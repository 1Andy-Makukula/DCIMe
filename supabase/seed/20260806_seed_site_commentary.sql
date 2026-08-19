-- ============================================================
-- DCIMe — Seed sample Site Commentary & Ongoing Items
-- Run in Supabase Dashboard → SQL Editor, AFTER 20260806_site_commentary.sql
--
-- This is placeholder/demo content so the Executive Summary full report has
-- something real to render while the feature is being tried out — not a
-- claim that these events actually happened.
--
-- IMPORTANT: this report is read BY administration IN a brief leadership
-- meeting, not a technician handover log. Every entry here interprets what
-- the numbers mean and flags what (if anything) needs a decision from
-- leadership — it does not remind staff to do their jobs.
--
-- Safe to re-run: it deletes its own previous seed rows (by author_id =
-- 'SITE-MGR') before inserting, so running this twice won't duplicate rows
-- or leave the earlier, wrongly-toned version sitting alongside it.
--
-- Edit the site_code below if this isn't going to Site 1. Delete any row
-- afterwards with:
--   DELETE FROM public.site_commentary WHERE id = '<id>';
-- or resolve an ONGOING row from the report UI itself (marks it
-- is_active = false rather than deleting it).
-- ============================================================

DO $$
DECLARE
  v_site_uuid uuid;
BEGIN
  SELECT id INTO v_site_uuid FROM public.sites WHERE site_code = 'SITE_01' LIMIT 1;

  IF v_site_uuid IS NULL THEN
    RAISE EXCEPTION 'No site found with site_code = SITE_01 — check your sites table or edit this script.';
  END IF;

  DELETE FROM public.site_commentary
  WHERE site_uuid = v_site_uuid AND author_id = 'SITE-MGR';

  -- ── Commentary (dated notes, most recent first) ──────────────────
  -- Each one interprets the numbers for someone who isn't watching the
  -- dashboard daily — the "so what" behind the report, not raw status.
  INSERT INTO public.site_commentary (site_uuid, note_type, body, author_name, author_id, created_at) VALUES
    (v_site_uuid, 'COMMENTARY',
     'Nothing requires a decision from you this week. The one item worth keeping on your radar going into next month is the UPS-2 watch item below.',
     'A. Makukula', 'SITE-MGR', now() - interval '1 hour'),

    (v_site_uuid, 'COMMENTARY',
     'DG-3''s scheduled no-load test cadence has held for three months straight. Worth mentioning at board level — that consistency is what keeps our compliance and insurance posture clean, and it costs nothing extra to maintain.',
     'A. Makukula', 'SITE-MGR', now() - interval '1 day'),

    (v_site_uuid, 'COMMENTARY',
     'All six thermal zones came back within range on this morning''s walk-through. No cooling-related spend expected this month.',
     'A. Makukula', 'SITE-MGR', now() - interval '2 days'),

    (v_site_uuid, 'COMMENTARY',
     'Fuel and generator figures this week are unremarkable — no unplanned runtime, no burn-rate variance worth flagging. I''d treat this week as the clean baseline to compare future months against.',
     'A. Makukula', 'SITE-MGR', now() - interval '3 days'),

    (v_site_uuid, 'COMMENTARY',
     'No open tickets and nothing outstanding heading into the weekend — a clean operational week, and a fair baseline to measure against once the UPS-2 item below is closed out.',
     'A. Makukula', 'SITE-MGR', now() - interval '4 days');

  -- ── Ongoing items (persist until resolved from the report UI) ────
  -- Framed as what leadership should be aware of, not a task list for staff.
  INSERT INTO public.site_commentary (site_uuid, note_type, body, author_name, author_id, created_at) VALUES
    (v_site_uuid, 'ONGOING',
     'UPS-2 battery remains on watch following last month''s undercharge event. No recurrence so far, but I''m holding off marking it fully resolved until it passes a full load test — flagging in case this becomes a capital request for a battery replacement.',
     'A. Makukula', 'SITE-MGR', now() - interval '6 days'),

    (v_site_uuid, 'ONGOING',
     'PAC-2 filter replacement is in progress with the contractor, no site impact expected. Only flagging it because replacement frequency on this unit has crept up — worth watching as a recurring cost line if it keeps happening.',
     'A. Makukula', 'SITE-MGR', now() - interval '3 days');

END $$;
