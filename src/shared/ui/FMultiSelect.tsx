import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Users, X } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Choosing several things, with "all" as a first-class option.
//
// Built alongside FSelect rather than inside it: multi-select needs a different
// trigger (a set of chips, not one value), a different close rule (the panel
// stays open while you pick), and — here — an explicit "everyone" state that
// means something different from "each person individually ticked".
//
// That distinction matters for work: broadcasting a job to the site is not the
// same as offering it to today's roster, because tomorrow's roster differs.
// ─────────────────────────────────────────────────────────────────────────────

export interface FMultiSelectOption {
  value: string;
  label: string;
  hint?: string;
}

export interface FMultiSelectProps {
  /** Empty means "all" when `allowAll` is set, otherwise simply nothing. */
  value: string[];
  onChange: (value: string[]) => void;
  options: FMultiSelectOption[];
  label?: string;
  /** Offers an explicit everyone/broadcast row that clears the selection. */
  allowAll?: boolean;
  allLabel?: string;
  allHint?: string;
  placeholder?: string;
  className?: string;
}

export function FMultiSelect({
  value, onChange, options, label,
  allowAll = false,
  allLabel = "Everyone",
  allHint,
  placeholder = "Select...",
  className = ""
}: FMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();

  // Rows, in the order they are rendered. The "all" row sits at index -1 so it
  // can be reached with ArrowUp from the top of the list.
  const firstIndex = allowAll ? -1 : 0;

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer, true);
    return () => document.removeEventListener("mousedown", onPointer, true);
  }, [open]);

  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  // Matches FSelect, minus the close-on-choose: a multi-select must stay open
  // while several things are picked.
  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) { setOpen(true); setActive(firstIndex); break; }
        setActive(a => Math.min(a + 1, options.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) { setOpen(true); setActive(firstIndex); break; }
        setActive(a => Math.max(a - 1, firstIndex));
        break;
      case "Home": if (open) { e.preventDefault(); setActive(firstIndex); } break;
      case "End":  if (open) { e.preventDefault(); setActive(options.length - 1); } break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (!open) { setOpen(true); setActive(firstIndex); break; }
        if (active === -1) onChange([]);
        else if (options[active]) toggle(options[active].value);
        break;
      case "Escape":
        if (open) { e.preventDefault(); setOpen(false); }
        break;
      case "Backspace":
        // Removes the last chip, the way a tag input behaves.
        if (!open && value.length > 0) onChange(value.slice(0, -1));
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  };

  const isAll = allowAll && value.length === 0;
  const chosen = options.filter(o => value.includes(o.value));

  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={id}
          className="mb-1 block text-[9px] font-black uppercase tracking-[0.12em] text-neutral-400"
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
          aria-controls={open ? `${id}-listbox` : undefined}
          aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
          onClick={() => setOpen(o => !o)}
          onKeyDown={onKeyDown}
          className={[
            "flex w-full items-center justify-between gap-2 rounded-xl border-2 bg-white px-3 py-2 text-left transition-all outline-none",
            open ? "border-brand-400" : "border-neutral-100 hover:border-neutral-200"
          ].join(" ")}
        >
          <span className="flex min-w-0 flex-wrap items-center gap-1 py-0.5">
            {isAll ? (
              <span className="flex items-center gap-1.5 rounded-lg bg-brand-50 px-2 py-1 text-[11px] font-black text-brand-700">
                <Users size={12} /> {allLabel}
              </span>
            ) : chosen.length === 0 ? (
              <span className="text-[12px] font-semibold text-neutral-400">{placeholder}</span>
            ) : (
              chosen.map(o => (
                <span
                  key={o.value}
                  className="flex items-center gap-1 rounded-lg bg-neutral-100 px-2 py-1 text-[11px] font-bold text-neutral-700"
                >
                  {o.label}
                  {/* A span, not a button: nesting a button inside a button is
                      invalid and the inner one stops receiving clicks. */}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${o.label}`}
                    onClick={e => { e.stopPropagation(); toggle(o.value); }}
                    className="cursor-pointer rounded text-neutral-400 hover:text-neutral-700"
                  >
                    <X size={11} />
                  </span>
                </span>
              ))
            )}
          </span>
          <ChevronDown
            size={14}
            className={`shrink-0 text-neutral-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && (
          <div
            ref={listRef}
            id={`${id}-listbox`}
            role="listbox"
            aria-multiselectable="true"
            className="absolute z-[var(--z-popover)] mt-1.5 max-h-64 w-full overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-1 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.3)]"
          >
            {allowAll && (
              <>
                <div
                  id={`${id}-opt--1`}
                  data-index={-1}
                  role="option"
                  aria-selected={isAll}
                  onMouseEnter={() => setActive(-1)}
                  onClick={() => onChange([])}
                  className={`flex cursor-pointer items-start gap-2 rounded-xl px-3 py-2.5 ${active === -1 ? "bg-brand-50" : "hover:bg-brand-50"}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[12px] ${isAll ? "font-black text-neutral-900" : "font-semibold text-neutral-700"}`}>
                      {allLabel}
                    </span>
                    {allHint && (
                      <span className="mt-0.5 block text-[10px] font-medium text-neutral-400">{allHint}</span>
                    )}
                  </span>
                  {isAll && <Check size={14} className="mt-0.5 shrink-0 text-brand-500" />}
                </div>
                <div className="my-1 border-t border-neutral-100" />
              </>
            )}

            {options.length === 0 && (
              <p className="px-3 py-2.5 text-[11px] font-semibold text-neutral-400">
                Nobody to choose from
              </p>
            )}

            {options.map((o, i) => {
              const on = value.includes(o.value);
              return (
                <div
                  key={o.value}
                  id={`${id}-opt-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={on}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => toggle(o.value)}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 ${i === active ? "bg-brand-50" : "hover:bg-brand-50"}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                    on ? "border-brand-500 bg-brand-500 text-white" : "border-neutral-300"
                  }`}>
                    {on && <Check size={11} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[12px] ${on ? "font-black text-neutral-900" : "font-semibold text-neutral-700"}`}>
                      {o.label}
                    </span>
                    {o.hint && (
                      <span className="mt-0.5 block truncate text-[10px] font-medium text-neutral-400">{o.hint}</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
