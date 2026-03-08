# Serial Ports

The Serial Ports tab configures what protocol runs on each of your flight controller's serial ports.

## Port Configuration

A table lists each port (SERIAL0 through SERIAL7) with three settings:

| Column | Description |
|--------|-------------|
| Port | Port label with icon (USB, TELEM1, TELEM2, GPS1, GPS2, Serial5-7) |
| Protocol | What the port is used for |
| Baud Rate | Communication speed (1200 to 2000000) |

Status badges indicate the current function:
- **RC Input** (green) -- Port is configured for receiver input
- **MAVLink** (blue) -- Port is running MAVLink telemetry

![TODO: screenshot of serial ports tab]()

## Protocol Options

Each port can be assigned one of 46+ protocols, including:

- **None** -- Port disabled
- **MAVLink1 / MAVLink2** -- Ground station communication
- **GPS** -- GPS module
- **RCIN** -- RC receiver input (CRSF, ELRS, SBus, etc.)
- **FrSky** -- FrSky telemetry passthrough
- **Rangefinder** -- Laser or sonar rangefinder
- **Gimbal** -- Various gimbal protocols
- **ESC Telemetry** -- BLHeli/ESC feedback
- **MSP** -- MSP protocol bridge
- **Generator** -- Generator telemetry

## Common Setups

| Use Case | Protocol | Baud Rate |
|----------|----------|-----------|
| ELRS/CRSF receiver | RCIN | 115200 |
| GPS module | GPS | 115200-230400 |
| Telemetry radio (SiK, etc.) | MAVLink2 | 57600 |
| Companion computer | MAVLink2 | 921600 |

## Warnings

- If no port is configured as RCIN, a warning banner appears: "No RCIN configured"
- Changes to serial port configuration require writing to flash and rebooting the flight controller to take effect