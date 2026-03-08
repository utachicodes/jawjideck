# Receiver

The Receiver tab configures your RC protocol and shows live channel values from your transmitter.

## RC Protocol Selection

Quick-select buttons for common protocols:
- **Auto-Detect** -- Let the flight controller detect the protocol automatically
- **CRSF/ELRS** -- Crossfire and ExpressLRS receivers
- **SBus** -- FrSky and other SBus receivers
- **DSM/Spektrum** -- Spektrum satellite receivers

A full dropdown is available with all supported protocols: Auto-Detect, All, PPM, IBUS, SBus, SBus (NI), DSM/Spektrum, SUMD, SRXL, SRXL2, CRSF/ELRS, ST24, FPORT, FPORT2, FastSBUS.

![TODO: screenshot of receiver tab with live channels]()

## Live RC Channels

When connected, the tab displays live RC channel values in real time.

### Signal Status

A status badge at the top shows:
- **Active** (green) -- RC signal is being received
- **Signal Lost** (amber) -- Signal was previously active but is now lost
- **No Signal** (red) -- No RC data received at all

RSSI is displayed when available from the receiver.

### Primary Sticks

The four primary channels (Roll, Pitch, Throttle, Yaw) are shown in a larger 2x2 grid with animated bars that update as you move the sticks. Channel names respect the RCMAP parameter ordering on your flight controller.

### AUX Channels

Channels 5 and above are shown in a compact grid. Each displays the channel number, current PWM value, and a movement indicator.

### No Signal State

If no RC data is received, a troubleshooting checklist is shown with common fixes (check receiver power, bind status, protocol match, serial port config).

## RC Calibration Table

Below the live channels, a calibration table shows the learned min, trim, and max values for each channel (RC1-RC16). These values are read from the flight controller parameters and are set during the RC calibration process on your transmitter.