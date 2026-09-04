// src/features/topology/components/VendorDetail.tsx
import { Link, useParams } from "react-router";
import {
  ArrowLeft, Loader2, AlertTriangle, Phone, ShieldCheck,
  FileText, Wrench, Boxes
} from "lucide-react";
import { MetricTile } from "@/shared/ui";
import { useVendorDetail } from "../hooks/useVendorDetail";

// ─────────────────────────────────────────────────────────────────────────────
// One vendor's whole record.
//
// The register is an index. This is the row you open when somebody asks whether
// a company is still under contract, who to ring at 02:00, what they have
// touched this year, and whether their repairs hold.
//
// Nothing here is typed in twice: the activity and performance figures come out
// of get_vendor_scorecard(), which reads the incidents and work items already
// keyed to this vendor. Where a fact has not been recorded the page says so
// rather than showing a zero that reads like a good result.
// ─────────────────────────────────────────────────────────────────────────────

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const daysUntil = (d: string | null | undefined): number | null => {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000);
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[9.5px] font-black uppercase tracking-[0.12em] text-neutral-400">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-semibold text-neutral-800">{value ?? "—"}</dd>
    </div>
  );
}

function Panel({ title, icon, children, aside }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-neutral-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-neutral-400">{icon}</span>
          <h2 className="text-[11px] font-black uppercase tracking-[0.14em] text-neutral-600">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** An expiry, coloured by how close it is rather than by whether it exists. */
function Expiry({ label, date }: { label: string; date: string | null }) {
  const days = daysUntil(date);
  const tone =
    date === null      ? "text-neutral-400"
    : days === null    ? "text-neutral-400"
    : days < 0         ? "text-danger-700"
    : days <= 30       ? "text-warn-700"
    : "text-ok-700";

  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-neutral-50 py-1.5 last:border-b-0">
      <span className="text-[11px] font-semibold text-neutral-500">{label}</span>
      <span className={`font-mono text-[11.5px] font-bold ${tone}`}>
        {date === null ? "not recorded" : (
          days !== null && days < 0 ? `${fmtDate(date)} · lapsed`
          : days !== null && days <= 30 ? `${fmtDate(date)} · ${days}d`
          : fmtDate(date)
        )}
      </span>
    </div>
  );
}

export function VendorDetail() {
  const { vendorId } = useParams();
  const { vendor, contacts, contracts, coverage, scorecard, isLoading, error } =
    useVendorDetail(vendorId);

  if (isLoading) {
    return (
      <div className="flex min-h-[16rem] items-center justify-center text-neutral-400">
        <Loader2 size={18} className="mr-2 animate-spin" />
        <span className="text-[12px] font-bold uppercase tracking-wider">Loading vendor…</span>
      </div>
    );
  }

  if (error || !vendor) {
    return (
      <div className="flex min-h-[16rem] flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle size={22} className="text-danger-500" />
        <p className="text-[13px] font-bold text-neutral-800">Could not open this vendor</p>
        <p className="max-w-md text-[12px] text-neutral-500">{error ?? "No such vendor."}</p>
        <Link to="/admin/vendors" className="mt-1 text-[11px] font-bold uppercase tracking-wider text-brand-600 hover:underline">
          Back to the register
        </Link>
      </div>
    );
  }

  const live = contracts.find((c) => c.is_active) ?? null;
  const act = scorecard?.activity;
  const perf = scorecard?.performance;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Identity ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/admin/vendors"
            className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-neutral-400 hover:text-brand-600">
            <ArrowLeft size={12} /> Vendor register
          </Link>
          <h1 className="text-[22px] font-black leading-none tracking-tight text-neutral-900">
            {vendor.name}
          </h1>
          <p className="mt-1.5 text-[11.5px] font-semibold text-neutral-500">
            {vendor.speciality || "No speciality recorded"}
            {!vendor.is_active && <span className="ml-2 text-neutral-400">· retired</span>}
          </p>
        </div>
        {vendor.flagged_reason && (
          <div className="max-w-sm rounded-xl border border-warn-200 bg-warn-50 px-3 py-2">
            <p className="text-[9.5px] font-black uppercase tracking-[0.12em] text-warn-700">
              Flagged for review
            </p>
            <p className="mt-0.5 text-[11.5px] font-semibold text-warn-900">{vendor.flagged_reason}</p>
          </div>
        )}
      </div>

      {/* ── What they have actually done ────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricTile
          label="Incidents"
          value={act?.incidents ?? 0}
          footnote={act && act.incidents_open > 0 ? `${act.incidents_open} still open` : "attributed this year"}
          status={act && act.incidents_open > 0 ? "warn" : null}
        />
        <MetricTile
          label="Mean restore"
          value={perf?.mean_restore_hours ?? null}
          unit="h"
          decimals={1}
          footnote={perf?.restore_target_hours != null
            ? `target ${perf.restore_target_hours} h`
            : "no contracted target"}
          status={
            perf?.mean_restore_hours != null && perf?.restore_target_hours != null
              ? (perf.mean_restore_hours <= perf.restore_target_hours ? "ok" : "breach")
              : null
          }
        />
        <MetricTile
          label="Worst restore"
          value={perf?.worst_restore_hours ?? null}
          unit="h"
          decimals={1}
          footnote="longest single fault"
        />
        <MetricTile
          label="Repairs that reopened"
          value={perf?.repeat_visits_30d ?? 0}
          status={(perf?.repeat_visits_30d ?? 0) > 0 ? "breach" : "ok"}
          footnote="same machine, within 30 days"
        />
        <MetricTile
          label="Site visits"
          value={act?.visits ?? 0}
          footnote={act?.last_visit ? `last ${fmtDate(act.last_visit)}` : "none logged"}
          status={(act?.visits ?? 0) === 0 && (act?.incidents ?? 0) > 0 ? "warn" : null}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Contract ─────────────────────────────────────────────────── */}
        <Panel title="Contract" icon={<FileText size={13} />}>
          {live ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3.5">
              <Field label="Reference" value={live.reference} />
              <Field label="Expires" value={
                <span className={
                  (daysUntil(live.expires_on) ?? 999) < 0 ? "text-danger-700"
                  : (daysUntil(live.expires_on) ?? 999) <= 60 ? "text-warn-700" : ""
                }>
                  {fmtDate(live.expires_on)}
                </span>
              } />
              <Field label="Response bought" value={live.response_hours != null ? `${live.response_hours} h` : null} />
              <Field label="Restore bought" value={live.restore_hours != null ? `${live.restore_hours} h` : null} />
              <Field label="Call-out" value={live.callout_rate != null ? `${live.currency} ${live.callout_rate}` : null} />
              <Field label="Payment terms" value={live.payment_terms_days != null ? `${live.payment_terms_days} days` : null} />
            </dl>
          ) : (
            <p className="text-[12px] font-semibold text-neutral-400">
              No contract recorded. Response and restore figures above have nothing to be
              measured against until one is.
            </p>
          )}
        </Panel>

        {/* ── Compliance ───────────────────────────────────────────────── */}
        <Panel title="Compliance" icon={<ShieldCheck size={13} />}>
          <div className="flex flex-col">
            <Expiry label="Public liability insurance" date={live?.insurance_expires_on ?? null} />
            <Expiry label="Workmen's compensation"    date={live?.workmens_comp_expires_on ?? null} />
            <Expiry label="Tax clearance"             date={live?.tax_clearance_expires_on ?? null} />
            <Expiry label="Safety induction"          date={live?.safety_induction_expires_on ?? null} />
          </div>
          <p className="mt-3 text-[10.5px] font-semibold text-neutral-400">
            A lapsed certificate is a reason to refuse entry, not a note to chase later.
          </p>
        </Panel>

        {/* ── People ───────────────────────────────────────────────────── */}
        <Panel title="People" icon={<Phone size={13} />}
          aside={<span className="text-[10px] font-bold text-neutral-400">{contacts.length}</span>}>
          {contacts.length === 0 ? (
            <div className="space-y-1">
              <p className="text-[12px] font-semibold text-neutral-500">
                {vendor.contact_name || vendor.contact_phone || vendor.contact_email
                  ? "Only the single contact from the register:"
                  : "No contacts recorded."}
              </p>
              {(vendor.contact_name || vendor.contact_phone) && (
                <p className="text-[12.5px] font-bold text-neutral-800">
                  {vendor.contact_name ?? "—"}
                  {vendor.contact_phone && <span className="ml-2 font-mono text-[11.5px] font-semibold text-neutral-500">{vendor.contact_phone}</span>}
                </p>
              )}
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {contacts.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-bold text-neutral-900">
                      {c.name}
                      {c.is_escalation && (
                        <span className="ml-2 rounded bg-brand-100 px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wider text-brand-700">
                          escalation
                        </span>
                      )}
                    </p>
                    <p className="text-[10.5px] font-semibold text-neutral-400">{c.role ?? "—"}</p>
                  </div>
                  <div className="shrink-0 text-right font-mono text-[11px] font-semibold text-neutral-600">
                    {c.phone && <div>{c.phone}</div>}
                    {c.email && <div className="text-neutral-400">{c.email}</div>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* ── Coverage ─────────────────────────────────────────────────── */}
        <Panel title="What they cover" icon={<Boxes size={13} />}
          aside={<span className="text-[10px] font-bold text-neutral-400">{coverage.length}</span>}>
          {coverage.length === 0 ? (
            <p className="text-[12px] font-semibold text-neutral-400">
              Nothing assigned. Until a system or a machine is listed here, “who is
              responsible for the generators” has no answer the platform can give.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {coverage.map((c) => (
                <span key={c.id}
                  className="rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 font-mono text-[10.5px] font-bold text-neutral-700">
                  {c.category ?? c.equipment_id}
                </span>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* ── Work ─────────────────────────────────────────────────────────── */}
      <Panel title="Work raised against this vendor" icon={<Wrench size={13} />}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Work items" value={act?.work_items ?? 0} />
          <Field label="Still open" value={act?.work_items_open ?? 0} />
          <Field label="Machines touched" value={perf?.assets_touched ?? 0} />
          <Field label="Incidents closed" value={act?.incidents_resolved ?? 0} />
        </div>
        <p className="mt-4 text-[10.5px] font-semibold text-neutral-400">
          Counted over the last 12 months, scoped to this site. Attribution comes from the
          vendor key on each record — the name typed on the form is kept alongside it, but
          is not what these figures are grouped by.
        </p>
      </Panel>
    </div>
  );
}
