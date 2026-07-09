// src/features/field/constants/pacConstants.ts

export type PacConstantValues = {
  returnTempSet: number | string;
  supplyTempSet: number | string;
  humiditySet: number | string;
  humidityActual: number | string; // Treated as constant per the current Excel workflow
};

export const PAC_CONSTANTS: Record<string, PacConstantValues> = {
  // Server Room
  "pac_server_em1": { returnTempSet: 22, supplyTempSet: 20, humiditySet: 45, humidityActual: 45 },
  "pac_server_em2": { returnTempSet: 22, supplyTempSet: 20, humiditySet: 45, humidityActual: 45 },
  "pac_server_em3": { returnTempSet: 22, supplyTempSet: 20, humiditySet: 45, humidityActual: 45 },
  "pac_server_em4": { returnTempSet: 22, supplyTempSet: 20, humiditySet: 45, humidityActual: 45 },
  "pac_server_em5": { returnTempSet: 22, supplyTempSet: 20, humiditySet: 45, humidityActual: 45 },
  "pac_server_em6": { returnTempSet: 22, supplyTempSet: 20, humiditySet: 45, humidityActual: 45 },
  "pac_server_em7": { returnTempSet: 22, supplyTempSet: 20, humiditySet: 45, humidityActual: 45 },
  "pac_server_vt1": { returnTempSet: 22, supplyTempSet: 20, humiditySet: 45, humidityActual: 45 },
  "pac_server_vt2": { returnTempSet: 22, supplyTempSet: 20, humiditySet: 45, humidityActual: 45 },
  "pac_server_vt3": { returnTempSet: 22, supplyTempSet: 20, humiditySet: 45, humidityActual: 45 },
  "pac_server_vt4": { returnTempSet: 22, supplyTempSet: 20, humiditySet: 45, humidityActual: 45 },
  "pac_server_vt5": { returnTempSet: 22, supplyTempSet: 20, humiditySet: 45, humidityActual: 45 },
  "pac_server_dragor": { returnTempSet: 22, supplyTempSet: 20, humiditySet: 45, humidityActual: 45 },
  
  // Power Room 1
  "pac_pr1_em1": { returnTempSet: 22, supplyTempSet: 20, humiditySet: 45, humidityActual: 45 },
  "pac_pr1_em2": { returnTempSet: 22, supplyTempSet: 20, humiditySet: 45, humidityActual: 45 },
  "pac_pr1_em3": { returnTempSet: 22, supplyTempSet: 20, humiditySet: 45, humidityActual: 45 },
  
  // Power Room 2
  "pac_pr2_em1": { returnTempSet: 22, supplyTempSet: 20, humiditySet: 45, humidityActual: 45 },
  "pac_pr2_em2": { returnTempSet: 22, supplyTempSet: 20, humiditySet: 45, humidityActual: 45 },
  
  // IT Room 1
  "pac_it1_em1": { returnTempSet: 22, supplyTempSet: 20, humiditySet: 45, humidityActual: 45 },
  "pac_it1_em2": { returnTempSet: 22, supplyTempSet: 20, humiditySet: 45, humidityActual: 45 },
  
  // IT Room 2
  "pac_it2_em1": { returnTempSet: 22, supplyTempSet: 20, humiditySet: 45, humidityActual: 45 },
  "pac_it2_em2": { returnTempSet: 22, supplyTempSet: 20, humiditySet: 45, humidityActual: 45 },
};
