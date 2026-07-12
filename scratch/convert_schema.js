import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function convert(filename, destName) {
  const srcPath = path.join(__dirname, '../', filename);
  const destPath = path.join(__dirname, '../', destName);
  if (fs.existsSync(srcPath)) {
    const content = fs.readFileSync(srcPath, 'utf16le');
    fs.writeFileSync(destPath, content, 'utf8');
    console.log(`Converted ${filename} to UTF-8 at ${destName}`);
  } else {
    console.error(`File not found: ${srcPath}`);
  }
}

convert('recovered_dictionary.ts', 'recovered_dictionary_utf8.ts');
