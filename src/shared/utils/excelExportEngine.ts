// src/shared/utils/excelExportEngine.ts
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { fetchExcelPlan, type ExcelPlan } from "@/shared/api/excelPlan";
import { DEFAULT_SITE_CODE } from "../../config/sites";
import { getExcelColumn, getEqptStatusRow, getFssRoomOffset } from "./excelMappingHelpers";

// PAC sheet geometry, read from the template: data starts at row 6, each
// two-hourly block lists 23 units, and there are 12 blocks in a day.
const PAC_FIRST_ROW = 6;
const PAC_UNITS_PER_BLOCK = 23;
const PAC_BLOCKS_PER_DAY = 12;

// DG Check lists nine engine checks per day.
const DG_CHECK_ITEMS_PER_DAY = 9;
import { BRAND_NAME, DAILY_CHECKLIST_ASSET_ID, siteFileLabel, EXCEL_TEMPLATES } from "./branding";

// What to print when no reading arrived.
//
// The registry answers this first: a NOT_APPLICABLE or CONSTANT parameter
// carries its own constant_value, so the workbook column is answered rather
// than blank, and turning one into a real reading later needs no code change.
//
// The rules below are what remains of the hardcoded heuristics — defaults for
// parameters that ARE captured but were skipped on a round. They belong in the
// registry's default_value too; moving them is Stage 4 work, once the
// conformance test can prove the exported cells are unchanged.
const getFallbackValue = (metricId: string, lastValue: any, plan: ExcelPlan): any => {
  if (lastValue !== undefined && lastValue !== null && lastValue !== "") {
    return lastValue;
  }

  const registered = plan.uncaptured[metricId];
  if (registered !== undefined) return registered;

  // Status check variables can have standard safe constants if they represent status checks,
  // but for measurements (like volts, temps, capacity, run hours, etc.), return null.
  if (metricId === "grid_status") return "ON";
  if (metricId === "grid_off_time") return "0:00";
  if (metricId === "grid_restored_time") return "0:00";
  if (metricId === "grid_off_duration") return "0:00";
  if (metricId.endsWith("_charged_status")) return "GREEN";
  if (metricId.endsWith("_auto_status")) return "YES";
  if (metricId === "workstation_status") return "OK";
  if (metricId === "fm200_status") return "OK";
  if (metricId === "facility_load_on") return "MAINS";
  if (metricId.endsWith("_daily_abnormality")) return "NON";
  if (metricId.endsWith("_daily_status")) return "OK";
  if (metricId === "leakage_sign" || metricId === "spillage_sign") return "NO";

  return null;
};

// Helper to look up worksheets case-insensitively
const getWorksheetCaseInsensitive = (workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined => {
  const lowercaseName = name.toLowerCase();
  return workbook.worksheets.find(ws => ws.name.toLowerCase() === lowercaseName);
};

export const generateMonthlyReport = async (
  month: string,
  year: string,
  logs: any[],
  siteCode: string = DEFAULT_SITE_CODE,
  /**
   * The site whose Excel destinations to use. Without it there is nothing to
   * write against, so the export refuses rather than producing empty workbooks
   * that look like a month with no readings.
   */
  siteUuid: string | null = null
): Promise<void> => {
  const plan = await fetchExcelPlan(siteUuid);
  if (Object.keys(plan.targets).length === 0) {
    throw new Error(
      "No Excel destinations are configured for this site. Apply 20260837_registry_seed.sql, " +
      "or check that the site has equipment loaded in the registry."
    );
  }
  const dailyTemplatePath = EXCEL_TEMPLATES.daily_canvas;
  const commercialTemplatePath = EXCEL_TEMPLATES.commercial_logbook;

  // Fetch Templates concurrently (M-7: report explicit HTTP status or path on failure)
  const [dailyRes, commRes] = await Promise.all([
    fetch(dailyTemplatePath).catch((err) => ({ ok: false, statusText: err.message } as Response)),
    fetch(commercialTemplatePath).catch((err) => ({ ok: false, statusText: err.message } as Response))
  ]);

  if (!dailyRes.ok) {
    throw new Error(`Failed to fetch daily template (${dailyTemplatePath}): ${dailyRes.statusText || dailyRes.status}`);
  }
  if (!commRes.ok) {
    throw new Error(`Failed to fetch commercial template (${commercialTemplatePath}): ${commRes.statusText || commRes.status}`);
  }

  // Load them into separate ExcelJS.Workbook instances
  const dailyWb = new ExcelJS.Workbook();
  await dailyWb.xlsx.load(await dailyRes.arrayBuffer());

  const commWb = new ExcelJS.Workbook();
  await commWb.xlsx.load(await commRes.arrayBuffer());

  // Filter out daily checklists from the main hourly telemetry log processing
  const filteredLogs = logs.filter(log => log.asset_id !== DAILY_CHECKLIST_ASSET_ID);

  // Build a lookup map of hourly logs by day and hour in CAT.
  // Prioritize facility_wide logs over secondary asset logs (e.g. dg_daily_test)
  const logsMap = new Map<string, any>();
  filteredLogs.forEach((log) => {
    const timestampStr = log.target_hour;
    if (!timestampStr) return;
    const date = new Date(timestampStr);
    const catDate = new Date(date.getTime() + 2 * 60 * 60 * 1000);
    const day = catDate.getUTCDate();
    const hour = catDate.getUTCHours();
    const key = `${day}-${hour}`;
    
    // Only overwrite if existing key is empty or if this log is the primary facility_wide log
    if (!logsMap.has(key) || log.asset_id === "facility_wide") {
      logsMap.set(key, log);
    }
  });

  // Determine number of days in the month
  // M-6 Note: month is 1-indexed (1=Jan, 12=Dec). In JS Date constructor (year, month, 0),
  // day 0 of month N returns the last day of month N-1, giving total days for 1-indexed month.
  // Support both numeric ("7") and full-name ("July") month strings.
  // parseInt("July", 10) returns NaN which silently kills the day loop.
  const rawMonthNum = parseInt(month, 10);
  const numericMonth = !isNaN(rawMonthNum)
    ? rawMonthNum
    : new Date(`${month} 1, ${year}`).getMonth() + 1;

  const numDays = new Date(parseInt(year, 10), numericMonth, 0).getDate();

  // Stateful carry-forward trackers
  const lastEnteredValues: Record<string, any> = {};
  let lastTechName = "Field Tech";

  const siteMappings = plan.targets;

  // Loop over every day and hour chronologically
  for (let day = 1; day <= numDays; day++) {
    for (let hour = 0; hour <= 23; hour++) {
      const logKey = `${day}-${hour}`;
      const log = logsMap.get(logKey);

      if (log) {
        const fullTechName = log.technician_name || "Field Tech";
        lastTechName = fullTechName.trim().split(/\s+/)[0];

        // Update state tracker with newly logged values
        if (log.metrics) {
          Object.keys(log.metrics).forEach((key) => {
            const val = log.metrics[key];
            if (val !== undefined && val !== null && val !== "") {
              lastEnteredValues[key] = val;
            }
          });
        }
      }

      // Loop over all metric mappings defined in the site mappings broker
      Object.keys(siteMappings).forEach((metricId) => {
        // Which asset this reading belongs to, from the registry rather than by
        // splitting the key on underscores and hoping the segment count is
        // right. That guesswork is what let a Data Room sensor answer to
        // media_ambient_temp for a year without anyone noticing.
        const assetId = plan.owner[metricId] ?? "";

        const isAssetOffline = assetId && log?.metrics && log.metrics[`status_${assetId}`] === "OFFLINE";

        // If offline, suspend carry-forward logic for this metric
        if (isAssetOffline) {
          delete lastEnteredValues[metricId];
        }

        const rawValue = log?.metrics ? log.metrics[metricId] : undefined;

        let cellValue: any = null;
        if (isAssetOffline) {
          cellValue = "OFFLINE";
        } else {
          let finalValue = rawValue !== undefined && rawValue !== null && rawValue !== ""
            ? rawValue
            : lastEnteredValues[metricId];

          // Intercept generator run hours for the Fuel Record sheet and map it from the calculated cumulative run hours
          if (metricId.endsWith('_run_hours') && metricId.startsWith('dg_')) {
            const dgPrefix = metricId.substring(0, 4); // e.g. "dg_1" or "dg_h"
            const cumKey = dgPrefix === 'dg_h' ? 'dg_hq_cumulative_hrs' : `${dgPrefix}_cumulative_hrs`;
            finalValue = lastEnteredValues[cumKey] !== undefined ? lastEnteredValues[cumKey] : null;
          }

          cellValue = getFallbackValue(metricId, finalValue, plan);

          // Intercept grid status for planned tests to prevent false offline reporting
          if (metricId === 'grid_status' && (cellValue === 'OFF' || cellValue === 'OFFLINE') && log?.metrics?.outage_type === 'planned_test') {
            cellValue = 'TEST';
          }
        }

        const destinations = siteMappings[metricId] || [];
        destinations.forEach((dest) => {
          const isDailyCanvas = dest.workbook === "daily_canvas";
          const isCommercialLogbook = dest.workbook === "commercial_logbook";

          if (!isDailyCanvas && !isCommercialLogbook) return;

          // Only write to daily_canvas if an actual log exists for this hour
          if (isDailyCanvas && !log) return;

          const workbookObj = isDailyCanvas ? dailyWb : commWb;
          const sheetName = (isDailyCanvas && dest.sheetName === "DYNAMIC_DAY")
            ? day.toString().padStart(2, "0")
            : dest.sheetName;

          const sheet = getWorksheetCaseInsensitive(workbookObj, sheetName) || getWorksheetCaseInsensitive(workbookObj, day.toString());
          if (!sheet) return;

          let colIndex = dest.excelColumnIndex;
          if (sheetName === "Eqpt status") {
            colIndex = dest.excelColumnIndex + (day - 1) * 4;
          }
          const colLetter = getExcelColumn(colIndex);
          let targetRow = 0;

          if (isDailyCanvas) {
            // Day sheets (01-31 or 1-31): hourly logs starting at row 6
            if (sheetName === day.toString().padStart(2, "0") || sheetName === day.toString()) {
              targetRow = hour + 6;
            } else if (sheetName === "FSS & VESDA") {
              const roomOffset = getFssRoomOffset(assetId || metricId);
              if (roomOffset !== -1) {
                targetRow = 3 + ((day - 1) * 6) + roomOffset;
              }
            }
          } else {
            // Commercial Logbook sheet rows
            if (sheetName === "Commercial Power Log" || sheetName === "Temp Record") {
              targetRow = 7 + ((day - 1) * 6) + Math.floor(hour / 4);
            } else if (sheetName.startsWith("DG-")) {
              // Header occupies rows 2-3; day 1 is row 4. This was 2 + day,
              // which wrote day 1 into the sub-header and shifted the whole
              // month up by one. The neighbouring Fuel Record was already
              // correct, which is how the two disagreed unnoticed.
              targetRow = 3 + day;
            } else if (sheetName === "Fuel Record") {
              targetRow = 5 + day;
            } else if (sheetName === "DG Check") {
              // Nine checklist items per day, not six. Date rows in the
              // template fall at 5, 14, 23, 32 — a stride of 9.
              targetRow = 5 + (day - 1) * DG_CHECK_ITEMS_PER_DAY;
            } else if (sheetName === "PAC") {
              const equipIdx = plan.rowIndex[assetId];
              // Undefined means the asset has no row on this sheet — the Dragor
              // and the three HQ aircons, which the 23-row block does not cover.
              if (equipIdx !== undefined) {
                // Every fault this line used to have: no day term at all, so all
                // 31 days overwrote one block; a stride of 24 against a block of
                // 23, drifting a row every two hours; and a base of 5 where the
                // data starts at row 6.
                const block = (day - 1) * PAC_BLOCKS_PER_DAY + Math.floor(hour / 2);
                targetRow = PAC_FIRST_ROW + block * PAC_UNITS_PER_BLOCK + equipIdx;
              }
            } else if (sheetName === "Eqpt status") {
              targetRow = getEqptStatusRow(assetId || metricId);
            }
          }

          if (targetRow > 0) {
            const cell = sheet.getCell(colLetter + targetRow);
            // Protect cell formulas from being overwritten
            const isFormula = cell.value && typeof cell.value === 'object' && ('formula' in cell.value || (cell.value as any).formula);
            if (!isFormula) {
              cell.value = cellValue;
            }
          }
        });
      });

      // Write tech name and date to daily canvas sheets (only if log exists)
      if (log) {
        const daySheetName = day.toString().padStart(2, "0");
        const dailySheet = dailyWb.getWorksheet(daySheetName) || dailyWb.getWorksheet(day.toString());
        if (dailySheet) {
          dailySheet.getCell("CC" + (hour + 6)).value = lastTechName;
        }

        const fssSheet = getWorksheetCaseInsensitive(dailyWb, "FSS & VESDA");
        if (fssSheet) {
          const rooms = [
            "fss_switch_room",
            "fss_ibm_room",
            "fss_power_room",
            "fss_battery_room",
            "fss_enterprise_1",
            "fss_enterprise_2"
          ];
          rooms.forEach((_roomId, roomOffset) => {
            const fssRow = 3 + ((day - 1) * 6) + roomOffset;
            const logDate = new Date(log.target_hour);
            fssSheet.getCell("A" + fssRow).value = logDate.toLocaleDateString("en-US");
            fssSheet.getCell("L" + fssRow).value = lastTechName;
          });
        }
      }

      // Write metadata/technician names to commercial logbook sheets for every day and hour slot
      const cpSheet = getWorksheetCaseInsensitive(commWb, "Commercial Power Log");
      if (cpSheet) {
        const cpRow = 7 + ((day - 1) * 6) + Math.floor(hour / 4);
        const logDateStr = new Date(parseInt(year, 10), numericMonth - 1, day).toLocaleDateString("en-US");
        cpSheet.getCell("A" + cpRow).value = logDateStr;
        // Q is Technician; R is Remarks. The name was landing in Remarks.
        cpSheet.getCell("Q" + cpRow).value = lastTechName;
      }

      const trSheet = getWorksheetCaseInsensitive(commWb, "Temp Record");
      if (trSheet) {
        const trRow = 7 + ((day - 1) * 6) + Math.floor(hour / 4);
        const logDateStr = new Date(parseInt(year, 10), numericMonth - 1, day).toLocaleDateString("en-US");
        trSheet.getCell("A" + trRow).value = logDateStr;
        // R is "Remarks & Sign". V is past the end of a 19-column sheet, so
        // the technician's name was being written outside the table.
        trSheet.getCell("R" + trRow).value = lastTechName;
      }

      const dgNames = ["DG-1", "DG-2", "DG-3", "DG-4", "DG-HQ"];
      dgNames.forEach(name => {
        const sheet = getWorksheetCaseInsensitive(commWb, name);
        if (sheet) {
          const logDateStr = new Date(parseInt(year, 10), numericMonth - 1, day).toLocaleDateString("en-US");
          // Day 1 is row 4; header occupies 2-3. Same off-by-one the reading
          // destinations had, in the metadata that labels them.
          const dgRow = 3 + day;
          sheet.getCell("A" + dgRow).value = logDateStr;
          sheet.getCell("T" + dgRow).value = lastTechName;
        }
      });

      const fuelSheet = getWorksheetCaseInsensitive(commWb, "Fuel Record");
      if (fuelSheet) {
        const fuelRow = 5 + day;
        const logDateStr = new Date(parseInt(year, 10), numericMonth - 1, day).toLocaleDateString("en-US");
        fuelSheet.getCell("A" + fuelRow).value = logDateStr;
        // The sheet's labelled columns end at L (fuel spillage), so there is no
        // technician column here. The hardcoded "OK" that used to go in M is
        // dropped — it asserted a status nobody had checked. The name stays, in
        // the first free column, because attribution is worth more than
        // tidiness; it wants a proper column in the client's template.
        fuelSheet.getCell("M" + fuelRow).value = lastTechName;
      }

      const pacSheet = getWorksheetCaseInsensitive(commWb, "PAC");
      if (pacSheet) {
        for (let eqIdx = 0; eqIdx < 24; eqIdx++) {
          const pacRow = 5 + (Math.floor(hour / 2) * 24) + eqIdx;
          const logDateStr = new Date(parseInt(year, 10), numericMonth - 1, day).toLocaleDateString("en-US");
          pacSheet.getCell("A" + pacRow).value = logDateStr;
          pacSheet.getCell("R" + pacRow).value = lastTechName;
        }
      }
    }
  }

  // Process daily checklists to populate "DG Check" status checks
  const checklistLogs = logs.filter(log => log.asset_id === DAILY_CHECKLIST_ASSET_ID);
  for (const log of checklistLogs) {
    const timestampStr = log.target_hour;
    if (!timestampStr) continue;

    const date = new Date(timestampStr);
    const catDate = new Date(date.getTime() + 2 * 60 * 60 * 1000);
    const day = catDate.getUTCDate();
    const fullTechName = log.technician_name || "Field Tech";
    const techName = fullTechName.trim().split(/\s+/)[0];

    const checkSheet = getWorksheetCaseInsensitive(commWb, "DG Check");
    if (checkSheet) {
      const startRow = 5 + (day - 1) * 6;
      const formVals = log.metrics?.formValues || {};
      
      const checkItems = [
        { key: "g5", defaultText: "Check engine oil level" },
        { key: "g6", defaultText: "Check radiator coolant level" }, // H-8 FIX: g6 for radiator coolant
        { key: "g3", defaultText: "Check starting batteries" },
        { key: "g1", defaultText: "Check for active alarms on control panel" },
        { key: "g4", defaultText: "Verify fuel tank levels" },
        { key: "g2", defaultText: "Verify no water or fuel leakage" },
      ];

      checkItems.forEach((item, idx) => {
        const rowNum = startRow + idx;
        const val = formVals[item.key] || { status: "OK", comment: "" };
        
        checkSheet.getCell("A" + rowNum).value = date.toLocaleDateString("en-US");
        checkSheet.getCell("C" + rowNum).value = val.status || "OK";
        
        const commentStr = val.comment ? `${val.comment} (${techName})` : `OK (${techName})`;
        checkSheet.getCell("AF" + rowNum).value = commentStr;
      });
    }
  }

  // ── Date the workbooks ───────────────────────────────────────────────────
  // Both templates ship hardcoded to June 2026. Every sheet that carries a date
  // column carried June's, whatever month was actually exported — so a
  // September report was dated June, and the person reading it had to know to
  // ignore that.
  //
  // Every address below was read out of the template rather than assumed. The
  // derived sheets (Room Temp, Summary, PUE Trend, Power Plant) are formula
  // views over the day sheets; their date columns are literal and need stamping
  // even though their data does not.
  const dayOf = (d: number) => new Date(parseInt(year, 10), numericMonth - 1, d);

  for (let d = 1; d <= numDays; d++) {
    const date = dayOf(d);

    // Day sheet — the header date, top right of each of the 31 sheets.
    const daySheet = getWorksheetCaseInsensitive(dailyWb, d.toString().padStart(2, "0"))
                  ?? getWorksheetCaseInsensitive(dailyWb, d.toString());
    if (daySheet) daySheet.getCell("BV1").value = date;

    const stamp = (wb: ExcelJS.Workbook, sheetName: string, col: string, firstRow: number) => {
      const sheet = getWorksheetCaseInsensitive(wb, sheetName);
      if (sheet) sheet.getCell(col + (firstRow + d - 1)).value = date;
    };

    stamp(dailyWb, "Room Temp - Auto Update", "A", 6);
    stamp(dailyWb, "Summary - Temp & Hum ",   "A", 4);
    stamp(dailyWb, "PUE Trend",               "A", 4);

    // Eqpt status runs ACROSS: one four-column block per day, starting at G3.
    const eqpt = getWorksheetCaseInsensitive(commWb, "Eqpt status");
    if (eqpt) eqpt.getCell(getExcelColumn(6 + (d - 1) * 4) + "3").value = date;

    // Power Plant check sheets: four rows per day (00/06/12/18), date on the first.
    for (const name of ["Power Plant - UPS 1", "Power Plant - UPS 2",
                        "Power Plant - RECTIFIER 1", "Power Plant - RECTIFIER 2"]) {
      const sheet = getWorksheetCaseInsensitive(dailyWb, name);
      if (sheet) sheet.getCell("B" + (4 + (d - 1) * 4)).value = date;
    }
  }

  // Half of each workbook is formulas reading the day sheets — Room Temp,
  // Summary, PUE Trend and the four Power Plant check sheets. ExcelJS writes
  // values without recomputing them, so without this the file ships carrying
  // the TEMPLATE's cached results and whether the recipient sees real numbers
  // depends on their Excel's recalculation settings.
  dailyWb.calcProperties.fullCalcOnLoad = true;
  commWb.calcProperties.fullCalcOnLoad = true;

  // Trigger Download
  const dailyBuffer = await dailyWb.xlsx.writeBuffer();
  saveAs(new Blob([dailyBuffer]), `${BRAND_NAME}_${siteFileLabel(siteCode)}_Daily_Canvas_${month}_${year}.xlsx`);

  const commBuffer = await commWb.xlsx.writeBuffer();
  saveAs(new Blob([commBuffer]), `${BRAND_NAME}_${siteFileLabel(siteCode)}_Commercial_Logbook_${month}_${year}.xlsx`);
};

export const generateLegacyMonthlyReport = async (
  month: string,
  year: string,
  flatData: any[],
  siteCode: string = DEFAULT_SITE_CODE,
  siteUuid: string | null = null
): Promise<void> => {
  const mappedLogs = flatData.map((row) => {
    const metrics: Record<string, any> = {};
    Object.keys(row).forEach((key) => {
      if (
        key !== "target_hour" &&
        key !== "created_at" &&
        key !== "frequency" &&
        key !== "asset_id" &&
        key !== "technician_name"
      ) {
        metrics[key] = row[key];
      }
    });
    return {
      target_hour: row.target_hour || row.created_at,
      frequency: row.frequency,
      asset_id: row.asset_id,
      technician_name: row.technician_name,
      metrics,
    };
  });
  return generateMonthlyReport(month, year, mappedLogs, siteCode, siteUuid);
};
