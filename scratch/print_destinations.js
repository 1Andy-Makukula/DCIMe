import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function printDestinations(filePath, label) {
  const fullPath = path.join(__dirname, filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`${label}: File not found.`);
    return;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  console.log(`=== Mappings in ${label} ===`);
  
  // Find all destinations blocks
  const regex = /id:\s*['"]([^'"]+)['"].*?destinations:\s*\[([\s\S]*?)\]/g;
  let match;
  let count = 0;
  while ((match = regex.exec(content)) !== null) {
    const id = match[1];
    const dest = match[2].trim();
    if (dest.length > 0) {
      console.log(`id: "${id}" -> destinations: [${dest.replace(/\s+/g, ' ')}]`);
      count++;
    }
  }
  console.log(`Total mapped IDs: ${count}\n`);
}

printDestinations('older_schema_utf8.ts', 'Recovered older_schema (12f5fa6)');
