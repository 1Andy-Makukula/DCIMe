import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function analyze(filePath, label) {
  const fullPath = path.join(__dirname, filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`${label}: File not found.`);
    return;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  // Count workbook mappings
  const matches = content.match(/workbook:\s*['"][^'"]+['"]/g);
  console.log(`${label}: Found ${matches ? matches.length : 0} Excel destination mappings.`);
}

analyze('../src/features/field/constants/telemetrySchema.ts', 'Current Active Schema');
analyze('old_schema_utf8.ts', 'Recovered old_schema (f4e7072~1)');
analyze('older_schema_utf8.ts', 'Recovered older_schema (c19b108)');
