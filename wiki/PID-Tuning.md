# PID Tuning

The PID Tuning tab lets you adjust proportional, integral, derivative, and feedforward gains for each axis. ArduDeck auto-detects your PID parameter scheme based on firmware version and shows the correct parameters.

## Layout

Three columns: **Roll**, **Pitch**, and **Yaw**. Each column has sliders for available gains.

![TODO: screenshot of PID tuning tab]()

## Gain Types

| Gain | Color | What It Does |
|------|-------|--------------|
| P (Proportional) | Blue | Controls response speed. Higher = snappier response |
| I (Integral) | Green | Keeps the aircraft on target. Higher = more stable hover/hold |
| D (Derivative) | Purple | Dampens oscillation. Higher = smoother stops |
| FF (Feedforward) | Orange | Anticipates stick commands. Available on modern firmware only |

Each slider shows the gain name, current value, and a hint describing its effect.

## PID Schemes

ArduDeck detects the correct parameter scheme automatically:

| Firmware | Parameters | Feedforward |
|----------|-----------|-------------|
| ArduCopter 3.5+ | `ATC_RAT_RLL_P/I/D/FF` | Yes |
| ArduCopter < 3.5 | `RATE_RLL_P/I/D` | No |
| ArduPlane | `RLL2SRV_P/I/D` | No |
| QuadPlane VTOL | `Q_A_RAT_RLL_P/I/D/FF` | Yes |

If the scheme can't be detected, a warning is shown with the option to fetch parameters manually.

## Quick Presets

Click **Quick Presets** to apply a tuning style instantly. Each preset adjusts all PID gains across all axes to a known-good starting point.

## Custom Profiles

Click **My Profiles** to save your current PID values as a named profile. You can load saved profiles later to quickly switch between tuning configurations.

## Tips

- **Start conservative** -- Begin with lower P values and increase until the vehicle responds well without oscillation
- **Use AutoTune** -- For most users, the AutoTune flight mode is the best way to get a good PID tune. Fly in AutoTune mode and the flight controller tunes itself in the air
- **Reset to Defaults** -- The reset button restores factory PID values if you need a clean starting point