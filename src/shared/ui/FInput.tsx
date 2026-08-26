
export interface FInputProps {
  label: string;
  placeholder: string;
  unit?: string;
  value?: string | number;
  onChange?: (val: string) => void;
}

export function FInput({ label, placeholder, unit, value, onChange }: FInputProps) {
  return (
    <div>
      <label className="block text-[9px] font-black text-neutral-400 uppercase tracking-[0.12em] mb-1">{label}</label>
      <div className="relative">
        <input
          className="w-full px-3 py-2.5 rounded-xl bg-white border-2 border-neutral-100 text-[12px] font-semibold text-neutral-900 outline-none focus:border-brand-400 transition-all"
          placeholder={placeholder}
          value={value ?? ""}
          onChange={(e) => onChange && onChange(e.target.value)}
          style={{ paddingRight: unit ? "2.5rem" : undefined }}
        />
        {unit && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-neutral-300">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
