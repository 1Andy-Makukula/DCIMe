import { Thermometer } from "lucide-react";
import { AccordionSection, FInput } from "@/shared/ui";

interface EnvironmentSectionProps {
  isOpen: boolean;
  onToggle: () => void;
  formData: Record<string, any>;
  handleInputChange: (id: string, value: any) => void;
}

export function EnvironmentSection({ isOpen, onToggle, formData, handleInputChange }: EnvironmentSectionProps) {
  return (
    <AccordionSection
      title="Environment"
      icon={<Thermometer size={14} />}
      isOpen={isOpen}
      onToggle={onToggle}
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
  );
}
