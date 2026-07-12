// Helper to translate 0-based index to Excel column letter
export const getExcelColumn = (index: number): string => {
  let colName = "";
  let dividend = index + 1;
  while (dividend > 0) {
    let modulo = (dividend - 1) % 26;
    colName = String.fromCharCode(65 + modulo) + colName;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return colName;
};

// Helper to get PAC unit equipment index (0 to 23)
export const getPacEquipmentIndex = (assetId: string): number => {
  if (assetId.startsWith("pac_server_em")) {
    const num = parseInt(assetId.replace("pac_server_em", ""), 10);
    if (num >= 1 && num <= 7) return num - 1; // 0 to 6
  }
  if (assetId.startsWith("pac_server_vt")) {
    const num = parseInt(assetId.replace("pac_server_vt", ""), 10);
    if (num === 3) return 7;
    if (num === 4) return 8;
    if (num === 5) return 9;
    if (num === 1) return 22;
    if (num === 2) return 23;
  }
  if (assetId.startsWith("pac_pr1_em")) {
    const num = parseInt(assetId.replace("pac_pr1_em", ""), 10);
    if (num >= 1 && num <= 3) return 13 + (num - 1); // 13 to 15
  }
  if (assetId.startsWith("pac_pr2_em")) {
    const num = parseInt(assetId.replace("pac_pr2_em", ""), 10);
    if (num >= 1 && num <= 2) return 16 + (num - 1); // 16 to 17
  }
  if (assetId.startsWith("pac_it1_em")) {
    const num = parseInt(assetId.replace("pac_it1_em", ""), 10);
    if (num >= 1 && num <= 2) return 18 + (num - 1); // 18 to 19
  }
  if (assetId.startsWith("pac_it2_em")) {
    const num = parseInt(assetId.replace("pac_it2_em", ""), 10);
    if (num >= 1 && num <= 2) return 20 + (num - 1); // 20 to 21
  }
  return -1;
};

// Helper to get Equipment Status row index (OK/Not OK sheet rows)
export const getEqptStatusRow = (assetId: string): number => {
  if (assetId === "ups_1") return 5;
  if (assetId === "ups_2") return 6;
  if (assetId === "rectifier_1") return 7;
  if (assetId === "rectifier_2") return 8;
  if (assetId.startsWith("pac_server_em")) {
    const num = parseInt(assetId.replace("pac_server_em", ""), 10);
    if (num >= 1 && num <= 7) return 9 + (num - 1);
  }
  if (assetId.startsWith("pac_server_vt")) {
    const num = parseInt(assetId.replace("pac_server_vt", ""), 10);
    if (num >= 1 && num <= 5) return 16 + (num - 1);
  }
  if (assetId === "pac_server_dragor") return 21;
  if (assetId.startsWith("pac_pr1_em")) {
    const num = parseInt(assetId.replace("pac_pr1_em", ""), 10);
    if (num >= 1 && num <= 3) return 24 + (num - 1);
  }
  if (assetId.startsWith("pac_pr2_em")) {
    const num = parseInt(assetId.replace("pac_pr2_em", ""), 10);
    if (num >= 1 && num <= 2) return 27 + (num - 1);
  }
  if (assetId.startsWith("pac_it1_em")) {
    const num = parseInt(assetId.replace("pac_it1_em", ""), 10);
    if (num >= 1 && num <= 2) return 29 + (num - 1);
  }
  if (assetId.startsWith("pac_it2_em")) {
    const num = parseInt(assetId.replace("pac_it2_em", ""), 10);
    if (num >= 1 && num <= 2) return 31 + (num - 1);
  }
  return -1;
};
