# Firmware Flash

The Firmware Flash view lets you update or change the firmware on your flight controller. It supports ArduPilot, Betaflight, iNav, PX4, and custom firmware files.

## Supported Firmware Sources

| Source | Vehicle Types | Notes |
|--------|--------------|-------|
| ArduPilot | Copter, Plane, VTOL, Rover, Boat, Sub | Primary firmware for ArduDeck |
| PX4 | Copter, Plane, VTOL, Rover, Boat, Sub | Alternative autopilot stack |
| Betaflight | Copter | FPV racing/freestyle firmware |
| iNav | Copter, Plane, Rover, Boat | Navigation-focused firmware |
| Custom | Any | Flash your own `.apj`, `.bin`, or `.hex` file |

## Flash Workflow

### Step 1: Detect Your Board

Connect your flight controller via USB. ArduDeck scans for the board automatically and displays:
- Port name
- Board name (if identified)
- Current firmware and version
- Protocol (MAVLink/MSP/DFU)
- MCU type

If auto-detect doesn't find your board, you can select it manually from a searchable dropdown of 150+ known boards (Pixhawk, SpeedyBee, Matek, Holybro, and more).

### Step 2: Select Firmware

Choose a firmware source. If your board is already connected, the source auto-selects based on the current firmware. Then select a vehicle type -- available types depend on the firmware source.

### Step 3: Select Version

Browse available versions grouped by major release (e.g., 4.x, 3.x). The latest stable release is marked. In Advanced Mode, you can include beta and dev builds.

For custom firmware, click the file button and select your `.apj`, `.bin`, or `.hex` file.

### Step 4: Flash

Click **Flash**. A progress bar shows real-time status as the firmware is written. Do not disconnect the board during flashing.

On success, a confirmation message appears. Unplug and reconnect your board to start using the new firmware.

![TODO: screenshot of firmware flash progress]()

## Boot Pad Wizard

Some boards use a USB-serial adapter (CP2102, FTDI, CH340) instead of native USB. These boards can't enter bootloader mode via software -- you need to physically short the boot pads on the board.

If flashing fails on a USB-serial board, ArduDeck automatically opens the **Boot Pad Wizard**, a step-by-step guide:

1. **Disconnect** your board from USB
2. **Short the boot pads** -- Find the pads labeled "BOOT" or "BT" near the MCU. Use tweezers or a jumper wire to connect them
3. **Reconnect USB** while keeping the pads shorted
4. **Wait for detection** -- ArduDeck probes serial ports for the STM32 bootloader
5. **Remove the jumper** before flashing (keep USB connected)
6. **Flash** -- Confirm and flash the firmware

The wizard includes safety checkboxes: you must confirm you've removed the jumper and verified the board selection before flashing.

## Advanced Mode

Toggle Advanced Mode to access additional features:

- **Serial port picker** with individual STM32 probe buttons per port
- **Beta/Dev version filters** for firmware selection
- **Manual board selection** when auto-detect fails
- **Board suggestions** based on detected MCU family (e.g., "Detected STM32F405 -- select your board")

## Post-Flash Behavior

After flashing iNav with an Airplane vehicle type, ArduDeck automatically configures the mixer for airplane mode. For all other combinations, the board boots with default settings.

## Firmware Switch Warning

Switching between firmware families (e.g., ArduPilot to Betaflight) resets all settings on the board. A warning is shown listing what will be lost (PIDs, modes, receiver config). You can always recover by putting the board back in bootloader mode and flashing again.

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Board not detected | USB cable is charge-only or drivers missing | Try a different USB cable. Install drivers (CP2102, CH340, STM32) |
| Flash fails immediately | Board not in bootloader mode | Use the Boot Pad Wizard or hold the boot button while plugging in |
| "No exact iNav target" warning | Selected board doesn't have a matching iNav build | Verify board model on the iNav wiki. Pin assignments may differ |
| Progress stuck at 0% | Communication error | Disconnect, reconnect, try again. Check USB cable |
| Settings lost after flash | Switched firmware families | Expected behavior. Reconfigure from scratch or load a saved `.param` file |
| Board bricked after flash | Wrong board/firmware selected | Re-enter bootloader (boot pads) and flash the correct firmware |