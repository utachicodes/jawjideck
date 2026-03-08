# Flight Modes

The Flight Modes tab assigns flight modes to switch positions on your transmitter. ArduPilot supports up to 6 flight mode slots mapped to a single RC channel.

## Mode Channel

Select which RC channel controls flight modes (channels 5-12). Click **Detect** to auto-detect: ArduDeck monitors all AUX channels and highlights the one with movement when you flip your switch.

## View Modes

Toggle between two layouts:

### Simple View (3-position switch)

Shows three slots mapped to Low, Mid, and High switch positions. Each slot has a mode dropdown and a safety indicator. This is the most common setup for 3-position switches.

### Advanced View (6-slot)

Shows all 6 mode slots in a grid. Each slot displays its PWM range (within 900-2100us), a mode dropdown, and whether the slot is currently active. Use this when your transmitter sends distinct PWM values for each position.

![TODO: screenshot of flight modes tab]()

## Live Feedback

When connected, the tab shows:
- A **switch position diagram** with the current position highlighted
- The live PWM value from your mode channel
- A "LIVE" badge on the active slot

## Available Modes

The mode list varies by vehicle type:

**Copter:** Stabilize, AltHold, Loiter, Auto, RTL, Land, PosHold, Brake, Sport, Acro, AutoTune, Guided, FlowHold, Follow, ZigZag, Smart_RTL, and more

**Plane:** Manual, Stabilize, FBWA, FBWB, Cruise, Auto, RTL, Loiter, Circle, AutoTune, Takeoff, VTOL modes (QStabilize, QHover, QLoiter, QLand, QRTL), and more

**Rover:** Manual, Steering, Hold, Loiter, Auto, RTL, Smart RTL, Guided, Acro, Follow, Simple

Each mode shows a safety badge -- green for safe modes (Stabilize, Loiter, RTL) and orange for advanced modes (Acro, Manual).

## Quick Presets

Presets configure all 6 mode slots at once for common scenarios:
- **Beginner** -- Safe modes only (Stabilize, AltHold, Loiter, RTL)
- **Intermediate** -- Adds Auto and PosHold
- **Advanced** -- Includes Acro and manual modes
- **Mapping** -- Optimized for autonomous mapping missions