import { Cpu } from "lucide-react";
import { AccordionSection, FInput } from "@/shared/ui";

interface RectifierSectionProps {
  isOpen: boolean;
  onToggle: () => void;
  formData: Record<string, any>;
  handleInputChange: (id: string, value: any) => void;
}

export function RectifierSection({ isOpen, onToggle, formData, handleInputChange }: RectifierSectionProps) {
  return (
    <AccordionSection
      title="Vertiv Rectifiers"
      icon={<Cpu size={14} />}
      isOpen={isOpen}
      onToggle={onToggle}
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
  );
}
