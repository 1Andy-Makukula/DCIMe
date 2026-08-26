-- ═══════════════════════════════════════════════════════════════════════════
-- 20260849_fix_excel_destinations.sql
-- DCIMe V2.1 — Stage 4: put every column back under its own heading.
--
-- 20260837 copied the mapping mechanically, defects included, so the import
-- could not add errors of its own. These are those defects, corrected against
-- the actual template files. scripts/verify-excel-mapping.mjs reads the real
-- headings and fails on any of them, so they cannot come back unnoticed.
--
-- ── 1. TEMP RECORD IS SHIFTED FOUR COLUMNS ────────────────────────────────
-- The sheet has seven room pairs starting at C. The mapping led with two rooms
-- that exist nowhere in this system — zesco_lt and rmu_ht — which pushed every
-- real room four columns right. HQ Power Room's reading was filed under
-- "Data Room", Server Room's under "Power Room 1", and IT Room 1's temperature
-- landed in "Average of all rooms" with its humidity in "Remarks & Sign".
-- IT Room 2 was written past the end of the table entirely.
--
-- This has been shipping in a signed compliance record.
--
-- ── 2. THE PAC SHEET HAS NO ELECTRICAL COLUMNS ────────────────────────────
-- The mapping gives every aircon thirteen destinations. The sheet has five:
--   4 Return ACT · 5 Return SET · 6 Supply SET · 7 Humidity ACT · 8 Humidity SET
-- Columns 9 and 10 are Remarks and Technician Name. Columns 11-16 do not exist.
--
-- So voltage_ry and voltage_yb were aimed at Remarks and Technician Name, and
-- since both parameters are NOT_APPLICABLE the export writes 'NA' into them —
-- roughly ten thousand cells an export, destroying the two columns that record
-- who performed each check.
--
-- The 216 impossible destinations are deleted. The PARAMETERS stay, still
-- NOT_APPLICABLE: if per-aircon electrical readings are wanted later, the
-- registry is ready and the PAC sheet needs columns added to receive them.
-- That is a change to the client's document and therefore their decision, not
-- one to make by aiming at cells that are not there.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Temp Record ─────────────────────────────────────────────────────────
-- Written as ABSOLUTE positions, taken from the sheet's own row-5 headings.
--
-- The first attempt at this expressed the fault as what it looks like — one
-- uniform shift of four columns — and subtracted 4 from every index at or above
-- 6. That is not idempotent: applying it twice moves everything twice, and the
-- second pass drove Data Room on top of HQ Power Room. A relative correction
-- cannot tell "already fixed" from "not yet fixed"; an absolute one does not
-- have to.
--
--   C(2) HQ Power Room   E(4) Server Room    G(6)  Data Room
--   I(8) Power Room 1    K(10) Power Room 2  M(12) IT Room 1   O(14) IT Room 2
--   Q(16) Average of all rooms   R(17) Remarks & Sign
UPDATE public.parameter_excel_targets t
   SET column_index = v.col
  FROM (VALUES
    ('hq_ambient_temp', 2),     ('hq_ambient_humidity', 3),
    ('server_ambient_temp', 4), ('server_ambient_humidity', 5),
    ('data_ambient_temp', 6),   ('data_ambient_humidity', 7),
    ('pr1_ambient_temp', 8),    ('pr1_ambient_humidity', 9),
    ('pr2_ambient_temp', 10),   ('pr2_ambient_humidity', 11),
    ('it1_ambient_temp', 12),   ('it1_ambient_humidity', 13),
    ('it2_ambient_temp', 14),   ('it2_ambient_humidity', 15)
  ) AS v(param, col)
 WHERE t.sheet_name = 'Temp Record'
   AND t.parameter_name = v.param;

-- ── 2. PAC ─────────────────────────────────────────────────────────────────
DELETE FROM public.parameter_excel_targets
 WHERE sheet_name = 'PAC'
   AND column_index > 8;

COMMIT;

-- ── Self-check ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_temp   int;
  v_pac    int;
  v_bad    int;
BEGIN
  SELECT count(*) INTO v_temp FROM public.parameter_excel_targets WHERE sheet_name = 'Temp Record';
  SELECT count(*) INTO v_pac  FROM public.parameter_excel_targets WHERE sheet_name = 'PAC';
  SELECT count(*) INTO v_bad  FROM public.parameter_excel_targets WHERE sheet_name = 'PAC' AND column_index > 8;

  RAISE NOTICE 'Temp Record: % destinations, lowest column now %',
    v_temp, (SELECT min(column_index) FROM public.parameter_excel_targets WHERE sheet_name='Temp Record');
  RAISE NOTICE 'PAC: % destinations, % still out of range', v_pac, v_bad;

  IF v_bad > 0 THEN
    RAISE WARNING 'PAC still has destinations past column 8.';
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. DG CHECK — off by one, and three generators the sheet does not have
--
-- The sheet carries two generators. Reading row 4:
--   M  (12) DG-1 Battery Voltage      N  (13) DG-1 Amps R
--   AA (26) DG-2 Battery Voltage      AB (27) DG-2 Amps R
--
-- The mapping aimed battery voltage at 13 and 27 — one column right, into the
-- R-phase amps of each machine. So the two that were in range were still wrong,
-- and were quietly overwriting a different measurement.
--
-- DG-3, DG-4 and DG-HQ were aimed at columns 41, 55 and 69 on a sheet with 32.
-- Nothing was written; nothing ever could be. Their battery voltage does reach
-- the workbook — the DG Battery Log sheet is the place for it, and adding that
-- is a mapping decision rather than a correction, so it is not made here.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

UPDATE public.parameter_excel_targets
   SET column_index = 12
 WHERE sheet_name = 'DG Check' AND parameter_name = 'dg_1_batt_voltage';

UPDATE public.parameter_excel_targets
   SET column_index = 26
 WHERE sheet_name = 'DG Check' AND parameter_name = 'dg_2_batt_voltage';

DELETE FROM public.parameter_excel_targets
 WHERE sheet_name = 'DG Check' AND column_index > 31;

COMMIT;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT parameter_name, column_index FROM public.parameter_excel_targets
            WHERE sheet_name = 'DG Check' ORDER BY column_index
  LOOP
    RAISE NOTICE 'DG Check: % -> column %', r.parameter_name, r.column_index;
  END LOOP;
END $$;
