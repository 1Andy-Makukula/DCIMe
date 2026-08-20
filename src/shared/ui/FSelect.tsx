import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// The dropdown. One implementation, one appearance.
//
// The app had two and neither was right. Eight raw <select> elements rendered
// with whatever chrome the operating system supplies — different on Windows,
// macOS, Android and iOS, and impossible to match to the rest of the forms.
// The other four used the shadcn trigger, whose `bg-input-background` token is
// #1A1C1C: a near-black control dropped into a white form, the same class of
// mistake as the white-on-white input text.
//
// This is a listbox rather than a native control, so it looks identical on
// every platform and can carry a description per option. It keeps the parts of
// a native select that matter: keyboard navigation, type-ahead, and a hit area
// big enough for a thumb.
//
// Styling comes from the same tokens as FInput, so a field and a dropdown sat
// next to each other read as one family.
// ─────────────────────────────────────────────────────────────────────────────

export interface FSelectOption<T extends string = string> {
  value: T;
  label: string;
  /** Optional second line in the panel, e.g. an SLA target. */
  hint?: string;
}

export interface FSelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: FSelectOption<T>[];
  /** Small caps label above the control, matching FInput. */
  label?: string;
  /** Shown when nothing is selected. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Accessible name when no visible label is given. */
  ariaLabel?: string;
  /**
   * Overrides the generated id. Needed when an EXTERNAL <label htmlFor> points
   * at this control — replacing a native <select> silently orphaned those
   * labels, so clicking them did nothing and screen readers lost the pairing.
   */
  id?: string;
  /** Marks the control required for assistive technology. */
  required?: boolean;
}

export function FSelect<T extends string = string>({
  value, onChange, options, label, placeholder = "Select...",
  disabled = false, className = "", ariaLabel, id: idProp, required = false
}: FSelectProps<T>) {
  const [open, setOpen]     = useState(false);
  const [active, setActive] = useState(0);
  const rootRef             = useRef<HTMLDivElement>(null);
  const listRef             = useRef<HTMLDivElement>(null);
  const autoId              = useId();
  const id                  = idProp ?? autoId;

  const selectedIndex = options.findIndex(o => o.value === value);
  const selected      = selectedIndex >= 0 ? options[selectedIndex] : null;

  // Opening starts from the current selection, not the top of the list.
  useEffect(() => {
    if (open) setActive(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // Capture phase: a stopPropagation deeper in the tree would otherwise leave
    // the panel stuck open.
    document.addEventListener("mousedown", onPointer, true);
    return () => document.removeEventListener("mousedown", onPointer, true);
  }, [open]);

  // Keeps the highlighted row inside the scroll box during keyboard use.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const commit = (i: number) => {
    const opt = options[i];
    if (!opt) return;
    onChange(opt.value);
    setOpen(false);
  };

  // Type-ahead: typing "g" jumps to Generator, as a native select would.
  const typed = useRef({ buffer: "", at: 0 });
  const onType = (key: string) => {
    const now = Date.now();
    typed.current.buffer = now - typed.current.at > 800 ? key : typed.current.buffer + key;
    typed.current.at = now;
    const i = options.findIndex(o =>
      o.label.toLowerCase().startsWith(typed.current.buffer.toLowerCase()));
    if (i >= 0) { setActive(i); if (!open) commit(i); }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) { setOpen(true); break; }
        setActive(a => Math.min(a + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) { setOpen(true); break; }
        setActive(a => Math.max(a - 1, 0));
        break;
      case "Home": if (open) { e.preventDefault(); setActive(0); } break;
      case "End":  if (open) { e.preventDefault(); setActive(options.length - 1); } break;
      case "Enter":
      case " ":
        e.preventDefault();
        open ? commit(active) : setOpen(true);
        break;
      case "Escape":
        if (open) { e.preventDefault(); setOpen(false); }
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) onType(e.key);
    }
  };

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={id}
          className="mb-1 block text-[9px] font-black uppercase tracking-[0.12em] text-gray-400"
        >
          {label}
        </label>
      )}

      <div ref={rootRef} className="relative">
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={label ? undefined : ariaLabel}
          aria-required={required || undefined}
          // On the combobox, not the listbox: this is the element that holds
          // focus, and assistive technology reads the active option from the
          // focused element.
          aria-controls={open ? `${id}-listbox` : undefined}
          aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
          disabled={disabled}
          onClick={() => setOpen(o => !o)}
          onKeyDown={onKeyDown}
          className={[
            "flex w-full items-center justify-between gap-2 rounded-xl border-2 bg-white px-3 py-2.5 text-left text-[12px] font-semibold transition-all outline-none",
            disabled
              ? "cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300"
              : open
                ? "border-brand-400 text-gray-900"
                : "border-gray-100 text-gray-900 hover:border-gray-200"
          ].join(" ")}
        >
          <span className={`truncate ${selected ? "" : "text-gray-400"}`}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown
            size={14}
            className={`shrink-0 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && (
          <div
            ref={listRef}
            id={`${id}-listbox`}
            role="listbox"
            className="absolute z-[var(--z-popover)] mt-1.5 max-h-64 w-full overflow-y-auto rounded-2xl border border-gray-200 bg-white p-1 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.3)]"
          >
            {options.length === 0 && (
              <p className="px-3 py-2.5 text-[11px] font-semibold text-gray-400">
                Nothing to choose from
              </p>
            )}
            {options.map((o, i) => {
              const isSelected = o.value === value;
              return (
                <div
                  key={o.value}
                  id={`${id}-opt-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => commit(i)}
                  className={[
                    "flex cursor-pointer items-start gap-2 rounded-xl px-3 py-2.5 transition-colors",
                    i === active ? "bg-brand-50" : ""
                  ].join(" ")}
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[12px] ${isSelected ? "font-black text-gray-900" : "font-semibold text-gray-700"}`}>
                      {o.label}
                    </span>
                    {o.hint && (
                      <span className="mt-0.5 block text-[10px] font-medium leading-snug text-gray-400">
                        {o.hint}
                      </span>
                    )}
                  </span>
                  {isSelected && <Check size={14} className="mt-0.5 shrink-0 text-brand-500" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
