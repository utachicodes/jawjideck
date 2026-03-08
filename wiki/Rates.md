# Rates

The Rates tab controls how fast your vehicle rotates in response to stick input. You configure the maximum rotation rate (degrees per second) and expo (stick curve) for each axis.

## Layout

Three columns: **Roll** (blue), **Pitch** (green), and **Yaw** (orange). Each column has a Max Rate slider and, if your firmware supports it, an Expo slider.

![TODO: screenshot of rates tab]()

## Controls

### Max Rate

The maximum rotation speed in degrees per second (or a multiplier on older firmware). Higher values make the vehicle more agile.

### Expo

Softens stick response around center while keeping full deflection at the same rate. Expressed as a percentage (0-100%). Higher expo = softer center, more precise small corrections.

If expo is available, a **rate curve visualization** is shown for each axis.

### Linked Roll/Pitch

On many setups, pitch rate is linked to roll rate. When linked, the pitch slider shows a "Linked to Roll" badge and adjusting roll automatically adjusts pitch to match.

## Rate Schemes

| Firmware | Parameters | Units | Expo |
|----------|-----------|-------|------|
| ArduCopter 3.5+ | `ACRO_RP_RATE`, `ACRO_RP_EXPO` | deg/s | Yes |
| ArduCopter < 3.5 | `ACRO_RP_P` | Multiplier | No |

When expo is not available, the tab displays a note indicating this.

## Quick Presets

Rate presets apply predefined rate and expo values. Presets range from beginner-friendly (low rates, high expo) to aggressive sport settings (high rates, low expo).

## Custom Profiles

Save your current rate values as a named profile with **My Profiles**. Load them later for quick switching between flying styles.