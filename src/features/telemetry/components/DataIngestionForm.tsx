import { useState } from "react";
import { Zap, Cpu, Shield, Thermometer, CheckCircle } from "lucide-react";
import { AccordionSection, FInput } from "@/shared/ui";
import { PowerSource, AccordionKey } from "@/shared/types";

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
          <AccordionSection
            title="ZESCO Mains"
            icon={<Zap size={14} />}
            isOpen={open.zesco}
            onToggle={() => toggle("zesco")}
          >
            {/* 1 column on phone, 2 columns on tablets/PCs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              <FInput
                label="Load Voltage"
                placeholder="230"
                unit="V"
                value={formData['grid_voltage_r'] || ''}
                onChange={(val) => handleInputChange('grid_voltage_r', val)}
              />
              <FInput
                label="Load Current"
                placeholder="98"
                unit="A"
                value={formData['grid_amps_r'] || ''}
                onChange={(val) => handleInputChange('grid_amps_r', val)}
              />
              <FInput
                label="Total KW"
                placeholder="476"
                unit="KW"
                value={formData['grid_total_site_load'] || ''}
                onChange={(val) => handleInputChange('grid_total_site_load', val)}
              />
              <FInput
                label="Power Factor"
                placeholder="0.98"
                unit="PF"
                value={formData['grid_power_factor'] || ''}
                onChange={(val) => handleInputChange('grid_power_factor', val)}
              />
            </div>
          </AccordionSection>

          {powerSource === "generator" && (
            <AccordionSection
              title="Generator Readings"
              icon={<Zap size={14} />}
              isOpen={open.zesco}
              onToggle={() => toggle("zesco")}
            >
              {/* 1 column on phone, 2 columns on tablets/PCs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                <FInput
                  label="Gen Voltage"
                  placeholder="230"
                  unit="V"
                  value={formData['dg_1_batt_voltage'] || ''}
                  onChange={(val) => handleInputChange('dg_1_batt_voltage', val)}
                />
                <FInput
                  label="Gen Current"
                  placeholder="120"
                  unit="A"
                  value={formData['dg_1_amps'] || ''}
                  onChange={(val) => handleInputChange('dg_1_amps', val)}
                />
                <FInput
                  label="Fuel Level"
                  placeholder="75"
                  unit="%"
                  value={formData['fuel_balance'] || ''}
                  onChange={(val) => handleInputChange('fuel_balance', val)}
                />
                <FInput
                  label="Run Hours"
                  placeholder="0"
                  unit="hrs"
                  value={formData['dg_1_run_hrs'] || ''}
                  onChange={(val) => handleInputChange('dg_1_run_hrs', val)}
                />
              </div>
            </AccordionSection>
          )}

          <AccordionSection
            title="Vertiv Rectifiers"
            icon={<Cpu size={14} />}
            isOpen={open.rectifier}
            onToggle={() => toggle("rectifier")}
          >
            <div className="space-y-4 mt-2">
              {["Room 1", "Room 2"].map((room, index) => {
                const roomNum = index + 1;
                return (
                  <div key={room}>
                    <div className="text-[9px] font-black text-gray-400 uppercase tracking-[0.15em] mb-2">{room}</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <FInput
                        label="Voltage"
                        placeholder="48.1"
                        unit="V"
                        value={formData[`rectifier_${roomNum}_dc_voltage`] || ''}
                        onChange={(val) => handleInputChange(`rectifier_${roomNum}_dc_voltage`, val)}
                      />
                      <FInput
                        label="Current"
                        placeholder="32"
                        unit="A"
                        value={formData[`rectifier_${roomNum}_amps`] || ''}
                        onChange={(val) => handleInputChange(`rectifier_${roomNum}_amps`, val)}
                      />
                      <FInput
                        label="Load"
                        placeholder="75"
                        unit="%"
                        value={formData[`rectifier_${roomNum}_used_percentage`] || ''}
                        onChange={(val) => handleInputChange(`rectifier_${roomNum}_used_percentage`, val)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </AccordionSection>

          <AccordionSection
            title="UPS Units"
            icon={<Shield size={14} />}
            isOpen={open.ups}
            onToggle={() => toggle("ups")}
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
                  const voltsKey = `${prefix}_${ph.toLowerCase()}_volts`;
                  const ampsKey = `${prefix}_${ph.toLowerCase()}_amps`;
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

          <AccordionSection
            title="Environment"
            icon={<Thermometer size={14} />}
            isOpen={open.env}
            onToggle={() => toggle("env")}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
              <FInput
                label="Main Room"
                placeholder="20.7"
                unit="°C"
                value={formData['server_ambient_temp'] || ''}
                onChange={(val) => handleInputChange('server_ambient_temp', val)}
              />
              <FInput
                label="Power Rm 1"
                placeholder="19.2"
                unit="°C"
                value={formData['pr1_ambient_temp'] || ''}
                onChange={(val) => handleInputChange('pr1_ambient_temp', val)}
              />
              <FInput
                label="Power Rm 2"
                placeholder="21.1"
                unit="°C"
                value={formData['pr2_ambient_temp'] || ''}
                onChange={(val) => handleInputChange('pr2_ambient_temp', val)}
              />
              <FInput
                label="Enterprise 1"
                placeholder="21.3"
                unit="°C"
                value={formData['it1_ambient_temp'] || ''}
                onChange={(val) => handleInputChange('it1_ambient_temp', val)}
              />
              <FInput
                label="Enterprise 2"
                placeholder="20.4"
                unit="°C"
                value={formData['it2_ambient_temp'] || ''}
                onChange={(val) => handleInputChange('it2_ambient_temp', val)}
              />
              <FInput
                label="Humidity"
                placeholder="63"
                unit="%"
                value={formData['server_ambient_humidity'] || ''}
                onChange={(val) => handleInputChange('server_ambient_humidity', val)}
              />
            </div>
          </AccordionSection>
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
