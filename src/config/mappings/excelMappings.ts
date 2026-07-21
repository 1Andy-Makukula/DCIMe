// src/config/mappings/excelMappings.ts

export type TargetWorkbook = 'daily_canvas' | 'commercial_logbook';

export interface ExcelTargetCoordinate {
  workbook: TargetWorkbook;
  sheetName: string;
  excelColumnIndex: number; // 0-based column index
  rowType?: 'hourly_row' | 'four_hourly_row' | 'dg_row' | 'fuel_row' | 'dg_check_row' | 'pac_row' | 'eqpt_status_row' | 'fss_row';
}

export type SiteMappings = Record<string, ExcelTargetCoordinate[]>;

// ── PAC Mapping Generator ───────────────────────────────────────────────────
function getPacMappings(prefix: string): Record<string, ExcelTargetCoordinate[]> {
  const mapping: Record<string, ExcelTargetCoordinate[]> = {};
  const metrics = [
    { suffix: 'return_temp_actual', col: 4 },
    { suffix: 'return_temp_set',    col: 5 },
    { suffix: 'supply_temp_set',    col: 6 },
    { suffix: 'humidity_actual',    col: 7 },
    { suffix: 'humidity_set',       col: 8 },
    { suffix: 'voltage_ry',         col: 9 },
    { suffix: 'voltage_yb',         col: 10 },
    { suffix: 'voltage_br',         col: 11 },
    { suffix: 'current_r',          col: 12 },
    { suffix: 'current_y',          col: 13 },
    { suffix: 'current_b',          col: 14 },
    { suffix: 'current_n',          col: 15 },
    { suffix: 'daily_abnormality',  col: 16 }
  ];

  metrics.forEach((m) => {
    mapping[`${prefix}_${m.suffix}`] = [
      { workbook: 'commercial_logbook', sheetName: 'PAC', excelColumnIndex: m.col, rowType: 'pac_row' }
    ];
  });
  return mapping;
}

// ── UPS Mapping Generator ───────────────────────────────────────────────────
function getUpsMappings(prefix: string, canvasStartIndex: number): Record<string, ExcelTargetCoordinate[]> {
  const mapping: Record<string, ExcelTargetCoordinate[]> = {};
  const offsets = [
    { suffix: 'output_load_kw', offset: 0 },
    { suffix: 'used_capacity', offset: 1 },
    { suffix: 'battery_charge_percent', offset: 2 },
    { suffix: 'battery_voltage', offset: 3 },
    { suffix: 'load_amps_a', offset: 4 },
    { suffix: 'load_amps_b', offset: 5 },
    { suffix: 'load_amps_c', offset: 6 },
    { suffix: 'load_phase_percent_a', offset: 7 },
    { suffix: 'load_phase_percent_b', offset: 8 },
    { suffix: 'load_phase_percent_c', offset: 9 },
    { suffix: 'output_voltage_a', offset: 10 },
    { suffix: 'output_voltage_b', offset: 11 },
    { suffix: 'output_voltage_c', offset: 12 }
  ];

  offsets.forEach((o) => {
    mapping[`${prefix}_${o.suffix}`] = [
      { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: canvasStartIndex + o.offset, rowType: 'hourly_row' }
    ];
  });

  // Daily status rows (Eqpt status sheet)
  mapping[`${prefix}_daily_status`] = [
    { workbook: 'commercial_logbook', sheetName: 'Eqpt status', excelColumnIndex: 6, rowType: 'eqpt_status_row' }
  ];
  mapping[`${prefix}_daily_abnormality`] = [
    { workbook: 'commercial_logbook', sheetName: 'Eqpt status', excelColumnIndex: 8, rowType: 'eqpt_status_row' }
  ];

  return mapping;
}

// ── Rectifier Mapping Generator ─────────────────────────────────────────────
function getRectifierMappings(prefix: string, canvasStartIndex: number): Record<string, ExcelTargetCoordinate[]> {
  const mapping: Record<string, ExcelTargetCoordinate[]> = {};
  const offsets = [
    { suffix: 'dc_voltage', offset: 0 },
    { suffix: 'amps', offset: 1 },
    { suffix: 'battery_status', offset: 2 },
    { suffix: 'used_percentage', offset: 3 }
  ];

  offsets.forEach((o) => {
    mapping[`${prefix}_${o.suffix}`] = [
      { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: canvasStartIndex + o.offset, rowType: 'hourly_row' }
    ];
  });

  mapping[`${prefix}_daily_status`] = [
    { workbook: 'commercial_logbook', sheetName: 'Eqpt status', excelColumnIndex: 6, rowType: 'eqpt_status_row' }
  ];
  mapping[`${prefix}_daily_abnormality`] = [
    { workbook: 'commercial_logbook', sheetName: 'Eqpt status', excelColumnIndex: 8, rowType: 'eqpt_status_row' }
  ];

  return mapping;
}

// ── DG Mapping Generator ────────────────────────────────────────────────────
function getDgMappings(prefix: string, dgNumber: number, isHq: boolean = false): Record<string, ExcelTargetCoordinate[]> {
  const mapping: Record<string, ExcelTargetCoordinate[]> = {};
  const dgName = isHq ? 'DG-HQ' : `DG-${dgNumber}`;
  const canvasStartIndex = isHq ? undefined : 19 + (dgNumber - 1) * 3;
  const checkVoltageIndex = isHq ? 69 : 13 + (dgNumber - 1) * 14;

  // Run hours
  mapping[`${prefix}_run_hrs`] = [
    { workbook: 'commercial_logbook', sheetName: dgName, excelColumnIndex: 6, rowType: 'dg_row' }
  ];
  if (canvasStartIndex !== undefined) {
    mapping[`${prefix}_run_hrs`].push(
      { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: canvasStartIndex, rowType: 'hourly_row' }
    );
  }

  // Battery voltage
  mapping[`${prefix}_batt_voltage`] = [
    { workbook: 'commercial_logbook', sheetName: 'DG Check', excelColumnIndex: checkVoltageIndex, rowType: 'dg_check_row' }
  ];
  if (canvasStartIndex !== undefined) {
    mapping[`${prefix}_batt_voltage`].push(
      { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: canvasStartIndex + 1, rowType: 'hourly_row' }
    );
  }

  // Charged status
  if (canvasStartIndex !== undefined) {
    mapping[`${prefix}_charged_status`] = [
      { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: canvasStartIndex + 2, rowType: 'hourly_row' }
    ];
  }

  // Daily parameter details
  const dailyMetrics = [
    { suffix: 'hr_meter_start', col: 2 },
    { suffix: 'hr_meter_stop',  col: 3 },
    { suffix: 'time_start',      col: 4 },
    { suffix: 'time_stop',       col: 5 },
    { suffix: 'cumulative_hrs',  col: 7 },
    { suffix: 'auto_status',     col: 8 },
    { suffix: 'kwh_meter',       col: 9 },
    { suffix: 'voltage_ry',      col: 10 },
    { suffix: 'voltage_yb',      col: 11 },
    { suffix: 'voltage_br',      col: 12 },
    { suffix: 'current_r',       col: 13 },
    { suffix: 'current_y',       col: 14 },
    { suffix: 'current_b',       col: 15 },
    { suffix: 'frequency',       col: 16 },
    { suffix: 'engine_rpm',      col: 17 },
    { suffix: 'oil_pressure',    col: 18 },
    { suffix: 'water_temp',      col: 19 },
    { suffix: 'daily_remarks',   col: 21 }
  ];

  dailyMetrics.forEach((m) => {
    mapping[`${prefix}_${m.suffix}`] = [
      { workbook: 'commercial_logbook', sheetName: dgName, excelColumnIndex: m.col, rowType: 'dg_row' }
    ];
  });

  return mapping;
}

// ── Ambient Temperature Mapping Generator ───────────────────────────────────
function getAmbientMappings(prefix: string, canvasTempCol: number, logbookTempCol: number): Record<string, ExcelTargetCoordinate[]> {
  const mapping: Record<string, ExcelTargetCoordinate[]> = {};
  
  const tempDests: ExcelTargetCoordinate[] = [];
  if (canvasTempCol !== -1) {
    tempDests.push({ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: canvasTempCol, rowType: 'hourly_row' });
  }
  tempDests.push({ workbook: 'commercial_logbook', sheetName: 'Temp Record', excelColumnIndex: logbookTempCol, rowType: 'four_hourly_row' });
  mapping[`${prefix}_temp`] = tempDests;

  const humDests: ExcelTargetCoordinate[] = [];
  if (canvasTempCol !== -1) {
    humDests.push({ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: canvasTempCol + 1, rowType: 'hourly_row' });
  }
  humDests.push({ workbook: 'commercial_logbook', sheetName: 'Temp Record', excelColumnIndex: logbookTempCol + 1, rowType: 'four_hourly_row' });
  mapping[`${prefix}_humidity`] = humDests;

  return mapping;
}

// ── FSS VESDA Mapping Generator ─────────────────────────────────────────────
function getFssMappings(prefix: string): Record<string, ExcelTargetCoordinate[]> {
  const mapping: Record<string, ExcelTargetCoordinate[]> = {};
  const metrics = [
    { suffix: 'gas_release_panel', offset: 2 },
    { suffix: 'detectors_led', offset: 3 },
    { suffix: 'inergen_pressure', offset: 4 },
    { suffix: 'smoke_detector', offset: 5 },
    { suffix: 'fm_nozzle_clean', offset: 6 },
    { suffix: 'fas_alarm', offset: 7 },
    { suffix: 'vesda_pipe', offset: 8 },
    { suffix: 'loose_connection', offset: 9 },
    { suffix: 'panel_battery_voltage', offset: 10 },
    { suffix: 'remarks', offset: 12 }
  ];

  metrics.forEach((m) => {
    mapping[`${prefix}_${m.suffix}`] = [
      { workbook: 'daily_canvas', sheetName: 'FSS & VESDA', excelColumnIndex: m.offset, rowType: 'fss_row' }
    ];
  });
  return mapping;
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPILATION OF NTC MASTER MAPPINGS
// ═════════════════════════════════════════════════════════════════════════════
const ntcMappings: SiteMappings = {
  // Ambient Averages
  ...getAmbientMappings('server_ambient', 65, 8),
  ...getAmbientMappings('media_ambient', 67, 10),
  ...getAmbientMappings('pr1_ambient', 69, 12),
  ...getAmbientMappings('battery_ambient', 71, 14),
  ...getAmbientMappings('it1_ambient', 73, 16),
  ...getAmbientMappings('it2_ambient', 75, 18),
  ...getAmbientMappings('hq_ambient', -1, 6),
  ...getAmbientMappings('zesco_lt', -1, 2),
  ...getAmbientMappings('rmu_ht', -1, 4),

  // Emerson & Vertiv Aircons (Server Room & General)
  ...getPacMappings('pac_server_em1'),
  ...getPacMappings('pac_server_em2'),
  ...getPacMappings('pac_server_em3'),
  ...getPacMappings('pac_server_em4'),
  ...getPacMappings('pac_server_em5'),
  ...getPacMappings('pac_server_em6'),
  ...getPacMappings('pac_server_em7'),
  ...getPacMappings('pac_server_vt1'),
  ...getPacMappings('pac_server_vt2'),
  ...getPacMappings('pac_server_vt3'),
  ...getPacMappings('pac_server_vt4'),
  ...getPacMappings('pac_server_vt5'),
  ...getPacMappings('pac_server_dragor'),
  
  ...getPacMappings('pac_data_vt6'),
  ...getPacMappings('pac_data_em1'),
  ...getPacMappings('pac_data_em2'),

  // Power Room 1
  ...getUpsMappings('ups_1', 31),
  ...getRectifierMappings('rectifier_1', 57),
  ...getPacMappings('pac_pr1_em1'),
  ...getPacMappings('pac_pr1_em2'),

  // Power Room 2
  ...getUpsMappings('ups_2', 44),
  ...getRectifierMappings('rectifier_2', 61),
  ...getPacMappings('pac_pr2_em1'),
  ...getPacMappings('pac_pr2_em2'),

  // IT Rooms
  ...getPacMappings('pac_it1_em1'),
  ...getPacMappings('pac_it1_em2'),
  ...getPacMappings('pac_it2_em1'),
  ...getPacMappings('pac_it2_em2'),

  // HQ Power Room Aircons
  ...getPacMappings('pac_hq_em1'),
  ...getPacMappings('pac_hq_em2'),
  ...getPacMappings('pac_hq_em3'),

  // FM 200 & Workstation
  workstation_status: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 77, rowType: 'hourly_row' }
  ],
  fm200_status: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 78, rowType: 'hourly_row' }
  ],

  // ZESCO Grid load details
  grid_voltage_r: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 4, rowType: 'hourly_row' },
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 2, rowType: 'hourly_row' }
  ],
  grid_voltage_y: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 5, rowType: 'hourly_row' },
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 3, rowType: 'hourly_row' }
  ],
  grid_voltage_b: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 6, rowType: 'hourly_row' },
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 4, rowType: 'hourly_row' }
  ],
  grid_amps_r: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 1, rowType: 'hourly_row' },
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 8, rowType: 'hourly_row' }
  ],
  grid_amps_y: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 2, rowType: 'hourly_row' },
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 9, rowType: 'hourly_row' }
  ],
  grid_amps_b: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 3, rowType: 'hourly_row' },
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 10, rowType: 'hourly_row' }
  ],
  grid_frequency: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 7, rowType: 'hourly_row' },
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 13, rowType: 'hourly_row' }
  ],
  grid_status: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 8, rowType: 'hourly_row' }
  ],
  grid_off_time: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 9, rowType: 'hourly_row' }
  ],
  grid_restored_time: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 10, rowType: 'hourly_row' }
  ],
  grid_off_duration: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 11, rowType: 'hourly_row' }
  ],
  grid_total_site_load: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 12, rowType: 'hourly_row' },
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 14, rowType: 'hourly_row' }
  ],
  facility_load_on: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 79, rowType: 'hourly_row' }
  ],
  grid_phase_voltage_rn: [
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 5, rowType: 'four_hourly_row' }
  ],
  grid_phase_voltage_yn: [
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 6, rowType: 'four_hourly_row' }
  ],
  grid_phase_voltage_bn: [
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 7, rowType: 'four_hourly_row' }
  ],
  grid_transformer_temp: [
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 11, rowType: 'four_hourly_row' }
  ],
  grid_power_factor: [
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 12, rowType: 'four_hourly_row' }
  ],
  grid_energy_meter_1: [
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 15, rowType: 'four_hourly_row' }
  ],
  grid_energy_meter_2: [
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 16, rowType: 'four_hourly_row' }
  ],

  // DG Load aggregate (canvas only)
  dg_load_amps_r: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 13, rowType: 'hourly_row' }],
  dg_load_amps_y: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 14, rowType: 'hourly_row' }],
  dg_load_amps_b: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 15, rowType: 'hourly_row' }],
  dg_load_voltage_r: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 16, rowType: 'hourly_row' }],
  dg_load_voltage_y: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 17, rowType: 'hourly_row' }],
  dg_load_voltage_b: [{ workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 18, rowType: 'hourly_row' }],

  // Generator Fleet (DG-1 to DG-4 and DG-HQ)
  ...getDgMappings('dg_1', 1),
  ...getDgMappings('dg_2', 2),
  ...getDgMappings('dg_3', 3),
  ...getDgMappings('dg_4', 4),
  ...getDgMappings('dg_hq', 5, true),

  // Fire Safety FSS & VESDA
  ...getFssMappings('fss_switch'),
  ...getFssMappings('fss_ibm'),
  ...getFssMappings('fss_power'),
  ...getFssMappings('fss_battery'),
  ...getFssMappings('fss_ent1'),
  ...getFssMappings('fss_ent2'),

  // Fuel Logistics
  fuel_brought_forward: [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 1, rowType: 'fuel_row' }],
  fuel_received:        [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 2, rowType: 'fuel_row' }],
  fuel_consumed:        [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 3, rowType: 'fuel_row' }],
  fuel_balance:         [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 4, rowType: 'fuel_row' }],
  dg_1_run_hours:       [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 5, rowType: 'fuel_row' }],
  dg_2_run_hours:       [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 6, rowType: 'fuel_row' }],
  dg_3_run_hours:       [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 7, rowType: 'fuel_row' }],
  dg_4_run_hours:       [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 8, rowType: 'fuel_row' }],
  dg_hq_run_hours:      [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 9, rowType: 'fuel_row' }],
  fuel_leakage_sign:    [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 10, rowType: 'fuel_row' }],
  fuel_spillage_sign:   [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 11, rowType: 'fuel_row' }]
};

// ═════════════════════════════════════════════════════════════════════════════
// WTC BLUEPRINT MAPPINGS
// ═════════════════════════════════════════════════════════════════════════════
// WTC uses a trimmed down subset of NTC, referencing identical workbook column offsets
const wtcMappings: SiteMappings = {
  ...getAmbientMappings('server_ambient', 65, 8),
  ...getAmbientMappings('pr1_ambient', 69, 12),
  ...getAmbientMappings('it1_ambient', 73, 16),

  ...getPacMappings('pac_server_em1'),
  ...getPacMappings('pac_server_em2'),
  ...getPacMappings('pac_pr1_em1'),
  ...getPacMappings('pac_it1_em1'),

  ...getUpsMappings('ups_1', 31),
  ...getRectifierMappings('rectifier_1', 57),

  grid_voltage_r: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 4, rowType: 'hourly_row' },
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 2, rowType: 'hourly_row' }
  ],
  grid_voltage_y: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 5, rowType: 'hourly_row' },
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 3, rowType: 'hourly_row' }
  ],
  grid_voltage_b: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 6, rowType: 'hourly_row' },
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 4, rowType: 'hourly_row' }
  ],
  grid_amps_r: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 1, rowType: 'hourly_row' },
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 8, rowType: 'hourly_row' }
  ],
  grid_amps_y: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 2, rowType: 'hourly_row' },
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 9, rowType: 'hourly_row' }
  ],
  grid_amps_b: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 3, rowType: 'hourly_row' },
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 10, rowType: 'hourly_row' }
  ],
  grid_frequency: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 7, rowType: 'hourly_row' },
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 13, rowType: 'hourly_row' }
  ],
  grid_status: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 8, rowType: 'hourly_row' }
  ],
  grid_off_time: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 9, rowType: 'hourly_row' }
  ],
  grid_restored_time: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 10, rowType: 'hourly_row' }
  ],
  grid_off_duration: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 11, rowType: 'hourly_row' }
  ],
  grid_total_site_load: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 12, rowType: 'hourly_row' },
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 14, rowType: 'hourly_row' }
  ],
  facility_load_on: [
    { workbook: 'daily_canvas', sheetName: 'DYNAMIC_DAY', excelColumnIndex: 79, rowType: 'hourly_row' }
  ],
  grid_phase_voltage_rn: [
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 5, rowType: 'four_hourly_row' }
  ],
  grid_phase_voltage_yn: [
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 6, rowType: 'four_hourly_row' }
  ],
  grid_phase_voltage_bn: [
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 7, rowType: 'four_hourly_row' }
  ],
  grid_transformer_temp: [
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 11, rowType: 'four_hourly_row' }
  ],
  grid_power_factor: [
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 12, rowType: 'four_hourly_row' }
  ],
  grid_energy_meter_1: [
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 15, rowType: 'four_hourly_row' }
  ],
  grid_energy_meter_2: [
    { workbook: 'commercial_logbook', sheetName: 'Commercial Power Log', excelColumnIndex: 16, rowType: 'four_hourly_row' }
  ],

  ...getDgMappings('dg_1', 1),
  ...getDgMappings('dg_hq', 5, true),

  fuel_brought_forward: [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 1, rowType: 'fuel_row' }],
  fuel_received:        [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 2, rowType: 'fuel_row' }],
  fuel_consumed:        [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 3, rowType: 'fuel_row' }],
  fuel_balance:         [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 4, rowType: 'fuel_row' }],
  dg_1_run_hours:       [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 5, rowType: 'fuel_row' }],
  dg_hq_run_hours:      [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 9, rowType: 'fuel_row' }],
  fuel_leakage_sign:    [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 10, rowType: 'fuel_row' }],
  fuel_spillage_sign:   [{ workbook: 'commercial_logbook', sheetName: 'Fuel Record', excelColumnIndex: 11, rowType: 'fuel_row' }]
};

export const EXCEL_MAPPINGS: Record<string, SiteMappings> = {
  NTC: ntcMappings,
  WTC: wtcMappings
};
