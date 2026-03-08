# Tuning Presets

The Tuning tab provides one-click presets and fine-tuning controls for vehicle behavior. Instead of adjusting individual parameters, you can select a skill level or mission type and ArduDeck sets multiple parameters at once.

## Skill Level Presets

| Preset | Description |
|--------|-------------|
| Beginner | Conservative settings. Low tilt angles, slow rates, gentle response. Good for learning |
| Intermediate | Balanced performance. Moderate agility and speed |
| Expert | Aggressive settings. High rates, fast response. For experienced pilots |

Each preset adjusts max tilt angle, acro rates, navigation speed, and other related parameters.

## Mission Type Presets

| Preset | Description |
|--------|-------------|
| Mapping | Slow, stable flight optimized for camera overlap and consistent altitude |
| Surveillance | Smooth loiter and tracking behavior |
| Sport | Fast, responsive flying for FPV and sport use |
| Cinematic | Very smooth movements for video work |

## Current Settings Overview

A summary card shows your current configuration at a glance:

| Metric | What It Shows |
|--------|---------------|
| Responsiveness | Max tilt angle in degrees |
| Acro Rates | Roll/Pitch and Yaw rates in deg/s |
| Navigation Speed | Waypoint and loiter speeds in m/s |

## Fine Tuning

Sliders for manual adjustment of individual values:

- **Max Tilt Angle** (15-80 degrees) -- Maximum lean angle in stabilized modes
- **Loiter Speed** (2.5-20 m/s) -- Speed during loiter and position hold
- **Waypoint Speed** (1-20 m/s) -- Speed between waypoints in Auto mode
- **Acro Roll/Pitch Rate** (45-720 deg/s) -- Maximum rotation rate in Acro mode

## AutoTune

For the best results, use the AutoTune flight mode on your vehicle. AutoTune adjusts PID gains in flight based on actual vehicle response, which is more accurate than any preset. See [[PID Tuning]] for more details.