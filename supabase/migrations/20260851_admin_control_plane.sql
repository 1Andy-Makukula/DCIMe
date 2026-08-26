-- ═══════════════════════════════════════════════════════════════════════════
-- 20260851_admin_control_plane.sql
-- DCIMe V2.1 — Stage 5: what an administrator can change, and a record of it.
--
-- Stage 2 shipped the warning band and reading_status(). Stage 3 shipped the
-- rollups that count warnings and breaches. Both are inert, because ONE of 187
-- captured parameters has a limit configured — so every reading resolves to
-- 'unknown' and every n_warn and n_breach is zero. The machinery is proven end
-- to end; nothing has told it what wrong looks like.
--
-- That is a screen, and this is the schema under it.
--
-- ── AN EDIT MOVES WHAT THE PLATFORM ALARMS ON ─────────────────────────────
-- Widening a band silently changes how many breaches the rollups report for
-- last month. work_items already stamps its own breach_value/min/max so a
-- raised job cannot be rewritten, but the aggregate view legitimately moves —
-- and when it does, somebody needs to be able to ask why.
--
-- registry_audit answers that. Field-level, so "who widened the Server Room
-- temperature limit, and from what" is one query rather than a reconstruction.
--
-- ── NAMEPLATE FACTS ARE NOT HERE ──────────────────────────────────────────
-- A first version of this migration gave generator burn rate its own column.
-- 20260852 replaces that with the general mechanism: a CONSTANT parameter
-- carrying semantic_role = 'FUEL_BURN_RATE', reached through the same editor as
-- every other parameter. Two ways to express one kind of fact is how the drift
-- this whole effort is undoing began, so the column is not created at all.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Who changed what ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.registry_audit (
  id             bigserial   PRIMARY KEY,
  changed_at     timestamptz NOT NULL DEFAULT now(),
  changed_by     uuid        REFERENCES public.employees(id) ON DELETE SET NULL,
  -- Denormalised beside the id: a limit changed two years ago has to keep
  -- naming who changed it even if that person has since left.
  changed_by_name text,
  site_uuid      uuid        REFERENCES public.sites(id) ON DELETE CASCADE,
  table_name     text        NOT NULL,
  record_key     text        NOT NULL,
  field          text        NOT NULL,
  old_value      text,
  new_value      text
);

COMMENT ON TABLE public.registry_audit IS
  'Field-level history of administrator edits to the registry. Recorded because '
  'these edits move what the platform alarms on and what the rollups count — '
  'when a breach total changes, this is what says why.';

CREATE INDEX IF NOT EXISTS idx_registry_audit_record
  ON public.registry_audit (table_name, record_key, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_registry_audit_recent
  ON public.registry_audit (site_uuid, changed_at DESC);

ALTER TABLE public.registry_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Registry audit: site-scoped read" ON public.registry_audit;
CREATE POLICY "Registry audit: site-scoped read"
  ON public.registry_audit FOR SELECT
  USING (auth.role() = 'authenticated'
         AND (site_uuid IS NULL OR site_uuid = public.get_my_site_uuid()));

-- No insert policy: rows come only from the trigger below. An audit entry a
-- client could write is an audit entry a client could forge.


-- ── 2. The trigger ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_registry_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_who   uuid := public.get_my_employee_id();
  v_name  text;
  v_site  uuid;
  v_key   text;
  f       text;
  v_old   text;
  v_new   text;
  v_watch text[];
BEGIN
  SELECT full_name INTO v_name FROM public.employees WHERE id = v_who;

  -- One watch list per table, rather than one shared list and an exception
  -- handler for the fields that do not apply.
  --
  -- The handler was the first attempt and it silently destroyed the whole
  -- audit: a PL/pgSQL EXCEPTION block is a subtransaction, so when a field
  -- absent from this table raised undefined_column, every row already inserted
  -- in the same block was rolled back with it. The trigger reported success and
  -- logged nothing.
  IF TG_TABLE_NAME = 'equipment_parameters' THEN
    v_key := NEW.id::text;
    SELECT e.site_uuid INTO v_site FROM public.equipment_registry e
     WHERE e.equipment_id = NEW.equipment_id;
    v_watch := ARRAY['min_value','max_value','warn_min','warn_max',
                     'capture_mode','frequency','is_active','constant_value',
                     'display_label','unit','is_graphable','semantic_role'];
  ELSE
    v_key  := NEW.equipment_id;
    v_site := NEW.site_uuid;
    v_watch := ARRAY['room_id','visit_frequency','excel_row_index','name',
                     'is_active','category','manufacturer','model'];
  END IF;

  FOREACH f IN ARRAY v_watch LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', f, f)
       INTO v_old, v_new USING OLD, NEW;

    CONTINUE WHEN v_old IS NOT DISTINCT FROM v_new;

    INSERT INTO public.registry_audit
      (changed_by, changed_by_name, site_uuid, table_name, record_key, field, old_value, new_value)
    VALUES (v_who, v_name, v_site, TG_TABLE_NAME, v_key, f, v_old, v_new);
  END LOOP;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_audit_equipment_parameters ON public.equipment_parameters;
CREATE TRIGGER trg_audit_equipment_parameters
  AFTER UPDATE ON public.equipment_parameters
  FOR EACH ROW EXECUTE FUNCTION public.log_registry_change();

DROP TRIGGER IF EXISTS trg_audit_equipment_registry ON public.equipment_registry;
CREATE TRIGGER trg_audit_equipment_registry
  AFTER UPDATE ON public.equipment_registry
  FOR EACH ROW EXECUTE FUNCTION public.log_registry_change();

COMMIT;

DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.registry_audit;
  RAISE NOTICE 'registry_audit ready (% existing rows)', v_n;
END $$;
