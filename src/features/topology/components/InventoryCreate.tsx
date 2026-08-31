import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/shared/api/supabaseClient";
import { FSelect } from "@/shared/ui";

// ─────────────────────────────────────────────────────────────────────────────
// Adding a room, an asset, and the readings it takes.
//
// The first two were disabled in AssetInventory with the note "defined in
// config blueprint" — the blueprint being SITE_01_blueprint.json, which was the
// source of truth for equipment until Stage 1 deleted it. The registry is
// authoritative now, so the reason those buttons were switched off is gone.
//
// Kept out of AssetInventory rather than added to it: that file is already a
// thousand lines, and creating a thing is a different job from browsing them.
//
// These write to `rooms`, `equipment_registry` and `equipment_parameters` — the
// same tables the commissioning import promotes into and every other screen
// reads. No new path: the import stays for loading a whole site at once, this
// is for adding one thing to a site that already exists.
// ─────────────────────────────────────────────────────────────────────────────

/** database.types.ts predates several of these columns. */
type UntypedFrom = (table: string) => any;
const from = supabase.from.bind(supabase) as unknown as UntypedFrom;

/** The categories equipment_registry's CHECK constraint accepts. */
const CATEGORIES = [
  "UPS", "GENERATOR", "MAINS", "RECTIFIER", "AIRCON",
  "ENVIRONMENT", "COOLING", "SWITCHGEAR", "DISTRIBUTION",
  "IT_LOAD", "SAFETY", "FUEL", "FACILITY"
];

const FREQUENCIES = ["hourly", "2-hour", "4-hour", "daily", "weekly", "monthly"];

const DATA_TYPES = [
  { value: "number",  label: "Number" },
  { value: "string",  label: "Text" },
  { value: "boolean", label: "Yes / No" }
];

/**
 * How a reading is captured.
 *
 * CONSTANT is the one that makes nameplate data work: a generator's fuel burn
 * rate is not something a technician reads every round, it is a fact about the
 * machine. Recording it as a parameter with a fixed value rather than a column
 * of its own means one editor covers every such fact, and calculations find
 * them by role rather than by name.
 */
const CAPTURE_MODES = [
  { value: "CAPTURED",       label: "Technician records it" },
  { value: "CONSTANT",       label: "Fixed value — nameplate" },
  { value: "NOT_APPLICABLE", label: "Not collected here" }
];

/**
 * Roles a calculation looks up by. Matches the CHECK on semantic_role, and
 * blank is the normal case — a reading needs a role only when something has to
 * find it without knowing its name.
 */
const ROLES = [
  "FUEL_BURN_RATE", "RUN_HOURS_START", "RUN_HOURS_STOP", "FUEL_BURN_ACTUAL",
  "FACILITY_LOAD_KW", "UPS_OUTPUT_KW", "RECTIFIER_DC_VOLTAGE", "RECTIFIER_DC_CURRENT",
  "AMBIENT_TEMP", "AMBIENT_HUMIDITY", "UPS_BATTERY_PERCENT", "UPS_USED_CAPACITY",
  "GRID_STATUS"
];

const Field = ({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) => (
  <div>
    <label className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-neutral-400">
      {label}
      {hint && <span className="ml-1.5 font-bold normal-case tracking-normal text-neutral-300">{hint}</span>}
    </label>
    {children}
  </div>
);

const inputClass =
  "w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-[13px] " +
  "font-semibold text-neutral-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

/** A stable id from a display name: lowercase, underscores, no punctuation. */
function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function Shell({ title, eyebrow, onClose, children, footer }: {
  title: string; eyebrow: string; onClose: () => void;
  children: React.ReactNode; footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-neutral-100 px-6 py-5">
          <div>
            <div className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-neutral-400">{eyebrow}</div>
            <h2 className="text-[16px] font-black tracking-tight text-neutral-900">{title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close"
                  className="rounded-xl p-2 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-neutral-100 px-6 py-4">
          {footer}
        </div>
      </div>
    </div>
  );
}

// ── Rooms ───────────────────────────────────────────────────────────────────

export function CreateRoomModal({ isOpen, siteId, nextSortOrder, onClose, onCreated }: {
  isOpen: boolean;
  siteId: string | null;
  nextSortOrder: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  if (!isOpen) return null;

  const save = async () => {
    const roomName = name.trim();
    if (!roomName) { toast.error("A room needs a name"); return; }
    if (!siteId)   { toast.error("No site selected"); return; }

    setBusy(true);
    try {
      // sort_order carries the walking order — a new room goes at the end
      // rather than into the middle of somebody's round.
      const { error } = await from("rooms").insert([{
        site_id: siteId, room_name: roomName, sort_order: nextSortOrder
      }]);
      if (error) throw new Error(error.message);
      toast.success(`${roomName} added`);
      setName("");
      onCreated();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not add the room");
    } finally { setBusy(false); }
  };

  return (
    <Shell eyebrow="Inventory" title="Add a room" onClose={onClose}
      footer={<>
        <button onClick={onClose}
          className="rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-wider text-neutral-400 hover:text-neutral-700">
          Cancel
        </button>
        <button onClick={save} disabled={busy || !name.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-neutral-900 px-5 py-2.5 text-[11px] font-black uppercase tracking-wider text-white transition-colors hover:bg-neutral-700 disabled:bg-neutral-200 disabled:text-neutral-400">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Add room
        </button>
      </>}>
      <Field label="Room name">
        <input value={name} onChange={e => setName(e.target.value)} className={inputClass}
               placeholder="Power Room 3" autoFocus />
      </Field>
      <p className="text-[11px] leading-relaxed text-neutral-400">
        The name appears on the technician&apos;s round and on the logbook sheets,
        so it should read the way people say it on site.
      </p>
    </Shell>
  );
}

// ── Equipment ───────────────────────────────────────────────────────────────

export function CreateEquipmentModal({ isOpen, siteId, rooms, onClose, onCreated }: {
  isOpen: boolean;
  siteId: string | null;
  rooms: { id: string; room_name: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName]         = useState("");
  const [idTouched, setTouched] = useState(false);
  const [equipmentId, setId]    = useState("");
  const [category, setCategory] = useState("AIRCON");
  const [roomId, setRoomId]     = useState("");
  const [visit, setVisit]       = useState("");
  const [model, setModel]       = useState("");
  const [maker, setMaker]       = useState("");
  const [busy, setBusy]         = useState(false);

  if (!isOpen) return null;

  // The id follows the name until somebody edits it, then it stops moving — an
  // id that keeps changing under a typed correction is worse than no help.
  const onName = (v: string) => {
    setName(v);
    if (!idTouched) setId(slugify(v));
  };

  const room = rooms.find(r => r.id === roomId);

  const save = async () => {
    const id = equipmentId.trim();
    if (!id)          { toast.error("An asset needs an id"); return; }
    if (!name.trim()) { toast.error("An asset needs a name"); return; }
    if (!roomId)      { toast.error("Choose the room it lives in"); return; }
    if (!siteId)      { toast.error("No site selected"); return; }

    setBusy(true);
    try {
      const { error } = await from("equipment_registry").insert([{
        equipment_id: id,
        name: name.trim(),
        category,
        room_id: roomId,
        // NOT NULL, and every other row carries the room's name here.
        location: room?.room_name ?? "",
        site_uuid: siteId,
        manufacturer: maker.trim() || null,
        model: model.trim() || null,
        // Empty means "each reading keeps its own cadence", which is right for
        // anything on the main round.
        visit_frequency: visit || null,
        is_active: true
        // provenance defaults to MANUAL and input_policy to ANY. The defaults
        // are already correct for something a person added, so restating them
        // would only create somewhere else for them to disagree.
      }]);
      if (error) {
        // The primary key is the id, so a clash is the likeliest failure and
        // deserves a sentence rather than a constraint name.
        throw new Error(/duplicate key/i.test(error.message)
          ? `An asset with the id "${id}" already exists at this site.`
          : error.message);
      }
      toast.success(`${name.trim()} added to ${room?.room_name}`);
      onCreated();
      onClose();
      setName(""); setId(""); setTouched(false);
      setModel(""); setMaker(""); setVisit("");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not add the asset");
    } finally { setBusy(false); }
  };

  return (
    <Shell eyebrow="Inventory" title="Add equipment" onClose={onClose}
      footer={<>
        <button onClick={onClose}
          className="rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-wider text-neutral-400 hover:text-neutral-700">
          Cancel
        </button>
        <button onClick={save} disabled={busy || !name.trim() || !roomId}
          className="flex items-center gap-1.5 rounded-xl bg-neutral-900 px-5 py-2.5 text-[11px] font-black uppercase tracking-wider text-white transition-colors hover:bg-neutral-700 disabled:bg-neutral-200 disabled:text-neutral-400">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Add asset
        </button>
      </>}>
      <Field label="Name">
        <input value={name} onChange={e => onName(e.target.value)} className={inputClass}
               placeholder="Emerson Aircon 3" autoFocus />
      </Field>

      <Field label="Identifier" hint="used in readings and the workbook">
        <input value={equipmentId}
               onChange={e => { setTouched(true); setId(slugify(e.target.value)); }}
               className={`${inputClass} font-mono text-[12px]`} placeholder="pac_pr3_em3" />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <FSelect label="Category" value={category} onChange={setCategory}
                 options={CATEGORIES.map(c => ({ value: c, label: c }))} />
        <FSelect label="Room" value={roomId} onChange={setRoomId} placeholder="Choose..."
                 options={rooms.map(r => ({ value: r.id, label: r.room_name }))} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Manufacturer" hint="optional">
          <input value={maker} onChange={e => setMaker(e.target.value)} className={inputClass} placeholder="Vertiv" />
        </Field>
        <Field label="Model" hint="optional">
          <input value={model} onChange={e => setModel(e.target.value)} className={inputClass} placeholder="EXM 0200" />
        </Field>
      </div>

      <FSelect label="Visit frequency" value={visit} onChange={setVisit}
               placeholder="Follow each reading's own cadence"
               options={FREQUENCIES.map(f => ({ value: f, label: f }))} />

      <p className="text-[11px] leading-relaxed text-neutral-400">
        Set a visit frequency only when this asset is reached less often than the
        main round — HQ Power Room is four-hourly, for instance. It overrides
        every reading&apos;s own cadence, because none can be taken more often
        than somebody arrives to take it.
      </p>

      <div className="rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-3">
        <p className="text-[11px] font-bold text-brand-700">Next: its readings</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-brand-600/80">
          The asset arrives with none. Open it and add what a technician records —
          and for anything the platform calculates from, give it a role so the
          figure can be found without matching on its name.
        </p>
      </div>
    </Shell>
  );
}

// ── Readings ────────────────────────────────────────────────────────────────

export function AddParameterForm({ equipmentId, onAdded }: {
  equipmentId: string;
  onAdded: () => void;
}) {
  const [open, setOpen]   = useState(false);
  const [label, setLabel] = useState("");
  const [unit, setUnit]   = useState("");
  const [dataType, setDataType]   = useState("number");
  const [frequency, setFrequency] = useState("hourly");
  const [mode, setMode]   = useState("CAPTURED");
  const [value, setValue] = useState("");
  const [role, setRole]   = useState("");
  const [units, setUnits] = useState<string[]>([]);
  const [busy, setBusy]   = useState(false);

  // Read rather than hardcoded: unit is foreign-keyed to unit_definitions and
  // the constraint is enforced on new rows, so an invented code fails on save.
  useEffect(() => {
    if (!open || units.length) return;
    (async () => {
      const { data } = await from("unit_definitions").select("unit_code").order("unit_code");
      setUnits((data ?? []).map((u: any) => u.unit_code));
    })();
  }, [open, units.length]);

  // The storage key, and the key inside every metrics payload from now on.
  // Prefixed with the asset so it stays unique and reads the way the existing
  // 324 do: ups_1_battery_voltage, not battery_voltage.
  const parameterName = label.trim() ? `${equipmentId}_${slugify(label)}` : "";

  const save = async () => {
    if (!label.trim()) { toast.error("Give the reading a label"); return; }
    if (mode !== "CAPTURED" && !value.trim()) {
      toast.error("A reading nobody takes needs a value to print");
      return;
    }

    setBusy(true);
    try {
      const { error } = await from("equipment_parameters").insert([{
        equipment_id:   equipmentId,
        parameter_name: parameterName,
        display_label:  label.trim(),
        data_type:      dataType,
        input_type:     dataType === "boolean" ? "boolean"
                      : dataType === "string"  ? "text" : "number",
        unit:           unit || null,
        frequency:      mode === "CAPTURED" ? frequency : null,
        capture_mode:   mode,
        is_constant:    mode === "CONSTANT",
        constant_value: mode === "CAPTURED" ? null : value.trim(),
        semantic_role:  role || null,
        // Numbers a person reads are worth plotting. A nameplate constant is a
        // flat line, and a status is not a series at all.
        is_graphable:   mode === "CAPTURED" && dataType === "number",
        is_required:    false,
        is_active:      true
      }]);
      if (error) {
        throw new Error(/duplicate key/i.test(error.message)
          ? `This asset already has a reading stored as ${parameterName}.`
          : /semantic_role/i.test(error.message)
            ? "Another reading on this asset already plays that role."
            : error.message);
      }
      toast.success(`${label.trim()} added`);
      setLabel(""); setUnit(""); setValue(""); setRole(""); setOpen(false);
      onAdded();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not add the reading");
    } finally { setBusy(false); }
  };

  if (!open) {
    // Dashed grey-on-grey read as a disabled placeholder rather than the
    // primary action on this panel — it was easy to miss entirely. This is the
    // first thing a newly created asset needs, so it is drawn as a real button.
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-200 bg-brand-50 py-3 text-[11px] font-black uppercase tracking-wider text-brand-700 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-100"
      >
        <Plus size={14} strokeWidth={3} /> Add equipment parameter
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Label" hint="what the technician sees">
          <input value={label} onChange={e => setLabel(e.target.value)} className={inputClass}
                 placeholder="Fuel burn rate" autoFocus />
        </Field>
        <FSelect label="Unit" value={unit} onChange={setUnit} placeholder="none"
                 options={units.map(u => ({ value: u, label: u }))} />
      </div>

      {parameterName && (
        <p className="font-mono text-[10px] text-neutral-400">
          stored as <span className="text-neutral-600">{parameterName}</span>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <FSelect label="Type" value={dataType} onChange={setDataType} options={DATA_TYPES} />
        <FSelect label="How it is captured" value={mode} onChange={setMode} options={CAPTURE_MODES} />
      </div>

      {mode === "CAPTURED" ? (
        <FSelect label="How often" value={frequency} onChange={setFrequency}
                 options={FREQUENCIES.map(f => ({ value: f, label: f }))} />
      ) : (
        <Field label="Value" hint={mode === "CONSTANT" ? "the nameplate figure" : "printed in the workbook"}>
          <input value={value} onChange={e => setValue(e.target.value)} className={inputClass}
                 placeholder={mode === "CONSTANT" ? "150" : "NA"} />
        </Field>
      )}

      <FSelect label="Role" value={role} onChange={setRole}
               placeholder="none — most readings need no role"
               options={ROLES.map(r => ({ value: r, label: r }))} />
      <p className="text-[10px] leading-relaxed text-neutral-400">
        A role is how a calculation finds this reading without matching on its
        name. Fuel consumption looks for <span className="font-mono">FUEL_BURN_RATE</span>;
        PUE looks for <span className="font-mono">UPS_OUTPUT_KW</span> and the
        rectifier pair. Leave it blank unless the platform has to compute
        something from this reading.
      </p>

      <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-3">
        <button onClick={() => setOpen(false)}
          className="rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-wider text-neutral-400 hover:text-neutral-700">
          Cancel
        </button>
        <button onClick={save} disabled={busy || !label.trim()}
          className="flex items-center gap-1.5 rounded-xl bg-neutral-900 px-4 py-2 text-[11px] font-black uppercase tracking-wider text-white transition-colors hover:bg-neutral-700 disabled:bg-neutral-200 disabled:text-neutral-400">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Add
        </button>
      </div>
    </div>
  );
}
