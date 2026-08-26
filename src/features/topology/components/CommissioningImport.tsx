import { useRef, useState } from "react";
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle,
  Loader2, Trash2, ArrowRight, Info
} from "lucide-react";
import { toast } from "sonner";
import { ManualEntryForm } from "./ManualEntryForm";
import ExcelJS from "exceljs";
import {
  useCommissioningImport,
  EXPECTED_COLUMNS,
  type ImportKind,
  type StagedRow
} from "@/features/topology/hooks/useCommissioningImport";

// ─────────────────────────────────────────────────────────────────────────────
// Commissioning a site from a spreadsheet.
//
// Three visible steps — upload, check, import — because the middle one is the
// point. A user must see exactly what is wrong, on which line, and be able to
// fix their file and try again without anything having touched live data.
// ─────────────────────────────────────────────────────────────────────────────

const VERDICT: Record<string, { cls: string; icon: typeof CheckCircle2 }> = {
  OK:      { cls: "text-ok-600", icon: CheckCircle2 },
  WARN:    { cls: "text-warn-600",   icon: AlertTriangle },
  ERROR:   { cls: "text-danger-600",     icon: XCircle },
  PENDING: { cls: "text-neutral-400",    icon: Info },
  SKIPPED: { cls: "text-neutral-400",    icon: Info }
};

/** A parsed row, carrying the line number the user actually sees in Excel. */
export interface SheetRow {
  line:   number;
  record: Record<string, unknown>;
}

/**
 * Reads the first worksheet into plain objects keyed by the header row.
 *
 * `line` is the TRUE worksheet row number, not the index within the parsed
 * results. Blank rows are common in the middle of real spreadsheets, and
 * renumbering after skipping them makes every validation message point at the
 * wrong line — which is worse than no line number at all.
 */
async function readSheet(file: File): Promise<SheetRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("That workbook has no sheets");

  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, col) => {
    // Normalised so "Equipment ID", "equipment_id" and "EQUIPMENT ID" all land
    // on the same key — a commissioning engineer should not have to guess case.
    headers[col] = String(cell.value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  });
  if (headers.filter(Boolean).length === 0) throw new Error("No header row found");

  const out: SheetRow[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const rec: Record<string, unknown> = {};
    let hasValue = false;
    row.eachCell((cell, col) => {
      const key = headers[col];
      if (!key) return;
      const v = cell.value;
      if (v === null || v === undefined || String(v).trim() === "") return;
      rec[key] = typeof v === "object" && "text" in (v as any)
        ? String((v as any).text).trim()
        : String(v).trim();
      hasValue = true;
    });
    // Blank rows in the middle of a sheet are common and are not errors — but
    // the rows after them keep their real numbers.
    if (hasValue) out.push({ line: n, record: rec });
  });
  return out;
}

function RowLine({ r }: { r: StagedRow }) {
  const v = VERDICT[r.verdict] ?? VERDICT.PENDING;
  const Icon = v.icon;
  const label = String(
    r.payload.equipment_id ??
    (r.payload.source_equipment_id
      ? `${r.payload.source_equipment_id} → ${r.payload.target_equipment_id}`
      : "—")
  );
  return (
    <li className="flex items-start gap-2.5 px-4 py-2">
      <Icon size={14} className={`mt-0.5 shrink-0 ${v.cls}`} />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] text-neutral-700">
          <span className="text-neutral-400">line {r.source_line}</span>
          {"  "}{label}
        </p>
        {r.message && <p className={`mt-0.5 text-[11px] ${v.cls}`}>{r.message}</p>}
      </div>
    </li>
  );
}

export function CommissioningImport() {
  const {
    batch, rows, isBusy, error,
    stage, validate, promote, discard,
    okCount, warnCount, errorCount
  } = useCommissioningImport();

  const [kind, setKind] = useState<ImportKind>("EQUIPMENT");
  const [source, setSource] = useState<"file" | "manual">("file");
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    try {
      const parsed = await readSheet(file);
      await stage(kind, file.name, parsed);
      toast.success(`${parsed.length} rows staged from ${file.name}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not read that file");
    }
  };

  const runPromote = async () => {
    try {
      const r = await promote();
      toast.success(`${r.inserted} rows imported`);
      if (r.graph_issues > 0) {
        // Surfaced now rather than discovered inside a cascade months later.
        toast.warning(
          `${r.graph_issues} graph issue${r.graph_issues === 1 ? "" : "s"} — newly imported equipment usually has no cables yet.`
        );
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Import failed");
    }
  };

  const cols = EXPECTED_COLUMNS[kind];
  const canPromote = batch?.status === "VALIDATED" && errorCount === 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-400">Commissioning</p>
        <h1 className="text-[20px] font-black leading-none tracking-tight text-neutral-900">
          Bulk Import
        </h1>
        <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-neutral-500">
          Load equipment and cabling from a spreadsheet, or type in a few items
          by hand. Nothing reaches the live facility until every row passes, so
          you can correct and retry as many times as you need.
        </p>
      </div>

      {/* Step 1 — what kind of sheet, and what it must contain */}
      {!batch && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(["EQUIPMENT", "CONNECTIONS"] as const).map(k => (
              <button key={k} onClick={() => setKind(k)}
                className={`rounded-2xl border py-3 text-[12px] font-bold transition-colors ${
                  kind === k ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-600"
                }`}>
                {k === "EQUIPMENT" ? "Equipment" : "Cables"}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">
              Columns for this sheet
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {cols.required.map(c => (
                <span key={c} className="rounded-lg border border-neutral-900 bg-neutral-900 px-2 py-1 font-mono text-[10px] text-white">
                  {c}
                </span>
              ))}
              {cols.optional.map(c => (
                <span key={c} className="rounded-lg border border-neutral-200 bg-white px-2 py-1 font-mono text-[10px] text-neutral-500">
                  {c}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-neutral-400">
              Dark are required. Column names are matched ignoring case and spaces.
            </p>
          </div>

          {/* Two ways in, one pipeline. A file for commissioning a site, a
              form for the single item somebody forgot — both stage the same
              rows and go through the same validation. */}
          <div className="flex gap-1 rounded-xl bg-neutral-100 p-1">
            {([["file", "From a spreadsheet"], ["manual", "Type it in"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setSource(k)}
                className={`flex-1 rounded-lg py-2 text-[11px] font-black uppercase tracking-wider transition-all ${
                  source === k ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-400 hover:text-neutral-600"
                }`}>
                {label}
              </button>
            ))}
          </div>

          {source === "file" ? (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={isBusy}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-300 py-12 transition-colors hover:border-neutral-400 hover:bg-neutral-50"
              >
                {isBusy ? <Loader2 size={26} className="animate-spin text-neutral-400" />
                        : <Upload size={26} className="text-neutral-400" />}
                <span className="text-[13px] font-bold text-neutral-700">Choose a spreadsheet</span>
                <span className="text-[11px] text-neutral-400">.xlsx — first sheet is used</span>
              </button>
              <input
                ref={fileRef} type="file" accept=".xlsx" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
              />
            </>
          ) : (
            <ManualEntryForm
              kind={kind}
              busy={isBusy}
              onStage={async rows => {
                try {
                  await stage(kind, "Manual entry", rows);
                  toast.success(`${rows.length} row${rows.length === 1 ? "" : "s"} staged`);
                  return true;
                } catch (e: any) {
                  toast.error(e?.message ?? "Could not stage those rows");
                  // Signals the form to keep what was typed.
                  return false;
                }
              }}
            />
          )}
        </>
      )}

      {/* Steps 2 and 3 — check, then import */}
      {batch && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet size={18} className="text-neutral-400" />
              <div>
                <p className="text-[13px] font-bold text-neutral-900">{batch.filename}</p>
                <p className="font-mono text-[10px] uppercase tracking-wider text-neutral-400">
                  {batch.kind} · {rows.length} rows · {batch.status}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {batch.status !== "PROMOTED" && (
                <>
                  <button onClick={validate} disabled={isBusy}
                    className="flex items-center gap-2 rounded-xl border border-neutral-300 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-700 hover:bg-neutral-50 disabled:opacity-50">
                    {isBusy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    Check rows
                  </button>
                  <button onClick={discard}
                    className="flex items-center gap-2 rounded-xl border border-neutral-300 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500 hover:bg-danger-50 hover:text-danger-600">
                    <Trash2 size={13} /> Discard
                  </button>
                </>
              )}
            </div>
          </div>

          {rows.some(r => r.verdict !== "PENDING") && (
            <div className="grid grid-cols-3 gap-2">
              {([["Ready", okCount, "text-ok-600"],
                 ["Warnings", warnCount, "text-warn-600"],
                 ["Errors", errorCount, "text-danger-600"]] as const).map(([label, n, cls]) => (
                <div key={label} className="rounded-2xl border border-neutral-200 bg-white p-3 text-center">
                  <p className={`text-[20px] font-black tabular-nums leading-none ${cls}`}>{n}</p>
                  <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-neutral-400">{label}</p>
                </div>
              ))}
            </div>
          )}

          {batch.status === "PROMOTED" ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-ok-200 bg-ok-50 py-8 text-center">
              <CheckCircle2 size={26} className="text-ok-600" />
              <p className="text-[13px] font-bold text-ok-900">Imported</p>
              <p className="max-w-sm text-[11px] text-ok-700">
                The equipment is now part of the facility. Add its cabling next if
                you have not already.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                <div className="border-b border-neutral-100 px-4 py-2.5">
                  <p className="text-[11px] font-black uppercase tracking-wider text-neutral-700">
                    Rows
                  </p>
                </div>
                <ul className="max-h-[22rem] divide-y divide-neutral-50 overflow-y-auto">
                  {/* Problems first: a user fixing a file needs the failures, not
                      to scroll past two hundred passing rows to find them. */}
                  {[...rows]
                    .sort((a, b) => {
                      const rank = (v: string) => (v === "ERROR" ? 0 : v === "WARN" ? 1 : 2);
                      return rank(a.verdict) - rank(b.verdict) || a.source_line - b.source_line;
                    })
                    .map(r => <RowLine key={r.id} r={r} />)}
                </ul>
              </div>

              <button
                onClick={runPromote}
                disabled={!canPromote || isBusy}
                className="flex items-center justify-center gap-2 rounded-2xl bg-neutral-900 py-3.5 text-[13px] font-bold text-white disabled:bg-neutral-200 disabled:text-neutral-400"
              >
                {isBusy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
                {errorCount > 0
                  ? `Fix ${errorCount} error${errorCount === 1 ? "" : "s"} first`
                  : batch.status !== "VALIDATED"
                    ? "Check the rows first"
                    : `Import ${okCount + warnCount} rows`}
              </button>
            </>
          )}
        </>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 p-3">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger-600" />
          <p className="text-[11px] text-danger-800">{error}</p>
        </div>
      )}
    </div>
  );
}
