-- ═══════════════════════════════════════════════════════════════════════════
-- 20260872_asset_history.sql
-- DCIMe V2.1 — letting somebody read the audit trail that was already being kept.
--
-- registry_audit had 296 rows and nothing displayed them. The trigger has been
-- recording every equipment and parameter change field-by-field since it was
-- built; the modal that showed it was deleted earlier in this project, so the
-- record accumulated where nobody could reach it.
--
-- "Who moved this temperature limit, and when" is precisely the question asked
-- when a number on a signed record is disputed. The data was there. The answer
-- was not.
--
-- WHY A FUNCTION RATHER THAN A VIEW
-- The two audited tables key differently: equipment_registry rows carry the
-- equipment_id in record_key, but equipment_parameters rows carry the
-- PARAMETER's uuid. Asking "what happened to this asset" therefore needs a
-- join back through equipment_parameters, which a caller should not have to
-- know about — and which is why the trail looked unusable at a glance.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.get_asset_history(text, int);

CREATE FUNCTION public.get_asset_history(
  p_equipment_id text,
  p_limit        int DEFAULT 100
)
RETURNS TABLE (
  changed_at      timestamptz,
  changed_by_name text,
  scope           text,
  target          text,
  field           text,
  old_value       text,
  new_value       text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text := auth.role();
  v_site  uuid;
BEGIN
  SELECT e.site_uuid INTO v_site
    FROM public.equipment_registry e WHERE e.equipment_id = p_equipment_id;

  IF v_actor IN ('authenticated','anon') THEN
    IF v_site IS NULL OR v_site IS DISTINCT FROM public.get_my_site_uuid() THEN
      RAISE EXCEPTION 'Not permitted to read history for %', p_equipment_id
        USING HINT = 'You can only read the site you are assigned to.';
    END IF;
  END IF;

  RETURN QUERY
  -- Changes to the asset itself.
  SELECT a.changed_at,
         -- Blank means no signed-in user: a migration or a scheduled job. Say
         -- so rather than leaving a gap somebody reads as missing data.
         COALESCE(NULLIF(a.changed_by_name, ''), 'System') AS changed_by_name,
         'Asset'::text,
         e.name,
         a.field, a.old_value, a.new_value
    FROM public.registry_audit a
    JOIN public.equipment_registry e ON e.equipment_id = a.record_key
   WHERE a.table_name = 'equipment_registry'
     AND a.record_key = p_equipment_id

  UNION ALL

  -- Changes to any parameter belonging to it. record_key here is the
  -- parameter's own uuid, which is why this needs the join.
  SELECT a.changed_at,
         COALESCE(NULLIF(a.changed_by_name, ''), 'System'),
         'Parameter'::text,
         COALESCE(p.display_label, p.measure, p.parameter_name),
         a.field, a.old_value, a.new_value
    FROM public.registry_audit a
    JOIN public.equipment_parameters p ON p.id::text = a.record_key
   WHERE a.table_name = 'equipment_parameters'
     AND p.equipment_id = p_equipment_id

   ORDER BY 1 DESC
   LIMIT p_limit;
END $$;

COMMENT ON FUNCTION public.get_asset_history(text, int) IS
  'Every recorded change to an asset and to its parameters, newest first. '
  'Reads registry_audit, which the log_registry_change trigger has been filling '
  'since it was built.';

GRANT EXECUTE ON FUNCTION public.get_asset_history(text, int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_asset_history(text, int) FROM anon;

COMMIT;

DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT * FROM public.get_asset_history('pac_data_vt6', 5) LOOP
    RAISE NOTICE '% | % | % %: % -> %',
      to_char(r.changed_at,'DD Mon HH24:MI'), r.changed_by_name,
      r.scope, r.field, COALESCE(r.old_value,'(none)'), COALESCE(r.new_value,'(cleared)');
    n := n + 1;
  END LOOP;
  IF n = 0 THEN RAISE NOTICE 'no history for that asset'; END IF;
END $$;
