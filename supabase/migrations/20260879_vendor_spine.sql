-- ═══════════════════════════════════════════════════════════════════════════
-- 20260879_vendor_spine.sql
-- DCIMe V2 — a vendor becomes a relationship rather than a phone number.
--
-- WHAT WAS THERE
-- One `vendors` row (MARIKE ENGINEERING: a name, a speciality string, one phone
-- number, no email, no SLA). Two incidents naming a contractor — as FREE TEXT,
-- typed by a technician, with no key to the vendor row. A contractor_visits
-- table with a vendor_id column, a signature flow and zero rows. The same
-- company existed in three places that had never been introduced, and there
-- was no single row you could open and ask: who are they, what are they
-- contracted for, are they still insured, what have they touched, and are they
-- any good.
--
-- WHAT THIS ADDS
--   vendor_contacts   — a vendor has more than one person. Who to call at 02:00
--                       is not who signs the invoice.
--   vendor_contracts  — the commercial and compliance facts, including the
--                       expiry dates that make a company legal to be on site.
--   vendor_coverage   — which equipment a vendor is actually responsible for,
--                       as rows that can be joined, replacing a speciality
--                       string that cannot be queried.
--   vendor_id on incidents and work_items — so "what has this vendor touched"
--                       is a query rather than a guess at a spelling.
--
-- The free-text columns are LEFT IN PLACE and backfilled from, never dropped.
-- incidents.contractor_engaged still reads exactly as it did; anything already
-- rendering it keeps working, and history stays legible if a vendor row is
-- later removed.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── How a company name is matched ──────────────────────────────────────────
-- vendors.normalised is lowercase alphanumeric ('MARIKE ENGINEERING' ->
-- 'marikeengineering'), which is what makes "Marike Engineering" typed into an
-- incident form match the register. It was maintained by whatever inserted the
-- row; now there is one definition of it, used by the backfill below and by
-- the trigger that keeps it true.
CREATE OR REPLACE FUNCTION public.normalise_vendor_name(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = public AS $$
  SELECT lower(regexp_replace(COALESCE(p_name, ''), '[^a-zA-Z0-9]', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.stamp_vendor_normalised()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
  NEW.normalised := public.normalise_vendor_name(NEW.name);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_vendor_normalised ON public.vendors;
CREATE TRIGGER trg_stamp_vendor_normalised
  BEFORE INSERT OR UPDATE OF name ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.stamp_vendor_normalised();

UPDATE public.vendors
   SET normalised = public.normalise_vendor_name(name)
 WHERE normalised IS DISTINCT FROM public.normalise_vendor_name(name);


-- ── People ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendor_contacts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id     uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  name          text NOT NULL,
  role          text,
  phone         text,
  email         text,
  -- The person to reach when the contracted response clock is running. At most
  -- one per vendor is enforced below: two escalation points is none.
  is_escalation boolean NOT NULL DEFAULT false,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendor_contacts_vendor_idx
  ON public.vendor_contacts (vendor_id);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_contacts_one_escalation_idx
  ON public.vendor_contacts (vendor_id) WHERE is_escalation;


-- ── Contract and compliance ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendor_contracts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id           uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  -- Null means the agreement covers every site, which is the common case for a
  -- national supplier and must not be forced into naming one.
  site_uuid           uuid REFERENCES public.sites(id),
  reference           text,
  starts_on           date,
  expires_on          date,

  -- The SLA that actually applies to this vendor. sla_targets is per SEVERITY
  -- and identical for everyone, which cannot express "this contract buys a
  -- four-hour response and that one buys next business day".
  response_hours      numeric,
  restore_hours       numeric,

  callout_rate        numeric,
  hourly_rate         numeric,
  currency            text NOT NULL DEFAULT 'ZMW',
  payment_terms_days  integer,
  renewal_notice_days integer,

  -- Compliance. Each is a date the platform can count down to, which is the
  -- point: "are they insured" is not a checkbox somebody ticked once.
  insurance_expires_on        date,
  workmens_comp_expires_on    date,
  tax_clearance_expires_on    date,
  safety_induction_expires_on date,

  is_active   boolean NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.employees(id)
);

CREATE INDEX IF NOT EXISTS vendor_contracts_vendor_idx
  ON public.vendor_contracts (vendor_id);
CREATE INDEX IF NOT EXISTS vendor_contracts_expiry_idx
  ON public.vendor_contracts (expires_on) WHERE is_active;


-- ── Coverage ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendor_coverage (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id    uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  site_uuid    uuid NOT NULL REFERENCES public.sites(id),
  -- Exactly one of these. A whole category ("all the generators") or one named
  -- machine, never both and never neither.
  category     text,
  equipment_id text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_coverage_one_target CHECK (
    (category IS NOT NULL AND equipment_id IS NULL) OR
    (category IS NULL AND equipment_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS vendor_coverage_vendor_idx
  ON public.vendor_coverage (vendor_id);
CREATE UNIQUE INDEX IF NOT EXISTS vendor_coverage_cat_idx
  ON public.vendor_coverage (vendor_id, site_uuid, category) WHERE category IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vendor_coverage_eq_idx
  ON public.vendor_coverage (vendor_id, site_uuid, equipment_id) WHERE equipment_id IS NOT NULL;


-- ── Attribution ────────────────────────────────────────────────────────────
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id);
ALTER TABLE public.work_items
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id);

CREATE INDEX IF NOT EXISTS incidents_vendor_idx  ON public.incidents  (vendor_id);
CREATE INDEX IF NOT EXISTS work_items_vendor_idx ON public.work_items (vendor_id);

COMMENT ON COLUMN public.incidents.vendor_id IS
  'The vendor who did the work. contractor_engaged is kept alongside as the '
  'name typed at the time — the key is the queryable fact, the text is the '
  'record of what was written.';

-- Backfill from what technicians typed. Matched on the normalised name, so
-- casing and punctuation differences resolve; anything that does not match a
-- register entry is LEFT NULL rather than guessed at.
UPDATE public.incidents i
   SET vendor_id = v.id
  FROM public.vendors v
 WHERE i.vendor_id IS NULL
   AND i.contractor_engaged IS NOT NULL
   AND public.normalise_vendor_name(i.contractor_engaged) = v.normalised
   AND v.normalised <> '';


-- ── RLS ────────────────────────────────────────────────────────────────────
-- Vendors are a register the whole site reads and admins maintain, which is
-- the policy already on `vendors`; these three inherit it rather than invent
-- a different rule for the same information.
ALTER TABLE public.vendor_contacts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_coverage  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendor contacts: authenticated read" ON public.vendor_contacts;
CREATE POLICY "Vendor contacts: authenticated read" ON public.vendor_contacts
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Vendor contacts: admin write" ON public.vendor_contacts;
CREATE POLICY "Vendor contacts: admin write" ON public.vendor_contacts
  FOR ALL USING (get_my_role() = 'ADMIN') WITH CHECK (get_my_role() = 'ADMIN');

DROP POLICY IF EXISTS "Vendor contracts: authenticated read" ON public.vendor_contracts;
CREATE POLICY "Vendor contracts: authenticated read" ON public.vendor_contracts
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Vendor contracts: admin write" ON public.vendor_contracts;
CREATE POLICY "Vendor contracts: admin write" ON public.vendor_contracts
  FOR ALL USING (get_my_role() = 'ADMIN') WITH CHECK (get_my_role() = 'ADMIN');

DROP POLICY IF EXISTS "Vendor coverage: authenticated read" ON public.vendor_coverage;
CREATE POLICY "Vendor coverage: authenticated read" ON public.vendor_coverage
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Vendor coverage: admin write" ON public.vendor_coverage;
CREATE POLICY "Vendor coverage: admin write" ON public.vendor_coverage
  FOR ALL USING (get_my_role() = 'ADMIN') WITH CHECK (get_my_role() = 'ADMIN');

COMMIT;
