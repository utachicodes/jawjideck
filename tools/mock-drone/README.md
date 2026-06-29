# Mock Drone

A Python script that simulates a MAVLink flight controller over TCP. Run it on a second laptop and connect Jawji to it — telemetry updates in real-time as you move.

## Requirements

Python 3.10+ (no pip packages needed — pure stdlib)

## Quick Start

```bash
# On the second laptop:
python mock_drone.py

# Find that laptop's IP (e.g. 192.168.1.42)
# In Jawji: Connection → Remote Drone → TCP → 192.168.1.42:5760
```

## Modes

### Manual (default)
Move with keyboard:
| Key | Action |
|-----|--------|
| `w/s` | Forward/back (change lat) |
| `a/d` | Left/right (change lon) |
| `q/e` | Climb/descend |
| `r` | Arm/disarm toggle |
| `t` | Takeoff to 50m |
| `l` | Land |
| `1-6` | Switch flight mode |

### Auto-move
```bash
python mock_drone.py --move
```
Flies a circle (~22m radius) starting at the given coordinates. GPS updates simulate real movement.

### SITL mode
```bash
python mock_drone.py --sitl
```
Starts armed in GUIDED mode. Useful for testing mission uploads.

## Custom start position

```bash
python mock_drone.py --lat 48.8566 --lon 2.3522 --alt 200  # Paris
```

## What Jawji sees

| Panel | Data |
|-------|------|
| GPS | Live coordinates, satellite count, HDOP |
| Attitude | Roll/pitch/yaw from simulated movement |
| Altitude | Altitude in meters, climb rate |
| Speed | Ground speed, air speed |
| Battery | 12.6V, 100% (simulated) |
| Flight Mode | Responds to mode switches |
| Map | Vehicle position tracks the mock drone |

## Troubleshooting

- **"Connection refused"** — make sure the script is running and port 5760 isn't blocked by a firewall
- **No telemetry** — check you're using TCP (not UDP) in Jawji's connection panel
- **Wrong position** — the mock drone starts at San Francisco by default; use `--lat` and `--lon` to set your location
