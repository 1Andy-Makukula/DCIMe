-- ═══════════════════════════════════════════════════════════════════════════
-- 20260811_widen_category_constraint.sql
-- DCIMe V2 — Stage 1 prerequisite
--
-- WHY THIS EXISTS
-- 20260625_reconcile_schema.sql pinned equipment_registry.category to five
-- values:  UPS, GENERATOR, MAINS, RECTIFIER, AIRCON.
--
-- That set is too narrow for the facility as actually modelled. V2 adds:
--     SWITCHGEAR  changeovers and distribution boards
--     IT_LOAD     server and telecom racks
--     SAFETY      fire suppression
--
-- It is also already violated by live data: the June seed in
-- 20260625_admin_wiring.sql inserts 'Power', 'Cooling', 'Network' and
-- 'Compute'. Any operation that revalidates the constraint therefore fails with
--     check constraint "equipment_registry_category_check" is violated by some row
-- which is what blocked 20260813_topology_graph.sql from applying.
--
-- THE FIX: widen the permitted set, and add it NOT VALID.
--
-- NOT VALID is deliberate, not laziness. It means:
--     - existing rows are grandfathered, whatever legacy value they hold
--     - every INSERT and UPDATE from now on IS checked
-- Blocking a schema migration on historical data entered eighteen months ago is
-- the wrong trade. Clean the legacy values when convenient, then run:
--     ALTER TABLE public.equipment_registry
--       VALIDATE CONSTRAINT equipment_registry_category_check;
--
-- Run this BEFORE 20260813_topology_graph.sql.
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── What is actually in the column right now ──────────────────────────────
-- Read this output. Anything outside the list below is legacy data that will
-- keep working but can never be re-saved through the UI until it is corrected.
DO $$
DECLARE r record; legacy text := '';
BEGIN
  FOR r IN
    SELECT category, count(*) AS n
      FROM public.equipment_registry
     WHERE category NOT IN ('UPS','GENERATOR','MAINS','RECTIFIER','AIRCON',
                            'SWITCHGEAR','IT_LOAD','SAFETY')
     GROUP BY category ORDER BY count(*) DESC
  LOOP
    legacy := legacy || format('%s (%s rows), ', r.category, r.n);
  END LOOP;

  IF legacy = '' THEN
    RAISE NOTICE 'category: no legacy values — the constraint can be VALIDATEd immediately.';
  ELSE
    RAISE NOTICE 'category: legacy values present, grandfathered by NOT VALID: %',
      rtrim(legacy, ', ');
  END IF;
END $$;

ALTER TABLE public.equipment_registry
  DROP CONSTRAINT IF EXISTS equipment_registry_category_check;

ALTER TABLE public.equipment_registry
  ADD CONSTRAINT equipment_registry_category_check
  CHECK (category IN (
    -- V1 vocabulary, unchanged
    'UPS', 'GENERATOR', 'MAINS', 'RECTIFIER', 'AIRCON',
    -- V2 additions
    'SWITCHGEAR',  -- changeovers, distribution boards, the paralleling bus
    'IT_LOAD',     -- server and telecom racks
    'SAFETY'       -- fire suppression: drawn on the diagram, never simulated
  ))
  NOT VALID;

COMMENT ON CONSTRAINT equipment_registry_category_check ON public.equipment_registry IS
  'NOT VALID: pre-2026 rows may hold legacy values (Power, Cooling, Network, '
  'Compute). New and updated rows are checked. VALIDATE once those are cleaned.';

COMMIT;
