-- ==========================================================================
-- 20260839_walking_path.sql
-- DCIMe V2.1 — Stage 1: the reading round moves into the database.
--
-- The last thing the blueprint JSON held that the registry did not. Rooms,
-- equipment and parameters are all in the database now; the walking order — the
-- sequence a technician physically follows, which visits the Server Room twice
-- because the Emerson units and the Vertiv units are at opposite ends of it —
-- was the one remaining reason a screen still had to read the file.
--
-- Room is resolved by NAME rather than by the blueprint's slug: the slugs
-- (room_server) exist only in the JSON, while rooms.room_name is what the
-- database has always keyed on, and the two agree for all 14 rooms.
--
-- Idempotent: safe to re-run.
-- ==========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.walking_path (
  site_uuid     uuid    NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  step_number   int     NOT NULL,
  name          text    NOT NULL,
  room_id       uuid    REFERENCES public.rooms(id) ON DELETE SET NULL,
  -- Deliberately not FK-constrained to equipment_registry: a step lists assets
  -- in walking order, and losing the whole step because one asset was
  -- decommissioned would silently drop a room from the round.
  equipment_ids text[]  NOT NULL DEFAULT '{}',
  -- Some steps stay on the round even when nothing in them is currently due.
  -- The generator and fuel step is the case that exists today: a technician
  -- starts and manages a generator test from it, so it has to be reachable
  -- whether or not any of its readings are scheduled this hour. That was a
  -- hardcoded room-slug comparison in RoutineTasksDashboard; here it is a fact
  -- about the step.
  always_visible boolean NOT NULL DEFAULT false,
  PRIMARY KEY (site_uuid, step_number)
);

ALTER TABLE public.walking_path
  ADD COLUMN IF NOT EXISTS always_visible boolean NOT NULL DEFAULT false;

COMMENT ON TABLE public.walking_path IS
  'The order a technician physically walks a site. A room may appear more than '
  'once — Server Room is visited twice because its Emerson and Vertiv units sit '
  'at opposite ends.';

ALTER TABLE public.walking_path ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Walking path: site-scoped read" ON public.walking_path;
CREATE POLICY "Walking path: site-scoped read"
  ON public.walking_path FOR SELECT
  USING (auth.role() = 'authenticated' AND site_uuid = public.get_my_site_uuid());

DROP POLICY IF EXISTS "Walking path: admin write" ON public.walking_path;
CREATE POLICY "Walking path: admin write"
  ON public.walking_path FOR ALL
  USING (public.get_my_role() = 'ADMIN')
  WITH CHECK (public.get_my_role() = 'ADMIN');


-- ------------------------------------------------------------------------
-- SITE_01 — 10 steps
-- ------------------------------------------------------------------------
INSERT INTO public.walking_path (site_uuid, step_number, name, room_id, equipment_ids)
SELECT s.id, v.step_number, v.name,
       (SELECT r.id FROM public.rooms r WHERE r.site_id = s.id AND r.room_name = v.room_name),
       v.equipment_ids
  FROM public.sites s, (VALUES
    (1, 'Server Room - Emerson Aircons', 'Server Room', ARRAY['room_server_ambient','pac_server_em1','pac_server_em2','pac_server_em3','pac_server_em4','pac_server_em5','pac_server_em6','pac_server_em7']::text[]),
    (2, 'Power Room 1', 'Power Room 1', ARRAY['room_pr1_ambient','pac_pr1_em1','pac_pr1_em2','rectifier_1','ups_1']::text[]),
    (3, 'Power Room 2', 'Power Room 2', ARRAY['room_pr2_ambient','pac_pr2_em1','pac_pr2_em2','rectifier_2','ups_2']::text[]),
    (4, 'Server Room - Vertiv Units & Dragor', 'Server Room', ARRAY['pac_server_vt1','pac_server_vt2','pac_server_vt3','pac_server_vt4','pac_server_vt5','pac_server_dragor']::text[]),
    (5, 'Data Room', 'Data Room', ARRAY['room_data_ambient','pac_data_vt6','pac_data_em1','pac_data_em2']::text[]),
    (6, 'IT Room 2', 'IT Room 2', ARRAY['room_it2_ambient','pac_it2_em1','pac_it2_em2']::text[]),
    (7, 'IT Room 1', 'IT Room 1', ARRAY['room_it1_ambient','pac_it1_em1','pac_it1_em2']::text[]),
    (8, 'Utility Load Room', 'Utility Load Room', ARRAY['grid_main']::text[]),
    (9, 'HQ Power Room', 'HQ Power Room', ARRAY['room_hq_ambient','pac_hq_em1','pac_hq_em2','pac_hq_em3','fm200_panel','room_workstation']::text[]),
    (10, 'Generator Fleet & Fuel', 'Fuel Reservoir', ARRAY['dg_1','dg_2','dg_3','dg_4','dg_hq','fuel_tank_main']::text[])
  ) AS v(step_number, name, room_name, equipment_ids)
 WHERE s.site_code = 'SITE_01'
ON CONFLICT (site_uuid, step_number) DO UPDATE
   SET name = EXCLUDED.name, room_id = EXCLUDED.room_id,
       equipment_ids = EXCLUDED.equipment_ids;

-- ------------------------------------------------------------------------
-- SITE_02 — 5 steps
-- ------------------------------------------------------------------------
INSERT INTO public.walking_path (site_uuid, step_number, name, room_id, equipment_ids)
SELECT s.id, v.step_number, v.name,
       (SELECT r.id FROM public.rooms r WHERE r.site_id = s.id AND r.room_name = v.room_name),
       v.equipment_ids
  FROM public.sites s, (VALUES
    (1, 'Server Room - Emerson Aircons', 'Server Room', ARRAY['room_server_ambient','pac_server_em1','pac_server_em2']::text[]),
    (2, 'Power Room 1', 'Power Room 1', ARRAY['room_pr1_ambient','pac_pr1_em1','rectifier_1','ups_1']::text[]),
    (3, 'IT Room 1', 'IT Room 1', ARRAY['room_it1_ambient','pac_it1_em1']::text[]),
    (4, 'Utility Load Room', 'Utility Load Room', ARRAY['grid_main']::text[]),
    (5, 'Generator Fleet & Fuel', 'Fuel Reservoir', ARRAY['dg_1','dg_hq','fuel_tank_main']::text[])
  ) AS v(step_number, name, room_name, equipment_ids)
 WHERE s.site_code = 'SITE_02'
ON CONFLICT (site_uuid, step_number) DO UPDATE
   SET name = EXCLUDED.name, room_id = EXCLUDED.room_id,
       equipment_ids = EXCLUDED.equipment_ids;

-- The generator and fuel step, by the room it belongs to rather than by name.
UPDATE public.walking_path w
   SET always_visible = true
  FROM public.rooms r
 WHERE r.id = w.room_id
   AND r.room_name = 'Fuel Reservoir'
   AND w.always_visible IS DISTINCT FROM true;

COMMIT;

DO $$
DECLARE v_steps int; v_unmatched int;
BEGIN
  SELECT count(*) INTO v_steps FROM public.walking_path;
  SELECT count(*) INTO v_unmatched FROM public.walking_path WHERE room_id IS NULL;
  RAISE NOTICE 'walking_path: % steps loaded, % with no matching room', v_steps, v_unmatched;
  IF v_unmatched > 0 THEN
    RAISE WARNING 'Some steps did not match a room by name — check rooms.room_name.';
  END IF;
END $$;
