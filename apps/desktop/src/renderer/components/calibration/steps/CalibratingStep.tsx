/**
 * CalibratingStep - Active calibration display
 *
 * Shows progress, countdown timer, and position indicators during calibration.
 */

import { useCalibrationStore } from '../../../stores/calibration-store';
import { CALIBRATION_TYPES, ACCEL_6POINT_POSITIONS } from '../../../../shared/calibration-types';
import { CalibrationProgress } from '../shared/CalibrationProgress';
import { PositionDiagram } from '../shared/PositionDiagram';
import { CountdownTimer } from '../shared/CountdownTimer';

export function CalibratingStep() {
  const {
    calibrationType,
    progress,
    statusText,
    currentPosition,
    positionStatus,
    countdown,
    compassProgress,
    isFinalizing,
    confirmPosition,
    cancelCalibration,
  } = useCalibrationStore();

  const calTypeInfo = calibrationType
    ? CALIBRATION_TYPES.find((t) => t.id === calibrationType)
    : null;

  if (!calibrationType || !calTypeInfo) {
    return null;
  }

  // For 6-point calibration, only show the confirm button when:
  //  1. It's a 6-point cal
  //  2. Not finalizing (all positions captured)
  //  3. Current position hasn't been confirmed yet
  //  4. FC has actually requested a position (statusText switches from
  //     "Waiting for flight controller..." to "Place vehicle ...")
  // Without check 4, the user can click "Position Ready" before AP's
  // AccelCal enters WAITING_FOR_ORIENTATION, and AP rejects with FAILED.
  const fcHasRequestedPosition = statusText.startsWith('Place vehicle');
  const isWaitingForConfirm = calibrationType === 'accel-6point' && !isFinalizing && !positionStatus[currentPosition] && fcHasRequestedPosition;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Calibration type header */}
      <div className="text-center">
        <h3 className="text-2xl font-semibold text-white mb-2">
          {calTypeInfo.name}
        </h3>
        <p className="text-gray-400">{statusText}</p>
      </div>

      {/* Main progress display */}
      <div className="flex justify-center py-8">
        {/* Countdown timer for timed calibrations */}
        {(calibrationType === 'compass' || calibrationType === 'opflow') && (
          <CountdownTimer seconds={countdown} total={calTypeInfo.estimatedDuration} />
        )}

        {/* Circular progress for simple calibrations */}
        {(calibrationType === 'accel-level' || calibrationType === 'gyro') && (
          <CalibrationProgress progress={progress} />
        )}

        {/* 6-point position display */}
        {calibrationType === 'accel-6point' && (
          <div className="w-full space-y-6">
            {/* Position diagram (hidden once finalizing — all 6 captured) */}
            {!isFinalizing && (
              <div className="flex justify-center">
                <PositionDiagram position={currentPosition} isActive={true} />
              </div>
            )}

            {/* Finalizing spinner */}
            {isFinalizing && (
              <div className="flex flex-col items-center justify-center py-6 gap-4">
                <svg className="w-12 h-12 animate-spin text-cyan-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="text-sm text-gray-400">Writing calibration to flight controller…</p>
              </div>
            )}

            {/* Position progress indicators */}
            <div className="flex justify-center gap-3">
              {positionStatus.map((done, index) => (
                <div
                  key={index}
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                    done
                      ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                      : index === currentPosition && !isFinalizing
                        ? 'bg-cyan-500/20 text-cyan-400 border-2 border-cyan-500 animate-pulse'
                        : 'bg-gray-800 text-gray-500 border border-gray-700'
                  }`}
                  title={ACCEL_6POINT_POSITIONS[index]}
                >
                  {done ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
              ))}
            </div>

            {/* Position name (suppressed during finalize) */}
            {!isFinalizing && (
              <p className="text-center text-lg text-white">
                Position {currentPosition + 1}: <span className="text-cyan-400">{ACCEL_6POINT_POSITIONS[currentPosition]}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Multi-compass progress (MAVLink) */}
      {compassProgress.length > 0 && (
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <h4 className="text-sm font-medium text-gray-300 mb-3">Compass Progress</h4>
          <div className="space-y-2">
            {compassProgress.map((prog, index) => (
              <div key={index} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-20">Compass {index + 1}</span>
                <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 transition-all duration-300"
                    style={{ width: `${prog}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 w-10 text-right">{prog}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress bar for overall progress */}
      {calibrationType !== 'accel-6point' && (
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-400">Progress</span>
            <span className="text-cyan-400">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-center gap-4 pt-4">
        {/* Confirm position button for 6-point */}
        {isWaitingForConfirm && (
          <button
            onClick={confirmPosition}
            className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Position Ready
          </button>
        )}

        {/* Cancel button — hidden during the finalize wait so the user
            can't abort an in-progress flash write to the FC */}
        {!isFinalizing && (
          <button
            onClick={cancelCalibration}
            className="px-4 py-2.5 bg-gray-700 hover:bg-red-500/20 hover:text-red-400 rounded-lg text-gray-400 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Cancel
          </button>
        )}
      </div>

      {/* Instructions reminder */}
      <p className="text-center text-xs text-gray-500">
        {calibrationType === 'compass' && 'Keep rotating your vehicle in all directions...'}
        {calibrationType === 'accel-level' && 'Keep your vehicle still on the level surface...'}
        {calibrationType === 'accel-6point' && !isFinalizing && 'Hold the position steady, then click "Position Ready"'}
        {calibrationType === 'accel-6point' && isFinalizing && 'Please wait — do not disconnect the flight controller'}
        {calibrationType === 'gyro' && 'Keep your vehicle completely still...'}
        {calibrationType === 'opflow' && 'Hold steady over the textured surface...'}
      </p>
    </div>
  );
}
