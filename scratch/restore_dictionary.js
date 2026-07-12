import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const recoveredPath = path.join(__dirname, '../recovered_dictionary_utf8.ts');
const targetPath = path.join(__dirname, '../src/features/field/constants/telemetrySchema.ts');

if (!fs.existsSync(recoveredPath)) {
  console.error("Recovered file not found!");
  process.exit(1);
}

let content = fs.readFileSync(recoveredPath, 'utf8');

// Clean up garbled character glitches from PowerShell/encodings
content = content
  .replace(/ÔöÇ/g, '─')
  .replace(/ÔòÉ/g, '═')
  .replace(/ÔÇö/g, '—')
  .replace(/┬░/g, '°');

// Append the strict analytics types we need for the analytics hook/views
const strictTypes = `
// ── STRICT ANALYTICS TYPES ───────────────────────────────────────────────────
export interface GeneratorsFuelAnalyticsType {
  run_hrs: number;
  fuel_consumed: number;
  batt_voltage: number;
  oil_pressure: number;
  water_temp: number;
  dg_id: 'DG-1' | 'DG-2' | 'DG-3' | 'DG-4' | 'DG-HQ';
}

export interface UpsRectifiersAnalyticsType {
  ups_status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  rectifier_status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  output_load_kw: number;
  load_amps_a: number;
  load_amps_b: number;
  load_amps_c: number;
  rectifier_dc_voltage: number;
  battery_charge: number;
}

export interface ThermalHvacAnalyticsType {
  server_ambient_temp: number;
  return_temp_actual: number;
  supply_temp_set: number;
  humidity_percent: number;
  pac_id: string;
  room_zone: string;
  abnormality_flag: boolean;
}

export interface IncidentsAnalyticsType {
  resolution_time_hrs: number;
  incident_count: number;
  incident_id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'OPEN' | 'RESOLVED';
  technician_id: string;
  resolution_notes: string;
}
`;

content += strictTypes;

fs.writeFileSync(targetPath, content, 'utf8');
console.log("Successfully restored and cleaned telemetrySchema.ts!");
