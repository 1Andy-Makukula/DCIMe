-- ============================================================
-- DCIMe — Site Manager Commentary & Ongoing Items
-- Run in Supabase Dashboard → SQL Editor
--
-- Backs two things on the Executive Summary full report that no telemetry
-- reading can generate on its own:
--   1. COMMENTARY — dated notes in the site manager's own words ("what's
--      really going on"). Report shows the last 5.
--   2. ONGOING    — a persistent status list (open maintenance, watch
--      items) that stays visible across days until marked resolved,
--      independent of any single day's telemetry snapshot.
-- Both are human-authored text. Nothing here is inferred from readings.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.site_commentary (
  id           uuid        NOT NULL DEFAULT uuid_generate_v4(),
  site_uuid    uuid        NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  note_type    text        NOT NULL CHECK (note_type IN ('COMMENTARY', 'ONGOING')),
  body         text        NOT NULL,
  author_name  text        NOT NULL DEFAULT '',
  author_id    text        NOT NULL DEFAULT '',
  -- Only meaningful for ONGOING rows — a manager marks an item resolved
  -- without deleting the record, so it drops off the live list but the
  -- history stays intact. COMMENTARY rows stay true; their "resolution"
  -- is just falling out of the last-5 window.
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_commentary_site_created_idx
  ON public.site_commentary (site_uuid, note_type, created_at DESC);

ALTER TABLE public.site_commentary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Site commentary: site-scoped read" ON public.site_commentary;
DROP POLICY IF EXISTS "Site commentary: site-scoped insert" ON public.site_commentary;
DROP POLICY IF EXISTS "Site commentary: site-scoped update" ON public.site_commentary;

CREATE POLICY "Site commentary: site-scoped read"
  ON public.site_commentary FOR SELECT
  USING (site_uuid = public.get_my_site_uuid());

CREATE POLICY "Site commentary: site-scoped insert"
  ON public.site_commentary FOR INSERT
  WITH CHECK (site_uuid = public.get_my_site_uuid());

-- Update is scoped to the same site and restricted in practice to toggling
-- is_active (resolving an ongoing item) — enforced at the application layer,
-- since RLS WITH CHECK re-validates site_uuid but not which columns changed.
CREATE POLICY "Site commentary: site-scoped update"
  ON public.site_commentary FOR UPDATE
  USING (site_uuid = public.get_my_site_uuid())
  WITH CHECK (site_uuid = public.get_my_site_uuid());

-- Deliberately no DELETE policy — a note or ongoing item is resolved by
-- setting is_active = false, not removed, so the report's history stays
-- reconstructable.
