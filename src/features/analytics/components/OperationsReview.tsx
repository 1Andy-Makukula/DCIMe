// src/features/analytics/components/OperationsReview.tsx
import { useMemo, useState } from "react";
import { Printer, Loader2, AlertTriangle } from "lucide-react";
import { StatTable, Num, MetricTile, FSelect } from "@/shared/ui";
import { humanise } from "@/domain/categories";
import { useAuth } from "@/shared/context/AuthContext";
import { useCurrentSite } from "@/shared/context/SiteContext";
import { siteLabel } from "@/shared/utils/branding";
import { usePeriodReview, type PlantRow, type ExceptionRow, type TechnicianRow } from "../hooks/usePeriodReview";
import { useReportSignoff, type SignoffRole } from "../hooks/useReportSignoff";
import { DocumentSignatures } from "@/shared/ui";

// ─────────────────────────────────────────────────────────────────────────────
// The Operations Review — one account of a week or a month.
//
// The platform had all of this and told it in pieces: the Executive Summary as
// a snapshot, Shift Reports as a list, Technician Analytics as a table. None of
// them was an account of the period, and none could be handed to somebody who
// had not been here.
//
// The order is fixed, deliberately. A reader who has seen last month's review
// knows where to look in this one, and a section that has nothing to report
// says so rather than being dropped — an absent section reads as an oversight,
// a section saying "no breaches" reads as a finding.
// ─────────────────────────────────────────────────────────────────────────────

type Grain = "week" | "month";

/** Local-time period boundaries. A month must start when the site says it does. */
function periodBounds(grain: Grain, offset: number): { from: Date; to: Date; label: string; key: string } {
  const now = new Date();
  if (grain === "month") {
    const from = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
    return {
      from, to,
      label: from.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
      key: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`
    };
  }
  // Weeks run Monday to Monday.
  const day = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day - offset * 7);
  const to = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
  return {
    from: monday, to,
    label: `Week of ${monday.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
    key: `${monday.getFullYear()}-W${String(monday.getDate()).padStart(2, "0")}-${monday.getMonth() + 1}`
  };
}

function Section({ n, title, lead, children }: {
  n: number; title: string; lead?: string; children: React.ReactNode;
}) {
  return (
    <section className="break-inside-avoid rounded-3xl border border-neutral-100 bg-white p-5 shadow-sm print:border-neutral-300 print:shadow-none">
      <div className="mb-4 flex items-baseline gap-3 border-b border-neutral-100 pb-3">
        <span className="font-mono text-[13px] font-black text-brand-500">
          {String(n).padStart(2, "0")}
        </span>
        <div>
          <h2 className="text-[15px] font-black tracking-tight text-neutral-900">{title}</h2>
          {lead && <p className="mt-0.5 text-[11px] font-semibold text-neutral-400">{lead}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function OperationsReview() {
  const { employee } = useAuth();
  const { currentSite } = useCurrentSite();
  const [grain, setGrain] = useState<Grain>("month");
  const [offset, setOffset] = useState(1); // last complete period by default

  const { from, to, label, key } = useMemo(() => periodBounds(grain, offset), [grain, offset]);
  const { review, isLoading, error } = usePeriodReview(from, to);

  const { signoff, sign } = useReportSignoff("OPS_REVIEW", `${grain}-${key}`);
  const [signError, setSignError] = useState<string | null>(null);

  const cov = review?.coverage;
  const inc = review?.incidents;

  // A category can carry many measures; the review lists them all, but the
  // reader wants the ones that went outside limits at the top.
  const plant = useMemo<PlantRow[]>(() => {
    if (!review) return [];
    return [...review.plant].sort((a, b) =>
      b.breaches - a.breaches || b.warns - a.warns || a.category.localeCompare(b.category));
  }, [review]);

  if (isLoading) {
    return (
      <div className="flex min-h-[16rem] items-center justify-center text-neutral-400">
        <Loader2 size={18} className="mr-2 animate-spin" />
        <span className="text-[12px] font-bold uppercase tracking-wider">Building the review…</span>
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className="flex min-h-[16rem] flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle size={22} className="text-danger-500" />
        <p className="text-[13px] font-bold text-neutral-800">Could not build the review</p>
        <p className="max-w-md text-[12px] text-neutral-500">{error ?? "No data for this period."}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-5 bg-neutral-50/50 p-6 print:bg-white print:p-0">
      {/* ── Masthead ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-neutral-100 bg-white p-5 shadow-sm print:border-0 print:shadow-none">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-400">
            {siteLabel(currentSite?.site_name ?? currentSite?.site_code)} · Operations Review
          </p>
          <h1 className="mt-0.5 text-[24px] font-black leading-none tracking-tight text-neutral-900">
            {label}
          </h1>
          <p className="mt-1.5 text-[11px] font-semibold text-neutral-500">
            {new Date(review.window_from).toLocaleDateString("en-GB")} to{" "}
            {new Date(review.window_to).toLocaleDateString("en-GB")} · {review.window_hours} hours
          </p>
        </div>

        <div className="flex items-center gap-2 print:hidden">
          <FSelect
            ariaLabel="Period length"
            className="w-28"
            value={grain}
            onChange={(v) => { setGrain(v as Grain); setOffset(1); }}
            options={[{ value: "month", label: "Monthly" }, { value: "week", label: "Weekly" }]}
          />
          <FSelect
            ariaLabel="Which period"
            className="w-36"
            value={String(offset)}
            onChange={(v) => setOffset(Number(v))}
            options={Array.from({ length: 6 }, (_, i) => ({
              value: String(i),
              label: i === 0 ? "Current (partial)" : periodBounds(grain, i).label
            }))}
          />
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-xl bg-neutral-900 px-3.5 py-2 text-[11px] font-black uppercase tracking-wider text-white hover:bg-neutral-700"
          >
            <Printer size={13} /> Print
          </button>
        </div>
      </div>

      {/* ── 01 The period ───────────────────────────────────────────────── */}
      <Section n={1} title="The period in one line"
        lead="What we know, and how much of it we know.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricTile
            label="Rounds walked"
            value={cov ? `${cov.rounds_logged}/${cov.rounds_expected}` : null}
            status={(cov?.coverage_pct ?? 0) >= 90 ? "ok" : (cov?.coverage_pct ?? 0) >= 60 ? "warn" : "breach"}
            footnote={`${cov?.coverage_pct ?? 0}% of the hours in the period`}
          />
          <MetricTile
            label="Hours with no round"
            value={cov?.hours_unlogged ?? null}
            status={(cov?.hours_unlogged ?? 0) > 0 ? "warn" : "ok"}
            footnote="nothing was recorded in these"
          />
          <MetricTile
            label="Technicians on the round"
            value={cov?.technicians ?? null}
            footnote="distinct names logged"
          />
          <MetricTile
            label="Incidents raised"
            value={inc?.opened ?? null}
            status={(inc?.still_open ?? 0) > 0 ? "warn" : "ok"}
            footnote={inc ? `${inc.closed} closed · ${inc.still_open} still open` : undefined}
          />
        </div>
        <p className="mt-4 max-w-3xl text-[12.5px] leading-relaxed text-neutral-600">
          {cov && cov.rounds_logged === 0 ? (
            <>No rounds were logged in this period at all, so nothing below describes
            the plant — it describes the absence of a record.</>
          ) : (
            <>
              The site was walked <strong>{cov?.rounds_logged}</strong> times against{" "}
              <strong>{cov?.rounds_expected}</strong> hours in the period
              {cov && cov.hours_unlogged > 0 && (
                <>, leaving <strong>{cov.hours_unlogged}</strong> hours with no reading of any kind</>
              )}. {inc?.opened === 0
                ? "No incidents were raised."
                : <>Of <strong>{inc?.opened}</strong> incidents raised, <strong>{inc?.serious}</strong> were
                   high or critical, and the average time to restore was{" "}
                   <strong>{inc?.mttr_hours ?? "—"} hours</strong>.</>}
            </>
          )}
        </p>
      </Section>

      {/* ── 02 What the plant did ───────────────────────────────────────── */}
      <Section n={2} title="What the plant did"
        lead="Every system, every measure it captured — not a representative machine.">
        <StatTable<PlantRow>
          rows={plant}
          rowKey={(r) => `${r.category}_${r.measure}`}
          rowTone={(r) => r.breaches > 0 ? "breach" : r.warns > 0 ? "warn" : "none"}
          maxHeight={460}
          emptyMessage="No readings were rolled up for this period."
          columns={[
            { key: "cat", header: "System", width: "16%",
              render: (r) => <span className="font-bold text-neutral-900">{humanise(r.category)}</span> },
            { key: "measure", header: "Measure",
              render: (r) => <span className="text-neutral-600">{humanise(r.measure)}</span> },
            { key: "assets", header: "Machines", numeric: true, width: "10%",
              render: (r) => <span className="text-neutral-600">{r.assets}</span> },
            { key: "min", header: "Min", numeric: true, width: "10%",
              render: (r) => <Num value={r.min_num} decimals={1} /> },
            { key: "avg", header: "Average", numeric: true, width: "11%",
              render: (r) => <Num value={r.avg_num} decimals={1} /> },
            { key: "max", header: "Max", numeric: true, width: "10%",
              render: (r) => <Num value={r.max_num} decimals={1} /> },
            { key: "out", header: "Outside limits", numeric: true, width: "13%",
              render: (r) => r.breaches > 0
                ? <span className="font-bold text-danger-700">{r.breaches}</span>
                : r.warns > 0
                  ? <span className="font-bold text-warn-700">{r.warns} warn</span>
                  : <span className="text-neutral-300">—</span> }
          ]}
        />
      </Section>

      {/* ── 03 Exceptions ───────────────────────────────────────────────── */}
      <Section n={3} title="Exceptions"
        lead="Ranked by how long a machine sat outside its limits, not by how far it went — a long mild breach usually matters more than a spike.">
        <StatTable<ExceptionRow>
          rows={review.exceptions}
          rowKey={(r) => `${r.equipment_id}_${r.measure}`}
          rowTone={() => "breach"}
          maxHeight={420}
          emptyMessage="Nothing went outside its limits in this period."
          columns={[
            { key: "asset", header: "Machine",
              render: (r) => <span className="font-bold text-neutral-900">{r.asset_name}</span> },
            { key: "measure", header: "Measure", width: "22%",
              render: (r) => <span className="text-neutral-600">{humanise(r.measure)}</span> },
            { key: "n", header: "Readings out", numeric: true, width: "13%",
              render: (r) => <span className="font-bold text-danger-700">{r.breach_readings}</span> },
            { key: "range", header: "Min / max", numeric: true, width: "16%",
              render: (r) => (
                <span className="text-neutral-500">
                  <Num value={r.min_num} decimals={1} /> – <Num value={r.max_num} decimals={1} />
                </span>
              ) },
            { key: "when", header: "Last seen", numeric: true, width: "15%",
              render: (r) => (
                <span className="text-neutral-500">
                  {new Date(r.last_seen).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </span>
              ) }
          ]}
        />
      </Section>

      {/* ── 04 Who did the work ─────────────────────────────────────────── */}
      <Section n={4} title="Who did the work"
        lead="Rounds logged per technician, and any vendor whose work was attributed in the period.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <StatTable<TechnicianRow>
            rows={review.technicians}
            rowKey={(r) => r.name}
            maxHeight={300}
            emptyMessage="No rounds were attributed to anyone."
            columns={[
              { key: "name", header: "Technician",
                render: (r) => <span className="font-bold text-neutral-900">{r.name}</span> },
              { key: "rounds", header: "Rounds", numeric: true, width: "22%",
                render: (r) => <span className="text-neutral-700">{r.rounds}</span> },
              { key: "days", header: "Days on", numeric: true, width: "22%",
                render: (r) => <span className="text-neutral-500">{r.days}</span> }
            ]}
          />
          <div className="rounded-2xl border border-neutral-100 bg-neutral-50/60 p-4">
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-neutral-400">
              Vendors engaged
            </p>
            {review.vendors.length === 0 ? (
              <p className="text-[12px] font-semibold text-neutral-400">
                No incident in this period was attributed to a vendor.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {review.vendors.map((v) => (
                  <li key={v.vendor} className="flex items-baseline justify-between gap-3">
                    <span className="text-[12.5px] font-bold text-neutral-900">{v.vendor}</span>
                    <span className="font-mono text-[11.5px] font-bold text-neutral-500">
                      {v.incidents} incident{v.incidents === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      {/* ── 05 Sign-off ─────────────────────────────────────────────────── */}
      <Section n={5} title="Sign-off"
        lead="Prepared and reviewed. A period report nobody put their name to is a draft.">
        <DocumentSignatures
          author={{
            role: "Prepared by",
            name: signoff.prepared_name ?? employee?.full_name ?? null,
            image: signoff.prepared_signature,
            signedAt: signoff.prepared_at
          }}
          counter={{
            role: "Reviewed by",
            name: signoff.reviewed_name,
            image: signoff.reviewed_signature,
            signedAt: signoff.reviewed_at
          }}
          context={`Operations Review · ${label}`}
          onSign={async (result) => {
            setSignError(null);
            const role: SignoffRole = signoff.prepared_signature ? "reviewed" : "prepared";
            try { await sign(role, result); }
            catch (e: any) { setSignError(e?.message ?? "Could not record the signature"); }
          }}
        />
        {signError && (
          <p className="mt-2 text-[11px] font-bold text-danger-700">{signError}</p>
        )}
      </Section>

      <p className="pb-4 text-center text-[10px] font-semibold text-neutral-400">
        Generated {new Date(review.generated_at).toLocaleString("en-GB")} · every figure read from the
        same window in one query.
      </p>
    </div>
  );
}
