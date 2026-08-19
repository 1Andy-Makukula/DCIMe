-- ═══════════════════════════════════════════════════════════════════════════
-- 20260819_commissioning_import.sql
-- DCIMe V2 — Stage 9: staged commissioning import
--
-- WHY THIS DECIDES WHETHER THE PLATFORM SCALES
-- Bringing a site online means recording every asset AND every cable. Done by
-- hand that is weeks of work per site, and it is the single most common reason
-- DCIM deployments are abandoned — not the software, the data entry.
--
-- THE RULE: NOTHING GOES STRAIGHT INTO LIVE TABLES.
-- A spreadsheet lands in staging, is validated row by row, and is promoted only
-- when it is clean. A half-imported facility is worse than no facility: the
-- graph looks complete, the cascade runs, and the answers are quietly wrong.
--
-- Every row carries its own verdict, so a commissioning engineer fixes their
-- spreadsheet against specific line numbers instead of a single "import failed".
--
-- Imported rows land with provenance = 'IMPORT', so surveyed topology stays
-- distinguishable from bulk-loaded topology forever.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. BATCHES
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.import_batches (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_uuid    uuid        NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  filename     text,
  kind         text        NOT NULL,
  status       text        NOT NULL DEFAULT 'STAGED',
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  promoted_at  timestamptz,
  row_count    integer     NOT NULL DEFAULT 0,
  error_count  integer     NOT NULL DEFAULT 0,
  notes        text,

  CONSTRAINT import_batches_kind_check
    CHECK (kind IN ('EQUIPMENT','CONNECTIONS','PARAMETERS')),
  -- STAGED -> VALIDATED -> PROMOTED, or DISCARDED at any point. A batch cannot
  -- be promoted twice; the status is the guard.
  CONSTRAINT import_batches_status_check
    CHECK (status IN ('STAGED','VALIDATED','PROMOTED','DISCARDED'))
);

CREATE INDEX IF NOT EXISTS idx_import_batches_site
  ON public.import_batches (site_uuid, created_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. STAGED ROWS
--
--    Payload is JSONB rather than typed columns: one staging table serves
--    equipment, connections and parameters, and a spreadsheet with an unexpected
--    column is a validation finding rather than a failed insert.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.import_rows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id    uuid    NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  -- The line number in the source file. Without it a validation message is
  -- useless to whoever has to fix the spreadsheet.
  source_line integer NOT NULL,
  payload     jsonb   NOT NULL,
  verdict     text    NOT NULL DEFAULT 'PENDING',
  message     text,

  CONSTRAINT import_rows_verdict_check
    CHECK (verdict IN ('PENDING','OK','WARN','ERROR','SKIPPED'))
);

CREATE INDEX IF NOT EXISTS idx_import_rows_batch
  ON public.import_rows (batch_id, source_line);
CREATE INDEX IF NOT EXISTS idx_import_rows_problems
  ON public.import_rows (batch_id) WHERE verdict IN ('ERROR','WARN');


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. VALIDATION
--
--    Checks every row and records a verdict. Never writes to live tables, so it
--    is safe to run repeatedly while someone corrects their spreadsheet.
--
--    ERROR blocks promotion. WARN does not — a missing coordinate means the
--    equipment simply is not drawn, which is a legitimate state, not a fault.
-- ═══════════════════════════════════════════════════════════════════════════
-- OUT column names are prefixed and the function dropped before recreation:
-- a RETURNS TABLE column becomes a PL/pgSQL variable that shadows any
-- identically named table column, and CREATE OR REPLACE cannot rename them.
DROP FUNCTION IF EXISTS public.validate_import_batch(uuid);

CREATE FUNCTION public.validate_import_batch(p_batch_id uuid)
RETURNS TABLE (out_verdict text, out_rows bigint)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_kind text;
  v_site uuid;
BEGIN
  SELECT b.kind, b.site_uuid INTO v_kind, v_site
    FROM public.import_batches b WHERE b.id = p_batch_id;
  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'No such import batch: %', p_batch_id;
  END IF;

  UPDATE public.import_rows SET verdict = 'PENDING', message = NULL
   WHERE batch_id = p_batch_id;

  IF v_kind = 'EQUIPMENT' THEN
    -- Required fields.
    UPDATE public.import_rows r
       SET verdict = 'ERROR', message = 'equipment_id and name are required'
     WHERE r.batch_id = p_batch_id
       AND (COALESCE(r.payload->>'equipment_id','') = ''
         OR COALESCE(r.payload->>'name','') = '');

    -- An unknown template would deploy equipment with no physics at all.
    UPDATE public.import_rows r
       SET verdict = 'ERROR',
           message = 'Unknown template: ' || COALESCE(r.payload->>'template_id','(none)')
     WHERE r.batch_id = p_batch_id AND r.verdict = 'PENDING'
       AND r.payload->>'template_id' IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.equipment_templates t
                        WHERE t.template_id = r.payload->>'template_id');

    -- Collides with equipment already at this site.
    UPDATE public.import_rows r
       SET verdict = 'ERROR',
           message = 'equipment_id already exists at this site'
     WHERE r.batch_id = p_batch_id AND r.verdict = 'PENDING'
       AND EXISTS (SELECT 1 FROM public.equipment_registry e
                    WHERE e.equipment_id = r.payload->>'equipment_id'
                      AND e.site_uuid = v_site);

    -- Duplicated inside the spreadsheet itself. Reported against the LATER
    -- line, so the first occurrence stays importable.
    UPDATE public.import_rows r
       SET verdict = 'ERROR', message = 'Duplicate equipment_id within this file'
      FROM (SELECT id, row_number() OVER (PARTITION BY payload->>'equipment_id'
                                          ORDER BY source_line) AS n
              FROM public.import_rows WHERE batch_id = p_batch_id) d
     WHERE r.id = d.id AND d.n > 1 AND r.verdict = 'PENDING';

    -- Drawable but incomplete: one coordinate without the other.
    UPDATE public.import_rows r
       SET verdict = 'WARN', message = 'Only one coordinate given; will not be drawn'
     WHERE r.batch_id = p_batch_id AND r.verdict = 'PENDING'
       AND num_nonnulls(r.payload->>'layout_x', r.payload->>'layout_y') = 1;

  ELSIF v_kind = 'CONNECTIONS' THEN
    UPDATE public.import_rows r
       SET verdict = 'ERROR', message = 'source and target are required'
     WHERE r.batch_id = p_batch_id
       AND (COALESCE(r.payload->>'source_equipment_id','') = ''
         OR COALESCE(r.payload->>'target_equipment_id','') = '');

    UPDATE public.import_rows r
       SET verdict = 'ERROR', message = 'A cable cannot connect equipment to itself'
     WHERE r.batch_id = p_batch_id AND r.verdict = 'PENDING'
       AND r.payload->>'source_equipment_id' = r.payload->>'target_equipment_id';

    -- Endpoints must exist. Checked against live equipment AND against any
    -- EQUIPMENT batch staged for the same site but not yet promoted, so a
    -- facility can be imported as equipment-then-cables in one sitting.
    UPDATE public.import_rows r
       SET verdict = 'ERROR',
           message = 'Unknown source: ' || (r.payload->>'source_equipment_id')
     WHERE r.batch_id = p_batch_id AND r.verdict = 'PENDING'
       AND NOT EXISTS (SELECT 1 FROM public.equipment_registry e
                        WHERE e.equipment_id = r.payload->>'source_equipment_id'
                          AND e.site_uuid = v_site)
       AND NOT EXISTS (SELECT 1 FROM public.import_rows ir
                        JOIN public.import_batches ib ON ib.id = ir.batch_id
                       WHERE ib.site_uuid = v_site AND ib.kind = 'EQUIPMENT'
                         AND ib.status <> 'DISCARDED'
                         AND ir.payload->>'equipment_id' = r.payload->>'source_equipment_id');

    UPDATE public.import_rows r
       SET verdict = 'ERROR',
           message = 'Unknown target: ' || (r.payload->>'target_equipment_id')
     WHERE r.batch_id = p_batch_id AND r.verdict = 'PENDING'
       AND NOT EXISTS (SELECT 1 FROM public.equipment_registry e
                        WHERE e.equipment_id = r.payload->>'target_equipment_id'
                          AND e.site_uuid = v_site)
       AND NOT EXISTS (SELECT 1 FROM public.import_rows ir
                        JOIN public.import_batches ib ON ib.id = ir.batch_id
                       WHERE ib.site_uuid = v_site AND ib.kind = 'EQUIPMENT'
                         AND ib.status <> 'DISCARDED'
                         AND ir.payload->>'equipment_id' = r.payload->>'target_equipment_id');

    -- The same cable twice would silently double the load it carries.
    UPDATE public.import_rows r
       SET verdict = 'ERROR', message = 'Duplicate connection within this file'
      FROM (SELECT id, row_number() OVER (
                     PARTITION BY payload->>'source_equipment_id',
                                  COALESCE(payload->>'source_port','OUT'),
                                  payload->>'target_equipment_id',
                                  COALESCE(payload->>'target_port','IN')
                     ORDER BY source_line) AS n
              FROM public.import_rows WHERE batch_id = p_batch_id) d
     WHERE r.id = d.id AND d.n > 1 AND r.verdict = 'PENDING';
  END IF;

  UPDATE public.import_rows SET verdict = 'OK'
   WHERE batch_id = p_batch_id AND verdict = 'PENDING';

  UPDATE public.import_batches b
     SET status = CASE WHEN EXISTS (SELECT 1 FROM public.import_rows r
                                     WHERE r.batch_id = p_batch_id AND r.verdict = 'ERROR')
                       THEN 'STAGED' ELSE 'VALIDATED' END,
         row_count   = (SELECT count(*) FROM public.import_rows r WHERE r.batch_id = p_batch_id),
         error_count = (SELECT count(*) FROM public.import_rows r
                         WHERE r.batch_id = p_batch_id AND r.verdict = 'ERROR')
   WHERE b.id = p_batch_id;

  RETURN QUERY
    SELECT r.verdict, count(*) FROM public.import_rows r
     WHERE r.batch_id = p_batch_id GROUP BY r.verdict ORDER BY 1;
END $$;

COMMENT ON FUNCTION public.validate_import_batch(uuid) IS
  'Validates a staged batch row by row. Writes nothing to live tables, so it is '
  'safe to re-run while a spreadsheet is corrected.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. PROMOTION
--
--    Refuses to run unless the batch validated clean. All-or-nothing: a partial
--    facility produces a graph that looks complete and answers wrongly.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.promote_import_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_kind text; v_site uuid; v_status text; v_errors int; v_inserted int := 0;
BEGIN
  SELECT b.kind, b.site_uuid, b.status, b.error_count
    INTO v_kind, v_site, v_status, v_errors
    FROM public.import_batches b WHERE b.id = p_batch_id;

  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'No such import batch: %', p_batch_id;
  END IF;
  IF v_status = 'PROMOTED' THEN
    RAISE EXCEPTION 'Batch already promoted';
  END IF;
  IF v_status <> 'VALIDATED' OR v_errors > 0 THEN
    RAISE EXCEPTION 'Batch is not clean: % error(s). Validate and fix first.', v_errors;
  END IF;

  IF v_kind = 'EQUIPMENT' THEN
    INSERT INTO public.equipment_registry
      (equipment_id, name, category, location, site_uuid, template_id,
       template_version, engine_type, dynamic_parameters, input_policy,
       provenance, is_active, layout_x, layout_y, render_shape, metric_prefix)
    SELECT r.payload->>'equipment_id',
           r.payload->>'name',
           COALESCE(r.payload->>'category', t.category, 'FACILITY'),
           COALESCE(r.payload->>'location', ''),
           v_site,
           r.payload->>'template_id',
           t.version,
           COALESCE(r.payload->>'engine_type', t.engine_type),
           COALESCE(t.default_parameters, '{}'::jsonb)
             || COALESCE((r.payload->'dynamic_parameters')::jsonb, '{}'::jsonb),
           COALESCE(r.payload->>'input_policy', 'ANY'),
           'IMPORT', true,
           -- Both coordinates or neither. Validation flags a half-pair as WARN
           -- ("will not be drawn"), and promotion has to honour that verdict —
           -- otherwise equipment_registry_layout_pair_check rejects the row and
           -- one sloppy cell fails an entire facility import.
           CASE WHEN r.payload->>'layout_y' IS NULL THEN NULL
                ELSE (r.payload->>'layout_x')::double precision END,
           CASE WHEN r.payload->>'layout_x' IS NULL THEN NULL
                ELSE (r.payload->>'layout_y')::double precision END,
           r.payload->>'render_shape',
           COALESCE(r.payload->>'metric_prefix', r.payload->>'equipment_id')
      FROM public.import_rows r
      LEFT JOIN public.equipment_templates t ON t.template_id = r.payload->>'template_id'
     WHERE r.batch_id = p_batch_id AND r.verdict IN ('OK','WARN');
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

  ELSIF v_kind = 'CONNECTIONS' THEN
    INSERT INTO public.equipment_connections
      (source_equipment_id, source_port, target_equipment_id, target_port,
       input_priority, connection_type, render_path_id, render_path_d,
       provenance, is_active)
    SELECT r.payload->>'source_equipment_id',
           COALESCE(r.payload->>'source_port','OUT'),
           r.payload->>'target_equipment_id',
           COALESCE(r.payload->>'target_port','IN'),
           COALESCE((r.payload->>'input_priority')::integer, 1),
           COALESCE(r.payload->>'connection_type','POWER'),
           r.payload->>'render_path_id',
           r.payload->>'render_path_d',
           'IMPORT', true
      FROM public.import_rows r
     WHERE r.batch_id = p_batch_id AND r.verdict IN ('OK','WARN');
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  UPDATE public.import_batches
     SET status = 'PROMOTED', promoted_at = now()
   WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'batch_id', p_batch_id,
    'kind', v_kind,
    'inserted', v_inserted,
    -- Surfaced immediately: a commissioning import is exactly when orphans and
    -- cross-site edges appear, and finding them now beats finding them in a
    -- cascade six months later.
    'graph_issues', COALESCE((SELECT count(*) FROM public.topology_graph_issues
                               WHERE site_uuid = v_site), 0)
  );
END $$;

COMMENT ON FUNCTION public.promote_import_batch(uuid) IS
  'Promotes a VALIDATED batch into live tables as provenance IMPORT. Refuses '
  'anything with errors — a partly-imported facility answers wrongly.';


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. RLS
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_rows    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Imports: site-scoped read" ON public.import_batches;
CREATE POLICY "Imports: site-scoped read"
  ON public.import_batches FOR SELECT
  USING (auth.role() = 'authenticated' AND site_uuid = public.get_my_site_uuid());

DROP POLICY IF EXISTS "Imports: admin write" ON public.import_batches;
CREATE POLICY "Imports: admin write"
  ON public.import_batches FOR ALL
  USING (public.get_my_role() = 'ADMIN' AND site_uuid = public.get_my_site_uuid())
  WITH CHECK (public.get_my_role() = 'ADMIN' AND site_uuid = public.get_my_site_uuid());

DROP POLICY IF EXISTS "Import rows: via batch" ON public.import_rows;
CREATE POLICY "Import rows: via batch"
  ON public.import_rows FOR ALL
  USING (EXISTS (SELECT 1 FROM public.import_batches b
                  WHERE b.id = batch_id AND b.site_uuid = public.get_my_site_uuid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.import_batches b
                       WHERE b.id = batch_id AND b.site_uuid = public.get_my_site_uuid()));

GRANT EXECUTE ON FUNCTION public.validate_import_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_import_batch(uuid) TO authenticated;

COMMIT;
