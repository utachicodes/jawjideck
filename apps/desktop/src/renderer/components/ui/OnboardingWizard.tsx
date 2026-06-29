import { useState } from 'react';
import type { ExperienceLevel, VehicleType } from '../../stores/settings-store';
import { VEHICLE_ICONS, VEHICLE_TYPE_NAMES, VEHICLE_TYPE_ORDER } from '../../lib/vehicle-icons';
import { ExperienceLevelCards } from './ExperienceLevelDialog';

interface OnboardingWizardProps {
  onVehicleTypeSelect: (type: VehicleType) => void;
  onExperienceSelect: (level: ExperienceLevel) => void;
}

// First-run wizard: pick your drone type, then your experience level.
// Replaces the old behavior of silently defaulting to a placeholder quad profile.
export function OnboardingWizard({ onVehicleTypeSelect, onExperienceSelect }: OnboardingWizardProps) {
  const [step, setStep] = useState<'vehicle' | 'experience'>('vehicle');

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-surface-input rounded-2xl border border-subtle w-full max-w-2xl mx-4 shadow-2xl overflow-hidden">
        {/* Step progress */}
        <div className="flex items-center justify-center gap-2 pt-5">
          <div className={`h-1.5 w-8 rounded-full ${step === 'vehicle' ? 'bg-blue-500' : 'bg-blue-500/40'}`} />
          <div className={`h-1.5 w-8 rounded-full ${step === 'experience' ? 'bg-blue-500' : 'bg-surface-raised'}`} />
        </div>

        {step === 'vehicle' ? (
          <>
            <div className="px-6 pt-4 pb-2 text-center">
              <h2 className="text-lg font-semibold text-content">What are you flying?</h2>
              <p className="text-sm text-content-secondary mt-1">
                This sets up sensible defaults for your vehicle — you can fine-tune everything later in Settings.
              </p>
            </div>

            <div className="p-6 grid grid-cols-3 gap-3">
              {VEHICLE_TYPE_ORDER.map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    onVehicleTypeSelect(type);
                    setStep('experience');
                  }}
                  className="group flex flex-col items-center gap-2 p-4 rounded-xl border border-subtle bg-surface hover:border-blue-500/50 hover:bg-blue-500/5 transition-all duration-200 cursor-pointer"
                >
                  <div className="w-16 h-16 text-content-secondary group-hover:text-blue-400 transition-colors">
                    {VEHICLE_ICONS[type]}
                  </div>
                  <span className="text-sm font-medium text-content">{VEHICLE_TYPE_NAMES[type]}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="px-6 pt-4 pb-2 text-center">
              <h2 className="text-lg font-semibold text-content">One more thing</h2>
              <p className="text-sm text-content-secondary mt-1">
                Choose your experience level to tailor the interface
              </p>
            </div>

            <div className="p-6">
              <ExperienceLevelCards onSelect={onExperienceSelect} />
            </div>

            <div className="px-6 pb-5 text-center">
              <p className="text-[11px] text-content-tertiary">
                You can change this anytime in Settings
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
