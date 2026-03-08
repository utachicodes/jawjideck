# Configuration

The Configuration view is where you tune and configure your flight controller. ArduDeck automatically routes you to the right interface based on your connected firmware.

## Configuration Routing

| Firmware | Protocol | Interface |
|----------|----------|-----------|
| ArduPilot (any version) | MAVLink | MAVLink Config tabs |
| iNav 2.1+ / Betaflight 4.0+ | MSP | MSP Config tabs |
| iNav < 2.1 / Betaflight < 4.0 / Cleanflight | CLI over MSP | Legacy CLI-powered GUI |

You don't need to select this manually. ArduDeck detects the protocol and firmware version on connect and shows the correct interface.

## Tab Overview

The available tabs depend on your vehicle type. Aircraft (Copter, Plane, VTOL) and ground vehicles (Rover, Boat) have different tab sets.

### Aircraft Tabs

| Tab | Purpose | Wiki Page |
|-----|---------|-----------|
| PID Tuning | P/I/D/FF gain sliders per axis | [[PID Tuning]] |
| Rates | Max rate and expo curves per axis | [[Rates]] |
| Flight Modes | Assign modes to switch positions | [[Flight Modes]] |
| Receiver | RC protocol, live channel display | [[Receiver]] |
| Serial Ports | Protocol assignment for each serial port | [[Serial Ports]] |
| Safety | Failsafe, arming checks, geofence | [[Safety and Failsafe]] |
| Sensors | Compass and accelerometer settings | -- |
| Tuning | Skill level and mission type presets | [[Tuning Presets]] |
| Battery | Monitor type, chemistry, thresholds | [[Battery]] |
| All Parameters | Expert parameter table | [[All Parameters]] |

### Rover/Boat Tabs

Rover and Boat vehicles replace PID Tuning/Rates with Speed & Steering, Navigation, and Drive Modes. Receiver, Serial Ports, Safety, Sensors, Battery, and All Parameters remain the same.

## Header Controls

The configuration header bar provides global actions that apply across all tabs:

- **Refresh** -- Re-download all parameters from the flight controller
- **Reboot** -- Send a reboot command to the flight controller
- **History** -- View parameter change checkpoints. ArduDeck auto-checkpoints before every write to flash, so you can always roll back
- **Save All Changes** -- Write modified parameters to flash. Opens a confirmation dialog showing every parameter that will change (old value and new value). Parameters that require a reboot are marked with a badge

When parameters require a reboot to take effect, a banner appears at the top listing the affected parameters with a Reboot button.

![TODO: screenshot of configuration header with save dialog]()