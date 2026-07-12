import { Zap } from "lucide-react";
import { AccordionSection, FInput } from "@/shared/ui";

interface GridSectionProps {
  isOpen: boolean;
  onToggle: () => void;
  formData: Record<string, any>;
  handleInputChange: (id: string, value: any) => void;
}

export function GridSection({ isOpen, onToggle, formData, handleInputChange }: GridSectionProps) {
  return (
    <AccordionSection
      title="ZESCO Mains"
      icon={<Zap size={14} />}
      isOpen={isOpen}
      onToggle={onToggle}
    >
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
  );
}
