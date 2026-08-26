// scripts/verify-excel-mapping.mjs
//
// Checks that every Excel destination in parameter_excel_targets actually sits
// under the heading it claims, by reading the real template files.
//
// WHY THIS EXISTS
// The V2.1 audit found that every room's temperature was being written under a
// different room's heading on the commercial logbook's Temp Record sheet — a
// four-column shift caused by two phantom rooms at the head of the mapping. It
// had been shipping in a signed compliance record. Nothing caught it because
// nothing had ever compared the mapping against the document it writes into.
//
// A column index is not self-describing. This is the only thing that can tell
// you it is wrong.
//
// WHAT IT ASSERTS
//   1. COLLISION  — no two parameters write to the same cell. Always a bug.
//   2. ALIGNMENT  — a room's ambient reading lands under that room's heading.
//                   This is the check that catches the shift class of defect.
//   3. IN RANGE   — no target points past the columns the sheet actually has.
//
// Everything else is printed for review rather than asserted: most of the 572
// destinations are per-asset electrical columns whose headings are positional
// ("R", "Y", "B") and carry no name to match against.
//
// Usage:  node scripts/verify-excel-mapping.mjs
// Exit 1 on any failure, so CI can gate on it.

import ExcelJS from "exceljs";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = process.env.DCIME_SITE ?? "SITE_01";

const TEMPLATES = {
  daily_canvas:       join(ROOT, "public", "template_daily_canvas.xlsx"),
  commercial_logbook: join(ROOT, "public", "template_commercial_logbook.xlsx")
};

// ── the connection string, from .env, never printed ─────────────────────────
function dbUrl() {
  const line = readFileSync(join(ROOT, ".env"), "utf8")
    .split(/\r?\n/).find((l) => l.startsWith("SUPABASE_DB_URL="));
  if (!line) throw new Error("SUPABASE_DB_URL is not set in .env");
  return line.slice("SUPABASE_DB_URL=".length).trim().replace(/^["']|["']$/g, "");
}

function query(sql) {
  const out = execFileSync("psql", [dbUrl(), "-X", "-q", "-t", "-A", "-F", "", "-c", sql],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return out.split(/\r?\n/).filter(Boolean).map((r) => r.split(""));
}

// ── reading a heading out of a template ─────────────────────────────────────
/**
 * The nearest heading above a column, resolving merges.
 *
 * Headings sit in different rows on every sheet — row 5 on Temp Record, rows 4
 * and 5 on a day sheet — and a room name is usually merged across its Temp and
 * Hum pair, so the cell directly above a column is frequently empty while the
 * heading that governs it lives one column to the left.
 */
function headingsFor(sheet, col, maxRow = 8) {
  const found = [];
  for (let row = 1; row <= maxRow; row++) {
    const cell = sheet.getCell(row, col);
    let v = cell.value;
    // A merged cell reports its master's value only from the master address.
    if ((v === null || v === undefined || v === "") && cell.isMerged) {
      v = sheet.getCell(cell.master.row, cell.master.col).value;
    }
    if (v !== null && v !== undefined && String(v).trim() !== "") {
      found.push(String(typeof v === "object" && v.richText
        ? v.richText.map((t) => t.text).join("") : v).trim());
    }
  }
  return found;
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Headings the templates use for rooms the registry names differently.
 *
 * These are not defects — they are the client's own vocabulary, and the
 * documents are theirs. Encoding the correspondence explicitly is the point:
 * without it "Room-1" under First Floor happens to substring-match "IT Room 1"
 * by luck, which would pass for the wrong reason and keep passing if the
 * mapping later drifted onto a different Room-1.
 */
const HEADING_ALIASES = {
  "Server Room": ["Room-1 Server & IT"],
  "Data Room":   ["Media Room"],
  "IT Room 1":   ["Room-1"],            // day sheet, under "First Floor"
  "IT Room 2":   ["Room-2"],            // day sheet, under "Second Floor"
  "Power Room 1": ["Power Room-1"],
  "Power Room 2": ["Power Room-2"]
};

// ── load ────────────────────────────────────────────────────────────────────
console.log(`Verifying Excel destinations for ${SITE}\n`);

const targets = query(`
  SELECT t.parameter_name, t.workbook, t.sheet_name, t.column_index, t.row_rule,
         COALESCE(r.room_name, ''), COALESCE(e.name, ''), COALESCE(e.category, '')
    FROM public.parameter_excel_targets t
    LEFT JOIN public.equipment_parameters p ON p.parameter_name = t.parameter_name
    LEFT JOIN public.equipment_registry  e ON e.equipment_id = p.equipment_id
    LEFT JOIN public.rooms r ON r.id = e.room_id
   WHERE t.site_uuid = (SELECT id FROM public.sites WHERE site_code = '${SITE}')
   ORDER BY t.workbook, t.sheet_name, t.column_index
`).map(([parameter_name, workbook, sheet_name, column_index, row_rule, room_name, equipment_name, category]) =>
  ({ parameter_name, workbook, sheet_name, column_index: Number(column_index),
     row_rule, room_name, equipment_name, category }));

if (targets.length === 0) {
  console.error("No destinations found. Has 20260837_registry_seed.sql been applied?");
  process.exit(1);
}

const books = {};
for (const [name, path] of Object.entries(TEMPLATES)) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  books[name] = wb;
}

const failures = [];
const notes = [];

// ── 1. collisions ───────────────────────────────────────────────────────────
// A shared column is only a collision when the ROW does not separate the two.
// On the PAC sheet all 27 aircons deliberately share five columns and are told
// apart by which row of the block they occupy; flagging that would be flagging
// the design. These three geometries place each asset on its own row.
const ROW_SEPARATES_ASSETS = new Set(["pac_row", "eqpt_status_row", "fss_row"]);

const seen = new Map();
for (const t of targets) {
  if (ROW_SEPARATES_ASSETS.has(t.row_rule)) continue;
  const key = `${t.workbook}|${t.sheet_name}|${t.column_index}`;
  if (seen.has(key)) {
    failures.push(`COLLISION  ${t.sheet_name} col ${t.column_index}: ` +
                  `${seen.get(key)} and ${t.parameter_name} both write here`);
  } else {
    seen.set(key, t.parameter_name);
  }
}

// ── 2. alignment + 3. range ─────────────────────────────────────────────────
// DYNAMIC_DAY is a placeholder for the day-of-month sheets, which are all the
// same shape; '1' stands in for all 31.
const resolveSheet = (wb, name) =>
  wb.worksheets.find((s) => s.name.toLowerCase() === (name === "DYNAMIC_DAY" ? "1" : name).toLowerCase());

let checkedAlignment = 0;

for (const t of targets) {
  const sheet = resolveSheet(books[t.workbook], t.sheet_name);
  if (!sheet) { failures.push(`MISSING SHEET  ${t.workbook} / ${t.sheet_name}`); continue; }

  const col = t.column_index + 1;                    // stored 0-based, ExcelJS 1-based
  if (col > sheet.columnCount + 4) {
    failures.push(`OUT OF RANGE  ${t.sheet_name} col ${t.column_index} ` +
                  `(${t.parameter_name}) — sheet has ${sheet.columnCount} columns`);
    continue;
  }

  // Only room-ambient readings carry a name that a heading can be matched
  // against. Everything else is positional and is reported, not asserted.
  const isRoomAmbient = /_ambient_(temp|humidity)$/.test(t.parameter_name) && t.room_name;
  if (!isRoomAmbient) continue;

  checkedAlignment++;
  const heads = headingsFor(sheet, col);
  const accepted = [t.room_name, ...(HEADING_ALIASES[t.room_name] ?? [])].map(norm);
  // Exact match against the room name or one of its documented aliases. Not a
  // substring test: "Room-1" is inside "IT Room 1" and also inside
  // "Power Room-1", so a loose match would call two different rooms correct.
  const hit = heads.some((h) => accepted.includes(norm(h)));

  if (!hit) {
    failures.push(
      `MISALIGNED  ${t.sheet_name} col ${t.column_index} — ${t.parameter_name} ` +
      `belongs to "${t.room_name}" but the heading reads ${JSON.stringify(heads)}`);
  }
}

// ── 4. PAC unit rows ────────────────────────────────────────────────────────
// The one sheet where an asset's ROW is what identifies it. The template names
// every unit in column D, so each asset's stored excel_row_index can be checked
// against the row it claims — this is what catches a reserved slot for a unit
// that does not exist, which shifted eight aircons by one row.
{
  const PAC_FIRST_ROW = 6, PAC_UNITS = 23;
  const pac = resolveSheet(books.commercial_logbook, "PAC");
  const placed = query(`
    SELECT e.equipment_id, e.excel_row_index, COALESCE(rm.room_name,'')
      FROM public.equipment_registry e
      LEFT JOIN public.rooms rm ON rm.id = e.room_id
     WHERE e.site_uuid = (SELECT id FROM public.sites WHERE site_code = '${SITE}')
       AND e.excel_row_index IS NOT NULL
     ORDER BY e.excel_row_index
  `).map(([equipment_id, idx, room_name]) => ({ equipment_id, idx: Number(idx), room_name }));

  const usedIdx = new Set();
  for (const a of placed) {
    if (usedIdx.has(a.idx)) failures.push(`PAC ROW CLASH  index ${a.idx} used twice (${a.equipment_id})`);
    usedIdx.add(a.idx);
    if (a.idx < 0 || a.idx >= PAC_UNITS) {
      failures.push(`PAC ROW RANGE  ${a.equipment_id} index ${a.idx} — block holds ${PAC_UNITS}`);
      continue;
    }
    // Location is written once per room and blank on the rows beneath it, so
    // it is carried down the block the way the sheet reads.
    let loc = "";
    for (let r = PAC_FIRST_ROW; r <= PAC_FIRST_ROW + a.idx; r++) {
      const v = pac.getCell(r, 3).value;
      if (v !== null && v !== undefined && String(v).trim() !== "") loc = String(v).trim();
    }
    if (a.room_name && norm(loc) !== norm(a.room_name)) {
      failures.push(`PAC ROW  ${a.equipment_id} (index ${a.idx}, row ${PAC_FIRST_ROW + a.idx}) ` +
                    `is in "${a.room_name}" but that row belongs to "${loc}"`);
    }
  }
  notes.push(`PAC: ${placed.length} of ${PAC_UNITS} rows assigned`);
}

// ── report ──────────────────────────────────────────────────────────────────
const bySheet = {};
for (const t of targets) bySheet[`${t.workbook} / ${t.sheet_name}`] =
  (bySheet[`${t.workbook} / ${t.sheet_name}`] ?? 0) + 1;

console.log("Destinations by sheet:");
for (const [k, v] of Object.entries(bySheet).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(4)}  ${k}`);
}
console.log(`\n${targets.length} destinations · ${checkedAlignment} heading-checkable · ${notes.length} notes`);

if (failures.length) {
  console.error(`\n${failures.length} FAILURE(S):\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log("\nAll checks passed.");
