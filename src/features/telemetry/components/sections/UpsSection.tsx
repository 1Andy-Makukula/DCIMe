import { Shield } from "lucide-react";
import { AccordionSection, FInput } from "@/shared/ui";

interface UpsSectionProps {
  isOpen: boolean;
  onToggle: () => void;
  upsTab: "ups1" | "ups2";
  setUpsTab: (tab: "ups1" | "ups2") => void;
  formData: Record<string, any>;
  handleInputChange: (id: string, value: any) => void;
}

export function UpsSection({ isOpen, onToggle, upsTab, setUpsTab, formData, handleInputChange }: UpsSectionProps) {
  return (
    <AccordionSection
      title="UPS Units"
      icon={<Shield size={14} />}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="mt-2">
        <div className="flex bg-gray-200 rounded-xl p-1 mb-4">
          {(["ups1", "ups2"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setUpsTab(tab)}
              className="flex-1 py-2 rounded-lg text-[12px] font-black transition-all"
              style={upsTab === tab ? { backgroundColor: "#FF0000", color: "white" } : { color: "#aaa" }}
            >
              {tab === "ups1" ? "UPS 1" : "UPS 2"}
            </button>
          ))}
        </div>

        <div className="text-[9px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2">
          Phase Readings — {upsTab === "ups1" ? "UPS 1" : "UPS 2"}
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="text-[9px] font-black text-gray-400 uppercase text-center tracking-wider">Phase</div>
          <div className="text-[9px] font-black text-gray-400 uppercase text-center tracking-wider">Volts</div>
          <div className="text-[9px] font-black text-gray-400 uppercase text-center tracking-wider">Amps</div>
          {["L1", "L2", "L3"].map((ph) => {
            const prefix = upsTab === "ups1" ? "ups_1" : "ups_2";
            const suffix = ph === "L1" ? "a" : ph === "L2" ? "b" : "c";
            const voltsKey = `${prefix}_output_voltage_${suffix}`;
            const ampsKey = `${prefix}_load_amps_${suffix}`;
            return (
              <div key={ph} className="contents">
                <div className="flex items-center justify-center py-2.5 rounded-xl bg-gray-100 text-[12px] font-black text-gray-600">
                  {ph}
                </div>
                <input
                  className="px-2 py-2.5 rounded-xl bg-white border-2 border-gray-100 text-[12px] font-semibold text-center text-gray-900 outline-none focus:border-red-400 transition-all"
                  placeholder="0.0"
                  value={formData[voltsKey] || ""}
                  onChange={(e) => handleInputChange(voltsKey, e.target.value)}
                />
                <input
                  className="px-2 py-2.5 rounded-xl bg-white border-2 border-gray-100 text-[12px] font-semibold text-center text-gray-900 outline-none focus:border-red-400 transition-all"
                  placeholder="0"
                  value={formData[ampsKey] || ""}
                  onChange={(e) => handleInputChange(ampsKey, e.target.value)}
                />
              </div>
            );
          })}
        </div>

        {(() => {
          const prefix = upsTab === "ups1" ? "ups_1" : "ups_2";
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FInput
                label="Battery VDC"
                placeholder="215"
                unit="V"
                value={formData[`${prefix}_battery_voltage`] || ''}
                onChange={(val) => handleInputChange(`${prefix}_battery_voltage`, val)}
              />
              <FInput
                label="Charge %"
                placeholder="100"
                unit="%"
                value={formData[`${prefix}_battery_charge_percent`] || ''}
                onChange={(val) => handleInputChange(`${prefix}_battery_charge_percent`, val)}
              />
              <FInput
                label="Capacity Used"
                placeholder="0"
                unit="%"
                value={formData[`${prefix}_used_capacity`] || ''}
                onChange={(val) => handleInputChange(`${prefix}_used_capacity`, val)}
              />
              <FInput
                label="Load KW"
                placeholder="0.0"
                unit="KW"
                value={formData[`${prefix}_output_load_kw`] || ''}
                onChange={(val) => handleInputChange(`${prefix}_output_load_kw`, val)}
              />
            </div>
          );
        })()}
      </div>
    </AccordionSection>
  );
}
