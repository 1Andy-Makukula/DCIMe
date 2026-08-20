import { useMemo, useState } from "react";
import { FSelect } from "@/shared/ui";
import { AlertTriangle, Check, ChevronDown, Loader2, RefreshCw, Info } from "lucide-react";
import {
  useFormDefinition,
  validateField,
  initialValues,
  type EquipmentForm,
  type Frequency,
  type ParameterDef,
  type Severity
} from "@/features/field/hooks/useFormDefinition";

// ─────────────────────────────────────────────────────────────────────────────
// The reading form, rendered entirely from the parameter registry.
//
// Nothing here knows what a UPS is, or that a generator has run-hours. It reads
// equipment_parameters and draws whatever it finds. Adding a field is an INSERT;
// no component changes, no deployment.
//
// This is the answer to the original V1 complaint — "a supervisor asks to track
// a new parameter and it breaks".
// ─────────────────────────────────────────────────────────────────────────────

export interface DynamicReadingFormProps {
  frequency?: Frequency;
  siteUuid?:  string;
  /** Previous readings, for carry-forward fields. */
  previous?:  Record<string, string>;
  onSubmit?:  (values: Record<string, string>, suspect: string[]) => void;
}

const SEVERITY_RING: Record<Severity, string> = {
  ok:      "border-slate-200 focus:border-slate-400",
  suspect: "border-warn-400 bg-warn-50/50 focus:border-warn-500",
  missing: "border-danger-300 focus:border-danger-400"
};

/** One field. The widget comes from input_type, the constraints from the row. */
function Field({
  def, value, onChange
}: {
  def: ParameterDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const verdict = validateField(def, value);
  const ring = SEVERITY_RING[verdict.severity];
  const id = `field-${def.parameter_name}`;

  const common =
    `w-full rounded-lg border px-3 py-2 text-[13px] font-semibold text-gray-900 ` +
    `transition-colors focus:outline-none ${ring}`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex items-baseline gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-600">
        {def.display_label}
        {/* The unit comes from unit_definitions, so it can never disagree with
            the stored dimension the way a hardcoded label could. */}
        {def.unit && <span className="font-mono text-[10px] normal-case text-gray-400">{def.unit}</span>}
        {def.is_required && <span className="text-danger-500">*</span>}
      </label>

      {def.input_type === "select" && def.options ? (
        <FSelect
          ariaLabel={def.display_label}
          value={value}
          onChange={onChange}
          placeholder="—"
          options={def.options.map(o => ({ value: o, label: o }))}
        />
      ) : def.input_type === "textarea" ? (
        <textarea id={id} className={common} rows={2} value={value} onChange={e => onChange(e.target.value)} />
      ) : def.input_type === "boolean" ? (
        <FSelect
          ariaLabel={def.display_label}
          value={value}
          onChange={onChange}
          placeholder="—"
          options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]}
        />
      ) : (
        <input
          id={id}
          className={common}
          type={def.input_type === "number" ? "number"
              : def.input_type === "time"   ? "time"
              : def.input_type === "date"   ? "date" : "text"}
          // inputMode matters on a phone in a plant room: it summons the numeric
          // keypad instead of the full keyboard.
          inputMode={def.data_type === "number" ? "decimal" : undefined}
          value={value}
          onChange={e => onChange(e.target.value)}
          readOnly={def.is_constant}
          aria-invalid={verdict.severity !== "ok"}
          aria-describedby={verdict.message ? `${id}-msg` : undefined}
        />
      )}

      {/* A warning, never a block. The reading is already accepted. */}
      {verdict.message && (
        <p id={`${id}-msg`}
           className={`text-[10px] font-semibold ${verdict.severity === "suspect" ? "text-warn-700" : "text-danger-600"}`}>
          {verdict.severity === "suspect" ? "Unusual — recorded anyway. " : ""}{verdict.message}
        </p>
      )}
      {def.help_text && !verdict.message && (
        <p className="text-[10px] text-gray-400">{def.help_text}</p>
      )}
    </div>
  );
}

/** One equipment item, collapsible — a full round is ~80 fields on a phone. */
function EquipmentGroup({
  group, values, onChange, defaultOpen
}: {
  group: EquipmentForm;
  values: Record<string, string>;
  onChange: (name: string, v: string) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const flagged = group.parameters.filter(
    p => validateField(p, values[p.parameter_name] ?? "").severity !== "ok"
  ).length;

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
      >
        <div className="min-w-0">
          <p className="truncate text-[13px] font-black text-gray-900">{group.name}</p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
            {group.location} · {group.parameters.length} reading{group.parameters.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {flagged > 0 && (
            <span className="rounded-full bg-warn-100 px-2 py-0.5 text-[10px] font-bold text-warn-700">
              {flagged}
            </span>
          )}
          <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="grid grid-cols-1 gap-3 border-t border-gray-100 p-4 sm:grid-cols-2">
          {group.parameters.map(p => (
            <Field
              key={p.parameter_name}
              def={p}
              value={values[p.parameter_name] ?? ""}
              onChange={v => onChange(p.parameter_name, v)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function DynamicReadingForm({
  frequency = "hourly",
  siteUuid,
  previous = {},
  onSubmit
}: DynamicReadingFormProps) {
  const { groups, fieldCount, isLoading, error, refresh } =
    useFormDefinition(frequency, siteUuid);

  const [values, setValues] = useState<Record<string, string> | null>(null);

  // Seed once the definition arrives: constants, carry-forwards, defaults.
  const seeded = useMemo(() => initialValues(groups, previous), [groups, previous]);
  const current = values ?? seeded;

  const suspect = useMemo(
    () => groups.flatMap(g => g.parameters)
                .filter(p => validateField(p, current[p.parameter_name] ?? "").severity === "suspect")
                .map(p => p.parameter_name),
    [groups, current]
  );

  const missing = useMemo(
    () => groups.flatMap(g => g.parameters)
                .filter(p => validateField(p, current[p.parameter_name] ?? "").severity === "missing")
                .length,
    [groups, current]
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[16rem] items-center justify-center text-gray-400">
        <Loader2 size={18} className="mr-2 animate-spin" />
        <span className="text-[12px] font-bold uppercase tracking-wider">Loading form…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[16rem] flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle size={22} className="text-danger-500" />
        <p className="text-[13px] font-bold text-gray-800">Could not load the form</p>
        <p className="max-w-md text-[12px] text-gray-500">{error}</p>
        <button onClick={refresh}
          className="mt-1 flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-600 hover:bg-gray-50">
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex min-h-[16rem] flex-col items-center justify-center gap-3 p-6 text-center">
        <Info size={22} className="text-gray-400" />
        <p className="text-[13px] font-bold text-gray-800">No readings defined for this round</p>
        <p className="max-w-md text-[12px] text-gray-500">
          Fields appear here as soon as parameters are added to the registry.
          Nothing needs deploying.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-black uppercase tracking-wider text-gray-900">
            {frequency} round
          </h2>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-gray-400">
            {groups.length} items · {fieldCount} readings · rendered from the registry
          </p>
        </div>
        {suspect.length > 0 && (
          <span className="rounded-full bg-warn-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-warn-700">
            {suspect.length} flagged for review
          </span>
        )}
      </div>

      {groups.map((g, i) => (
        <EquipmentGroup
          key={g.equipment_id}
          group={g}
          values={current}
          defaultOpen={i === 0}
          onChange={(name, v) => setValues({ ...current, [name]: v })}
        />
      ))}

      <button
        onClick={() => onSubmit?.(current, suspect)}
        className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-[12px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-gray-800"
      >
        <Check size={15} />
        Submit {frequency} round
        {missing > 0 && <span className="font-mono normal-case">({missing} blank)</span>}
      </button>

      {/* Submission is never blocked. A blank or unusual value is recorded and
          surfaced, because a technician who cannot record what they see will
          record something else. */}
      <p className="text-center text-[10px] text-gray-400">
        Unusual readings are recorded and flagged, not rejected.
      </p>
    </div>
  );
}
