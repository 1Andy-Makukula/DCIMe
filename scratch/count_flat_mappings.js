import { HOURLY_TELEMETRY_SCHEMA } from '../src/features/field/constants/telemetrySchema.js';

let mapped = 0;
let unmapped = 0;

HOURLY_TELEMETRY_SCHEMA.forEach(field => {
  if (field.excelColumnIndex > -1) {
    mapped++;
  } else {
    unmapped++;
  }
});

console.log(`Flat schema metrics with valid Excel column index: ${mapped}`);
console.log(`Flat schema metrics unmapped to Excel: ${unmapped}`);
console.log(`Total flat metrics: ${HOURLY_TELEMETRY_SCHEMA.length}`);
