import { useState } from "react";
import {
  Loader2, AlertTriangle, RefreshCw, Plus, Building2, Check, X, Inbox, Flag, Archive, Trash2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useVendors, type VendorActivity } from "@/features/topology/hooks/useVendors";

// ─────────────────────────────────────────────────────────────────────────────
// The vendor register.
//
// Answers the question V1 could not: who has been on site, how often, what did
// they find, and how much of it is still open.
// ─────────────────────────────────────────────────────────────────────────────

function VendorRow({ v, onSave, onFlag, onSetActive, onDelete }: {
  v: VendorActivity;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
  onFlag: (reason: string | null) => void;
  onSetActive: (active: boolean) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing]   = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [flagWhy, setFlagWhy]   = useState("");
  const [busy, setBusy]         = useState(false);
  const [contact, setContact] = useState("");
  const [phone, setPhone]     = useState("");
  const [spec, setSpec]       = useState(v.speciality ?? "");
  const [sla, setSla]         = useState(v.sla_hours === null ? "" : String(v.sla_hours));

  const save = async () => {
    setBusy(true);
    try {
      await onSave({
        contact_name:  contact.trim() || null,
        contact_phone: phone.trim() || null,
        speciality:    spec.trim() || null,
        // Empty means no agreement exists, which is a different thing from an
        // agreement of zero hours and must stay distinguishable.
        sla_hours:     sla.trim() === "" ? null : Number(sla)
      });
      toast.success("Vendor updated");
      setEditing(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const hasHistory = v.visits > 0 || v.findings > 0;

  return (
    <div className={`rounded-2xl border bg-white p-4 ${
      v.flagged_reason ? "border-warn-300 ring-1 ring-warn-200"
      : !v.is_active   ? "border-gray-200 opacity-70"
      : "border-gray-200"
    }`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-[13px] font-black text-gray-900">{v.vendor_name}</p>
            {!v.is_active && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-gray-500">
                Retired
              </span>
            )}
            {v.flagged_reason && (
              <span className="flex items-center gap-1 rounded bg-warn-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-warn-700">
                <Flag size={9} /> Flagged
              </span>
            )}
          </div>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-gray-400">
            {v.speciality || "No speciality recorded"}
            {v.sla_hours !== null && ` · ${v.sla_hours}h response agreed`}
          </p>
        </div>
        <button
          onClick={() => setEditing(e => !e)}
          className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:bg-gray-50"
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>

      {/* The four numbers that answer "should we keep using this contractor". */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        {([
          ["Visits",   v.visits,           ""],
          ["Findings", v.findings,         ""],
          ["Serious",  v.serious_findings, v.serious_findings > 0 ? "text-warn-600" : ""],
          ["Open",     v.open_work,        v.open_work > 0 ? "text-danger-600" : ""]
        ] as const).map(([label, n, cls]) => (
          <div key={label} className="rounded-xl bg-gray-50 p-2 text-center">
            <p className={`text-[16px] font-black tabular-nums leading-none ${cls || "text-gray-900"}`}>{n}</p>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-gray-400">{label}</p>
          </div>
        ))}
      </div>

      {v.last_visit && (
        <p className="mt-2 text-[10px] text-gray-400">
          Last on site {new Date(v.last_visit).toLocaleDateString()}
        </p>
      )}

      {v.flagged_reason && (
        <div className="mt-3 rounded-xl border border-warn-200 bg-warn-50 px-3 py-2">
          <p className="font-mono text-[9px] uppercase tracking-widest text-warn-600">
            Flagged for review
          </p>
          <p className="mt-0.5 text-[11px] font-semibold text-warn-800">{v.flagged_reason}</p>
          {v.flagged_at && (
            <p className="mt-0.5 font-mono text-[9px] text-warn-500">
              {new Date(v.flagged_at).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {/* Lifecycle. Deleting is offered only when there is no history to lose;
          everything else is retired, which keeps the record intact. */}
      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-gray-100 pt-3">
        <button
          onClick={() => v.flagged_reason ? onFlag(null) : setFlagging(true)}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
            v.flagged_reason
              ? "border-warn-300 bg-warn-50 text-warn-700 hover:bg-warn-100"
              : "border-gray-200 text-gray-500 hover:bg-gray-50"
          }`}
        >
          <Flag size={11} /> {v.flagged_reason ? "Clear flag" : "Flag"}
        </button>

        <button
          onClick={() => onSetActive(!v.is_active)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 transition-colors hover:bg-gray-50"
        >
          {v.is_active ? <><Archive size={11} /> Retire</> : <><RotateCcw size={11} /> Restore</>}
        </button>

        <button
          onClick={onDelete}
          disabled={hasHistory}
          title={hasHistory
            ? `${v.visits} visit(s) and ${v.findings} finding(s) on record — retire instead, so the history survives.`
            : "Permanently remove this vendor"}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-danger-500 transition-colors hover:bg-danger-50 disabled:cursor-not-allowed disabled:border-gray-100 disabled:text-gray-300 disabled:hover:bg-transparent"
        >
          <Trash2 size={11} /> Delete
        </button>
      </div>

      {flagging && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={flagWhy}
            onChange={e => setFlagWhy(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && flagWhy.trim()) { onFlag(flagWhy); setFlagging(false); setFlagWhy(""); } }}
            placeholder="Why does this vendor need review?"
            className="min-w-0 flex-1 rounded-xl border border-warn-200 bg-warn-50/50 px-3 py-2 text-[12px] text-gray-900 focus:border-warn-400 focus:outline-none"
          />
          <button
            onClick={() => { onFlag(flagWhy); setFlagging(false); setFlagWhy(""); }}
            disabled={!flagWhy.trim()}
            className="rounded-xl bg-warn-500 px-3 text-[11px] font-black uppercase tracking-wider text-white disabled:bg-gray-200 disabled:text-gray-400"
          >
            Flag
          </button>
          <button onClick={() => { setFlagging(false); setFlagWhy(""); }} aria-label="Cancel"
            className="rounded-xl px-2 text-gray-400 hover:bg-gray-100"><X size={15} /></button>
        </div>
      )}

      {editing && (
        <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <input value={contact} onChange={e => setContact(e.target.value)}
              placeholder="Contact name"
              className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] focus:border-gray-400 focus:outline-none" />
            <input value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="Phone" inputMode="tel"
              className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] focus:border-gray-400 focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={spec} onChange={e => setSpec(e.target.value)}
              placeholder="Speciality, e.g. Generators"
              className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] focus:border-gray-400 focus:outline-none" />
            <input value={sla} onChange={e => setSla(e.target.value)}
              placeholder="Response hours" inputMode="numeric"
              className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[12px] tabular-nums focus:border-gray-400 focus:outline-none" />
          </div>
          <button onClick={save} disabled={busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-gray-900 py-2.5 text-[12px] font-bold text-white disabled:bg-gray-300">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
          </button>
        </div>
      )}
    </div>
  );
}

export function VendorRegister() {
  const { vendors, isLoading, error, refresh, update, create, flag, setActive, remove } = useVendors();
  const [adding, setAdding] = useState(false);
  const [name, setName]     = useState("");

  const add = async () => {
    try { await create(name); setName(""); setAdding(false); toast.success("Vendor added"); }
    catch (e: any) { toast.error(e?.message ?? "Could not add"); }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[16rem] items-center justify-center text-gray-400">
        <Loader2 size={18} className="mr-2 animate-spin" />
        <span className="text-[12px] font-bold uppercase tracking-wider">Loading vendors…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[16rem] flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle size={22} className="text-danger-500" />
        <p className="text-[13px] font-bold text-gray-800">Could not load the vendor register</p>
        <p className="max-w-md text-[12px] text-gray-500">{error}</p>
        <button onClick={refresh}
          className="mt-1 flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-600">
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-gray-400">
            Ecosystem
          </p>
          <h1 className="text-[20px] font-black leading-none tracking-tight text-gray-900">
            Vendor Register
          </h1>
          <p className="mt-1 text-[11px] text-gray-500">
            {vendors.length} contractor{vendors.length === 1 ? "" : "s"} · created automatically
            the first time each one is logged on a visit
          </p>
        </div>
        <button onClick={() => setAdding(a => !a)}
          className="flex items-center gap-2 rounded-xl border border-gray-300 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-700 hover:bg-gray-50">
          <Plus size={14} /> Add vendor
        </button>
      </div>

      {adding && (
        <div className="flex gap-2 rounded-2xl border border-gray-200 bg-gray-50 p-3">
          <input value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") add(); }}
            placeholder="Company name"
            className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[12px] focus:border-gray-400 focus:outline-none" />
          <button onClick={add}
            className="rounded-xl bg-gray-900 px-4 text-[12px] font-bold text-white">Add</button>
          <button onClick={() => setAdding(false)} aria-label="Cancel"
            className="rounded-xl px-2 text-gray-400 hover:bg-gray-200"><X size={15} /></button>
        </div>
      )}

      {vendors.length === 0 ? (
        <div className="flex min-h-[14rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 text-center">
          <Inbox size={26} className="text-gray-300" />
          <p className="text-[13px] font-bold text-gray-700">No vendors yet</p>
          <p className="max-w-xs text-[11px] leading-snug text-gray-400">
            A vendor is registered automatically the first time a contractor is
            named on a visit. Nothing needs setting up in advance.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {vendors.map(v => (
            <VendorRow
              key={v.vendor_id}
              v={v}
              onSave={patch => update(v.vendor_id, patch)}
              onFlag={async reason => {
                try {
                  await flag(v.vendor_id, reason);
                  toast.success(reason ? "Vendor flagged for review" : "Flag cleared");
                } catch (e: any) { toast.error(e?.message ?? "Could not update the flag"); }
              }}
              onSetActive={async active => {
                try {
                  await setActive(v.vendor_id, active);
                  toast.success(active ? "Vendor restored" : "Vendor retired");
                } catch (e: any) { toast.error(e?.message ?? "Could not change status"); }
              }}
              onDelete={async () => {
                // Irreversible, so it asks. The hook refuses outright when
                // there is history, which the button already reflects.
                if (!window.confirm(`Permanently delete ${v.vendor_name}? This cannot be undone.`)) return;
                try { await remove(v.vendor_id); toast.success("Vendor deleted"); }
                catch (e: any) { toast.error(e?.message ?? "Could not delete"); }
              }}
            />
          ))}
        </div>
      )}

      <p className="text-[10px] leading-relaxed text-gray-400">
        <Building2 size={11} className="mr-1 inline align-[-1px]" />
        Names are matched ignoring case and punctuation, so "Cummins Zambia" and
        "cummins  zambia" resolve to one company rather than two.
      </p>
    </div>
  );
}
