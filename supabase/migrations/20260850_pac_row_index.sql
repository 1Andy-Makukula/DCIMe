-- ═══════════════════════════════════════════════════════════════════════════
-- 20260850_pac_row_index.sql
-- DCIMe V2.1 — Stage 4: which row of the PAC block each aircon occupies.
--
-- getPacEquipmentIndex() in excelMappingHelpers.ts hardcodes these, and reserves
-- a slot for pac_pr1_em3 — a third Power Room 1 aircon that does not exist at
-- this site and has no row in the template. Everything after it is therefore one
-- row low:
--
--   Power Room 2's readings land on IT Room 1's rows
--   IT Room 1's land on IT Room 2's
--   IT Room 2's land on the two Server Room Vertivs
--   Vertiv 2 lands on index 23 — outside a 23-row block, in the FIRST row of
--   the next two-hourly block, overwriting Server Room Emerson Aircon 1
--
-- Verified against the template's own "Location" and "PAC Unit No" columns
-- (rows 6-28), which name every unit in order.
--
-- Stored on the asset rather than fixed in code for the same reason the column
-- indices moved: a row number is not self-describing, and the only thing that
-- can check it is the document. scripts/verify-excel-mapping.mjs now reads the
-- unit names out of the template and asserts each asset sits on its own row.
--
-- Dragor and the three HQ aircons are deliberately left NULL: the PAC sheet has
-- 23 rows and the site has 27 units, and the agreed decision was to leave the
-- client's document unchanged and carry those four in DCIMe only.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.equipment_registry
  ADD COLUMN IF NOT EXISTS excel_row_index integer;

COMMENT ON COLUMN public.equipment_registry.excel_row_index IS
  'Zero-based position of this asset within a per-asset sheet block — the PAC '
  'sheet''s 23 aircon rows. NULL means the asset has no row on such a sheet and '
  'is skipped by the export.';

UPDATE public.equipment_registry e
   SET excel_row_index = v.idx
  FROM (VALUES
    ('pac_server_em1',0), ('pac_server_em2',1), ('pac_server_em3',2),
    ('pac_server_em4',3), ('pac_server_em5',4), ('pac_server_em6',5),
    ('pac_server_em7',6),
    ('pac_server_vt3',7), ('pac_server_vt4',8), ('pac_server_vt5',9),
    ('pac_data_em1',10), ('pac_data_em2',11), ('pac_data_vt6',12),
    ('pac_pr1_em1',13), ('pac_pr1_em2',14),
    ('pac_pr2_em1',15), ('pac_pr2_em2',16),
    ('pac_it1_em1',17), ('pac_it1_em2',18),
    ('pac_it2_em1',19), ('pac_it2_em2',20),
    ('pac_server_vt1',21), ('pac_server_vt2',22)
  ) AS v(equipment_id, idx)
 WHERE e.equipment_id = v.equipment_id
   AND e.excel_row_index IS DISTINCT FROM v.idx;

COMMIT;

DO $$
DECLARE v_mapped int; v_unmapped int;
BEGIN
  SELECT count(*) FILTER (WHERE excel_row_index IS NOT NULL),
         count(*) FILTER (WHERE excel_row_index IS NULL)
    INTO v_mapped, v_unmapped
    FROM public.equipment_registry
   WHERE category = 'AIRCON'
     AND site_uuid = (SELECT id FROM public.sites WHERE site_code = 'SITE_01');

  RAISE NOTICE 'PAC rows: % aircons placed, % with no row on the sheet', v_mapped, v_unmapped;
  IF v_mapped <> 23 THEN
    RAISE WARNING 'Expected 23 placed aircons to match the template block.';
  END IF;
END $$;
