# Battery

The Battery tab configures how your flight controller monitors battery voltage, current, and capacity.

## Monitor Type

Select the type of battery monitor connected to your flight controller:

- **Disabled** -- No battery monitoring
- **Analog** -- Analog voltage/current sensor
- **Volt/Amp meter** -- Digital voltage and current monitor
- Other types depending on hardware (SMBus, I2C, ESC telemetry, etc.)

If monitoring is disabled, a warning is shown.

## Battery Capacity

Set the total battery capacity in mAh using a slider (0-30000 mAh). Quick preset buttons are provided for common sizes: 1300, 2200, 3000, 5000, 8000, 10000, 16000 mAh.

![TODO: screenshot of battery tab]()

## Chemistry and Cell Configuration

### Chemistry

Select your battery chemistry:
- **LiPo** -- Lithium Polymer (most common for RC)
- **Li-Ion** -- Lithium Ion
- **LiFe** -- Lithium Iron Phosphate
- Other types as supported

Each chemistry shows a description and sets appropriate voltage references.

### Cell Count

Select the number of cells (2S through 12S). Each option shows the cell count and nominal voltage. ArduDeck estimates the current cell count from the detected voltage.

### Voltage Reference

When cells are detected, a reference card shows the voltages for your configuration:
- **Full** -- Fully charged voltage
- **Storage** -- Storage charge voltage
- **Low (RTL)** -- Voltage that triggers RTL failsafe
- **Critical** -- Emergency land voltage

## Voltage Thresholds

Three thresholds control failsafe behavior:

| Threshold | Purpose |
|-----------|---------|
| Minimum Arm Voltage | Prevents arming below this voltage |
| Low Warning Voltage | Triggers RTL failsafe (see [[Safety and Failsafe]]) |
| Critical Voltage | Triggers emergency land |

A visual voltage bar shows the breakdown between critical, low, and good zones with markers at each threshold.

## Calibration

Advanced calibration settings for tuning sensor accuracy:

| Setting | Range | Purpose |
|---------|-------|---------|
| Voltage Multiplier | 5.00-20.00 | Scale factor for analog voltage reading |
| Amps Per Volt | 0-50.0 | Current sensor sensitivity |
| Current Offset | -1.00 to 1.00 | Zero-point offset for current sensor |

Adjust the voltage multiplier until the reported voltage matches a multimeter reading.