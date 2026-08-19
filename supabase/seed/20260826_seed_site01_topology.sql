-- ═══════════════════════════════════════════════════════════════════════════
-- 20260826_seed_site01_topology.sql
-- DCIMe V2 — the topology, applied to the real site
--
-- REPLACES the SANDBOX seeds. equipment_registry.equipment_id is a GLOBAL
-- primary key, not per-site, so a sandbox holding blueprint ids like
-- 'grid_main' collides with the site that already owns them. The sandbox was
-- scaffolding for building the topology safely; that phase is over.
--
-- Site 1 already carries the 47 blueprint items and their parameters. What it
-- has never had is topology. This adds exactly that:
--
--   47 existing items  -> UPDATE: coordinates, engine type, input policy
--   17 new items       -> INSERT: boards, changeovers, the paralleling bus
--   cabling            -> INSERT
--   room plates        -> UPDATE
--
-- NOTHING IS DELETED. No telemetry, incident, shift report or reading is
-- touched. Every write is additive, and everything inserted carries
-- provenance = 'IMPORT' so it can be removed with one predicate.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TEMP TABLE _site ON COMMIT DROP AS
  SELECT id AS site_uuid FROM public.sites WHERE site_code = 'SITE_01';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _site) THEN
    RAISE EXCEPTION 'No site with site_code = SITE_01. Run 20260825_neutral_identifiers.sql first.';
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. EQUIPMENT
--
--    ON CONFLICT DO UPDATE carries a WHERE clause restricting it to rows
--    ALREADY owned by this site. Without it, an id belonging to another site
--    would be silently reassigned here — taking that site's equipment with it.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.equipment_registry
  (equipment_id, name, category, location, site_uuid,
   template_id, template_version, engine_type, dynamic_parameters,
   input_policy, provenance, is_active, sort_order, metric_prefix)
SELECT v.equipment_id, v.name, t.category, v.location,
       (SELECT site_uuid FROM _site),
       v.template_id, t.version, t.engine_type,
       t.default_parameters || v.overrides,
       v.input_policy, 'IMPORT', true, v.sort_order, v.equipment_id
  FROM (VALUES
    -- ── Sources ────────────────────────────────────────────────────────────
    ('grid_main',      'ZESCO Grid Feed',    'Genset Yard', 'TPL_GRID_FEED',  '{}'::jsonb, 'ANY',      10),
    ('dg_1',         'Generator DG-1',     'Genset Yard', 'TPL_GENSET_1MW', '{}'::jsonb, 'ANY',      20),
    ('dg_2',         'Generator DG-2',     'Genset Yard', 'TPL_GENSET_1MW', '{}'::jsonb, 'ANY',      21),
    ('dg_3',         'Generator DG-3',     'Genset Yard', 'TPL_GENSET_1MW', '{}'::jsonb, 'ANY',      22),
    ('dg_4',         'Generator DG-4',     'Genset Yard', 'TPL_GENSET_1MW', '{}'::jsonb, 'ANY',      23),
    ('dg_hq',        'HQ Standby Gen',     'Genset Yard', 'TPL_GENSET_HQ',  '{}'::jsonb, 'ANY',      24),

    -- ── Changeover: PRIORITY policy. Grid preferred, generator on failure. ──
    ('node-tco-1',        'TCO 1',              'Power Room 1','TPL_TCO',        '{}'::jsonb, 'PRIORITY', 30),
    ('node-tco-2',        'TCO 2',              'Power Room 2','TPL_TCO',        '{}'::jsonb, 'PRIORITY', 31),

    -- ── Distribution ───────────────────────────────────────────────────────
    ('node-main-main-db', 'MAIN MAIN DB',       'Power Room 1','TPL_DB',         '{}'::jsonb, 'PRIORITY', 40),
    ('node-maindb-1',     'MAIN DB 1',          'Power Room 1','TPL_DB',         '{}'::jsonb, 'ANY',      41),
    ('node-maindb-2',     'MAIN DB 2',          'Power Room 2','TPL_DB',         '{}'::jsonb, 'ANY',      42),
    ('node-ac-ups-db-a',  'AC UPS DB A',        'Power Room 2','TPL_DB',         '{}'::jsonb, 'ANY',      43),
    ('node-dc-rect-db-a', 'DC RECTIFIER DB A',  'Power Room 2','TPL_DB',         '{}'::jsonb, 'ANY',      44),
    ('node-aircon-db-a',  'AIRCON UNITS DB A',  'Power Room 2','TPL_DB',         '{}'::jsonb, 'ANY',      45),
    ('node-ac-ups-db-b',  'AC UPS DB B',        'Power Room 1','TPL_DB',         '{}'::jsonb, 'ANY',      46),
    ('node-dc-rect-db-b', 'DC RECTIFIER DB B',  'Power Room 1','TPL_DB',         '{}'::jsonb, 'ANY',      47),
    ('node-aircon-db-b',  'AIRCON UNITS DB B',  'Power Room 1','TPL_DB',         '{}'::jsonb, 'ANY',      48),
    -- ── The A and B supply buses ────────────────────────────────────────────
    -- CORRECTED. These were modelled as ONE board fed by both UPS. The facility
    -- runs two INDEPENDENT paths: UPS-1 + Rectifier-1 on the A side, UPS-2 +
    -- Rectifier-2 on the B side, with every rack bridging both through
    -- dual-corded power supplies.
    --
    -- The numbers came out the same either way, but the drawing did not: a
    -- single board cannot show WHY a rack survives. Two buses and two cords can.
    ('node-ac-server-db',   'AC SERVER BUS A',  'Server Room', 'TPL_DB',         '{}'::jsonb, 'ANY',      49),
    ('node-ac-server-db-b', 'AC SERVER BUS B',  'Server Room', 'TPL_DB',         '{}'::jsonb, 'ANY',      50),
    ('node-dc-server-db',   'DC SERVER BUS A',  'Server Room', 'TPL_DB',         '{}'::jsonb, 'ANY',      51),
    ('node-dc-server-db-b', 'DC SERVER BUS B',  'Server Room', 'TPL_DB',         '{}'::jsonb, 'ANY',      52),

    -- ── Conversion (live currents preserved from the engine.js literals) ────
    ('ups_1',        'Vertiv UPS 1',       'Power Room 1','TPL_UPS_200',
       '{"current": 120.0}'::jsonb, 'ANY', 60),
    ('ups_2',        'Vertiv UPS 2',       'Power Room 2','TPL_UPS_200',
       '{"current": 110.0}'::jsonb, 'ANY', 61),
    ('rectifier_1',  'NetSure Rectifier 1','Power Room 1','TPL_RECT_5000',
       '{"current": 1167.0}'::jsonb, 'ANY', 62),
    ('rectifier_2',  'NetSure Rectifier 2','Power Room 2','TPL_RECT_5000',
       '{"current": 1050.0}'::jsonb, 'ANY', 63),

    -- ── Cooling (Vertiv + Dragor) ──────────────────────────────────────────
    -- RECLASSIFIED. engine.js typed these as 'server', but index.html draws
    -- every one with face-aircon and a cooling-fan, and the facility confirms
    -- they are precision cooling units. Leaving them as IT load would have put
    -- ~7 cooling units in the PUE DENOMINATOR and understated PUE badly.
    ('pac_server_vt1',     'Vertiv PAC 1',       'Server Room', 'TPL_PAC',        '{}'::jsonb, 'ANY', 70),
    ('pac_server_vt2',     'Vertiv PAC 2',       'Server Room', 'TPL_PAC',        '{}'::jsonb, 'ANY', 71),
    ('pac_server_vt3',     'Vertiv PAC 3',       'Server Room', 'TPL_PAC',        '{}'::jsonb, 'ANY', 72),
    ('pac_server_vt4',     'Vertiv PAC 4',       'Server Room', 'TPL_PAC',        '{}'::jsonb, 'ANY', 73),
    ('pac_server_vt5',     'Vertiv PAC 5',       'Server Room', 'TPL_PAC',        '{}'::jsonb, 'ANY', 74),
    ('pac_data_vt6',     'Vertiv PAC 6',       'Data Room',   'TPL_PAC',        '{}'::jsonb, 'ANY', 75),
    ('pac_server_dragor',       'Dragor PAC',         'Data Room',   'TPL_PAC',        '{}'::jsonb, 'ANY', 76),

    -- ── Cooling ────────────────────────────────────────────────────────────
    ('pac_server_em1',      'Emerson AC-1',       'Server Room', 'TPL_PAC',        '{}'::jsonb, 'ANY', 80),
    ('pac_server_em2',      'Emerson AC-2',       'Server Room', 'TPL_PAC',        '{}'::jsonb, 'ANY', 81),
    ('pac_server_em3',      'Emerson AC-3',       'Server Room', 'TPL_PAC',        '{}'::jsonb, 'ANY', 82),
    ('pac_server_em4',      'Emerson AC-4',       'Server Room', 'TPL_PAC',        '{}'::jsonb, 'ANY', 83),
    ('pac_server_em5',      'Emerson AC-5',       'Server Room', 'TPL_PAC',        '{}'::jsonb, 'ANY', 84),
    ('pac_server_em6',      'Emerson AC-6',       'Server Room', 'TPL_PAC',        '{}'::jsonb, 'ANY', 85),
    ('pac_server_em7',      'Emerson AC-7',       'Server Room', 'TPL_PAC',        '{}'::jsonb, 'ANY', 86),
    ('pac_pr1_em1',     'PR1 PAC-1',          'Power Room 1','TPL_PAC',        '{}'::jsonb, 'ANY', 87),
    ('pac_pr1_em2',     'PR1 PAC-2',          'Power Room 1','TPL_PAC',        '{}'::jsonb, 'ANY', 88),
    ('node-pr1-ac-3',     'PR1 PAC-3',          'Power Room 1','TPL_PAC',        '{}'::jsonb, 'ANY', 89),
    ('pac_pr2_em1',     'PR2 PAC-1',          'Power Room 2','TPL_PAC',        '{}'::jsonb, 'ANY', 90),
    ('pac_pr2_em2',     'PR2 PAC-2',          'Power Room 2','TPL_PAC',        '{}'::jsonb, 'ANY', 91),
    ('pac_it1_em1',     'IT1 PAC-1',          'IT Room 1',   'TPL_PAC',        '{}'::jsonb, 'ANY', 92),
    ('pac_it1_em2',     'IT1 PAC-2',          'IT Room 1',   'TPL_PAC',        '{}'::jsonb, 'ANY', 93),
    ('pac_it2_em1',     'IT2 PAC-1',          'IT Room 2',   'TPL_PAC',        '{}'::jsonb, 'ANY', 94),
    ('pac_it2_em2',     'IT2 PAC-2',          'IT Room 2',   'TPL_PAC',        '{}'::jsonb, 'ANY', 95),
    ('pac_data_em1',      'DR PAC-1',           'Data Room',   'TPL_PAC',        '{}'::jsonb, 'ANY', 96),
    ('pac_data_em2',      'DR PAC-2',           'Data Room',   'TPL_PAC',        '{}'::jsonb, 'ANY', 97),

    -- ── Drawn but not simulated ────────────────────────────────────────────
    -- Fire suppression: it appears on the diagram, but has no place in a power
    -- cascade. engine_type NULL keeps it out of the physics while the widened
    -- contract still ships it to the renderer.
    ('fm200_panel',       'FM 200 Suppression', 'Power Room 1','TPL_FSS',        '{}'::jsonb, 'ANY',  5),

    -- ── The generator paralleling bus ──────────────────────────────────────
    -- Recovered from the SVG, not from engine.js. Paths dg-cable-1..4 and
    -- dg-cable-hq all rise to y=150, where dg-bus (M 300 150 L 1700 150) runs
    -- horizontally and feeds BOTH changeovers via dg-to-tco1 / dg-to-tco2.
    --
    -- So all five generators parallel onto a shared busbar rather than each
    -- feeding one TCO. This is also WHY pair rotation exists: with a common
    -- bus any two generators can carry the whole site, so they alternate for
    -- even wear. Modelling it as individual DG->TCO cables would have been
    -- electrically wrong and obvious to anyone reading the single line.
    ('node-dg-bus',       'DG Paralleling Bus', 'Genset Yard', 'TPL_DB',         '{}'::jsonb, 'ANY', 25)
,

    -- ═══════════════════════════════════════════════════════════════════════
    -- TELEMETRY-ONLY  (12 rows)
    --
    -- Read on every round, but absent from the power graph: engine_type NULL
    -- and no coordinates. Before unification these existed ONLY in the
    -- blueprint, so a technician could record a room temperature against
    -- equipment the registry had never heard of.
    --
    -- The three pac_hq_* units and room_hq_ambient belong to a DIFFERENT
    -- facility. They appear in this site's rounds but not in its cascade, which
    -- is precisely why they carry no engine_type.
    -- ═══════════════════════════════════════════════════════════════════════
    ('room_server_ambient', 'Server Room Ambient',   'Server Room', 'TPL_AMBIENT', '{}'::jsonb, 'ANY', 300),
    ('room_data_ambient',   'Data Room Ambient',     'Data Room',   'TPL_AMBIENT', '{}'::jsonb, 'ANY', 301),
    ('room_pr1_ambient',    'Power Room 1 Ambient',  'Power Room 1','TPL_AMBIENT', '{}'::jsonb, 'ANY', 302),
    ('room_pr2_ambient',    'Power Room 2 Ambient',  'Power Room 2','TPL_AMBIENT', '{}'::jsonb, 'ANY', 303),
    ('room_it1_ambient',    'IT Room 1 Ambient',     'IT Room 1',   'TPL_AMBIENT', '{}'::jsonb, 'ANY', 304),
    ('room_it2_ambient',    'IT Room 2 Ambient',     'IT Room 2',   'TPL_AMBIENT', '{}'::jsonb, 'ANY', 305),
    ('room_hq_ambient',     'HQ Power Room Ambient', 'Power Room 1','TPL_AMBIENT', '{}'::jsonb, 'ANY', 306),
    ('pac_hq_em1',          'HQ Power Room AC 1',    'Power Room 1','TPL_PAC',     '{}'::jsonb, 'ANY', 310),
    ('pac_hq_em2',          'HQ Power Room AC 2',    'Power Room 1','TPL_PAC',     '{}'::jsonb, 'ANY', 311),
    ('pac_hq_em3',          'HQ Power Room AC 3',    'Power Room 1','TPL_PAC',     '{}'::jsonb, 'ANY', 312),
    ('room_workstation',    'Work Station',          'Server Room', 'TPL_RECORD',  '{}'::jsonb, 'ANY', 320),
    ('site_fuel_record',    'Site Fuel Record',      'Genset Yard', 'TPL_FUEL',    '{}'::jsonb, 'ANY', 321)
  ) AS v(equipment_id, name, location, template_id, overrides, input_policy, sort_order)
  JOIN public.equipment_templates t ON t.template_id = v.template_id
ON CONFLICT (equipment_id) DO UPDATE
   SET engine_type        = EXCLUDED.engine_type,
       input_policy       = EXCLUDED.input_policy,
       template_id        = COALESCE(public.equipment_registry.template_id, EXCLUDED.template_id),
       -- Existing physics wins: a real reading already recorded against this
       -- machine must not be overwritten by a template default.
       dynamic_parameters = EXCLUDED.dynamic_parameters || public.equipment_registry.dynamic_parameters
 WHERE public.equipment_registry.site_uuid = (SELECT site_uuid FROM _site);


-- ── Equipment that is REAL but not on the single line ────────────────────
--
-- The HQ Power Room air conditioners exist and are read on every round, but
-- they were never drawn on the single-line diagram and no feed was ever
-- recorded for them. Rather than invent a cable and a position, they are
-- excluded from the GRAPH while remaining full equipment everywhere else.
--
-- engine_type NULL keeps them out of the physics; no coordinates keeps them off
-- the drawing. get_topology_graph() returns a node only when it is simulated OR
-- drawn, so they disappear from the topology entirely — while the inventory,
-- their parameters and their hourly readings all carry on untouched.
--
-- This is also what silences their ORPHAN and NOT_DRAWN warnings: a node that
-- never claimed to be part of the power graph cannot be missing from it.
UPDATE public.equipment_registry
   SET engine_type  = NULL,
       layout_x     = NULL,
       layout_y     = NULL,
       render_shape = NULL
 WHERE site_uuid = (SELECT site_uuid FROM _site)
   AND equipment_id IN ('pac_hq_em1', 'pac_hq_em2', 'pac_hq_em3');


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. GEOMETRY
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TEMP TABLE _layout(equipment_id text PRIMARY KEY, x double precision,
                          y double precision, shape text) ON COMMIT DROP;

INSERT INTO _layout(equipment_id, x, y, shape) VALUES
  ('node-ac-server-db', 1100.0, 4800.0, 'server'),
  ('node-ac-server-db-b', 1700.0, 4800.0, 'server'),
  ('node-ac-ups-db-a', 1000.0, 1750.0, 'db'),
  ('node-ac-ups-db-b', 3100.0, 750.0, 'db'),
  ('node-aircon-db-a', 1000.0, 2250.0, 'db'),
  ('node-aircon-db-b', 3100.0, 1250.0, 'db'),
  ('node-dc-rect-db-a', 1000.0, 2000.0, 'db'),
  ('node-dc-rect-db-b', 3100.0, 1000.0, 'db'),
  ('node-dc-server-db', 1900.0, 4000.0, 'server'),
  ('node-dc-server-db-b', 2500.0, 4000.0, 'server'),
  ('dg_1', 300.0, 300.0, 'generator'),
  ('dg_2', 650.0, 300.0, 'generator'),
  ('dg_3', 1000.0, 300.0, 'generator'),
  ('dg_4', 1350.0, 300.0, 'generator'),
  ('node-dg-bus', 1000.0, 150.0, 'bus'),
  ('dg_hq', 1700.0, 300.0, 'generator'),
  ('pac_data_em1', 3450.0, 3000.0, 'aircon'),
  ('pac_data_em2', 4050.0, 3000.0, 'aircon'),
  ('pac_server_dragor', 1500.0, 4400.0, 'aircon'),
  ('fm200_panel', 1100.0, 900.0, 'fss'),
  ('grid_main', 300.0, 900.0, 'transformer'),
  ('pac_it1_em1', 2450.0, 1600.0, 'aircon'),
  ('pac_it1_em2', 2750.0, 2000.0, 'aircon'),
  ('pac_it2_em1', 3450.0, 1600.0, 'aircon'),
  ('pac_it2_em2', 3750.0, 2000.0, 'aircon'),
  ('node-main-main-db', 700.0, 900.0, 'db'),
  ('node-maindb-1', 2700.0, 1000.0, 'db'),
  ('node-maindb-2', 600.0, 2000.0, 'db'),
  ('pac_pr1_em1', 3900.0, 600.0, 'aircon'),
  ('pac_pr1_em2', 3900.0, 900.0, 'aircon'),
  ('node-pr1-ac-3', 3900.0, 1200.0, 'aircon'),
  ('pac_pr2_em1', 1800.0, 1600.0, 'aircon'),
  ('pac_pr2_em2', 1800.0, 2200.0, 'aircon'),
  ('rectifier_1', 3500.0, 1000.0, 'rectifier'),
  ('rectifier_2', 1400.0, 2000.0, 'rectifier'),
  ('pac_server_em1', 300.0, 3100.0, 'aircon'),
  ('pac_server_em2', 700.0, 3100.0, 'aircon'),
  ('pac_server_em3', 1100.0, 3100.0, 'aircon'),
  ('pac_server_em4', 1500.0, 3100.0, 'aircon'),
  ('pac_server_em5', 1900.0, 3100.0, 'aircon'),
  ('pac_server_em6', 2300.0, 3100.0, 'aircon'),
  ('pac_server_em7', 2700.0, 3100.0, 'aircon'),
  ('node-tco-1', 200.0, 2000.0, 'tco'),
  ('node-tco-2', 2300.0, 1000.0, 'tco'),
  ('ups_1', 3500.0, 750.0, 'ups'),
  ('ups_2', 1400.0, 1750.0, 'ups'),
  ('pac_server_vt1', 300.0, 3600.0, 'aircon'),
  ('pac_server_vt2', 300.0, 4000.0, 'aircon'),
  ('pac_server_vt3', 300.0, 4400.0, 'aircon'),
  ('pac_server_vt4', 300.0, 4800.0, 'aircon'),
  ('pac_server_vt5', 300.0, 5200.0, 'aircon'),
  ('pac_data_vt6', 3750.0, 3700.0, 'aircon');

UPDATE public.equipment_registry e
   SET layout_x = l.x, layout_y = l.y, render_shape = l.shape
  FROM _layout l
 WHERE e.equipment_id = l.equipment_id
   AND e.site_uuid = (SELECT site_uuid FROM _site)
   -- Deliberately excluded above; the layout table must not reinstate them.
   AND e.engine_type IS NOT NULL;

UPDATE public.equipment_registry
   SET render_path_d = 'M 300 150 L 1700 150'
 WHERE equipment_id = 'node-dg-bus'
   AND site_uuid = (SELECT site_uuid FROM _site);


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. CABLING
-- ═══════════════════════════════════════════════════════════════════════════
-- Clears only the cabling THIS seed owns. Scoping by provenance matters: the
-- demonstration rack cords are recorded as IMPORT, and an unscoped delete
-- removed them here — leaving ten racks orphaned whenever this seed was re-run
-- on its own, with the graph reporting issues that the previous run had not had.
DELETE FROM public.equipment_connections c
 USING public.equipment_registry e
 WHERE e.equipment_id = c.source_equipment_id
   AND e.site_uuid = (SELECT site_uuid FROM _site)
   AND c.provenance = 'MANUAL';

INSERT INTO public.equipment_connections
  (source_equipment_id, source_port, target_equipment_id, target_port,
   input_priority, connection_type, render_path_id, provenance, is_active)
VALUES
  -- Grid backbone
  ('grid_main',      'OUT',   'node-main-main-db', 'GRID_IN', 1, 'POWER', 'grid-to-main', 'MANUAL', true),
  ('node-main-main-db', 'OUT_1', 'node-tco-1',        'GRID_IN', 1, 'POWER', 'main-to-tco1', 'MANUAL', true),
  ('node-main-main-db', 'OUT_2', 'node-tco-2',        'GRID_IN', 1, 'POWER', 'main-to-tco2', 'MANUAL', true),

  -- Generator backbone — RECOVERED FROM THE SVG, not inferred.
  -- Every generator riser (dg-cable-N) terminates on the paralleling bus at
  -- y=150; the bus then feeds both changeovers. Pairing is confirmed by the
  -- Stage 0 golden fixtures (dg_run_hours_0 and _2 increment together, so
  -- Pair A = DG1 & DG3), and the common bus is what makes that rotation
  -- workable in the first place.
  ('dg_1',   'OUT', 'node-dg-bus', 'BUS_IN', 1, 'POWER', 'dg-cable-1',  'MANUAL', true),
  ('dg_2',   'OUT', 'node-dg-bus', 'BUS_IN', 2, 'POWER', 'dg-cable-2',  'MANUAL', true),
  ('dg_3',   'OUT', 'node-dg-bus', 'BUS_IN', 3, 'POWER', 'dg-cable-3',  'MANUAL', true),
  ('dg_4',   'OUT', 'node-dg-bus', 'BUS_IN', 4, 'POWER', 'dg-cable-4',  'MANUAL', true),
  ('dg_hq',  'OUT', 'node-dg-bus', 'BUS_IN', 5, 'POWER', 'dg-cable-hq', 'MANUAL', true),
  -- Bus -> changeovers. Priority 2 puts the generator behind the grid at each
  -- TCO, which is what a changeover physically does.
  ('node-dg-bus', 'OUT_1', 'node-tco-1', 'GEN_IN', 2, 'POWER', 'dg-to-tco1', 'MANUAL', true),
  ('node-dg-bus', 'OUT_2', 'node-tco-2', 'GEN_IN', 2, 'POWER', 'dg-to-tco2', 'MANUAL', true),

  -- TCO -> main boards (note the deliberate 1->2 / 2->1 crossover)
  ('node-tco-1', 'OUT', 'node-maindb-2', 'IN', 1, 'POWER', 'tco1-to-maindb2', 'MANUAL', true),
  ('node-tco-2', 'OUT', 'node-maindb-1', 'IN', 1, 'POWER', 'tco2-to-maindb1', 'MANUAL', true),

  -- A-side distribution
  ('node-maindb-2', 'OUT_1', 'node-ac-ups-db-a',  'IN', 1, 'POWER', 'maindb2-to-upsdba',  'MANUAL', true),
  ('node-maindb-2', 'OUT_2', 'node-dc-rect-db-a', 'IN', 1, 'POWER', 'maindb2-to-rectdba', 'MANUAL', true),
  ('node-maindb-2', 'OUT_3', 'node-aircon-db-a',  'IN', 1, 'POWER', 'maindb2-to-acdba',   'MANUAL', true),

  -- B-side distribution
  ('node-maindb-1', 'OUT_1', 'node-ac-ups-db-b',  'IN', 1, 'POWER', 'maindb1-to-upsdbb',  'MANUAL', true),
  ('node-maindb-1', 'OUT_2', 'node-dc-rect-db-b', 'IN', 1, 'POWER', 'maindb1-to-rectdbb', 'MANUAL', true),
  ('node-maindb-1', 'OUT_3', 'node-aircon-db-b',  'IN', 1, 'POWER', 'maindb1-to-acdbb',   'MANUAL', true),

  -- Conversion
  ('node-ac-ups-db-a',  'OUT', 'ups_2',       'IN', 1, 'POWER', 'upsdba-to-ups2',   'MANUAL', true),
  ('node-dc-rect-db-a', 'OUT', 'rectifier_2', 'IN', 1, 'POWER', 'rectdba-to-rect2', 'MANUAL', true),
  ('node-ac-ups-db-b',  'OUT', 'ups_1',       'IN', 1, 'POWER', 'upsdbb-to-ups1',   'MANUAL', true),
  ('node-dc-rect-db-b', 'OUT', 'rectifier_1', 'IN', 1, 'POWER', 'rectdbb-to-rect1', 'MANUAL', true),

  -- Dual-feed convergence. These four edges make redundancy real: each server
  -- board has TWO independent parents, so killing one UPS must NOT black out
  -- the load. This is the single most important behaviour to demonstrate, and
  -- the thing a type-tier cascade cannot express.
  -- One source per bus. The redundancy lives at the RACK, where two cords meet,
  -- not at a board collecting both feeds.
  ('ups_1',       'OUT', 'node-ac-server-db',   'IN', 1, 'POWER', 'ups1-to-acserverdb',  'MANUAL', true),
  ('ups_2',       'OUT', 'node-ac-server-db-b', 'IN', 1, 'POWER', 'ups2-to-acserverdb',  'MANUAL', true),
  ('rectifier_1', 'OUT', 'node-dc-server-db',   'IN', 1, 'POWER', 'rect1-to-dcserverdb', 'MANUAL', true),
  ('rectifier_2', 'OUT', 'node-dc-server-db-b', 'IN', 1, 'POWER', 'rect2-to-dcserverdb', 'MANUAL', true),

  -- IT load
  -- ── CORRECTED: Vertiv cooling is on RAW power, not UPS/DC ───────────────
  -- directFeederMap had these six hanging off AC/DC SERVER DB, i.e. downstream
  -- of the UPS and rectifiers. The facility confirms all cooling is fed from the
  -- changeovers directly. Leaving them on conditioned power put six aircons
  -- inside the PUE denominator, which is measured at UPS + rectifier output —
  -- silently understating PUE.
  --
  -- Split 3/3 across the two changeover paths:
  --     aircon-db-a  <- maindb-2 <- TCO-1
  --     aircon-db-b  <- maindb-1 <- TCO-2
  --
  -- render_path_d is left NULL so the renderer draws a straight line from the
  -- true source. The six original SVG cables (acserverdb-to-vertivN,
  -- dcserverdb-to-vertivN) now depict wiring that does not exist and are no
  -- longer referenced; the drawing should be corrected when convenient.
  ('node-aircon-db-a', 'OUT_5', 'pac_server_vt1', 'IN', 1, 'POWER', 'acdba-to-vertiv1', 'MANUAL', true),
  ('node-aircon-db-a', 'OUT_6', 'pac_server_vt2', 'IN', 1, 'POWER', 'acdba-to-vertiv2', 'MANUAL', true),
  ('node-aircon-db-a', 'OUT_7', 'pac_server_vt3', 'IN', 1, 'POWER', 'acdba-to-vertiv3', 'MANUAL', true),
  ('node-aircon-db-b', 'OUT_15', 'pac_server_vt4', 'IN', 1, 'POWER', 'acdbb-to-vertiv4', 'MANUAL', true),
  ('node-aircon-db-b', 'OUT_16', 'pac_server_vt5', 'IN', 1, 'POWER', 'acdbb-to-vertiv5', 'MANUAL', true),
  ('node-aircon-db-b', 'OUT_17', 'pac_data_vt6', 'IN', 1, 'POWER', 'acdbb-to-vertiv6', 'MANUAL', true),
  ('node-tco-2',        'OUT_2', 'pac_server_dragor',   'IN', 1, 'POWER', 'tco2-to-dragor',        'MANUAL', true),

  -- Cooling, A-side
  ('node-aircon-db-a', 'OUT_1', 'pac_server_em1', 'IN', 1, 'POWER', 'acdba-to-ac1', 'MANUAL', true),
  ('node-aircon-db-a', 'OUT_2', 'pac_server_em2', 'IN', 1, 'POWER', 'acdba-to-ac2', 'MANUAL', true),
  ('node-aircon-db-a', 'OUT_3', 'pac_server_em6', 'IN', 1, 'POWER', 'acdba-to-ac6', 'MANUAL', true),
  ('node-aircon-db-a', 'OUT_4', 'pac_server_em7', 'IN', 1, 'POWER', 'acdba-to-ac7', 'MANUAL', true),

  -- Cooling, B-side
  ('node-aircon-db-b', 'OUT_01', 'pac_server_em3',  'IN', 1, 'POWER', 'acdbb-to-ac3',    'MANUAL', true),
  ('node-aircon-db-b', 'OUT_02', 'pac_server_em4',  'IN', 1, 'POWER', 'acdbb-to-ac4',    'MANUAL', true),
  ('node-aircon-db-b', 'OUT_03', 'pac_server_em5',  'IN', 1, 'POWER', 'acdbb-to-ac5',    'MANUAL', true),
  ('node-aircon-db-b', 'OUT_04', 'pac_pr1_em1', 'IN', 1, 'POWER', 'acdbb-to-pr1ac1', 'MANUAL', true),
  ('node-aircon-db-b', 'OUT_05', 'pac_pr1_em2', 'IN', 1, 'POWER', 'acdbb-to-pr1ac2', 'MANUAL', true),
  ('node-aircon-db-b', 'OUT_06', 'node-pr1-ac-3', 'IN', 1, 'POWER', 'acdbb-to-pr1ac3', 'MANUAL', true),
  ('node-aircon-db-b', 'OUT_07', 'pac_pr2_em1', 'IN', 1, 'POWER', 'acdbb-to-pr2ac1', 'MANUAL', true),
  ('node-aircon-db-b', 'OUT_08', 'pac_pr2_em2', 'IN', 1, 'POWER', 'acdbb-to-pr2ac2', 'MANUAL', true),
  ('node-aircon-db-b', 'OUT_09', 'pac_it1_em1', 'IN', 1, 'POWER', 'acdbb-to-it1ac1', 'MANUAL', true),
  ('node-aircon-db-b', 'OUT_10', 'pac_it1_em2', 'IN', 1, 'POWER', 'acdbb-to-it1ac2', 'MANUAL', true),
  ('node-aircon-db-b', 'OUT_11', 'pac_it2_em1', 'IN', 1, 'POWER', 'acdbb-to-it2ac1', 'MANUAL', true),
  ('node-aircon-db-b', 'OUT_12', 'pac_it2_em2', 'IN', 1, 'POWER', 'acdbb-to-it2ac2', 'MANUAL', true),
  ('node-aircon-db-b', 'OUT_13', 'pac_data_em1',  'IN', 1, 'POWER', 'acdbb-to-drac1',  'MANUAL', true),
  ('node-aircon-db-b', 'OUT_14', 'pac_data_em2',  'IN', 1, 'POWER', 'acdbb-to-drac2',  'MANUAL', true)
ON CONFLICT (source_equipment_id, source_port, target_equipment_id, target_port)
DO UPDATE SET input_priority  = EXCLUDED.input_priority,
              connection_type = EXCLUDED.connection_type,
              render_path_id  = EXCLUDED.render_path_id,
              is_active       = true;

CREATE TEMP TABLE _paths(render_path_id text PRIMARY KEY, d text) ON COMMIT DROP;
INSERT INTO _paths(render_path_id, d) VALUES
  ('acdba-to-ac1', 'M 1000 2250 L 1000 2550 L 1000 2950 L 300 2950 L 300 3100'),
  ('acdba-to-ac2', 'M 1000 2950 L 700 2950 L 700 3100'),
  ('acdba-to-ac6', 'M 1000 2950 L 2300 2950 L 2300 3100'),
  ('acdba-to-ac7', 'M 1000 2950 L 2700 2950 L 2700 3100'),
  ('acdbb-to-ac3', 'M 1900 2950 L 1100 2950 L 1100 3100'),
  ('acdbb-to-ac4', 'M 1900 2950 L 1500 2950 L 1500 3100'),
  ('acdbb-to-ac5', 'M 3100 1250 L 3100 2950 L 1900 2950 L 1900 3100'),
  ('acdbb-to-drac1', 'M 3100 1250 L 3300 1250 L 3300 2900 L 3450 2900 L 3450 3000'),
  ('acdbb-to-drac2', 'M 3450 2900 L 4050 2900 L 4050 3000'),
  ('acdbb-to-it1ac1', 'M 3100 1250 L 2450 1250 L 2450 1600'),
  ('acdbb-to-it1ac2', 'M 2450 1250 L 2750 1250 L 2750 2000'),
  ('acdbb-to-it2ac1', 'M 3100 1250 L 3450 1250 L 3450 1600'),
  ('acdbb-to-it2ac2', 'M 3450 1250 L 3750 1250 L 3750 2000'),
  ('acdbb-to-pr1ac1', 'M 3100 1250 L 3700 1250 L 3700 600 L 3900 600'),
  ('acdbb-to-pr1ac2', 'M 3700 1250 L 3700 900 L 3900 900'),
  ('acdbb-to-pr1ac3', 'M 3700 1250 L 3900 1200'),
  ('acdbb-to-pr2ac1', 'M 3100 1250 L 2100 1250 L 2100 1600 L 1800 1600'),
  ('acdbb-to-pr2ac2', 'M 2100 1600 L 2100 2200 L 1800 2200'),
  ('acserverdb-to-vertiv1', 'M 1100 4800 L 500 4800 L 500 3600 L 300 3600'),
  ('acserverdb-to-vertiv2', 'M 500 4800 L 500 4000 L 300 4000'),
  ('dcserverdb-to-vertiv3', 'M 1900 4000 L 600 4000 L 600 4400 L 300 4400'),
  ('dcserverdb-to-vertiv4', 'M 600 4000 L 600 4800 L 300 4800'),
  ('dcserverdb-to-vertiv5', 'M 600 4000 L 600 5200 L 300 5200'),
  ('dcserverdb-to-vertiv6', 'M 1900 4000 L 3750 4000 L 3750 3700'),
  ('dg-bus', 'M 300 150 L 1700 150'),
  ('dg-cable-1', 'M 300 300 L 300 150'),
  ('dg-cable-2', 'M 650 300 L 650 150'),
  ('dg-cable-3', 'M 1000 300 L 1000 150'),
  ('dg-cable-4', 'M 1350 300 L 1350 150'),
  ('dg-cable-hq', 'M 1700 300 L 1700 150'),
  ('dg-to-tco1', 'M 300 150 L 150 150 L 150 2000 L 200 2000'),
  ('dg-to-tco2', 'M 1700 150 L 2250 150 L 2250 1000 L 2300 1000'),
  ('grid-to-main', 'M 300 900 L 700 900'),
  ('main-to-tco1', 'M 700 900 L 700 1300 L 200 1300 L 200 2000'),
  ('main-to-tco2', 'M 700 900 L 1200 900 L 1200 1100 L 2300 1100 L 2300 1000'),
  ('maindb1-to-acdbb', 'M 2700 1000 L 2900 1000 L 2900 1250 L 3100 1250'),
  ('maindb1-to-rectdbb', 'M 2700 1000 L 3100 1000'),
  ('maindb1-to-upsdbb', 'M 2700 1000 L 2900 1000 L 2900 750 L 3100 750'),
  ('maindb2-to-acdba', 'M 600 2000 L 800 2000 L 800 2250 L 1000 2250'),
  ('maindb2-to-rectdba', 'M 600 2000 L 1000 2000'),
  ('maindb2-to-upsdba', 'M 600 2000 L 800 2000 L 800 1750 L 1000 1750'),
  ('rect1-to-dcserverdb', 'M 3500 1000 L 3650 1000 L 3650 2700 L 1900 2700 L 1900 4000'),
  ('rect2-to-dcserverdb', 'M 1400 2000 L 1650 2000 L 1650 2700 L 1900 2700 L 1900 4000'),
  ('rectdba-to-rect2', 'M 1000 2000 L 1400 2000'),
  ('rectdbb-to-rect1', 'M 3100 1000 L 3500 1000'),
  ('tco1-to-maindb2', 'M 200 2000 L 600 2000'),
  ('tco2-to-dragor', 'M 2300 1000 L 2150 1000 L 2150 2600 L 1500 2600 L 1500 4400'),
  ('tco2-to-maindb1', 'M 2300 1000 L 2700 1000'),
  ('ups1-to-acserverdb', 'M 3500 750 L 3600 750 L 3600 2600 L 1100 2600 L 1100 4800'),
  ('ups2-to-acserverdb', 'M 1400 1750 L 1600 1750 L 1600 2650 L 1100 2650 L 1100 4800'),
  ('upsdba-to-ups2', 'M 1000 1750 L 1400 1750'),
  ('upsdbb-to-ups1', 'M 3100 750 L 3500 750');

UPDATE public.equipment_connections c
   SET render_path_d = p.d
  FROM _paths p, public.equipment_registry e
 WHERE c.render_path_id = p.render_path_id
   AND e.equipment_id = c.source_equipment_id
   AND e.site_uuid = (SELECT site_uuid FROM _site);


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. REPORT
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_site uuid; v_nodes int; v_drawn int; v_sim int; v_edges int; v_issues int;
BEGIN
  SELECT site_uuid INTO v_site FROM _site;

  SELECT count(*), count(*) FILTER (WHERE layout_x IS NOT NULL),
         count(*) FILTER (WHERE engine_type IS NOT NULL)
    INTO v_nodes, v_drawn, v_sim
    FROM public.equipment_registry WHERE site_uuid = v_site;

  SELECT count(*) INTO v_edges
    FROM public.equipment_connections c
    JOIN public.equipment_registry e ON e.equipment_id = c.source_equipment_id
   WHERE e.site_uuid = v_site;

  SELECT count(*) INTO v_issues
    FROM public.topology_graph_issues
   WHERE site_uuid = v_site AND issue <> 'NOT_DRAWN';

  RAISE NOTICE 'Site 1 topology: % equipment, % drawn, % simulated, % cables',
    v_nodes, v_drawn, v_sim, v_edges;

  IF v_issues > 0 THEN
    RAISE WARNING '% graph issue(s) — inspect public.topology_graph_issues', v_issues;
  END IF;
END $$;

COMMIT;
