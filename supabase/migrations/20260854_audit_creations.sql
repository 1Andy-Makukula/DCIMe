-- ═══════════════════════════════════════════════════════════════════════════
-- 20260854_audit_creations.sql
-- DCIMe V2.1 — Stage 5: record who ADDED a thing, not only who changed it.
--
-- 20260851's trigger fires on UPDATE only. That was right while the registry
-- was loaded by migration and nobody could add to it — but the Inventory screen
-- now creates rooms, assets and parameters, and "who added this asset, and
-- when" is exactly as worth knowing as "who widened this limit".
--
-- Found by testing the creation path rather than by reading it: the insert
-- succeeded, and registry_audit stayed where it was.
--
-- A creation is logged as ONE row, not one per column. Thirty fields of
-- "NULL → value" buries the fact that something was created under its own
-- detail; the row that matters says a thing came into existence, who by, and
-- what it was called.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

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
  v_label text;
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
    v_key   := NEW.id::text;
    v_label := NEW.parameter_name;
    SELECT e.site_uuid INTO v_site FROM public.equipment_registry e
     WHERE e.equipment_id = NEW.equipment_id;
    v_watch := ARRAY['min_value','max_value','warn_min','warn_max',
                     'capture_mode','frequency','is_active','constant_value',
                     'display_label','unit','is_graphable','semantic_role'];
  ELSIF TG_TABLE_NAME = 'rooms' THEN
    v_key   := NEW.id::text;
    v_label := NEW.room_name;
    v_site  := NEW.site_id;
    v_watch := ARRAY['room_name','sort_order'];
  ELSE
    v_key   := NEW.equipment_id;
    v_label := COALESCE(NEW.name, NEW.equipment_id);
    v_site  := NEW.site_uuid;
    v_watch := ARRAY['room_id','visit_frequency','excel_row_index','name',
                     'is_active','category','manufacturer','model'];
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.registry_audit
      (changed_by, changed_by_name, site_uuid, table_name, record_key, field, old_value, new_value)
    VALUES (v_who, v_name, v_site, TG_TABLE_NAME, v_key, '(created)', NULL, v_label);
    RETURN NEW;
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
  AFTER INSERT OR UPDATE ON public.equipment_parameters
  FOR EACH ROW EXECUTE FUNCTION public.log_registry_change();

DROP TRIGGER IF EXISTS trg_audit_equipment_registry ON public.equipment_registry;
CREATE TRIGGER trg_audit_equipment_registry
  AFTER INSERT OR UPDATE ON public.equipment_registry
  FOR EACH ROW EXECUTE FUNCTION public.log_registry_change();

-- Rooms were not audited at all before — nothing could create one.
DROP TRIGGER IF EXISTS trg_audit_rooms ON public.rooms;
CREATE TRIGGER trg_audit_rooms
  AFTER INSERT OR UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.log_registry_change();

COMMIT;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl,
           string_agg(CASE WHEN t.tgtype & 4 > 0 THEN 'INSERT'
                           WHEN t.tgtype & 16 > 0 THEN 'UPDATE' END, '+') AS fires_on
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE NOT t.tgisinternal AND t.tgname LIKE 'trg_audit_%'
     GROUP BY c.relname ORDER BY c.relname
  LOOP
    RAISE NOTICE 'auditing % on %', COALESCE(r.fires_on, 'INSERT+UPDATE'), r.tbl;
  END LOOP;
END $$;
