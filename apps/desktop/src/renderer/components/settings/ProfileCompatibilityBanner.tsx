import type { VehicleType } from '../../stores/settings-store';

export function ProfileCompatibilityBanner({
  profileType,
  fcVariant,
  boardId,
  supportedTypes,
  onCreateNewProfile,
}: {
  profileType: VehicleType;
  fcVariant: string;
  boardId?: string;
  supportedTypes: VehicleType[];
  onCreateNewProfile: (type: VehicleType) => void;
}) {
  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-4">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div className="flex-1">
          <p className="text-sm text-amber-300 font-medium">Profile Incompatible</p>
          <p className="text-xs text-amber-300/70 mt-1">
            Your profile is set to <strong>{profileType}</strong> but {fcVariant} only supports:{' '}
            {supportedTypes.join(', ')}.
          </p>
          <div className="flex gap-2 mt-3">
            {supportedTypes.map((type) => (
              <button
                key={type}
                onClick={() => onCreateNewProfile(type)}
                className="px-3 py-1.5 text-xs bg-amber-600/80 hover:bg-amber-500/80 text-white rounded-lg font-medium transition-colors"
              >
                Create {type} profile
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
