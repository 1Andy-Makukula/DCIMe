
export interface FInputProps {
  label: string;
  placeholder: string;
  unit?: string;
}

export function FInput({ label, placeholder, unit }: FInputProps) {
  return (
    <div>
      <label className="block text-[9px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1">{label}</label>
      <div className="relative">
        <input
          className="w-full px-3 py-2.5 rounded-xl bg-white border-2 border-gray-100 text-[12px] font-semibold text-gray-900 outline-none focus:border-red-400 transition-all"
          placeholder={placeholder}
          style={{ paddingRight: unit ? "2.5rem" : undefined }}
        />
        {unit && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-gray-300">
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
