import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { MASTER_ASSET_DICTIONARY } from "../../features/field/constants/telemetrySchema";
import { getExcelColumn, getPacEquipmentIndex, getEqptStatusRow, getFssRoomOffset } from "./excelMappingHelpers";

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

  // Filter out daily checklists from the main hourly telemetry log processing
  const filteredLogs = logs.filter(log => log.asset_id !== "AIRTEL_DAILY_CHECKLIST");

  // Build a lookup map of hourly logs by day and hour in CAT
  const logsMap = new Map<string, any>();
  filteredLogs.forEach((log) => {
    const timestampStr = log.target_hour;
    if (!timestampStr) return;
    const date = new Date(timestampStr);
    const catDate = new Date(date.getTime() + 2 * 60 * 60 * 1000);
    const day = catDate.getUTCDate();
    const hour = catDate.getUTCHours();
    logsMap.set(`${day}-${hour}`, log);
  });

  // Determine number of days in the month
  const numDays = new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate();

  // Stateful carry-forward trackers
  const lastEnteredValues: Record<string, any> = {};
  let lastTechName = "Field Tech";

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

      // Loop over categories -> assets -> metrics
      MASTER_ASSET_DICTIONARY.forEach((category) => {
        category.assets.forEach((asset) => {
          // Intercept asset status: status_[assetId] = 'OFFLINE'
          const isAssetOffline = log?.metrics && log.metrics[`status_${asset.id}`] === "OFFLINE";

          asset.metrics.forEach((metric) => {
            // If offline, suspend carry-forward logic for this metric
            if (isAssetOffline) {
              delete lastEnteredValues[metric.id];
            }

            const rawValue = log?.metrics ? log.metrics[metric.id] : undefined;

            let cellValue: any = null;
            if (isAssetOffline) {
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

              // Only write to daily_canvas if an actual log exists for this hour
              if (isDailyCanvas && !log) return;

              const workbookObj = isDailyCanvas ? dailyWb : commWb;
              const sheetName = (isDailyCanvas && dest.sheetName === "DYNAMIC_DAY")
                ? day.toString().padStart(2, "0")
                : dest.sheetName;

              const sheet = workbookObj.getWorksheet(sheetName) || workbookObj.getWorksheet(day.toString());
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
                  const roomOffset = getFssRoomOffset(asset.id);
                  if (roomOffset !== -1) {
                    targetRow = 3 + ((day - 1) * 6) + roomOffset;
                  }
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
                  targetRow = 5 + (day - 1) * 6; // Set targetRow to the first row of the day
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
                const cell = sheet.getCell(colLetter + targetRow);
                // Protect cell formulas from being overwritten
                const isFormula = cell.value && typeof cell.value === 'object' && ('formula' in cell.value || (cell.value as any).formula);
                if (!isFormula) {
                  cell.value = cellValue;
                }
              }
            });
          });
        });
      });

      // Write tech name and date to daily canvas sheets (only if log exists)
      if (log) {
        const daySheetName = day.toString().padStart(2, "0");
        const dailySheet = dailyWb.getWorksheet(daySheetName) || dailyWb.getWorksheet(day.toString());
        if (dailySheet) {
          dailySheet.getCell("CC" + (hour + 6)).value = lastTechName;
        }

        const fssSheet = dailyWb.getWorksheet("FSS & VESDA");
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
      const cpSheet = commWb.getWorksheet("Commercial Power Log");
      if (cpSheet) {
        const cpRow = 7 + ((day - 1) * 6) + Math.floor(hour / 4);
        const logDateStr = new Date(parseInt(year, 10), parseInt(month, 10) - 1, day).toLocaleDateString("en-US");
        cpSheet.getCell("A" + cpRow).value = logDateStr;
        cpSheet.getCell("R" + cpRow).value = lastTechName;
      }

      const trSheet = commWb.getWorksheet("Temp Record");
      if (trSheet) {
        const trRow = 7 + ((day - 1) * 6) + Math.floor(hour / 4);
        const logDateStr = new Date(parseInt(year, 10), parseInt(month, 10) - 1, day).toLocaleDateString("en-US");
        trSheet.getCell("A" + trRow).value = logDateStr;
        trSheet.getCell("V" + trRow).value = lastTechName;
      }

      const dgNames = ["DG-1", "DG-2", "DG-3", "DG-4", "DG-HQ"];
      dgNames.forEach(name => {
        const sheet = commWb.getWorksheet(name);
        if (sheet) {
          const logDateStr = new Date(parseInt(year, 10), parseInt(month, 10) - 1, day).toLocaleDateString("en-US");
          sheet.getCell("A" + (2 + day)).value = logDateStr;
          sheet.getCell("T" + (2 + day)).value = lastTechName;
        }
      });

      const fuelSheet = commWb.getWorksheet("Fuel Record");
      if (fuelSheet) {
        const fuelRow = 5 + day;
        const logDateStr = new Date(parseInt(year, 10), parseInt(month, 10) - 1, day).toLocaleDateString("en-US");
        fuelSheet.getCell("A" + fuelRow).value = logDateStr;
      }

      const pacSheet = commWb.getWorksheet("PAC");
      if (pacSheet) {
        for (let eqIdx = 0; eqIdx < 24; eqIdx++) {
          const pacRow = 5 + (Math.floor(hour / 2) * 24) + eqIdx;
          const logDateStr = new Date(parseInt(year, 10), parseInt(month, 10) - 1, day).toLocaleDateString("en-US");
          pacSheet.getCell("A" + pacRow).value = logDateStr;
          pacSheet.getCell("R" + pacRow).value = lastTechName;
        }
      }
    }
  }

  // Process daily checklists to populate "DG Check" status checks
  const checklistLogs = logs.filter(log => log.asset_id === "AIRTEL_DAILY_CHECKLIST");
  for (const log of checklistLogs) {
    const timestampStr = log.target_hour;
    if (!timestampStr) continue;

    const date = new Date(timestampStr);
    const catDate = new Date(date.getTime() + 2 * 60 * 60 * 1000);
    const day = catDate.getUTCDate();
    const fullTechName = log.technician_name || "Field Tech";
    const techName = fullTechName.trim().split(/\s+/)[0];

    const checkSheet = commWb.getWorksheet("DG Check");
    if (checkSheet) {
      const startRow = 5 + (day - 1) * 6;
      const formVals = log.metrics?.formValues || {};
      
      const checkItems = [
        { key: "g5", defaultText: "Check engine oil level" },
        { key: "g5", defaultText: "Check radiator coolant level" },
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
  return generateMonthlyReport(month, year, mappedLogs);
};
