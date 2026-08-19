-- ═══════════════════════════════════════════════════════════════════════════
-- 20260815_seed_demo_it_load.sql
-- DCIMe V2 — demonstration IT load
--
-- WHY THIS EXISTS
-- Reclassifying the Vertiv and Dragor units as precision cooling left the model
-- with ZERO IT-load nodes: in this facility the real IT equipment hangs off the
-- UPS and rectifier outputs and was never drawn on the V1 single line. That is
-- fine for PUE — IT load is measured at the conversion tier — but it means a
-- simulated failure visibly stops at a distribution board, which lands flat in
-- front of an audience.
--
-- These 10 racks give the cascade somewhere to arrive.
--
-- IMPORTANT — these are DEMONSTRATION nodes, not surveyed equipment:
--   provenance = 'IMPORT'  (not 'MANUAL') so they are distinguishable from
--   hand-verified topology and can be removed with a single predicate:
--       DELETE FROM equipment_registry WHERE template_id IN
--         ('TPL_RACK_AC_DEMO','TPL_RACK_DC_DEMO');
--
-- PUE IS UNAFFECTED. The denominator stays Sum(UPS output) + Sum(rectifier
-- output), measured at the conversion tier. These racks are downstream of that
-- measurement point, so counting them as well would double-count IT load.
--
-- Requires: 20260813_seed_sandbox_topology.sql, 20260814_seed_topology_layout.sql
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TEMP TABLE _sb ON COMMIT DROP AS
  SELECT id AS site_uuid FROM public.sites WHERE site_code = 'SITE_01';

-- ── Templates ─────────────────────────────────────────────────────────────
-- Capacity deliberately exceeds load so headroom is non-zero and the Stage 4
-- reverse pass has something meaningful to compute.
INSERT INTO public.equipment_templates
  (template_id, display_name, category, engine_type, manufacturer, model, default_parameters)
VALUES
  ('TPL_RACK_AC_DEMO', 'AC Server Rack (demo)', 'IT_LOAD', 'server', 'Generic', 'HV-42U',
     '{"capacity": 8.0, "voltage": 230.0, "kw_load": 5.0, "u_space": 42}'::jsonb),
  -- Telecom DC is nominally -48V; the model carries the rectifier float voltage
  -- (54.2V) so it stays consistent with the upstream nodes rather than mixing
  -- sign conventions inside the same graph.
  ('TPL_RACK_DC_DEMO', 'DC Telecom Rack (demo)', 'IT_LOAD', 'server', 'Generic', 'BSC-48V',
     '{"capacity": 5.0, "voltage": 54.2, "kw_load": 3.0, "u_space": 42}'::jsonb)
ON CONFLICT (template_id) DO UPDATE
  SET default_parameters = EXCLUDED.default_parameters,
      version            = public.equipment_templates.version + 1;

-- ── Idempotency ───────────────────────────────────────────────────────────
DELETE FROM public.equipment_connections
 WHERE target_equipment_id IN (
   SELECT equipment_id FROM public.equipment_registry
    WHERE site_uuid = (SELECT site_uuid FROM _sb)
      AND template_id IN ('TPL_RACK_AC_DEMO','TPL_RACK_DC_DEMO'));

DELETE FROM public.equipment_registry
 WHERE site_uuid = (SELECT site_uuid FROM _sb)
   AND template_id IN ('TPL_RACK_AC_DEMO','TPL_RACK_DC_DEMO');

-- ── Nodes ─────────────────────────────────────────────────────────────────
-- CORRECTED POSITIONS. These first sat in one row at y = 5800, which put the AC
-- racks exactly on the Server Room plate's bottom edge and the DC racks
-- (x 2400-4000) outside it altogether — that plate spans x 100-3000. Equipment
-- floating outside its own room is precisely what topology_layout_issues now
-- catches, so it would have failed its own check.
--
-- Both rows now sit inside the Server Room plate. Telecom racks living in the
-- server room is ordinary; the Data Room plate is only 1100 units wide and
-- already holds its own cooling.
INSERT INTO public.equipment_registry
  (equipment_id, name, category, location, room_id, site_uuid,
   template_id, template_version, engine_type, dynamic_parameters,
   input_policy, provenance, is_active, sort_order,
   layout_x, layout_y, render_shape)
SELECT v.equipment_id, v.name, t.category, v.location,
       rm.id, (SELECT site_uuid FROM _sb),
       v.template_id, t.version, t.engine_type, t.default_parameters,
       -- ANY: alive while EITHER cord is energised. That is the whole point of
       -- a dual-corded rack, and it is what makes killing one UPS visibly
       -- survivable while killing both is not.
       'ANY', 'IMPORT', true, v.sort_order,
       v.x, v.y, 'server'
  FROM (VALUES
    -- AC row, y = 5150
    ('node-rack-ac-1', 'AC Rack 1 (Hypervisor)',  'Server Room', 'TPL_RACK_AC_DEMO',  400.0, 5150.0, 200),
    ('node-rack-ac-2', 'AC Rack 2 (Hypervisor)',  'Server Room', 'TPL_RACK_AC_DEMO',  900.0, 5150.0, 201),
    ('node-rack-ac-3', 'AC Rack 3 (Hypervisor)',  'Server Room', 'TPL_RACK_AC_DEMO', 1400.0, 5150.0, 202),
    ('node-rack-ac-4', 'AC Rack 4 (Hypervisor)',  'Server Room', 'TPL_RACK_AC_DEMO', 1900.0, 5150.0, 203),
    ('node-rack-ac-5', 'AC Rack 5 (Hypervisor)',  'Server Room', 'TPL_RACK_AC_DEMO', 2400.0, 5150.0, 204),
    -- DC row, y = 5550. Located in the Server Room rather than the Data Room:
    -- that plate is only 1100 units wide and already holds its own cooling.
    ('node-rack-dc-1', 'DC Rack 1 (BSC Core)',     'Server Room', 'TPL_RACK_DC_DEMO',  400.0, 5550.0, 210),
    ('node-rack-dc-2', 'DC Rack 2 (BSC Core)',     'Server Room', 'TPL_RACK_DC_DEMO',  900.0, 5550.0, 211),
    ('node-rack-dc-3', 'DC Rack 3 (Transmission)', 'Server Room', 'TPL_RACK_DC_DEMO', 1400.0, 5550.0, 212),
    ('node-rack-dc-4', 'DC Rack 4 (Transmission)', 'Server Room', 'TPL_RACK_DC_DEMO', 1900.0, 5550.0, 213),
    ('node-rack-dc-5', 'DC Rack 5 (Core Router)',  'Server Room', 'TPL_RACK_DC_DEMO', 2400.0, 5550.0, 214)
  ) AS v(equipment_id, name, location, template_id, x, y, sort_order)
  JOIN public.equipment_templates t ON t.template_id = v.template_id
  LEFT JOIN public.rooms rm
         ON rm.room_name = v.location AND rm.site_id = (SELECT site_uuid FROM _sb);

-- ── Edges: racks hang off the server distribution boards ──────────────────
--
-- DUAL-CORDED, as the facility confirms.
--
--     UPS-1       -> AC SERVER BUS A ─┐
--                                     ├─> every AC rack (PSU_A + PSU_B)
--     UPS-2       -> AC SERVER BUS B ─┘
--
--     Rectifier-1 -> DC SERVER BUS A ─┐
--                                     ├─> every DC rack (FEED_A + FEED_B)
--     Rectifier-2 -> DC SERVER BUS B ─┘
--
-- Each rack carries two power supply units, one cabled to each bus. Both are
-- live and share the draw; if an input dies the surviving PSU takes the whole
-- load instantly, in hardware. There is no transfer switch and no changeover
-- delay — that is the entire point of dual-corded equipment, and it is why the
-- rack's input policy is ANY.
--
-- Earlier revisions modelled this as ONE board fed by both sources. The
-- capacity arithmetic came out identical, but the drawing could not show WHY a
-- rack survives. Two buses and two cords can.
--
-- render_path_d is NULL: the renderer falls back to a straight line, which is
-- correct for a cable that was never hand-routed.
INSERT INTO public.equipment_connections
  (source_equipment_id, source_port, target_equipment_id, target_port,
   input_priority, connection_type, render_path_id, provenance, is_active)
SELECT s.src, s.sport, r.equipment_id, s.tport, s.prio, 'POWER',
       s.prefix || right(r.equipment_id, 1), 'IMPORT', true
  FROM public.equipment_registry r
  JOIN (VALUES
    -- Two cords per rack, from genuinely independent sources.
    ('TPL_RACK_AC_DEMO', 'node-ac-server-db',   'OUT_RACK', 'PSU_A', 1, 'busa-to-rack-ac-'),
    ('TPL_RACK_AC_DEMO', 'node-ac-server-db-b', 'OUT_RACK', 'PSU_B', 2, 'busb-to-rack-ac-'),
    ('TPL_RACK_DC_DEMO', 'node-dc-server-db',   'OUT_RACK', 'FEED_A', 1, 'busa-to-rack-dc-'),
    ('TPL_RACK_DC_DEMO', 'node-dc-server-db-b', 'OUT_RACK', 'FEED_B', 2, 'busb-to-rack-dc-')
  ) AS s(tpl, src, sport, tport, prio, prefix)
    ON s.tpl = r.template_id
 WHERE r.site_uuid = (SELECT site_uuid FROM _sb);

-- ── Self-check ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_site uuid; v_racks int; v_cords int; v_single int; v_boards int; v_bad int; v_detail text;
BEGIN
  SELECT site_uuid INTO v_site FROM _sb;

  SELECT count(*) INTO v_racks FROM public.equipment_registry
   WHERE site_uuid = v_site AND template_id IN ('TPL_RACK_AC_DEMO','TPL_RACK_DC_DEMO');

  SELECT count(*) INTO v_cords FROM public.equipment_connections c
    JOIN public.equipment_registry r ON r.equipment_id = c.target_equipment_id
   WHERE r.site_uuid = v_site
     AND r.template_id IN ('TPL_RACK_AC_DEMO','TPL_RACK_DC_DEMO');

  -- Exactly one feed per rack; the redundancy lives at the board above it.
  SELECT count(*) INTO v_single FROM (
    SELECT c.target_equipment_id
      FROM public.equipment_connections c
      JOIN public.equipment_registry r ON r.equipment_id = c.target_equipment_id
     WHERE r.site_uuid = v_site
       AND r.template_id IN ('TPL_RACK_AC_DEMO','TPL_RACK_DC_DEMO')
     GROUP BY c.target_equipment_id HAVING count(*) <> 2
  ) t;

  -- Each bus takes exactly ONE source. Redundancy is at the rack now.
  SELECT count(*) INTO v_boards FROM (
    SELECT c.target_equipment_id
      FROM public.equipment_connections c
     WHERE c.target_equipment_id IN ('node-ac-server-db','node-ac-server-db-b',
                                     'node-dc-server-db','node-dc-server-db-b')
     GROUP BY c.target_equipment_id HAVING count(*) = 1
  ) b;

  -- Scoped to the rows THIS seed created. Asserting zero issues site-wide made
  -- the seed refuse to run because of pre-existing gaps it did not cause and
  -- cannot fix — the HQ air conditioners, which were never on the single-line
  -- diagram and so have neither coordinates nor a recorded feed.
  SELECT count(*) INTO v_bad
    FROM public.topology_graph_issues i
    JOIN public.equipment_registry r ON r.equipment_id = i.equipment_id
   WHERE i.site_uuid = v_site
     AND r.template_id IN ('TPL_RACK_AC_DEMO','TPL_RACK_DC_DEMO');

  IF v_racks <> 10 THEN
    RAISE EXCEPTION 'expected 10 racks, got %', v_racks;
  END IF;
  IF v_cords <> 20 THEN
    RAISE EXCEPTION 'expected 20 cords (2 per rack), got %', v_cords;
  END IF;
  IF v_single > 0 THEN
    RAISE EXCEPTION '% rack(s) are not dual-corded', v_single;
  END IF;
  IF v_boards <> 4 THEN
    RAISE EXCEPTION 'all 4 buses must take exactly one source; % do', v_boards;
  END IF;
  IF v_bad > 0 THEN
    SELECT string_agg(i.equipment_id || ' (' || i.issue || ')', ', ') INTO v_detail
      FROM public.topology_graph_issues i
      JOIN public.equipment_registry r ON r.equipment_id = i.equipment_id
     WHERE i.site_uuid = v_site
       AND r.template_id IN ('TPL_RACK_AC_DEMO','TPL_RACK_DC_DEMO');
    RAISE EXCEPTION 'graph issue(s): %', v_detail;
  END IF;

  RAISE NOTICE 'Demo IT load OK: % racks, % cords, all dual-corded across A and B buses, 0 issues.', v_racks, v_cords;
END $$;

COMMIT;
