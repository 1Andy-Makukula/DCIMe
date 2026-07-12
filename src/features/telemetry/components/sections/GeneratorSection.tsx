import { Zap } from "lucide-react";
import { AccordionSection, FInput } from "@/shared/ui";

interface GeneratorSectionProps {
  isOpen: boolean;
  onToggle: () => void;
  formData: Record<string, any>;
  handleInputChange: (id: string, value: any) => void;
}

export function GeneratorSection({ isOpen, onToggle, formData, handleInputChange }: GeneratorSectionProps) {
  return (
    <AccordionSection
      title="Generator Readings"
      icon={<Zap size={14} />}
      isOpen={isOpen}
      onToggle={onToggle}
    >
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
          value={formData['dg_load_amps_r'] || ''}
          onChange={(val) => {
            handleInputChange('dg_load_amps_r', val);
            handleInputChange('dg_load_amps_y', val);
            handleInputChange('dg_load_amps_b', val);
          }}
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
  );
}
