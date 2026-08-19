-- ═══════════════════════════════════════════════════════════════════════════
-- 20260816_unify_equipment_identity.sql
-- DCIMe V2 — one registry row per physical device
--
-- THE PROBLEM
-- Two models described the same facility under different identifiers:
--   blueprint (NTC_blueprint.json)  47 items — what gets READ    (pac_server_em1)
--   topology  (sandbox seed)        50 nodes — what carries POWER (node-sr-ac-1)
-- Only ~15 overlapped by name, and automatic matching produced confidently
-- wrong pairs — "Vertiv 1" matched a Vertiv-brand UPS to a Vertiv aircon.
-- The mapping was therefore resolved by hand and confirmed by the facility.
--
-- WHICH IDENTIFIER WINS
-- Blueprint ids, decisively. telemetry_logs stores one row per hour under
-- asset_id = 'facility_wide', with equipment identity embedded in the METRIC KEY
-- PREFIXES (ups_1_load_amps_a, dg_1_run_hours). Those same prefixes key
-- excelMappings.ts. Renaming them would orphan every historical reading and
-- break every export. Topology node ids appear only in the disposable sandbox
-- seed and the engine, so they are the cheap side to move.
--
-- RESULT — 62 rows, three kinds:
--   35  matched      one row carrying BOTH a parameter set and a graph position
--   12  telemetry    room ambient sensors, fuel record, workstation, HQ units:
--                    real equipment, no place in a power cascade
--   15  topology     distribution boards, changeovers, busbar: carry power,
--                    nobody takes readings from them
--
-- This migration only widens constraints. The sandbox seed is rewritten
-- separately, because renaming a primary key referenced by ON DELETE CASCADE
-- foreign keys is worse than regenerating disposable data.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. THE CATEGORY CONSTRAINT
--
--    20260625_reconcile_schema.sql pinned category to five values:
--        UPS, GENERATOR, MAINS, RECTIFIER, AIRCON
--
--    That is the vocabulary of a POWER model. A unified registry also holds
--    switchgear, IT load, safety equipment and environmental sensors, none of
--    which fit — which is why applying the topology migration against the live
--    database failed with "check constraint is violated by some row".
--
--    Widened rather than dropped: an unconstrained category column drifts into
--    free text within a month.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.equipment_registry
  DROP CONSTRAINT IF EXISTS equipment_registry_category_check;

ALTER TABLE public.equipment_registry
  ADD CONSTRAINT equipment_registry_category_check CHECK (
    category IN (
      -- Original five, preserved so existing rows stay valid.
      'UPS','GENERATOR','MAINS','RECTIFIER','AIRCON',
      -- Power path.
      'POWER_SOURCE','SWITCHGEAR','DISTRIBUTION','BUSBAR',
      -- Load and environment.
      'IT_LOAD','COOLING','ENVIRONMENT',
      -- Neither powered nor power-carrying, but still logged.
      'SAFETY','FUEL','FACILITY',
      -- Legacy values seeded by 20260625_admin_wiring.sql.
      'Power','Cooling','Network','Compute'
    )
  ) NOT VALID;

-- NOT VALID deliberately: existing rows are not re-checked, so the migration
-- cannot fail on data that predates it. New and updated rows ARE checked.
-- Once the live registry is known clean:
--     ALTER TABLE public.equipment_registry
--       VALIDATE CONSTRAINT equipment_registry_category_check;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. THE TELEMETRY LINK
--
--    Equipment that is read but never simulated needs no engine_type and no
--    coordinates — the schema already permits both to be NULL. What it does
--    need is a way to say "this row is the subject of metric keys beginning
--    <prefix>", so Stage 6 can attach 324 parameter definitions without
--    guessing from the id.
--
--    Usually identical to equipment_id. It exists for the case where they
--    diverge, and so the relationship is explicit rather than inferred from a
--    naming convention — inferring from names is what produced the bad matches.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.equipment_registry
  ADD COLUMN IF NOT EXISTS metric_prefix text;

COMMENT ON COLUMN public.equipment_registry.metric_prefix IS
  'Prefix of this equipment''s keys inside telemetry_logs.metrics, e.g. ups_1 '
  'for ups_1_load_amps_a. Normally equals equipment_id.';

CREATE INDEX IF NOT EXISTS idx_equipment_registry_metric_prefix
  ON public.equipment_registry (metric_prefix)
  WHERE metric_prefix IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. ROLE VISIBILITY
--
--    With three kinds of row in one table, "what is this?" must be answerable
--    without re-deriving it in every query and every UI.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.equipment_roles AS
  SELECT e.equipment_id,
         e.site_uuid,
         e.name,
         e.category,
         e.engine_type,
         e.metric_prefix,
         (e.engine_type IS NOT NULL)                        AS is_simulated,
         (e.layout_x IS NOT NULL)                           AS is_drawn,
         EXISTS (SELECT 1 FROM public.equipment_parameters p
                  WHERE p.equipment_id = e.equipment_id)     AS has_parameters,
         CASE
           WHEN e.engine_type IS NOT NULL
            AND EXISTS (SELECT 1 FROM public.equipment_parameters p
                         WHERE p.equipment_id = e.equipment_id) THEN 'MATCHED'
           WHEN e.engine_type IS NOT NULL                       THEN 'TOPOLOGY_ONLY'
           ELSE                                                      'TELEMETRY_ONLY'
         END                                                 AS role
    FROM public.equipment_registry e;

COMMENT ON VIEW public.equipment_roles IS
  'One row per device with its role: MATCHED (powered and read), TOPOLOGY_ONLY '
  '(carries power, no readings), TELEMETRY_ONLY (read, not in the cascade).';

COMMIT;
