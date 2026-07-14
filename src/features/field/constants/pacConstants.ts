// src/features/field/constants/pacConstants.ts

export type PacConstantValues = {
  returnTempSet: number | string;
  supplyTempSet: number | string;
  humiditySet: number | string;
  humidityActual: number | string; // Treated as constant per the current Excel workflow
};

export const PAC_CONSTANTS: Record<string, PacConstantValues> = {
  // Server Room
  "pac_server_em1": { returnTempSet: 20, supplyTempSet: "NA", humiditySet: 50, humidityActual: 31 },
  "pac_server_em2": { returnTempSet: 18, supplyTempSet: "NA", humiditySet: 50, humidityActual: 42 },
  "pac_server_em3": { returnTempSet: 17.5, supplyTempSet: "NA", humiditySet: "NA", humidityActual: "NA" },
  "pac_server_em4": { returnTempSet: 17.5, supplyTempSet: "NA", humiditySet: "NA", humidityActual: "NA" },
  "pac_server_em5": { returnTempSet: 17.5, supplyTempSet: "NA", humiditySet: "NA", humidityActual: "NA" },
  "pac_server_em6": { returnTempSet: 17.5, supplyTempSet: "NA", humiditySet: "NA", humidityActual: "NA" },
  "pac_server_em7": { returnTempSet: 18.5, supplyTempSet: "NA", humiditySet: "NA", humidityActual: 36 },
  "pac_server_vt1": { returnTempSet: 20, supplyTempSet: "NA", humiditySet: 50, humidityActual: 38.7 },
  "pac_server_vt2": { returnTempSet: 20, supplyTempSet: "NA", humiditySet: 50, humidityActual: 47.4 },
  "pac_server_vt3": { returnTempSet: 20, supplyTempSet: 20, humiditySet: 50, humidityActual: 47.2 },
  "pac_server_vt4": { returnTempSet: 20, supplyTempSet: 20, humiditySet: 50, humidityActual: 40.7 },
  "pac_server_vt5": { returnTempSet: 18, supplyTempSet: 18, humiditySet: 50, humidityActual: 42.2 },
  "pac_server_dragor": { returnTempSet: "NA", supplyTempSet: "NA", humiditySet: "NA", humidityActual: "NA" },
  
  // Power Room 1
  "pac_pr1_em1": { returnTempSet: 20, supplyTempSet: "NA", humiditySet: "NA", humidityActual: "NA" },
  "pac_pr1_em2": { returnTempSet: "NA", supplyTempSet: "NA", humiditySet: "NA", humidityActual: "NA" },
  "pac_pr1_em3": { returnTempSet: "NA", supplyTempSet: "NA", humiditySet: "NA", humidityActual: "NA" },
  
  // Power Room 2
  "pac_pr2_em1": { returnTempSet: "NA", supplyTempSet: "NA", humiditySet: "NA", humidityActual: "NA" },
  "pac_pr2_em2": { returnTempSet: "NA", supplyTempSet: "NA", humiditySet: "NA", humidityActual: "NA" },
  
  // IT Room 1
  "pac_it1_em1": { returnTempSet: "NA", supplyTempSet: "NA", humiditySet: "NA", humidityActual: "NA" },
  "pac_it1_em2": { returnTempSet: 20, supplyTempSet: "NA", humiditySet: "NA", humidityActual: "NA" },
  
  // IT Room 2
  "pac_it2_em1": { returnTempSet: 20, supplyTempSet: "NA", humiditySet: "NA", humidityActual: "NA" },
  "pac_it2_em2": { returnTempSet: "NA", supplyTempSet: "NA", humiditySet: "NA", humidityActual: "NA" },
  
  // Data Room / Server Room VT6
  "pac_data_vt6": { returnTempSet: "NA", supplyTempSet: "NA", humiditySet: 50, humidityActual: 50.7 },
  "pac_data_em1": { returnTempSet: "NA", supplyTempSet: "NA", humiditySet: "NA", humidityActual: "NA" },
  "pac_data_em2": { returnTempSet: "NA", supplyTempSet: "NA", humiditySet: "NA", humidityActual: "NA" },
};
