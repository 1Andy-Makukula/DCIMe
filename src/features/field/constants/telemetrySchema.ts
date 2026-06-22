export interface TelemetryField {
  id: string;
  label: string;
  category: string;
  subgroup?: string;
  unit?: string;
  type: "number" | "text";
}

export const HOURLY_TELEMETRY_SCHEMA: TelemetryField[] = [
  // 1. ZESCO GRID
  { id: "grid_v_rn", label: "R-N Voltage", category: "Zesco Grid", subgroup: "Grid Voltage", unit: "V", type: "number" },
  { id: "grid_v_yn", label: "Y-N Voltage", category: "Zesco Grid", subgroup: "Grid Voltage", unit: "V", type: "number" },
  { id: "grid_v_bn", label: "B-N Voltage", category: "Zesco Grid", subgroup: "Grid Voltage", unit: "V", type: "number" },
  { id: "grid_v_ry", label: "R-Y Voltage", category: "Zesco Grid", subgroup: "Grid Voltage L-L", unit: "V", type: "number" },
  { id: "grid_v_yb", label: "Y-B Voltage", category: "Zesco Grid", subgroup: "Grid Voltage L-L", unit: "V", type: "number" },
  { id: "grid_v_br", label: "B-R Voltage", category: "Zesco Grid", subgroup: "Grid Voltage L-L", unit: "V", type: "number" },
  { id: "grid_i_r", label: "Phase R Current", category: "Zesco Grid", subgroup: "Grid Current", unit: "A", type: "number" },
  { id: "grid_i_y", label: "Phase Y Current", category: "Zesco Grid", subgroup: "Grid Current", unit: "A", type: "number" },
  { id: "grid_i_b", label: "Phase B Current", category: "Zesco Grid", subgroup: "Grid Current", unit: "A", type: "number" },
  { id: "grid_freq", label: "Frequency", category: "Zesco Grid", subgroup: "System Metrics", unit: "Hz", type: "number" },
  { id: "grid_pf", label: "Power Factor", category: "Zesco Grid", subgroup: "System Metrics", type: "number" },
  { id: "grid_kva", label: "Apparent Power", category: "Zesco Grid", subgroup: "System Metrics", unit: "kVA", type: "number" },

  // 2. DG-1 DETAILS
  { id: "dg1_run_hours", label: "Run Hours", category: "DG-1 Details", subgroup: "Engine Parameters", unit: "hrs", type: "number" },
  { id: "dg1_rpm", label: "Engine Speed", category: "DG-1 Details", subgroup: "Engine Parameters", unit: "RPM", type: "number" },
  { id: "dg1_oil_press", label: "Oil Pressure", category: "DG-1 Details", subgroup: "Engine Parameters", unit: "bar", type: "number" },
  { id: "dg1_water_temp", label: "Water Temp", category: "DG-1 Details", subgroup: "Engine Parameters", unit: "°C", type: "number" },
  { id: "dg1_fuel_level", label: "Fuel Level", category: "DG-1 Details", subgroup: "Engine Parameters", unit: "%", type: "number" },
  { id: "dg1_v_r", label: "Phase R Voltage", category: "DG-1 Details", subgroup: "Electrical Output", unit: "V", type: "number" },
  { id: "dg1_v_y", label: "Phase Y Voltage", category: "DG-1 Details", subgroup: "Electrical Output", unit: "V", type: "number" },
  { id: "dg1_v_b", label: "Phase B Voltage", category: "DG-1 Details", subgroup: "Electrical Output", unit: "V", type: "number" },
  { id: "dg1_i_r", label: "Phase R Current", category: "DG-1 Details", subgroup: "Electrical Output", unit: "A", type: "number" },
  { id: "dg1_i_y", label: "Phase Y Current", category: "DG-1 Details", subgroup: "Electrical Output", unit: "A", type: "number" },
  { id: "dg1_i_b", label: "Phase B Current", category: "DG-1 Details", subgroup: "Electrical Output", unit: "A", type: "number" },
  { id: "dg1_freq", label: "Frequency", category: "DG-1 Details", subgroup: "Electrical Output", unit: "Hz", type: "number" },
  { id: "dg1_batt_v", label: "Battery Voltage", category: "DG-1 Details", subgroup: "Electrical Output", unit: "V", type: "number" },

  // 3. DG-2 DETAILS
  { id: "dg2_run_hours", label: "Run Hours", category: "DG-2 Details", subgroup: "Engine Parameters", unit: "hrs", type: "number" },
  { id: "dg2_rpm", label: "Engine Speed", category: "DG-2 Details", subgroup: "Engine Parameters", unit: "RPM", type: "number" },
  { id: "dg2_oil_press", label: "Oil Pressure", category: "DG-2 Details", subgroup: "Engine Parameters", unit: "bar", type: "number" },
  { id: "dg2_water_temp", label: "Water Temp", category: "DG-2 Details", subgroup: "Engine Parameters", unit: "°C", type: "number" },
  { id: "dg2_fuel_level", label: "Fuel Level", category: "DG-2 Details", subgroup: "Engine Parameters", unit: "%", type: "number" },
  { id: "dg2_v_r", label: "Phase R Voltage", category: "DG-2 Details", subgroup: "Electrical Output", unit: "V", type: "number" },
  { id: "dg2_v_y", label: "Phase Y Voltage", category: "DG-2 Details", subgroup: "Electrical Output", unit: "V", type: "number" },
  { id: "dg2_v_b", label: "Phase B Voltage", category: "DG-2 Details", subgroup: "Electrical Output", unit: "V", type: "number" },
  { id: "dg2_i_r", label: "Phase R Current", category: "DG-2 Details", subgroup: "Electrical Output", unit: "A", type: "number" },
  { id: "dg2_i_y", label: "Phase Y Current", category: "DG-2 Details", subgroup: "Electrical Output", unit: "A", type: "number" },
  { id: "dg2_i_b", label: "Phase B Current", category: "DG-2 Details", subgroup: "Electrical Output", unit: "A", type: "number" },
  { id: "dg2_freq", label: "Frequency", category: "DG-2 Details", subgroup: "Electrical Output", unit: "Hz", type: "number" },
  { id: "dg2_batt_v", label: "Battery Voltage", category: "DG-2 Details", subgroup: "Electrical Output", unit: "V", type: "number" },

  // 4. UPS-1 DETAILS
  { id: "ups1_in_v_r", label: "Input V Phase R", category: "UPS-1 Details", subgroup: "Input Parameters", unit: "V", type: "number" },
  { id: "ups1_in_v_y", label: "Input V Phase Y", category: "UPS-1 Details", subgroup: "Input Parameters", unit: "V", type: "number" },
  { id: "ups1_in_v_b", label: "Input V Phase B", category: "UPS-1 Details", subgroup: "Input Parameters", unit: "V", type: "number" },
  { id: "ups1_out_v_r", label: "Output V Phase R", category: "UPS-1 Details", subgroup: "Output Parameters", unit: "V", type: "number" },
  { id: "ups1_out_v_y", label: "Output V Phase Y", category: "UPS-1 Details", subgroup: "Output Parameters", unit: "V", type: "number" },
  { id: "ups1_out_v_b", label: "Output V Phase B", category: "UPS-1 Details", subgroup: "Output Parameters", unit: "V", type: "number" },
  { id: "ups1_load_r", label: "Load Phase R", category: "UPS-1 Details", subgroup: "Load Level", unit: "%", type: "number" },
  { id: "ups1_load_y", label: "Load Phase Y", category: "UPS-1 Details", subgroup: "Load Level", unit: "%", type: "number" },
  { id: "ups1_load_b", label: "Load Phase B", category: "UPS-1 Details", subgroup: "Load Level", unit: "%", type: "number" },
  { id: "ups1_load_kw", label: "Total Load", category: "UPS-1 Details", subgroup: "Load Level", unit: "kW", type: "number" },
  { id: "ups1_batt_v", label: "Battery Voltage", category: "UPS-1 Details", subgroup: "Battery Status", unit: "V", type: "number" },
  { id: "ups1_batt_i", label: "Battery Current", category: "UPS-1 Details", subgroup: "Battery Status", unit: "A", type: "number" },
  { id: "ups1_batt_temp", label: "Battery Temp", category: "UPS-1 Details", subgroup: "Battery Status", unit: "°C", type: "number" },
  { id: "ups1_batt_runtime", label: "Backup Runtime", category: "UPS-1 Details", subgroup: "Battery Status", unit: "min", type: "number" },

  // 5. UPS-2 DETAILS
  { id: "ups2_in_v_r", label: "Input V Phase R", category: "UPS-2 Details", subgroup: "Input Parameters", unit: "V", type: "number" },
  { id: "ups2_in_v_y", label: "Input V Phase Y", category: "UPS-2 Details", subgroup: "Input Parameters", unit: "V", type: "number" },
  { id: "ups2_in_v_b", label: "Input V Phase B", category: "UPS-2 Details", subgroup: "Input Parameters", unit: "V", type: "number" },
  { id: "ups2_out_v_r", label: "Output V Phase R", category: "UPS-2 Details", subgroup: "Output Parameters", unit: "V", type: "number" },
  { id: "ups2_out_v_y", label: "Output V Phase Y", category: "UPS-2 Details", subgroup: "Output Parameters", unit: "V", type: "number" },
  { id: "ups2_out_v_b", label: "Output V Phase B", category: "UPS-2 Details", subgroup: "Output Parameters", unit: "V", type: "number" },
  { id: "ups2_load_r", label: "Load Phase R", category: "UPS-2 Details", subgroup: "Load Level", unit: "%", type: "number" },
  { id: "ups2_load_y", label: "Load Phase Y", category: "UPS-2 Details", subgroup: "Load Level", unit: "%", type: "number" },
  { id: "ups2_load_b", label: "Load Phase B", category: "UPS-2 Details", subgroup: "Load Level", unit: "%", type: "number" },
  { id: "ups2_load_kw", label: "Total Load", category: "UPS-2 Details", subgroup: "Load Level", unit: "kW", type: "number" },
  { id: "ups2_batt_v", label: "Battery Voltage", category: "UPS-2 Details", subgroup: "Battery Status", unit: "V", type: "number" },
  { id: "ups2_batt_i", label: "Battery Current", category: "UPS-2 Details", subgroup: "Battery Status", unit: "A", type: "number" },
  { id: "ups2_batt_temp", label: "Battery Temp", category: "UPS-2 Details", subgroup: "Battery Status", unit: "°C", type: "number" },
  { id: "ups2_batt_runtime", label: "Backup Runtime", category: "UPS-2 Details", subgroup: "Battery Status", unit: "min", type: "number" },

  // 6. RECTIFIERS
  { id: "rec1_out_v", label: "DC Voltage", category: "Rectifiers", subgroup: "Rectifier-1", unit: "V", type: "number" },
  { id: "rec1_load_a", label: "Load Current", category: "Rectifiers", subgroup: "Rectifier-1", unit: "A", type: "number" },
  { id: "rec1_temp", label: "Cabinet Temp", category: "Rectifiers", subgroup: "Rectifier-1", unit: "°C", type: "number" },
  { id: "rec2_out_v", label: "DC Voltage", category: "Rectifiers", subgroup: "Rectifier-2", unit: "V", type: "number" },
  { id: "rec2_load_a", label: "Load Current", category: "Rectifiers", subgroup: "Rectifier-2", unit: "A", type: "number" },
  { id: "rec2_temp", label: "Cabinet Temp", category: "Rectifiers", subgroup: "Rectifier-2", unit: "°C", type: "number" },

  // 7. THERMAL MANAGEMENT (CRACS)
  { id: "crac1_ret_temp", label: "Return Air Temp", category: "Thermal (CRACs)", subgroup: "CRAC-1", unit: "°C", type: "number" },
  { id: "crac1_sup_temp", label: "Supply Air Temp", category: "Thermal (CRACs)", subgroup: "CRAC-1", unit: "°C", type: "number" },
  { id: "crac1_humidity", label: "Relative Hum", category: "Thermal (CRACs)", subgroup: "CRAC-1", unit: "%", type: "number" },
  { id: "crac2_ret_temp", label: "Return Air Temp", category: "Thermal (CRACs)", subgroup: "CRAC-2", unit: "°C", type: "number" },
  { id: "crac2_sup_temp", label: "Supply Air Temp", category: "Thermal (CRACs)", subgroup: "CRAC-2", unit: "°C", type: "number" },
  { id: "crac2_humidity", label: "Relative Hum", category: "Thermal (CRACs)", subgroup: "CRAC-2", unit: "%", type: "number" },
  { id: "crac3_ret_temp", label: "Return Air Temp", category: "Thermal (CRACs)", subgroup: "CRAC-3", unit: "°C", type: "number" },
  { id: "crac3_sup_temp", label: "Supply Air Temp", category: "Thermal (CRACs)", subgroup: "CRAC-3", unit: "°C", type: "number" },
  { id: "crac3_humidity", label: "Relative Hum", category: "Thermal (CRACs)", subgroup: "CRAC-3", unit: "%", type: "number" },

  // 8. ROOM TEMPERATURES
  { id: "room1_temp_front", label: "Aisle Front Temp", category: "Room Temps", subgroup: "Server Room 1", unit: "°C", type: "number" },
  { id: "room1_temp_rear", label: "Aisle Rear Temp", category: "Room Temps", subgroup: "Server Room 1", unit: "°C", type: "number" },
  { id: "room1_humidity", label: "Room Humidity", category: "Room Temps", subgroup: "Server Room 1", unit: "%", type: "number" },
  { id: "pwr1_temp", label: "Room Temp", category: "Room Temps", subgroup: "Power Room 1", unit: "°C", type: "number" },
  { id: "pwr1_humidity", label: "Room Humidity", category: "Room Temps", subgroup: "Power Room 1", unit: "%", type: "number" },
  { id: "batt1_temp", label: "Room Temp", category: "Room Temps", subgroup: "Battery Room 1", unit: "°C", type: "number" },
  { id: "batt1_humidity", label: "Room Humidity", category: "Room Temps", subgroup: "Battery Room 1", unit: "%", type: "number" }
];
