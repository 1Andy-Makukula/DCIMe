import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function evaluateSchema(fileName, label) {
  const tsPath = path.join(__dirname, fileName);
  if (!fs.existsSync(tsPath)) {
    console.log(`${label}: File not found.`);
    return;
  }
  const tsContent = fs.readFileSync(tsPath, 'utf8');

  // Strip TypeScript types so it compiles as pure JS
  let jsContent = tsContent
    .replace(/export\s+type\s+[^;]+;/g, '')
    .replace(/export\s+interface\s+\w+\s*\{[\s\S]*?\}/g, '')
    .replace(/:\s*(CheckFrequency|TargetWorkbook|ExcelTarget\[\]|ExcelTarget|AssetMetric\[\]|AssetMetric|Asset\[\]|Asset|AssetCategory\[\]|AssetCategory|TelemetryField\[\]|TelemetryField|string|number|boolean|any)/g, '')
    .replace(/as\s+const/g, '')
    .replace(/const\s+fields\s*=\s*\[\]/g, 'const fields = []')
    .replace(/export\s+const\s+/g, 'const ')
    .replace(/isHq\s*:\s*boolean\s*=\s*false/g, 'isHq = false')
    .replace(/defaultVoltage\s*:\s*number\s*=\s*26\.7/g, 'defaultVoltage = 26.7')
    .replace(/outputVoltageDefault\s*:\s*number/g, 'outputVoltageDefault')
    .replace(/excelStartColumnIndex\s*:\s*number/g, 'excelStartColumnIndex')
    .replace(/excelStartColumnIndex\s*\?/g, 'excelStartColumnIndex')
    .replace(/dgNumber\s*:\s*number/g, 'dgNumber')
    .replace(/prefix\s*:\s*string/g, 'prefix');

  // Append mapping evaluator code
  jsContent += `
  const fields = [];
  MASTER_ASSET_DICTIONARY.forEach((cat) => {
    cat.assets.forEach((asset) => {
      asset.metrics.forEach((metric) => {
        const dests = metric.destinations || [];
        dests.forEach(d => {
          fields.push({
            id: metric.id,
            workbook: d.workbook,
            sheetName: d.sheetName,
            excelColumnIndex: d.excelColumnIndex
          });
        });
      });
    });
  });

  console.log("=== " + "${label}" + " ===");
  console.log("Total resolved Excel mappings (destinations count):", fields.length);
  const dailyCanvasCount = fields.filter(f => f.workbook === 'daily_canvas').length;
  const commercialLogbookCount = fields.filter(f => f.workbook === 'commercial_logbook').length;
  console.log("  - daily_canvas:", dailyCanvasCount);
  console.log("  - commercial_logbook:", commercialLogbookCount);
  `;

  const evalPath = path.join(__dirname, 'eval_temp.js');
  fs.writeFileSync(evalPath, jsContent, 'utf8');
  
  // Dynamic import the generated temporary script
  import('./eval_temp.js').catch(err => {
    // Fallback if import fails
    console.error("Evaluation failed:", err);
  });
}

evaluateSchema('../src/features/field/constants/telemetrySchema.ts', 'Current Active Schema');
// wait a small delay to prevent imports overriding concurrently
setTimeout(() => {
  evaluateSchema('older_schema_utf8.ts', 'Recovered older_schema (12f5fa6)');
}, 100);
