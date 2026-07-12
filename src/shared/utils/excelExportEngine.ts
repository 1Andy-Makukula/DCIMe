import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { MASTER_ASSET_DICTIONARY } from "../../features/field/constants/telemetrySchema";
import { getExcelColumn, getPacEquipmentIndex, getEqptStatusRow } from "./excelMappingHelpers";

// Helper to get fallback/constant value based on user spec
const getFallbackValue = (metricId: string, lastValue: any): any => {
  if (lastValue !== undefined && lastValue !== null && lastValue !== "") {
    return lastValue;
  }

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

export const generateMonthlyReport = async (
  month: string,
  year: string,
  logs: any[]
): Promise<void> => {
  // Fetch Templates concurrently
  const [dailyRes, commRes] = await Promise.all([
    fetch("/template_daily_canvas.xlsx").catch(() => null),
    fetch("/template_commercial_logbook.xlsx").catch(() => null)
  ]);

  if (!dailyRes || !commRes || !dailyRes.ok || !commRes.ok) {
    throw new Error("Failed to fetch templates. Ensure template_daily_canvas.xlsx and template_commercial_logbook.xlsx are in the /public folder.");
  }

  // Load them into separate ExcelJS.Workbook instances
  const dailyWb = new ExcelJS.Workbook();
  await dailyWb.xlsx.load(await dailyRes.arrayBuffer());

  const commWb = new ExcelJS.Workbook();
  await commWb.xlsx.load(await commRes.arrayBuffer());

  // Filter out daily checklists from telemetry log processing
  const filteredLogs = logs.filter(log => log.frequency !== "daily" && log.asset_id !== "daily_checklist");

  // Sort logs chronologically to ensure correct carry-forward state tracking
  const sortedLogs = [...filteredLogs].sort((a, b) => {
    return new Date(a.target_hour).getTime() - new Date(b.target_hour).getTime();
  });

  // Stateful carry-forward trackers
  const lastEnteredValues: Record<string, any> = {};

  // Routing Engine (The Loop)
  for (const log of sortedLogs) {
    const timestampStr = log.target_hour;
    if (!timestampStr) continue;

    const date = new Date(timestampStr);
    // Add +2 hours offset to guarantee we parse the day and hour in CAT (Central Africa Time, UTC+2)
    // regardless of local browser/client timezone.
    const catDate = new Date(date.getTime() + 2 * 60 * 60 * 1000);
    const day = catDate.getUTCDate();
    const hour = catDate.getUTCHours();

    const fullTechName = log.technician_name || "Field Tech";
    const techName = fullTechName.trim().split(/\s+/)[0];

    // Update state tracker with newly logged values
    if (log.metrics) {
      Object.keys(log.metrics).forEach((key) => {
        const val = log.metrics[key];
        if (val !== undefined && val !== null && val !== "") {
          lastEnteredValues[key] = val;
        }
      });
    }

    // Loop over categories -> assets -> metrics
    MASTER_ASSET_DICTIONARY.forEach((category) => {
      category.assets.forEach((asset) => {
        // Intercept asset status: status_[assetId] = 'OFFLINE'
        const isAssetOffline = log.metrics && log.metrics[`status_${asset.id}`] === "OFFLINE";

        asset.metrics.forEach((metric) => {
          // If offline, suspend carry-forward logic for this metric
          if (isAssetOffline) {
            delete lastEnteredValues[metric.id];
          }

          const rawValue = log.metrics ? log.metrics[metric.id] : undefined;

          let cellValue: any = null;
          if (isAssetOffline) {
            // Explicitly write "OFFLINE" into those cells instead of carrying forward metrics
            cellValue = "OFFLINE";
          } else {
            const finalValue = rawValue !== undefined && rawValue !== null && rawValue !== ""
              ? rawValue
              : lastEnteredValues[metric.id];
            cellValue = getFallbackValue(metric.id, finalValue);
          }

          // Route strictly using coordinates defined in the dictionary destinations
          const destinations = metric.destinations || [];
          destinations.forEach((dest) => {
            const isDailyCanvas = dest.workbook === "daily_canvas";
            const isCommercialLogbook = dest.workbook === "commercial_logbook";

            if (!isDailyCanvas && !isCommercialLogbook) return;

            const workbookObj = isDailyCanvas ? dailyWb : commWb;
            const sheetName = (isDailyCanvas && dest.sheetName === "DYNAMIC_DAY")
              ? day.toString().padStart(2, "0")
              : dest.sheetName;

            const sheet = workbookObj.getWorksheet(sheetName) || workbookObj.getWorksheet(day.toString());
            if (!sheet) return;

            const colLetter = getExcelColumn(dest.excelColumnIndex);
            let targetRow = 0;

            if (isDailyCanvas) {
              // Day sheets (01-31 or 1-31): hourly logs starting at row 6
              if (sheetName === day.toString().padStart(2, "0") || sheetName === day.toString()) {
                targetRow = hour + 6;
              }
            } else {
              // Commercial Logbook sheet rows
              if (sheetName === "Commercial Power Log" || sheetName === "Temp Record") {
                targetRow = 7 + ((day - 1) * 6) + Math.floor(hour / 4);
              } else if (sheetName.startsWith("DG-")) {
                targetRow = 2 + day;
              } else if (sheetName === "Fuel Record") {
                targetRow = 5 + day;
              } else if (sheetName === "DG Check") {
                targetRow = 3 + day;
              } else if (sheetName === "PAC") {
                const equipIdx = getPacEquipmentIndex(asset.id);
                if (equipIdx !== -1) {
                  targetRow = 5 + (Math.floor(hour / 2) * 24) + equipIdx;
                }
              } else if (sheetName === "Eqpt status") {
                targetRow = getEqptStatusRow(asset.id);
              }
            }

            if (targetRow > 0) {
              sheet.getCell(colLetter + targetRow).value = cellValue;
            }
          });
        });
      });
    });

    // Write technician name to daily day sheets (column CC)
    const daySheetName = day.toString().padStart(2, "0");
    const dailySheet = dailyWb.getWorksheet(daySheetName) || dailyWb.getWorksheet(day.toString());
    if (dailySheet) {
      dailySheet.getCell("CC" + (hour + 6)).value = techName;
    }

    // Write technician name and static properties to commercial logbook sheets where appropriate
    const cpSheet = commWb.getWorksheet("Commercial Power Log");
    if (cpSheet) {
      const cpRow = 7 + ((day - 1) * 6) + Math.floor(hour / 4);
      cpSheet.getCell("R" + cpRow).value = techName;
    }

    const trSheet = commWb.getWorksheet("Temp Record");
    if (trSheet) {
      const trRow = 7 + ((day - 1) * 6) + Math.floor(hour / 4);
      trSheet.getCell("V" + trRow).value = techName;
    }

    const dgNames = ["DG-1", "DG-2", "DG-3", "DG-4", "DG-HQ"];
    dgNames.forEach(name => {
      const sheet = commWb.getWorksheet(name);
      if (sheet) {
        sheet.getCell("T" + (2 + day)).value = techName;
      }
    });

    const fuelSheet = commWb.getWorksheet("Fuel Record");
    if (fuelSheet) {
      const fuelRow = 5 + day;
      fuelSheet.getCell("A" + fuelRow).value = date.toLocaleDateString("en-US");
      fuelSheet.getCell("K" + fuelRow).value = "NO";
      fuelSheet.getCell("L" + fuelRow).value = "NO";
    }

    const checkSheet = commWb.getWorksheet("DG Check");
    if (checkSheet) {
      const checkRow = 3 + day;
      checkSheet.getCell("A" + checkRow).value = date.toLocaleDateString("en-US");
      checkSheet.getCell("W" + checkRow).value = techName;
    }

    const pacSheet = commWb.getWorksheet("PAC");
    if (pacSheet) {
      for (let eqIdx = 0; eqIdx < 24; eqIdx++) {
        const pacRow = 5 + (Math.floor(hour / 2) * 24) + eqIdx;
        pacSheet.getCell("A" + pacRow).value = date.toLocaleDateString("en-US");
        pacSheet.getCell("R" + pacRow).value = techName;
      }
    }
  }

  // 8. Trigger Dual Download
  const dailyBuffer = await dailyWb.xlsx.writeBuffer();
  saveAs(new Blob([dailyBuffer]), `Airtel_Daily_Canvas_${month}_${year}.xlsx`);

  const commBuffer = await commWb.xlsx.writeBuffer();
  saveAs(new Blob([commBuffer]), `Airtel_Commercial_Logbook_${month}_${year}.xlsx`);
};

export const generateLegacyMonthlyReport = async (
  month: string,
  year: string,
  flatData: any[]
): Promise<void> => {
  const mappedLogs = flatData.map((row) => {
    const metrics: Record<string, any> = {};
    Object.keys(row).forEach((key) => {
      if (key !== "target_hour" && key !== "created_at") {
        metrics[key] = row[key];
      }
    });
    return {
      target_hour: row.target_hour || row.created_at,
      metrics,
    };
  });
  return generateMonthlyReport(month, year, mappedLogs);
};
