-- ═══════════════════════════════════════════════════════════════════════════
-- 20260822_contractor_findings.sql
-- DCIMe V2 — contractor findings become trackable work
--
-- V1 records a contractor visit correctly — purpose, target, who logged it —
-- and rightly refuses to close a ticket just because someone looked at it
-- (audit A-04, a distinction most systems get wrong). But what the contractor
-- FOUND lands in one free-text notes blob (audit A-05).
--
-- A contractor who identifies three new defects during a service visit produces
-- one paragraph. Nothing becomes trackable, nothing gets a severity, nothing
-- appears on any list of outstanding work, and nobody is accountable for any of
-- it. The next visit rediscovers the same defects.
--
-- A finding is a defect somebody must act on — which is a work item. So this
-- adds a thin findings table that raises work through the same spine, rather
-- than a second parallel system with its own states and its own queue.
--
-- Also adds the vendor registry (audit A-06): contractors are currently
-- free-text, so "Cummins", "Cummins Zambia" and "cummins engineers" are three
-- different companies to the system, and "how often has this vendor been out
-- this quarter" is unanswerable.
--
-- Depends on: 20260820_work_items.sql
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. VENDOR REGISTRY
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.vendors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  -- Lowercased, punctuation stripped. This is what makes "Cummins Zambia" and
  -- "cummins  zambia" the same company without forcing anyone to type exactly.
  normalised    text NOT NULL,
  contact_name  text,
  contact_phone text,
  contact_email text,
  speciality    text,
  -- Contracted response target in hours. NULL means no agreement exists, which
  -- is different from an agreement of zero and must stay distinguishable.
  sla_hours     integer,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendors_normalised ON public.vendors (normalised);

CREATE OR REPLACE FUNCTION public.normalise_vendor(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(lower(trim(coalesce(p_name,''))), '[^a-z0-9]+', '', 'g');
$$;

-- Backfill from the free-text names already recorded, so the registry starts
-- populated rather than empty and ignored.
INSERT INTO public.vendors (name, normalised)
SELECT DISTINCT ON (public.normalise_vendor(v.contractor))
       trim(v.contractor), public.normalise_vendor(v.contractor)
  FROM public.contractor_visits v
 WHERE coalesce(trim(v.contractor),'') <> ''
   AND public.normalise_vendor(v.contractor) <> ''
 ORDER BY public.normalise_vendor(v.contractor), trim(v.contractor)
ON CONFLICT (normalised) DO NOTHING;

-- Link visits to the registry without breaking the existing free-text column:
-- old rows keep working, new rows resolve to a real company.
ALTER TABLE public.contractor_visits
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL;

UPDATE public.contractor_visits v
   SET vendor_id = ven.id
  FROM public.vendors ven
 WHERE v.vendor_id IS NULL
   AND ven.normalised = public.normalise_vendor(v.contractor);


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. FINDINGS
--
--    Deliberately thin. A finding is the OBSERVATION — what was seen, where,
--    how bad. The response to it is a work item, so severity, ownership,
--    deadlines and state live in one place instead of being modelled twice
--    and drifting apart.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.contractor_findings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id     uuid NOT NULL REFERENCES public.contractor_visits(id) ON DELETE CASCADE,
  site_uuid    uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,

  summary      text NOT NULL,
  detail       text,
  severity     text NOT NULL REFERENCES public.sla_targets(severity),
  equipment_id text REFERENCES public.equipment_registry(equipment_id) ON DELETE SET NULL,

  -- The work raised from it. Nullable: an observation worth recording is not
  -- always work worth scheduling, and forcing one would either fabricate jobs
  -- or suppress observations.
  work_item_id uuid REFERENCES public.work_items(id) ON DELETE SET NULL,

  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid
);

CREATE INDEX IF NOT EXISTS idx_findings_visit ON public.contractor_findings (visit_id);
CREATE INDEX IF NOT EXISTS idx_findings_site  ON public.contractor_findings (site_uuid, created_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RECORDING A FINDING
--    One call: record the observation and raise the work it implies.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.record_contractor_finding(
  p_visit_id     uuid,
  p_summary      text,
  p_severity     text DEFAULT 'P3',
  p_detail       text DEFAULT NULL,
  p_equipment_id text DEFAULT NULL,
  p_raise_work    boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_site uuid; v_vendor text; v_finding uuid; v_work uuid;
BEGIN
  SELECT v.site_uuid, COALESCE(ven.name, v.contractor)
    INTO v_site, v_vendor
    FROM public.contractor_visits v
    LEFT JOIN public.vendors ven ON ven.id = v.vendor_id
   WHERE v.id = p_visit_id;

  IF v_site IS NULL THEN
    RAISE EXCEPTION 'No such contractor visit: %', p_visit_id;
  END IF;

  INSERT INTO public.contractor_findings
    (visit_id, site_uuid, summary, detail, severity, equipment_id)
  VALUES (p_visit_id, v_site, p_summary, p_detail, p_severity, p_equipment_id)
  RETURNING id INTO v_finding;

  IF p_raise_work THEN
    v_work := public.raise_work_item(
      p_site_uuid   => v_site,
      p_title       => p_summary,
      p_severity    => p_severity,
      p_kind        => 'FINDING',
      -- Attribution matters: work that came from an outside engineer should say
      -- so, because whoever picks it up has not seen what they saw.
      p_detail      => COALESCE(p_detail || E'\n\n', '')
                       || 'Raised from a finding by ' || COALESCE(v_vendor, 'a contractor')
                       || ' during a site visit.',
      p_origin      => 'CONTRACTOR',
      p_source_kind => 'FINDING',
      p_source_ref  => v_finding::text
    );
    UPDATE public.contractor_findings SET work_item_id = v_work WHERE id = v_finding;
  END IF;

  RETURN v_finding;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. VENDOR HISTORY
--    Answers "how often has this contractor been out, and what did they find" —
--    a question V1 cannot answer at all because vendors are typed by hand.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.vendor_activity AS
SELECT ven.id            AS vendor_id,
       ven.name          AS vendor_name,
       ven.speciality,
       ven.sla_hours,
       count(DISTINCT v.id)                                   AS visits,
       count(f.id)                                            AS findings,
       count(f.id) FILTER (WHERE f.severity IN ('P1','P2'))   AS serious_findings,
       count(w.id) FILTER (WHERE w.state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS'))
                                                              AS open_work,
       max(v.created_at)                                      AS last_visit
  FROM public.vendors ven
  LEFT JOIN public.contractor_visits    v ON v.vendor_id = ven.id
  LEFT JOIN public.contractor_findings  f ON f.visit_id  = v.id
  LEFT JOIN public.work_items           w ON w.id        = f.work_item_id
 GROUP BY ven.id, ven.name, ven.speciality, ven.sla_hours;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. RLS
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.vendors             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_findings ENABLE ROW LEVEL SECURITY;

-- Vendors are shared reference data: the same company serves several sites.
DROP POLICY IF EXISTS "Vendors: authenticated read" ON public.vendors;
CREATE POLICY "Vendors: authenticated read"
  ON public.vendors FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Vendors: admin write" ON public.vendors;
CREATE POLICY "Vendors: admin write"
  ON public.vendors FOR ALL
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');

DROP POLICY IF EXISTS "Findings: site-scoped read" ON public.contractor_findings;
CREATE POLICY "Findings: site-scoped read"
  ON public.contractor_findings FOR SELECT
  USING (auth.role() = 'authenticated' AND site_uuid = public.get_my_site_uuid());

DROP POLICY IF EXISTS "Findings: site-scoped insert" ON public.contractor_findings;
CREATE POLICY "Findings: site-scoped insert"
  ON public.contractor_findings FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND site_uuid = public.get_my_site_uuid());

GRANT EXECUTE ON FUNCTION public.record_contractor_finding(uuid,text,text,text,text,boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalise_vendor(text) TO authenticated;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. KEEPING THE REGISTRY ALIVE
--
--    The backfill above only fixes history. Without this, every visit logged
--    afterwards carries a null vendor_id and the registry decays back into the
--    free-text mess it was built to replace — which is how vendor registries
--    usually die: populated once, never maintained.
--
--    Resolving on write rather than asking the technician to pick from a list
--    keeps the field exactly as forgiving as it is today, while still producing
--    one row per real company.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.resolve_visit_vendor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_norm text;
  v_id   uuid;
BEGIN
  IF NEW.vendor_id IS NOT NULL THEN RETURN NEW; END IF;

  v_norm := public.normalise_vendor(NEW.contractor);
  IF v_norm = '' THEN RETURN NEW; END IF;

  SELECT id INTO v_id FROM public.vendors WHERE normalised = v_norm;

  IF v_id IS NULL THEN
    -- First sighting of this company. Created with only a name: a registry that
    -- demands contact details up front is one a technician routes around.
    INSERT INTO public.vendors (name, normalised)
    VALUES (trim(NEW.contractor), v_norm)
    ON CONFLICT (normalised) DO UPDATE SET name = public.vendors.name
    RETURNING id INTO v_id;
  END IF;

  NEW.vendor_id := v_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_resolve_visit_vendor ON public.contractor_visits;
CREATE TRIGGER trg_resolve_visit_vendor
  BEFORE INSERT OR UPDATE OF contractor ON public.contractor_visits
  FOR EACH ROW EXECUTE FUNCTION public.resolve_visit_vendor();

-- Link anything logged between the backfill and this trigger.
UPDATE public.contractor_visits v
   SET vendor_id = ven.id
  FROM public.vendors ven
 WHERE v.vendor_id IS NULL
   AND ven.normalised = public.normalise_vendor(v.contractor);
