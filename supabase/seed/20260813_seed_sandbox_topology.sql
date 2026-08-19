-- ═══════════════════════════════════════════════════════════════════════════
-- 20260813_seed_sandbox_topology.sql
-- DCIMe V2 — the "Dummy Room" sandbox (V2 doc, Part 4.5)
--
-- Reproduces, in the database, the topology currently hardcoded in
-- public/topology_engine/renderer/engine.js:
--     nodes  <- seedInitialTopology()  (~line 550)
--     edges  <- directFeederMap        (~line 630)
--
-- EDGE COUNT, verified by parsing engine.js rather than assumed:
--     47  entries in directFeederMap   (one per node that has a feeder)
--     44  actual edges (the sum of every `devs` array)
--      5  generators listed as ROOTS with `devs: []` — they have SVG cables
--         (dg-cable-1..4, dg-cable-hq) drawn in the renderer but NO recorded
--         downstream connection anywhere in the current code
--
-- The generator connections were then RECOVERED from index.html rather than
-- guessed: dg-cable-1..4 and dg-cable-hq all rise to y=150, where dg-bus
-- (M 300 150 L 1700 150) runs horizontally and feeds BOTH changeovers through
-- dg-to-tco1 / dg-to-tco2. All five generators parallel onto a shared busbar.
--     ---
--     51  edges = 44 copied + 5 DG->bus + 2 bus->TCO
--     50  nodes = 48 from engine.js + FM-200 (drawn only) + the bus
--
-- All 52 SVG cable paths are now accounted for: 51 on edges, 1 (dg-bus) on the
-- busbar node itself.
--
-- That equivalence is the whole point. When Stage 3 switches engine.js to read
-- from get_topology_graph(), the rendered topology must look IDENTICAL. Any
-- visible difference is a bug in the migration, not a change in the model —
-- which makes it a refactor you verify by eye rather than one you trust.
--
-- ISOLATION: everything lands under site_code 'SANDBOX'. No real site row is
-- read or written. Safe against production; safe to re-run.
--
-- Requires: 20260812_reference_layer.sql, 20260813_topology_graph.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 0. Sandbox site + rooms ───────────────────────────────────────────────
INSERT INTO public.sites (site_code, site_name)
VALUES ('SANDBOX', 'Sandbox Facility')
ON CONFLICT (site_code) DO NOTHING;

CREATE TEMP TABLE _sb ON COMMIT DROP AS
  SELECT id AS site_uuid FROM public.sites WHERE site_code = 'SANDBOX';

-- Idempotency: wipe only sandbox topology, never anything else.
DELETE FROM public.equipment_connections
 WHERE source_equipment_id IN (
   SELECT equipment_id FROM public.equipment_registry
    WHERE site_uuid = (SELECT site_uuid FROM _sb));

DELETE FROM public.equipment_parameters
 WHERE equipment_id IN (
   SELECT equipment_id FROM public.equipment_registry
    WHERE site_uuid = (SELECT site_uuid FROM _sb));

DELETE FROM public.equipment_registry
 WHERE site_uuid = (SELECT site_uuid FROM _sb);

DELETE FROM public.rooms WHERE site_id = (SELECT site_uuid FROM _sb);

INSERT INTO public.rooms (room_name, site_id, sort_order)
SELECT r.name, (SELECT site_uuid FROM _sb), r.ord
  FROM (VALUES
    ('Server Room',  0), ('Data Room',    1), ('Power Room 1', 2),
    ('Power Room 2', 3), ('IT Room 1',    4), ('IT Room 2',    5),
    ('Genset Yard',  6)
  ) AS r(name, ord);


-- ═══════════════════════════════════════════════════════════════════════════
-- 1. NODES — 50 instances deployed from the Stage 1 templates
--
--    Physics comes from the template's default_parameters, overridden per
--    instance where engine.js carried a specific literal. That is Rule 1
--    working: the blueprint holds the spec, the instance holds what is unique.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.equipment_registry
  (equipment_id, name, category, location, room_id, site_uuid,
   template_id, template_version, engine_type, dynamic_parameters,
   input_policy, provenance, is_active, sort_order)
SELECT v.equipment_id, v.name, t.category, v.location,
       rm.id,
       (SELECT site_uuid FROM _sb),
       v.template_id, t.version, t.engine_type,
       t.default_parameters || v.overrides,
       v.input_policy, 'MANUAL', true, v.sort_order
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
  LEFT JOIN public.rooms rm
         ON rm.room_name = v.location
        AND rm.site_id   = (SELECT site_uuid FROM _sb);


-- HQ aircons inherit engine_type 'cooling' from TPL_PAC, but belong to another
-- facility's power path. Clearing it keeps them out of this site's graph while
-- leaving their parameters intact.
UPDATE public.equipment_registry SET engine_type = NULL
 WHERE site_uuid = (SELECT site_uuid FROM _sb)
   AND equipment_id IN ('pac_hq_em1','pac_hq_em2','pac_hq_em3');

-- Every row is the subject of metric keys sharing its id as a prefix.
UPDATE public.equipment_registry SET metric_prefix = equipment_id
 WHERE site_uuid = (SELECT site_uuid FROM _sb);


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. EDGES — directFeederMap, flipped to power-flow direction
--
--    engine.js stores child -> parents (an upstream lookup). Here it is
--    source -> target, the direction power actually travels, so a downstream
--    cascade is a plain forward traversal. render_path_id carries the original
--    SVG path id through unchanged, so cable highlighting survives the switch.
-- ═══════════════════════════════════════════════════════════════════════════
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
  ('node-aircon-db-b', 'OUT_14', 'pac_data_em2',  'IN', 1, 'POWER', 'acdbb-to-drac2',  'MANUAL', true);


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. SELF-CHECK — fail loudly rather than seed a broken graph
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_site  uuid;
  v_nodes int;
  v_edges int;
  v_bad   int;
  v_issue text;
BEGIN
  SELECT id INTO v_site FROM public.sites WHERE site_code = 'SANDBOX';

  SELECT count(*) INTO v_nodes
    FROM public.equipment_registry WHERE site_uuid = v_site;

  SELECT count(*) INTO v_edges
    FROM public.equipment_connections c
    JOIN public.equipment_registry e ON e.equipment_id = c.source_equipment_id
   WHERE e.site_uuid = v_site;

  -- NOT_DRAWN is deliberately excluded: layout coordinates arrive in the NEXT
  -- file (20260814_seed_topology_layout.sql), so every node is legitimately
  -- undrawn at this point. That file asserts drawing completeness itself.
  SELECT count(*) INTO v_bad
    FROM public.topology_graph_issues
   WHERE site_uuid = v_site AND issue <> 'NOT_DRAWN';

  -- 48 from engine.js + FM-200 (drawn, not simulated) + the paralleling bus
  IF v_nodes <> 64 THEN
    RAISE EXCEPTION 'Seed failed: expected 64 nodes, got %', v_nodes;
  END IF;
  -- 44 copied from directFeederMap + 5 DG->bus + 2 bus->TCO
  IF v_edges <> 51 THEN
    RAISE EXCEPTION 'Seed failed: expected 51 edges, got %', v_edges;
  END IF;
  IF v_bad > 0 THEN
    SELECT string_agg(equipment_id || ' (' || issue || ')', ', ')
      INTO v_issue FROM public.topology_graph_issues
     WHERE site_uuid = v_site AND issue <> 'NOT_DRAWN';
    RAISE EXCEPTION 'Seed produced % graph issue(s): %', v_bad, v_issue;
  END IF;

  RAISE NOTICE 'Sandbox topology OK: % nodes, % edges, 0 issues.', v_nodes, v_edges;
END $$;

COMMIT;

-- ── Verify by hand ─────────────────────────────────────────────────────────
--   SELECT jsonb_pretty(public.get_topology_graph(
--     (SELECT id FROM public.sites WHERE site_code = 'SANDBOX')));
--
-- Expect {"nodes":[48], "edges":[47], ...} — the payload engine.js consumes
-- in Stage 3 in place of its literals.
