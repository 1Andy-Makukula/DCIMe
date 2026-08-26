-- ═══════════════════════════════════════════════════════════════════════════
-- 20260863_synthetic_reports.sql
-- DCIMe V2.1 — the paperwork the readings would have generated.
--
-- WHY THESE ARE WRITTEN DIRECTLY RATHER THAN LET THE MACHINERY PRODUCE THEM
-- The elegant version would be to let evaluate_thresholds() see the injected
-- readings and raise its own work items. It cannot: the function looks only at
-- readings from the last 48 hours and takes the newest per asset-parameter. Run
-- against three months of history it would produce a handful of alarms, all
-- stamped with today's date, and none of the lifecycle that makes a work queue
-- worth looking at.
--
-- So the work items are written here — but written to be INDISTINGUISHABLE from
-- what the cron produces going forward: same title wording, same source_ref
-- convention (equipment.parameter), same severity function, same breach
-- evidence stamped on the row. When the scheduled job next runs it will see
-- these as its own and de-duplicate against them correctly.
--
-- THE ASSIGNMENT MODEL IS YOURS
-- Not an offer somebody accepts. A work item is broadcast to whoever is on
-- shift, several people acknowledge it, and whichever of them actually does it
-- resolves it with a note. That is what assigned_scope = 'ON_SHIFT' plus
-- multiple work_item_acks plus a single resolved_by represents here.
--
-- ONE BREACH PER SOURCE PER WEEK
-- 10,327 readings breach. Raising a work item for each would be nonsense —
-- evaluate_thresholds() deliberately will not raise a second while one is open.
-- So the worst breach per asset-parameter per week becomes one item, which is
-- the real pattern: raised, dealt with, recurs.
--
-- NOT EVERYTHING IS CLOSED. A queue where every item is resolved is a queue
-- nobody has ever worked. Roughly a fifth stay open or in progress.
--
-- Everything is marked SYNTHETIC and removed by purge_synthetic_data().
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- The two report tables missed in 20260860, so the purge reaches them too.
ALTER TABLE public.shift_reports   ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'FIELD';
ALTER TABLE public.report_signoffs ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'FIELD';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['shift_reports','report_signoffs'] LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_provenance_check');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (provenance IN (''FIELD'',''SYNTHETIC'',''IMPORT'',''BMS''))',
      t, t || '_provenance_check');
  END LOOP;
END $$;

COMMIT;


BEGIN;

CREATE OR REPLACE FUNCTION public.generate_synthetic_reports(
  p_site_uuid uuid,
  p_from      timestamptz,
  p_to        timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b            record;
  v_id         uuid;
  v_state      text;
  v_ack_at     timestamptz;
  v_res_at     timestamptz;
  v_resolver   record;
  v_ackers     int;
  v_work       int := 0;
  v_acks       int := 0;
  v_inc        int := 0;
  v_rep        int := 0;
  v_sign       int := 0;
  v_roll       double precision;
  s            record;
  m            record;
BEGIN
  -- Replace, never stack.
  DELETE FROM public.work_item_acks a USING public.work_items w
   WHERE a.work_item_id = w.id AND w.provenance = 'SYNTHETIC' AND w.site_uuid = p_site_uuid;
  DELETE FROM public.work_items   WHERE provenance='SYNTHETIC' AND site_uuid = p_site_uuid;
  DELETE FROM public.incidents    WHERE provenance='SYNTHETIC' AND site_uuid = p_site_uuid;
  DELETE FROM public.shift_reports WHERE provenance='SYNTHETIC' AND site_uuid = p_site_uuid;
  DELETE FROM public.report_signoffs WHERE provenance='SYNTHETIC' AND site_uuid = p_site_uuid;

  -- ── 1. Work items, from the worst breach per source per week ─────────────
  FOR b IN
    WITH weekly AS (
      SELECT DISTINCT ON (r.equipment_id, r.parameter_name, date_trunc('week', r.target_hour))
             r.equipment_id, r.parameter_name, r.target_hour, r.value_num,
             p.min_value, p.max_value, p.unit, p.display_label,
             e.name AS equipment_name
        FROM public.readings r
        JOIN public.equipment_parameters p
          ON p.equipment_id = r.equipment_id AND p.parameter_name = r.parameter_name
        JOIN public.equipment_registry e
          ON e.equipment_id = r.equipment_id AND e.site_uuid = p_site_uuid
       WHERE r.site_uuid = p_site_uuid
         AND r.target_hour >= p_from AND r.target_hour < p_to
         AND r.value_num IS NOT NULL
         AND public.reading_status(r.value_num, p.min_value, p.max_value,
                                   p.warn_min, p.warn_max) = 'breach'
         AND COALESCE(e.is_active, true)
         -- The same rule evaluate_thresholds() now applies (20260864): an
         -- exact zero where the floor is above zero is a blank field, not an
         -- excursion. Without this, 595 of 636 generated work items were P1
         -- alarms about empty boxes, burying the 41 real excursions.
         AND NOT (r.value_num = 0 AND COALESCE(p.min_value, 0) > 0)
       ORDER BY r.equipment_id, r.parameter_name, date_trunc('week', r.target_hour),
                -- The worst moment of that week is the one worth raising.
                abs(r.value_num - COALESCE(p.max_value, p.min_value, 0)) DESC
    )
    SELECT w.*,
           -- Which is the most recent alarm for this sensor. Only that one may
           -- still be open: uq_work_items_open_source permits a single
           -- OPEN/ACKNOWLEDGED/IN_PROGRESS row per source, which is the rule
           -- that stops one drifting sensor filling the queue with duplicates.
           row_number() OVER (PARTITION BY w.equipment_id, w.parameter_name
                              ORDER BY w.target_hour DESC) AS recency
      FROM weekly w
     ORDER BY w.target_hour
  LOOP
    v_roll := random();

    -- Raised a few minutes after the reading was taken, as the cron would.
    v_ack_at := b.target_hour + ((3 + floor(random()*25))::int || ' minutes')::interval;

    -- Everything historic is closed out; only the newest alarm for a given
    -- sensor is allowed to still be live. Roughly four in five of THOSE get
    -- worked — the rest are the standing backlog.
    --
    -- And the live system wins. Once the operating limits landed, the
    -- dcime_thresholds cron raised real work items of its own — the first this
    -- database has ever had. Where one is already open for a sensor, the
    -- generated history closes out behind it rather than competing for the
    -- single open slot uq_work_items_open_source allows.
    IF b.recency > 1
       OR EXISTS (SELECT 1 FROM public.work_items w
                   WHERE w.site_uuid = p_site_uuid
                     AND w.source_kind = 'THRESHOLD'
                     AND w.source_ref = b.equipment_id || '.' || b.parameter_name
                     AND w.state IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS'))
    THEN
      v_state := 'RESOLVED';
    ELSIF v_roll < 0.55 THEN v_state := 'RESOLVED';
    ELSIF v_roll < 0.72 THEN v_state := 'IN_PROGRESS';
    ELSIF v_roll < 0.86 THEN v_state := 'ACKNOWLEDGED';
    ELSE                     v_state := 'OPEN';
    END IF;

    v_res_at := CASE WHEN v_state = 'RESOLVED'
                     THEN v_ack_at + ((30 + floor(random()*2600))::int || ' minutes')::interval
                END;

    -- Whoever resolves it is somebody who was actually on shift.
    SELECT emp.id, emp.full_name INTO v_resolver
      FROM public.employees emp
     WHERE emp.site_uuid = p_site_uuid AND emp.status='Active' AND emp.role='FIELD_TECH'
     ORDER BY random() LIMIT 1;

    INSERT INTO public.work_items (
      site_uuid, title, detail, kind, severity, state, origin,
      source_kind, source_ref, assigned_scope,
      breach_value, breach_min, breach_max,
      created_at, updated_at,
      acknowledged_at, acknowledged_by,
      resolved_at, resolved_by, resolution_note,
      provenance)
    VALUES (
      p_site_uuid,
      -- Word for word what evaluate_thresholds() writes, so the history and
      -- anything raised from here on read as one series.
      'Inspect ' || b.equipment_name || ' — '
        || COALESCE(b.display_label, b.parameter_name) || ' out of range',
      'Recorded ' || b.value_num || COALESCE(' ' || b.unit, '')
        || ', expected ' || COALESCE(b.min_value::text,'–') || ' to '
        || COALESCE(b.max_value::text,'–') || COALESCE(' ' || b.unit, '')
        || '. Raised automatically from the reading logged for ' || b.equipment_name || '.',
      'FAULT',
      public.severity_from_excursion(b.value_num, b.min_value, b.max_value),
      v_state,
      'SYSTEM', 'THRESHOLD',
      b.equipment_id || '.' || b.parameter_name,
      -- Broadcast, not offered to an individual.
      'ON_SHIFT',
      b.value_num, b.min_value, b.max_value,
      v_ack_at, COALESCE(v_res_at, v_ack_at),
      CASE WHEN v_state <> 'OPEN' THEN v_ack_at + interval '4 minutes' END,
      CASE WHEN v_state <> 'OPEN' THEN v_resolver.id END,
      v_res_at,
      CASE WHEN v_state = 'RESOLVED' THEN v_resolver.id END,
      CASE WHEN v_state = 'RESOLVED' THEN
        (ARRAY[
          'Checked on site. Reading confirmed and unit reset; back within range.',
          'Filter found clogged. Cleaned and airflow restored.',
          'Sensor reading drifted. Recalibrated against handheld meter.',
          'Setpoint had been left adjusted from the last service. Restored.',
          'Transcription error on the round — re-read and logged correctly.',
          'Unit had tripped on high pressure. Reset and monitored for an hour.',
          'No fault found on inspection; value returned to normal unaided.'
        ])[1 + floor(random()*7)]
      END,
      'SYNTHETIC')
    RETURNING id INTO v_id;

    v_work := v_work + 1;

    -- ── Acknowledgements: several people, because it was broadcast ─────────
    IF v_state <> 'OPEN' THEN
      v_ackers := 1 + floor(random()*3);
      INSERT INTO public.work_item_acks (work_item_id, employee_id, acknowledged_at)
      SELECT v_id, emp.id,
             v_ack_at + ((floor(random()*90))::int || ' minutes')::interval
        FROM public.employees emp
       WHERE emp.site_uuid = p_site_uuid AND emp.status='Active' AND emp.role='FIELD_TECH'
       ORDER BY random() LIMIT v_ackers
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS v_ackers = ROW_COUNT;
      v_acks := v_acks + v_ackers;
    END IF;
  END LOOP;

  -- ── 2. Incidents ─────────────────────────────────────────────────────────
  -- Sparser than work items and raised by a person rather than a threshold:
  -- the things somebody noticed rather than the things a limit caught.
  FOR b IN
    SELECT gs AS occurred_at
      FROM generate_series(p_from, p_to, interval '68 hours') gs
     WHERE random() < 0.75
  LOOP
    SELECT emp.id, emp.full_name INTO v_resolver
      FROM public.employees emp
     WHERE emp.site_uuid = p_site_uuid AND emp.status='Active'
     ORDER BY random() LIMIT 1;

    v_roll := random();

    INSERT INTO public.incidents (
      site_uuid, asset_id, status, severity, occurred_at, created_at,
      raised_by_name, raised_by_id, notes, impact,
      resolved_at, resolved_by_name, resolved_by_id, resolved_by_type,
      resolution_details, provenance)
    VALUES (
      p_site_uuid,
      -- An incident is always about something. Picked from the real registry
      -- so it resolves to an asset that exists.
      (SELECT eq.equipment_id FROM public.equipment_registry eq
        WHERE eq.site_uuid = p_site_uuid AND COALESCE(eq.is_active, true)
        ORDER BY random() LIMIT 1),
      CASE WHEN v_roll < 0.72 THEN 'RESOLVED' ELSE 'OPEN' END,
      (ARRAY['low','low','medium','medium','high','critical'])[1 + floor(random()*6)],
      b.occurred_at, b.occurred_at + interval '12 minutes',
      v_resolver.full_name, v_resolver.id::text,
      (ARRAY[
        'Condensate tray overflow noticed under the unit during the round.',
        'Audible bearing noise from the fan section.',
        'Door held open by a contractor; room temperature rose before it was closed.',
        'UPS alarm panel showing a battery warning LED.',
        'Water ingress at the roof penetration after heavy rain.',
        'Generator failed to reach load during the weekly test.',
        'Rodent damage found on cable tray insulation.',
        'Fuel delivery short against the delivery note.'
      ])[1 + floor(random()*8)],
      CASE WHEN v_roll < 0.3 THEN 'No service impact — redundancy held.'
           WHEN v_roll < 0.6 THEN 'Reduced cooling redundancy for the duration.'
           ELSE NULL END,
      CASE WHEN v_roll < 0.72
           THEN b.occurred_at + ((2 + floor(random()*70))::int || ' hours')::interval END,
      CASE WHEN v_roll < 0.72 THEN v_resolver.full_name END,
      CASE WHEN v_roll < 0.72 THEN v_resolver.id::text END,
      CASE WHEN v_roll < 0.72 THEN
        CASE WHEN random() < 0.25 THEN 'EXTERNAL_CONTRACTOR' ELSE 'INTERNAL_TECH' END END,
      CASE WHEN v_roll < 0.72 THEN
        (ARRAY[
          'Cleared on site and verified over the following round.',
          'Contractor attended and replaced the failed component.',
          'Temporary measure in place; permanent fix scheduled.',
          'Root cause traced to a loose connection, now remade.'
        ])[1 + floor(random()*4)] END,
      'SYNTHETIC');
    v_inc := v_inc + 1;
  END LOOP;

  -- ── 3. Shift reports: one per closed shift ───────────────────────────────
  FOR s IN
    SELECT ss.id, ss.employee_id, ss.checked_in_at, ss.checked_out_at, e.full_name
      FROM public.shift_sessions ss
      JOIN public.employees e ON e.id = ss.employee_id
     WHERE ss.site_uuid = p_site_uuid AND ss.provenance = 'SYNTHETIC'
       AND ss.checked_out_at IS NOT NULL
  LOOP
    INSERT INTO public.shift_reports (
      site_uuid, shift_session_id, logged_by, technician_name, "timestamp",
      active_power_source, notes, certified, shift_duration,
      routine_logs_completed, incidents_filed, signed_at, provenance)
    VALUES (
      p_site_uuid, s.id, s.employee_id, s.full_name, s.checked_out_at,
      CASE WHEN random() < 0.93 THEN 'MAINS' ELSE 'GENERATOR' END,
      (ARRAY[
        'Rounds completed. All plant normal at handover.',
        'Rounds completed. PAC units in the server room running cool — noted for the day team.',
        'One round missed during the fire alarm test. Everything else logged.',
        'Handover to incoming shift completed. No outstanding actions.',
        'Fuel level checked and recorded. Nothing further to report.'
      ])[1 + floor(random()*5)],
      true,
      round(EXTRACT(epoch FROM (s.checked_out_at - s.checked_in_at))/3600)::text || 'h',
      (SELECT count(*) FROM public.telemetry_logs t
        WHERE t.shift_session_id = s.id),
      (SELECT count(*) FROM public.incidents i
        WHERE i.site_uuid = p_site_uuid
          AND i.occurred_at BETWEEN s.checked_in_at AND s.checked_out_at),
      s.checked_out_at, 'SYNTHETIC');
    v_rep := v_rep + 1;
  END LOOP;

  -- ── 4. Monthly report signoffs ───────────────────────────────────────────
  FOR m IN
    SELECT to_char(gs, 'YYYY-MM') AS period_key, gs AS month_start
      FROM generate_series(date_trunc('month', p_from), p_to, interval '1 month') gs
  LOOP
    SELECT emp.full_name INTO v_resolver
      FROM public.employees emp
     WHERE emp.site_uuid = p_site_uuid AND emp.status='Active' AND emp.role='FIELD_TECH'
     ORDER BY random() LIMIT 1;

    INSERT INTO public.report_signoffs (
      site_uuid, report_kind, period_key,
      prepared_name, prepared_at, reviewed_name, reviewed_at, provenance)
    SELECT p_site_uuid, k, m.period_key,
           v_resolver.full_name,
           m.month_start + interval '1 month' + interval '2 days',
           (SELECT full_name FROM public.employees
             WHERE site_uuid = p_site_uuid AND status='Active' AND role='ADMIN' LIMIT 1),
           -- Reviewed a couple of days after preparation, and not always yet.
           CASE WHEN random() < 0.8
                THEN m.month_start + interval '1 month' + interval '4 days' END,
           'SYNTHETIC'
      FROM unnest(ARRAY['MONTHLY_OPERATIONS','TEMPERATURE_RECORD']) k;
    v_sign := v_sign + 2;
  END LOOP;

  RETURN format(
    '%s work items (%s acknowledgements), %s incidents, %s shift reports, %s signoffs',
    v_work, v_acks, v_inc, v_rep, v_sign);
END $$;

COMMENT ON FUNCTION public.generate_synthetic_reports(uuid, timestamptz, timestamptz) IS
  'Writes the work items, incidents, shift reports and signoffs the injected '
  'readings would have produced. Work items match evaluate_thresholds() wording '
  'and source_ref exactly, so the scheduled job de-duplicates against them.';

REVOKE ALL ON FUNCTION public.generate_synthetic_reports(uuid, timestamptz, timestamptz)
  FROM anon, authenticated;

COMMIT;


-- ── Extend the purge to reach the two new tables ───────────────────────────
BEGIN;

CREATE OR REPLACE FUNCTION public.purge_synthetic_data(p_site_uuid uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_readings int; v_logs int; v_work int; v_inc int;
  v_shifts int; v_acks int; v_rep int; v_sign int;
BEGIN
  DELETE FROM public.work_item_acks a USING public.work_items w
   WHERE a.work_item_id = w.id AND w.provenance = 'SYNTHETIC'
     AND (p_site_uuid IS NULL OR w.site_uuid = p_site_uuid);
  GET DIAGNOSTICS v_acks = ROW_COUNT;

  DELETE FROM public.shift_reports
   WHERE provenance='SYNTHETIC' AND (p_site_uuid IS NULL OR site_uuid = p_site_uuid);
  GET DIAGNOSTICS v_rep = ROW_COUNT;

  DELETE FROM public.report_signoffs
   WHERE provenance='SYNTHETIC' AND (p_site_uuid IS NULL OR site_uuid = p_site_uuid);
  GET DIAGNOSTICS v_sign = ROW_COUNT;

  DELETE FROM public.readings
   WHERE provenance='SYNTHETIC' AND (p_site_uuid IS NULL OR site_uuid = p_site_uuid);
  GET DIAGNOSTICS v_readings = ROW_COUNT;

  DELETE FROM public.telemetry_logs
   WHERE provenance='SYNTHETIC' AND (p_site_uuid IS NULL OR site_uuid = p_site_uuid);
  GET DIAGNOSTICS v_logs = ROW_COUNT;

  DELETE FROM public.work_items
   WHERE provenance='SYNTHETIC' AND (p_site_uuid IS NULL OR site_uuid = p_site_uuid);
  GET DIAGNOSTICS v_work = ROW_COUNT;

  DELETE FROM public.incidents
   WHERE provenance='SYNTHETIC' AND (p_site_uuid IS NULL OR site_uuid = p_site_uuid);
  GET DIAGNOSTICS v_inc = ROW_COUNT;

  -- Shift sessions last: shift_reports reference them.
  DELETE FROM public.shift_sessions
   WHERE provenance='SYNTHETIC' AND (p_site_uuid IS NULL OR site_uuid = p_site_uuid);
  GET DIAGNOSTICS v_shifts = ROW_COUNT;

  PERFORM public.refresh_reading_rollups();

  RETURN format(
    '%s readings, %s submissions, %s work items, %s acks, %s incidents, '
    '%s shifts, %s shift reports, %s signoffs removed',
    v_readings, v_logs, v_work, v_acks, v_inc, v_shifts, v_rep, v_sign);
END $$;

REVOKE ALL ON FUNCTION public.purge_synthetic_data(uuid) FROM anon, authenticated;

COMMIT;
