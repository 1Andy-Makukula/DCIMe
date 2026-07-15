// ─────────────────────────────────────────────────────────────────────────────
// DCIMe Engine — Relational Asset Dictionary (v3 Production)
// Single source of truth for the mobile app and Excel export engine.
// 100% Forensically mapped to physical NTC Excel templates.
// ─────────────────────────────────────────────────────────────────────────────

export type CheckFrequency = 'hourly' | '2-hour' | '4-hour' | 'daily';
export type TargetWorkbook = 'daily_canvas' | 'commercial_logbook';

export interface ExcelTarget {
  workbook: TargetWorkbook;
  sheetName: string;
  excelColumnIndex: number; // 0-based column index
}

export interface AssetMetric {
  id: string;
  label: string;
  type: 'number' | 'text' | 'boolean';
  frequency: CheckFrequency; 
  isConstant?: boolean;      
  defaultValue?: string | number; 
  carryForward?: boolean;    
  destinations: ExcelTarget[];
}

export interface Asset {
  id: string;
  name: string;
  metrics: AssetMetric[];
}

export interface AssetCategory {
  categoryName: string;
  assets: Asset[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared metric blueprints — Mapped exactly to Excel Columns
// ─────────────────────────────────────────────────────────────────────────────

function buildPacMetrics(prefix: string): AssetMetric[] {
  return [
    { id: `${prefix}_return_temp_actual`, label: 'Return Temp (Actual)', type: 'number', frequency: '2-hour', destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 4 }] },
    { id: `${prefix}_return_temp_set`,    label: 'Return Temp (Set)',    type: 'number', frequency: '2-hour', isConstant: true, defaultValue: 22, destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 5 }] },
    { id: `${prefix}_supply_temp_set`,    label: 'Supply Temp (Set)',    type: 'number', frequency: '2-hour', isConstant: true, defaultValue: 20, destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 6 }] },
    { id: `${prefix}_humidity_actual`,    label: 'Humidity (Actual)',    type: 'number', frequency: '2-hour', destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 7 }] },
    { id: `${prefix}_humidity_set`,       label: 'Humidity (Set)',       type: 'number', frequency: '2-hour', isConstant: true, defaultValue: 45, destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 8 }] },
    
    // Voltages (L-L)
    { id: `${prefix}_voltage_ry`,         label: 'Voltage (R-Y)',        type: 'number', frequency: '2-hour', destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 9 }] },
    { id: `${prefix}_voltage_yb`,         label: 'Voltage (Y-B)',        type: 'number', frequency: '2-hour', destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 10 }] },
    { id: `${prefix}_voltage_br`,         label: 'Voltage (B-R)',        type: 'number', frequency: '2-hour', destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 11 }] },
    
    // Load Currents
    { id: `${prefix}_current_r`,          label: 'Load Current (R)',     type: 'number', frequency: '2-hour', destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 12 }] },
    { id: `${prefix}_current_y`,          label: 'Load Current (Y)',     type: 'number', frequency: '2-hour', destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 13 }] },
    { id: `${prefix}_current_b`,          label: 'Load Current (B)',     type: 'number', frequency: '2-hour', destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 14 }] },
    { id: `${prefix}_current_n`,          label: 'Load Current (N)',     type: 'number', frequency: '2-hour', destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 15 }] },

    // Daily Status
    { id: `${prefix}_daily_abnormality`, label: 'Remarks / Abnormality', type: 'text', frequency: 'daily', defaultValue: 'NON', destinations: [{ workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: 16 }] },
  ];
}

function buildUpsMetrics(prefix: string, canvasStartIndex: number): AssetMetric[] {
  const getCanvasDest = (offset: number): ExcelTarget[] => [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: canvasStartIndex + offset }
  ];
  
  return [
    // Output Load & Battery
    { id: `${prefix}_output_load_kw`, label: 'Output Load (kW)', type: 'number', frequency: 'hourly', destinations: getCanvasDest(0) },
    { id: `${prefix}_used_capacity`, label: 'Used Capacity (%)', type: 'number', frequency: 'hourly', destinations: getCanvasDest(1) },
    { id: `${prefix}_battery_charge_percent`, label: 'Battery Charge (%)', type: 'number', frequency: 'hourly', destinations: getCanvasDest(2) },
    { id: `${prefix}_battery_voltage`, label: 'Battery Voltage (V)', type: 'number', frequency: 'hourly', destinations: getCanvasDest(3) },
    
    // Load Currents
    { id: `${prefix}_load_amps_a`, label: 'Load Current (A)', type: 'number', frequency: 'hourly', destinations: getCanvasDest(4) },
    { id: `${prefix}_load_amps_b`, label: 'Load Current (B)', type: 'number', frequency: 'hourly', destinations: getCanvasDest(5) },
    { id: `${prefix}_load_amps_c`, label: 'Load Current (C)', type: 'number', frequency: 'hourly', destinations: getCanvasDest(6) },
    
    // Load Phase %
    { id: `${prefix}_load_phase_percent_a`, label: 'Load Phase % (A)', type: 'number', frequency: 'hourly', destinations: getCanvasDest(7) },
    { id: `${prefix}_load_phase_percent_b`, label: 'Load Phase % (B)', type: 'number', frequency: 'hourly', destinations: getCanvasDest(8) },
    { id: `${prefix}_load_phase_percent_c`, label: 'Load Phase % (C)', type: 'number', frequency: 'hourly', destinations: getCanvasDest(9) },
    
    // Output Voltages
    { id: `${prefix}_output_voltage_a`, label: 'Output Voltage (A)', type: 'number', frequency: 'hourly', destinations: getCanvasDest(10) },
    { id: `${prefix}_output_voltage_b`, label: 'Output Voltage (B)', type: 'number', frequency: 'hourly', destinations: getCanvasDest(11) },
    { id: `${prefix}_output_voltage_c`, label: 'Output Voltage (C)', type: 'number', frequency: 'hourly', destinations: getCanvasDest(12) },

    // Daily Status (Eqpt Status Sheet)
    { id: `${prefix}_daily_status`, label: 'Status (OK/Not OK)', type: 'text', frequency: 'daily', isConstant: true, defaultValue: 'OK', destinations: [{ workbook: 'commercial_logbook', sheetName: 'Eqpt status', excelColumnIndex: 6 }] },
    { id: `${prefix}_daily_abnormality`, label: 'Abnormality Observed', type: 'text', frequency: 'daily', isConstant: true, defaultValue: 'NON', destinations: [{ workbook: 'commercial_logbook', sheetName: 'Eqpt status', excelColumnIndex: 8 }] },
  ];
}

function buildRectifierMetrics(prefix: string, canvasStartIndex: number): AssetMetric[] {
  const getCanvasDest = (offset: number): ExcelTarget[] => [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: canvasStartIndex + offset }
  ];

  return [
    { id: `${prefix}_dc_voltage`, label: 'DC Voltage (V)', type: 'number', frequency: 'hourly', destinations: getCanvasDest(0) },
    { id: `${prefix}_amps`, label: 'Current (A)', type: 'number', frequency: 'hourly', destinations: getCanvasDest(1) },
    { id: `${prefix}_battery_status`, label: 'BB Charging Status', type: 'text', frequency: 'hourly', isConstant: true, defaultValue: 'OK', destinations: getCanvasDest(2) },
    { id: `${prefix}_used_percentage`, label: 'Used Percentage (%)', type: 'number', frequency: 'hourly', destinations: getCanvasDest(3) },

    // Daily Status (Eqpt Status Sheet)
    { id: `${prefix}_daily_status`, label: 'Status (OK/Not OK)', type: 'text', frequency: 'daily', isConstant: true, defaultValue: 'OK', destinations: [{ workbook: 'commercial_logbook', sheetName: 'Eqpt status', excelColumnIndex: 6 }] },
    { id: `${prefix}_daily_abnormality`, label: 'Abnormality Observed', type: 'text', frequency: 'daily', isConstant: true, defaultValue: 'NON', destinations: [{ workbook: 'commercial_logbook', sheetName: 'Eqpt status', excelColumnIndex: 8 }] },
  ];
}

function buildDgMetrics(prefix: string, dgNumber: number, isHq: boolean = false, _defaultVoltage: number = 26.7): AssetMetric[] {
  const dgName = isHq ? 'DG-HQ' : `DG-${dgNumber}`;
  const canvasStartIndex = isHq ? undefined : 19 + (dgNumber - 1) * 3;
  const checkVoltageIndex = isHq ? 69 : 13 + (dgNumber - 1) * 14;

  const getLogbookDest = (colIndex: number): ExcelTarget[] => [
    { workbook: 'commercial_logbook', sheetName: dgName, excelColumnIndex: colIndex }
  ];

  return [
    // Hourly/Daily Logs
    { id: `${prefix}_run_hrs`, label: 'Run Hours', type: 'number', frequency: 'hourly', carryForward: true, destinations: [
      ...(canvasStartIndex !== undefined ? [{ workbook: 'daily_canvas' as const, sheetName: 'DYNAMIC_DAY', excelColumnIndex: canvasStartIndex }] : []),
      { workbook: 'commercial_logbook', sheetName: dgName, excelColumnIndex: 6 }
    ] },
    { id: `${prefix}_batt_voltage`, label: 'Battery Voltage', type: 'number', frequency: 'hourly', destinations: [
      ...(canvasStartIndex !== undefined ? [{ workbook: 'daily_canvas' as const, sheetName: 'DYNAMIC_DAY', excelColumnIndex: canvasStartIndex + 1 }] : []),
      { workbook: 'commercial_logbook', sheetName: 'DG Check', excelColumnIndex: checkVoltageIndex }
    ] },
    { id: `${prefix}_charged_status`, label: 'Charged Status', type: 'text', frequency: 'hourly', isConstant: true, defaultValue: 'GREEN', destinations: [
      ...(canvasStartIndex !== undefined ? [{ workbook: 'daily_canvas' as const, sheetName: 'DYNAMIC_DAY', excelColumnIndex: canvasStartIndex + 2 }] : [])
    ] },
    
    // Daily Engine & Time Logs (Commercial Logbook DG Sheets)
    { id: `${prefix}_hr_meter_start`, label: 'Hour Meter (Start)', type: 'number', frequency: 'daily', carryForward: true, destinations: getLogbookDest(2) },
    { id: `${prefix}_hr_meter_stop`, label: 'Hour Meter (Stop)', type: 'number', frequency: 'daily', destinations: getLogbookDest(3) },
    { id: `${prefix}_time_start`, label: 'Time (Start)', type: 'text', frequency: 'daily', defaultValue: '0:00', destinations: getLogbookDest(4) },
    { id: `${prefix}_time_stop`, label: 'Time (Stop)', type: 'text', frequency: 'daily', defaultValue: '0:00', destinations: getLogbookDest(5) },
    { id: `${prefix}_cumulative_hrs`, label: 'Cumulative Run Hrs', type: 'number', frequency: 'daily', carryForward: true, destinations: getLogbookDest(7) },
    { id: `${prefix}_auto_status`, label: 'Auto Functioning?', type: 'text', frequency: 'daily', isConstant: true, defaultValue: 'YES', destinations: getLogbookDest(8) },
    { id: `${prefix}_kwh_meter`, label: 'KWH Meter', type: 'number', frequency: 'daily', carryForward: true, destinations: getLogbookDest(9) },
    
    // DG Voltages & Currents
    { id: `${prefix}_voltage_ry`, label: 'Voltage (R-Y)', type: 'number', frequency: 'daily', destinations: getLogbookDest(10) },
    { id: `${prefix}_voltage_yb`, label: 'Voltage (Y-B)', type: 'number', frequency: 'daily', destinations: getLogbookDest(11) },
    { id: `${prefix}_voltage_br`, label: 'Voltage (B-R)', type: 'number', frequency: 'daily', destinations: getLogbookDest(12) },
    { id: `${prefix}_current_r`, label: 'Load Current (R)', type: 'number', frequency: 'daily', destinations: getLogbookDest(13) },
    { id: `${prefix}_current_y`, label: 'Load Current (Y)', type: 'number', frequency: 'daily', destinations: getLogbookDest(14) },
    { id: `${prefix}_current_b`, label: 'Load Current (B)', type: 'number', frequency: 'daily', destinations: getLogbookDest(15) },
    
    // Engine Health
    { id: `${prefix}_load_kw`, label: 'Load in KW', type: 'number', frequency: 'daily', destinations: [] }, // No load_kw column exists in DG sheet, disabled destination
    { id: `${prefix}_frequency`, label: 'Frequency (Hz)', type: 'number', frequency: 'daily', destinations: getLogbookDest(16) },
    { id: `${prefix}_engine_rpm`, label: 'Engine Speed', type: 'number', frequency: 'daily', destinations: getLogbookDest(17) },
    { id: `${prefix}_oil_pressure`, label: 'Lub. Oil Pressure', type: 'number', frequency: 'daily', destinations: getLogbookDest(18) },
    { id: `${prefix}_water_temp`, label: 'Water Temp', type: 'number', frequency: 'daily', destinations: getLogbookDest(19) },
    { id: `${prefix}_daily_remarks`, label: 'Remarks', type: 'text', frequency: 'daily', defaultValue: 'OK', destinations: getLogbookDest(21) },
  ];
}

function buildAmbientMetrics(prefix: string, canvasTempCol: number, logbookTempCol: number): AssetMetric[] {
  const destinations: ExcelTarget[] = [];
  if (canvasTempCol !== -1) {
    destinations.push({ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: canvasTempCol });
  }
  destinations.push({ workbook: 'commercial_logbook', sheetName: 'Temp Record', excelColumnIndex: logbookTempCol });

  const humidityDests: ExcelTarget[] = [];
  if (canvasTempCol !== -1) {
    humidityDests.push({ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: canvasTempCol + 1 });
  }
  humidityDests.push({ workbook: 'commercial_logbook', sheetName: 'Temp Record', excelColumnIndex: logbookTempCol + 1 });

  return [
    { id: `${prefix}_temp`, label: 'Temperature (°C)', type: 'number', frequency: '4-hour', destinations },
    { id: `${prefix}_humidity`, label: 'Humidity (%)', type: 'number', frequency: '4-hour', destinations: humidityDests },
  ];
}

function buildFssVesdaMetrics(prefix: string): AssetMetric[] {
  const getFssDest = (colIndex: number): ExcelTarget[] => [
    { workbook: 'daily_canvas', sheetName: 'FSS & VESDA', excelColumnIndex: colIndex }
  ];
  return [
    { id: `${prefix}_gas_release_panel`, label: 'Gas Release Panel (Auto/Manual)', type: 'text', frequency: 'daily', isConstant: true, defaultValue: 'Auto', destinations: getFssDest(2) },
    { id: `${prefix}_detectors_led`, label: 'Detectors LED Blinking', type: 'text', frequency: 'daily', isConstant: true, defaultValue: 'Yes', destinations: getFssDest(3) },
    { id: `${prefix}_inergen_pressure`, label: 'Inergen Pressure in Green Band', type: 'text', frequency: 'daily', destinations: getFssDest(4) },
    { id: `${prefix}_smoke_detector`, label: 'Smoke Detector Visible', type: 'text', frequency: 'daily', isConstant: true, defaultValue: 'Yes', destinations: getFssDest(5) },
    { id: `${prefix}_fm_nozzle_clean`, label: 'FM Nozzle Area Clean', type: 'text', frequency: 'daily', isConstant: true, defaultValue: 'Yes', destinations: getFssDest(6) },
    { id: `${prefix}_fas_alarm`, label: 'Any Alarm on FAS', type: 'text', frequency: 'daily', isConstant: true, defaultValue: 'No', destinations: getFssDest(7) },
    { id: `${prefix}_vesda_pipe`, label: 'VESDA Pipe', type: 'text', frequency: 'daily', isConstant: true, defaultValue: 'Ok', destinations: getFssDest(8) },
    { id: `${prefix}_loose_connection`, label: 'Loose Battery Terminals', type: 'text', frequency: 'daily', isConstant: true, defaultValue: 'No', destinations: getFssDest(9) },
    { id: `${prefix}_panel_battery_voltage`, label: 'Panel Battery Voltage (V)', type: 'number', frequency: 'daily', isConstant: true, defaultValue: 24, destinations: getFssDest(10) },
    { id: `${prefix}_remarks`, label: 'Remarks', type: 'text', frequency: 'daily', isConstant: true, defaultValue: 'OK', destinations: getFssDest(12) },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// MASTER ASSET DICTIONARY
// ─────────────────────────────────────────────────────────────────────────────

export const MASTER_ASSET_DICTIONARY: AssetCategory[] = [
  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 1 — The Server Room
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'The Server Room',
    assets: [
      { id: 'room_server_ambient', name: 'Server Room Ambient', metrics: buildAmbientMetrics('server_ambient', 65, 8) },
      { id: 'pac_server_em1', name: 'Emerson Aircon 1', metrics: buildPacMetrics('pac_server_em1') },
      { id: 'pac_server_em2', name: 'Emerson Aircon 2', metrics: buildPacMetrics('pac_server_em2') },
      { id: 'pac_server_em3', name: 'Emerson Aircon 3', metrics: buildPacMetrics('pac_server_em3') },
      { id: 'pac_server_em4', name: 'Emerson Aircon 4', metrics: buildPacMetrics('pac_server_em4') },
      { id: 'pac_server_em5', name: 'Emerson Aircon 5', metrics: buildPacMetrics('pac_server_em5') },
      { id: 'pac_server_em6', name: 'Emerson Aircon 6', metrics: buildPacMetrics('pac_server_em6') },
      { id: 'pac_server_em7', name: 'Emerson Aircon 7', metrics: buildPacMetrics('pac_server_em7') },
      { id: 'pac_server_vt1', name: 'Vertiv 1', metrics: buildPacMetrics('pac_server_vt1') },
      { id: 'pac_server_vt2', name: 'Vertiv 2', metrics: buildPacMetrics('pac_server_vt2') },
      { id: 'pac_server_vt3', name: 'Vertiv 3', metrics: buildPacMetrics('pac_server_vt3') },
      { id: 'pac_server_vt4', name: 'Vertiv 4', metrics: buildPacMetrics('pac_server_vt4') },
      { id: 'pac_server_vt5', name: 'Vertiv 5', metrics: buildPacMetrics('pac_server_vt5') },
      { id: 'pac_server_dragor', name: 'Dragor', metrics: buildPacMetrics('pac_server_dragor') },
    ],
  },
  
  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 2 — Media Room & Work Station
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'Media Room & General',
    assets: [
      { id: 'room_media_ambient', name: 'IBM / Media Room Ambient', metrics: buildAmbientMetrics('media_ambient', 67, 10) },
      { id: 'pac_data_em1', name: 'Data Room Emerson 1', metrics: buildPacMetrics('pac_data_em1') },
      { id: 'pac_data_em2', name: 'Data Room Emerson 2', metrics: buildPacMetrics('pac_data_em2') },
      { id: 'pac_data_vt6', name: 'Data Room Vertiv 6', metrics: buildPacMetrics('pac_data_vt6') },
      {
        id: 'room_workstation',
        name: 'Work Station',
        metrics: [
          { id: 'workstation_status', label: 'Status', type: 'text', frequency: 'hourly', isConstant: true, defaultValue: 'OK', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 77 }] },
        ],
      },
      {
        id: 'fm200_panel',
        name: 'FM 200 Panel',
        metrics: [
          { id: 'fm200_status', label: 'Status', type: 'text', frequency: 'hourly', isConstant: true, defaultValue: 'OK', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 78 }] },
        ],
      },
    ]
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 3 — Power Room 1
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'Power Room 1',
    assets: [
      { id: 'room_pr1_ambient', name: 'Rectifier Room Ambient', metrics: buildAmbientMetrics('pr1_ambient', 69, 12) },
      { id: 'ups_1', name: 'UPS 1', metrics: buildUpsMetrics('ups_1', 31) },
      { id: 'rectifier_1', name: 'Rectifier 1', metrics: buildRectifierMetrics('rectifier_1', 57) },
      { id: 'pac_pr1_em1', name: 'Emerson Aircon 1', metrics: buildPacMetrics('pac_pr1_em1') },
      { id: 'pac_pr1_em2', name: 'Emerson Aircon 2', metrics: buildPacMetrics('pac_pr1_em2') },
      { id: 'pac_pr1_em3', name: 'Emerson Aircon 3', metrics: buildPacMetrics('pac_pr1_em3') },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 4 — Power Room 2 / Battery Room
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'Power Room 2 / Battery',
    assets: [
      { id: 'room_battery_ambient', name: 'Battery Room Ambient', metrics: buildAmbientMetrics('battery_ambient', 71, 14) },
      { id: 'ups_2', name: 'UPS 2', metrics: buildUpsMetrics('ups_2', 44) },
      { id: 'rectifier_2', name: 'Rectifier 2', metrics: buildRectifierMetrics('rectifier_2', 61) },
      { id: 'pac_pr2_em1', name: 'Power Room 2 AC 1', metrics: buildPacMetrics('pac_pr2_em1') },
      { id: 'pac_pr2_em2', name: 'Power Room 2 AC 2', metrics: buildPacMetrics('pac_pr2_em2') },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 5 — IT Rooms
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'IT Rooms',
    assets: [
      { id: 'room_it1_ambient', name: 'IT Room 1 Ambient', metrics: buildAmbientMetrics('it1_ambient', 73, 16) },
      { id: 'pac_it1_em1', name: 'IT Room 1 AC 1', metrics: buildPacMetrics('pac_it1_em1') },
      { id: 'pac_it1_em2', name: 'IT Room 1 AC 2', metrics: buildPacMetrics('pac_it1_em2') },
      
      { id: 'room_it2_ambient', name: 'IT Room 2 Ambient', metrics: buildAmbientMetrics('it2_ambient', 75, 18) },
      { id: 'pac_it2_em1', name: 'IT Room 2 AC 1', metrics: buildPacMetrics('pac_it2_em1') },
      { id: 'pac_it2_em2', name: 'IT Room 2 AC 2', metrics: buildPacMetrics('pac_it2_em2') },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 6 — HQ Zone / Zesco Panel
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'HQ Zone / Main Grid',
    assets: [
      { id: 'hq_ambient', name: 'HQ Power Room Ambient', metrics: buildAmbientMetrics('hq_ambient', -1, 6) },
      { id: 'zesco_lt_ambient', name: 'Zesco Panel / Main LT Room', metrics: buildAmbientMetrics('zesco_lt', -1, 2) },
      { id: 'rmu_ht_ambient', name: 'RMU / Main HT Room', metrics: buildAmbientMetrics('rmu_ht', -1, 4) },
      { id: 'dg_hq', name: 'Generator HQ', metrics: buildDgMetrics('dg_hq', 5, true) },
      {
        id: 'grid_main',
        name: 'ZESCO Grid',
        metrics: [
          // Voltages (Daily Canvas & Commercial Power Log)
          { id: 'grid_voltage_r', label: 'Voltage (R)', type: 'number', frequency: 'hourly', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 4 }, { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 2 }] },
          { id: 'grid_voltage_y', label: 'Voltage (Y)', type: 'number', frequency: 'hourly', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 5 }, { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 3 }] },
          { id: 'grid_voltage_b', label: 'Voltage (B)', type: 'number', frequency: 'hourly', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 6 }, { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 4 }] },
          
          // Amps (Daily Canvas & Commercial Power Log)
          { id: 'grid_amps_r', label: 'Amps (R)', type: 'number', frequency: 'hourly', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 1 }, { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 8 }] },
          { id: 'grid_amps_y', label: 'Amps (Y)', type: 'number', frequency: 'hourly', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 2 }, { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 9 }] },
          { id: 'grid_amps_b', label: 'Amps (B)', type: 'number', frequency: 'hourly', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 3 }, { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 10 }] },
          
          { id: 'grid_frequency', label: 'Frequency (Hz)', type: 'number', frequency: 'hourly', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 7 }, { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 13 }] },
          
          // Status & Durations
          { id: 'grid_status', label: 'Status', type: 'text', frequency: 'hourly', isConstant: true, defaultValue: 'ON', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 8 }] },
          { id: 'grid_off_time', label: 'Off Time', type: 'text', frequency: 'hourly', isConstant: true, defaultValue: '0:00', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 9 }] },
          { id: 'grid_restored_time', label: 'Restored Time', type: 'text', frequency: 'hourly', isConstant: true, defaultValue: '0:00', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 10 }] },
          { id: 'grid_off_duration', label: 'Off Duration', type: 'text', frequency: 'hourly', isConstant: true, defaultValue: '0:00', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 11 }] },
          
          { id: 'grid_total_site_load', label: 'Total Site Load (kW)', type: 'number', frequency: 'hourly', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 12 }, { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 14 }] },
          { id: 'facility_load_on', label: 'Load On (MAINS/DG)', type: 'text', frequency: 'hourly', isConstant: true, defaultValue: 'MAINS', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 79 }] },

          // Commercial Power (4-Hour) Logbook Metrics
          { id: 'grid_phase_voltage_rn', label: 'Phase Voltage (RN)', type: 'number', frequency: '4-hour', destinations: [{ workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 5 }] },
          { id: 'grid_phase_voltage_yn', label: 'Phase Voltage (YN)', type: 'number', frequency: '4-hour', destinations: [{ workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 6 }] },
          { id: 'grid_phase_voltage_bn', label: 'Phase Voltage (BN)', type: 'number', frequency: '4-hour', destinations: [{ workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 7 }] },
          { id: 'grid_transformer_temp', label: 'Transformer Temp (°C)', type: 'text', frequency: '4-hour', isConstant: true, defaultValue: 'NA', destinations: [{ workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 11 }] },
          { id: 'grid_power_factor', label: 'Power Factor', type: 'number', frequency: '4-hour', destinations: [{ workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 12 }] },
          { id: 'grid_energy_meter_1', label: 'Energy Meter (Sw 1)', type: 'number', frequency: '4-hour', destinations: [{ workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 15 }] },
          { id: 'grid_energy_meter_2', label: 'Energy Meter (Sw 2)', type: 'number', frequency: '4-hour', destinations: [{ workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 16 }] },
        ],
      },
      // DG Load currents and voltages aggregate
      {
        id: 'dg_aggregate_load',
        name: 'DG Load',
        metrics: [
          { id: 'dg_load_amps_r', label: 'DG Amps (R)', type: 'number', frequency: 'hourly', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 13 }] },
          { id: 'dg_load_amps_y', label: 'DG Amps (Y)', type: 'number', frequency: 'hourly', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 14 }] },
          { id: 'dg_load_amps_b', label: 'DG Amps (B)', type: 'number', frequency: 'hourly', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 15 }] },
          { id: 'dg_load_voltage_r', label: 'DG Voltage (R-Y)', type: 'number', frequency: 'hourly', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 16 }] },
          { id: 'dg_load_voltage_y', label: 'DG Voltage (Y-B)', type: 'number', frequency: 'hourly', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 17 }] },
          { id: 'dg_load_voltage_b', label: 'DG Voltage (B-R)', type: 'number', frequency: 'hourly', destinations: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 18 }] },
        ]
      }
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 7 — Generators (DG 1 to 4)
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'Generators',
    assets: [
      { id: 'dg_1', name: 'Generator 1', metrics: buildDgMetrics('dg_1', 1) },
      { id: 'dg_2', name: 'Generator 2', metrics: buildDgMetrics('dg_2', 2) },
      { id: 'dg_3', name: 'Generator 3', metrics: buildDgMetrics('dg_3', 3) },
      { id: 'dg_4', name: 'Generator 4', metrics: buildDgMetrics('dg_4', 4, false, 27.7) },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 8 — Fire & Safety (FSS / VESDA)
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'Fire & Safety',
    assets: [
      { id: 'fss_switch_room', name: 'Switch Room', metrics: buildFssVesdaMetrics('fss_switch') },
      { id: 'fss_ibm_room', name: 'IBM Room', metrics: buildFssVesdaMetrics('fss_ibm') },
      { id: 'fss_power_room', name: 'Power Room', metrics: buildFssVesdaMetrics('fss_power') },
      { id: 'fss_battery_room', name: 'Battery Room', metrics: buildFssVesdaMetrics('fss_battery') },
      { id: 'fss_enterprise_1', name: 'Enterprise Room 1', metrics: buildFssVesdaMetrics('fss_ent1') },
      { id: 'fss_enterprise_2', name: 'Enterprise Room 2', metrics: buildFssVesdaMetrics('fss_ent2') },
    ]
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CATEGORY 9 — Fuel Logistics
  // ══════════════════════════════════════════════════════════════════════════
  {
    categoryName: 'Fuel Logistics',
    assets: [
      {
        id: 'site_fuel_record',
        name: 'Site Fuel Record',
        metrics: [
          { id: 'fuel_brought_forward', label: 'Fuel B/F (Ltr.)', type: 'number', frequency: 'daily', carryForward: true, destinations: [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 1 }] },
          { id: 'fuel_received', label: 'Fuel Received (Ltr.)', type: 'number', frequency: 'daily', defaultValue: 0, destinations: [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 2 }] },
          { id: 'fuel_consumed', label: 'Fuel Consumed (Ltr.)', type: 'number', frequency: 'daily', defaultValue: 0, destinations: [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 3 }] },
          { id: 'fuel_balance', label: 'Fuel Balance (Ltr.)', type: 'number', frequency: 'daily', carryForward: true, destinations: [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 4 }] },
          { id: 'dg_1_run_hours', label: 'DG-1 Run Hours', type: 'number', frequency: 'daily', carryForward: true, destinations: [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 5 }] },
          { id: 'dg_2_run_hours', label: 'DG-2 Run Hours', type: 'number', frequency: 'daily', carryForward: true, destinations: [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 6 }] },
          { id: 'dg_3_run_hours', label: 'DG-3 Run Hours', type: 'number', frequency: 'daily', carryForward: true, destinations: [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 7 }] },
          { id: 'dg_4_run_hours', label: 'DG-4 Run Hours', type: 'number', frequency: 'daily', carryForward: true, destinations: [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 8 }] },
          { id: 'dg_hq_run_hours', label: 'DG-HQ Run Hours', type: 'number', frequency: 'daily', carryForward: true, destinations: [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 9 }] },
          { id: 'fuel_leakage_sign', label: 'Leakage Sign', type: 'text', frequency: 'daily', isConstant: true, defaultValue: 'NO', destinations: [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 10 }] },
          { id: 'fuel_spillage_sign', label: 'Spillage Sign', type: 'text', frequency: 'daily', isConstant: true, defaultValue: 'NO', destinations: [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 11 }] },
        ],
      },
    ],
  },
];

// ── BACKWARDS COMPATIBILITY LAYER ─────────────────────────────────────────────
export interface TelemetryField {
  id: string;
  label: string;
  category: string;
  subgroup?: string;
  unit?: string;
  type: "number" | "text";
  excelColumnIndex: number;
}

export const HOURLY_TELEMETRY_SCHEMA: TelemetryField[] = (() => {
  const fields: TelemetryField[] = [];
  MASTER_ASSET_DICTIONARY.forEach((cat) => {
    cat.assets.forEach((asset) => {
      asset.metrics.forEach((metric) => {
        const primaryDest = metric.destinations[0];
        fields.push({
          id: metric.id,
          label: `${asset.name} - ${metric.label}`,
          category: cat.categoryName,
          subgroup: asset.name,
          unit: undefined,
          type: metric.type === "boolean" ? "text" : metric.type,
          excelColumnIndex: primaryDest ? primaryDest.excelColumnIndex : -1
        });
      });
    });
  });
  return fields;
})();

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
