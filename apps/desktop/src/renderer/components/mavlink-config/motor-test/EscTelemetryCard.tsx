/**
 * EscTelemetryCard — live per-motor monitoring.
 *
 * Always shows the FC's PWM output to each motor (from SERVO_OUTPUT_RAW).
 * When ESC telemetry is also available (DShot + BLHeli_32 with telemetry
 * wire connected), additionally shows RPM, temp, voltage, and current.
 */

import React from 'react';
import { Thermometer } from 'lucide-react';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { testOrderToLabel } from './motor-layout-utils';
import type { FrameLayout } from '../../../../shared/motor-test-types';

interface EscTelemetryCardProps {
  layout: FrameLayout;
}

function tempColor(tempC: number): string {
  if (tempC === 0) return 'text-gray-500';
  if (tempC < 70) return 'text-emerald-400';
  if (tempC < 90) return 'text-amber-400';
  return 'text-red-400';
}

/**
 * Map a PWM µs value (1000-2000) to a 0-100% color band.
 * Idle ≈ 1000 = gray, mid = blue, high = yellow→red.
 */
function pwmColor(pwm: number): string {
  if (pwm < 1050) return 'text-gray-500';
  if (pwm < 1300) return 'text-blue-400';
  if (pwm < 1600) return 'text-cyan-400';
  if (pwm < 1800) return 'text-amber-400';
  return 'text-red-400';
}

export const EscTelemetryCard: React.FC<EscTelemetryCardProps> = ({ layout }) => {
  const escTelemetry = useTelemetryStore((s) => s.escTelemetry);
  const lastEscTelemetry = useTelemetryStore((s) => s.lastEscTelemetry);
  const servoOutput = useTelemetryStore((s) => s.servoOutput);
  const lastServoOutput = useTelemetryStore((s) => s.lastServoOutput);

  const escStale = lastEscTelemetry === 0 || Date.now() - lastEscTelemetry > 3000;
  const hasAnyEsc = escTelemetry?.motors.some((m) => m !== undefined) ?? false;
  const hasServoOutput = lastServoOutput > 0 && Date.now() - lastServoOutput < 3000;

  return (
    <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
          <Thermometer className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-200">Motor Outputs</div>
          <div className="text-[11px] text-gray-500">
            {hasAnyEsc ? 'ESC telemetry · PWM · RPM · temp · V · A' : 'PWM output (no ESC telemetry)'}
          </div>
        </div>
      </div>

      {escStale && !hasAnyEsc && (
        <div className="text-[11px] text-gray-500 italic mb-3 leading-snug">
          ESC telemetry not available. Requires BLHeli_32 ESCs with the telemetry wire connected
          to a UART (SERVO_BLH_AUTO=1, SERIALn_PROTOCOL=16). PWM values below come from the FC.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {layout.motors
          .slice()
          .sort((a, b) => a.Number - b.Number)
          .map((m) => {
            const data = escTelemetry?.motors[m.Number - 1];
            const pwm = servoOutput?.outputs[m.Number - 1];
            const hasPwm = pwm !== undefined && pwm > 0;

            return (
              <div
                key={m.Number}
                className="bg-gray-900/40 rounded-lg p-3 border border-gray-700/20"
              >
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-xs font-mono font-semibold text-gray-300">
                    M{m.Number}
                    <span className="text-gray-500 ml-1">{testOrderToLabel(m.TestOrder)}</span>
                  </div>
                  <div className="text-[9px] uppercase tracking-wider text-gray-600">
                    {m.Rotation}
                  </div>
                </div>

                <div className="space-y-1">
                  {/* PWM is always shown when available */}
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] text-gray-500">PWM</span>
                    <span className={`text-sm font-mono font-semibold ${hasPwm ? pwmColor(pwm) : 'text-gray-600'}`}>
                      {hasPwm ? `${pwm}` : '—'}
                      {hasPwm && <span className="text-[9px] text-gray-600 ml-0.5">µs</span>}
                    </span>
                  </div>

                  {data ? (
                    <>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] text-gray-500">RPM</span>
                        <span className="text-sm font-mono font-semibold text-amber-400">
                          {data.rpm}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] text-gray-500">Temp</span>
                        <span className={`text-sm font-mono font-semibold ${tempColor(data.tempC)}`}>
                          {data.tempC}°C
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] text-gray-500">V / A</span>
                        <span className="text-xs font-mono text-gray-300">
                          {data.voltageV.toFixed(1)} / {data.currentA.toFixed(1)}
                        </span>
                      </div>
                    </>
                  ) : !hasPwm && !hasServoOutput ? (
                    <div className="text-[10px] text-gray-600 italic text-center py-2">
                      no data
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};
