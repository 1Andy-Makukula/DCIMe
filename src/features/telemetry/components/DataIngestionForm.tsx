import { useState } from "react";
import { CheckCircle } from "lucide-react";
import { PowerSource, AccordionKey } from "@/shared/types";
import { GridSection } from "./sections/GridSection";
import { GeneratorSection } from "./sections/GeneratorSection";
import { RectifierSection } from "./sections/RectifierSection";
import { UpsSection } from "./sections/UpsSection";
import { EnvironmentSection } from "./sections/EnvironmentSection";

export interface DataIngestionFormProps {
  onBack: () => void;
  onSubmit: () => void;
  formData: Record<string, any>;
  handleInputChange: (id: string, value: any) => void;
}

export function DataIngestionForm({ onBack, onSubmit, formData, handleInputChange }: DataIngestionFormProps) {
  const powerSource: PowerSource = formData['grid_status'] === 'OFF' ? 'generator' : 'mains';
  const [open, setOpen] = useState<Record<AccordionKey, boolean>>({
    zesco: true,
    rectifier: false,
    ups: false,
    env: false,
  });
  const [upsTab, setUpsTab] = useState<"ups1" | "ups2">("ups1");

  const toggle = (key: AccordionKey) => setOpen((prev: Record<AccordionKey, boolean>) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="min-h-screen flex items-center justify-center p-0 md:p-4" style={{ backgroundColor: "#0C0D0D" }}>
      <div
        className="w-full h-screen md:h-auto max-h-screen md:max-h-[calc(100vh-32px)] max-w-full md:max-w-2xl lg:max-w-3xl bg-white rounded-none md:rounded-[28px] overflow-hidden flex flex-col"
        style={{ boxShadow: "0 32px 80px rgba(0,0,0,0.9)" }}
      >
        {/* Top Bar */}
        <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-black text-[15px] text-gray-900">Shift Report</div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.12em] mt-0.5 font-mono">
                NTC ZM 0874 · {new Date().toLocaleDateString("en-GB")} · {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors">
                Save Draft
              </button>
              <button
                onClick={onBack}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-red-200 hover:bg-red-50 transition-colors"
                style={{ color: "#FF0000" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>

        {/* Power Source Toggle */}
        <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="text-[9px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2">Power Source</div>
          <div className="flex bg-gray-100 rounded-xl p-1">
            {(["mains", "generator"] as const).map((src) => (
              <button
                key={src}
                onClick={() => handleInputChange('grid_status', src === 'mains' ? 'ON' : 'OFF')}
                className="flex-1 py-2.5 rounded-lg text-[12px] font-black uppercase tracking-[0.06em] transition-all"
                style={
                  powerSource === src
                    ? {
                        backgroundColor: src === "mains" ? "#19C853" : "#FF0000",
                        color: "white",
                      }
                    : { color: "#bbb" }
                }
              >
                {src === "mains" ? "ZESCO MAINS" : "GENERATOR"}
              </button>
            ))}
          </div>
        </div>

        {/* Accordion Sections */}
        <div className="overflow-y-auto flex-1">
          <GridSection
            isOpen={open.zesco}
            onToggle={() => toggle("zesco")}
            formData={formData}
            handleInputChange={handleInputChange}
          />

          {powerSource === "generator" && (
            <GeneratorSection
              isOpen={open.zesco}
              onToggle={() => toggle("zesco")}
              formData={formData}
              handleInputChange={handleInputChange}
            />
          )}

          <RectifierSection
            isOpen={open.rectifier}
            onToggle={() => toggle("rectifier")}
            formData={formData}
            handleInputChange={handleInputChange}
          />

          <UpsSection
            isOpen={open.ups}
            onToggle={() => toggle("ups")}
            upsTab={upsTab}
            setUpsTab={setUpsTab}
            formData={formData}
            handleInputChange={handleInputChange}
          />

          <EnvironmentSection
            isOpen={open.env}
            onToggle={() => toggle("env")}
            formData={formData}
            handleInputChange={handleInputChange}
          />
        </div>

        {/* Submit */}
        <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0 bg-white">
          <button
            onClick={onSubmit}
            className="w-full py-4 rounded-2xl font-black text-white text-[14px] tracking-[0.06em] uppercase flex items-center justify-center gap-2.5 transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ backgroundColor: "#19C853" }}
          >
            <CheckCircle size={20} strokeWidth={3} /> SUBMIT TELEMETRY
          </button>
        </div>
      </div>
    </div>
  );
}
