# Safety and Failsafe

The Safety tab configures what your vehicle does when things go wrong. It covers failsafe actions, arming checks, and geofence boundaries.

## Safety Presets

Quick-apply presets that configure multiple failsafe parameters at once:

| Preset | Description |
|--------|-------------|
| Maximum | Most conservative. All failsafes enabled with aggressive actions (RTL/Land) |
| Balanced | Sensible defaults for most users |
| Minimal | Relaxed settings. Only use when you understand the risks |

## Failsafe Settings

Four failsafe categories are configured independently:

### RC Signal Lost

What happens when the RC link drops.

- **Action:** Disabled, RTL, Continue Mission, Land Immediately, SmartRTL or RTL, SmartRTL or Land
- **Trigger PWM Threshold:** The PWM value below which the signal is considered lost (default around 975us)

### GCS Connection Lost

What happens when the ground station stops sending heartbeats.

- **Action:** Disabled, RTL, Continue Mission, SmartRTL or RTL, SmartRTL or Land, Land Immediately

Disable this if you fly without a GCS connection (e.g., manual line-of-sight flying).

### Low Battery

What happens when battery voltage or consumed capacity crosses a threshold.

- **Action:** Disabled, Land Immediately, RTL
- **Low Voltage (V):** Voltage threshold that triggers the failsafe
- **Low mAh Used:** Consumed capacity threshold (0-10000 mAh)

### Geofence

Virtual boundary that triggers an action if crossed.

- **Enable/Disable toggle**
- **Fence Type:** Altitude only, Circle only, Altitude + Circle, Polygon, etc.
- **Max Altitude (m):** Ceiling in meters (10-1000)
- **Max Radius (m):** Horizontal boundary in meters (30-10000)
- **Breach Action:** Report Only, RTL or Land, Always Land, SmartRTL or RTL, Brake or Land

![TODO: screenshot of safety tab]()

## Arming Checks

Arming checks prevent the vehicle from arming if something is wrong. Three quick-select options:

| Option | Description |
|--------|-------------|
| All Checks (Recommended) | Every pre-arm check must pass before arming |
| No Checks (Dangerous!) | Disables all pre-arm checks. A red warning banner appears |
| Custom | Toggle individual checks on/off |

In Custom mode, a grid of individual checks is shown (16+ checks). Each can be toggled independently. Checks include items like GPS lock, compass calibration, battery level, RC calibration, accelerometer health, and more.