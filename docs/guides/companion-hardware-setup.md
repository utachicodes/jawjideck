# Companion Hardware Setup: ESP32 Telemetry + Raspberry Pi Video/Agent

A full walkthrough for pairing Jawji with an ESP32 (wireless MAVLink bridge) and a Raspberry Pi (companion metrics + camera feed), tested against a ground robot (rover) but equally applicable to a flying vehicle.

**End state:** the ESP32 replaces your USB cable/telemetry radio for MAVLink; the Pi gives you live system metrics/terminal via the Jawji Agent and a live camera feed in Jawji's Camera panel. Both run independently and simultaneously over the same WiFi network.

---

## What you need

- A flight controller (ArduPilot or iNav) already wired up on the robot/vehicle, with a spare UART (e.g. `TELEM2` on ArduPilot).
- An ESP32 dev board.
- A Raspberry Pi 4 or 5 (camera streaming needs Pi 4/5; older Pis work fine for the agent alone) with a Pi Camera Module attached.
- A microSD card (16GB+ recommended if you're using the Pi for both agent and camera).
- A USB cable to flash the ESP32 from your computer.
- Jawji running on your computer, connected to the same WiFi network you'll put the ESP32/Pi on.

---

## Part 1 — ESP32 as a wireless MAVLink bridge (DroneBridge)

This replaces your telemetry radio or USB tether: the ESP32 sits on the vehicle, talks to the flight controller over UART, and exposes MAVLink over WiFi.

### 1.1 Flash the firmware

1. Plug the ESP32 into your computer over USB.
2. In Jawji, go to **Companion Dashboard → Store** tab.
3. Filter by board: **ESP32**.
4. Select the **DroneBridge WiFi Telemetry** template.
5. Click **Flash**. Jawji will:
   - Download `esptool` if it isn't already cached
   - Detect your ESP32's chip variant over the USB serial connection
   - Download the latest DroneBridge firmware release from GitHub
   - Flash the correct binaries for your chip
6. Wait for the flash to complete — do not unplug the ESP32.

### 1.2 Read its configuration

1. After flashing, click **"Read from USB"** in the same panel.
2. Jawji resets the ESP32 (via DTR toggle) and reads its boot log at 115200 baud.
3. Note down what it reports:
   - **AP SSID** and **password** (this is the WiFi network the ESP32 broadcasts)
   - **AP IP** (usually `192.168.2.1` by default)
   - **Baud rate** and **serial protocol** (MAVLink, by default)
   - **GPIO pins** assigned for TX/RX

### 1.3 Wire the ESP32 to the flight controller

Connect three wires between the ESP32 and the FC's spare UART port:

| ESP32 | Flight Controller |
|-------|-------------------|
| TX    | RX (on the FC's UART) |
| RX    | TX (on the FC's UART) |
| GND   | GND |

Power the ESP32 from a 3.3V or 5V source depending on your board (check your specific ESP32 module's rating — most dev boards accept 5V via USB/VIN and regulate down internally).

> **Note:** the app does not (yet) provide a wiring wizard per flight-controller model. If the GPIO pins DroneBridge defaults to don't match your ESP32 board's silkscreen labels, open the **DroneBridge Settings** panel (see 1.5) and adjust the Serial section's TX/RX pin assignment to match your wiring.

### 1.4 Power up and join the WiFi

1. Power the flight controller and ESP32 (from the vehicle's battery/BEC or however you've wired it).
2. On your computer, join the WiFi network broadcast by the ESP32 (SSID/password from step 1.2).

### 1.5 Verify in Jawji

1. Companion Dashboard → **DroneBridge** tab. Jawji auto-probes `192.168.2.1`; if your AP IP is different, type it into the IP field.
2. You should see:
   - Firmware version, chip model, MAC address
   - WiFi signal strength (RSSI)
   - Live throughput (serial RX bytes/sec, MAVLink message count)
3. If you need to change anything (baud rate, GPIO pins, WiFi mode, network config), use the **Settings** sub-panel — note that saving settings triggers a reboot of the ESP32.

### 1.6 Connect Jawji to the vehicle over this link

1. Go to Jawji's normal **Connect** panel (left sidebar).
2. Choose **TCP** or **UDP**, and point it at the ESP32's IP and the MAVLink port DroneBridge is serving (check the Settings panel's Network section for the exact port if it's not the default).
3. Click Connect — telemetry should start flowing exactly as it would over USB or a telemetry radio. Arm/disarm, mode changes, mission upload all work identically over this link.

---

## Part 2 — Raspberry Pi as a companion computer (Jawji Agent)

This gives you live system metrics, a remote terminal, and log access from the Pi, inside Jawji's Companion Dashboard.

### 2.1 Install the agent

Over SSH on the Pi, use Jawji's one-script installer with the `basic` profile — it installs the Jawji Agent **and** `mavlink-router` (MAVLink over UDP :14550) **and** a WiFi access point in one command, as systemd services:

```bash
curl -fsSL https://jawji.space/install.sh | sudo bash -s -- basic
```

If you only want the agent and nothing else, use the agent-only installer instead:

```bash
curl -fsSL https://raw.githubusercontent.com/utachicodes/jawjideck/master/packages/jawji-agent/install.sh | sudo bash
```

This installs Node.js/pnpm if needed, clones the repo, builds the `jawji-agent` workspace package, and installs it as a systemd service listening on port **48400**.

If you already have the repo checked out locally and just want to rebuild/reinstall from your working copy, run `sudo packages/jawji-agent/install.sh` from the repo root instead.

> See the [Companion Board wiki page](https://github.com/utachicodes/jawjideck/wiki/Companion-Board) for the full profile/flag reference (`basic` / `vision` / `ai`, or individual `WITH_*` components).

### 2.2 Get the pairing token

The agent generates a random pairing token the first time it starts. Read it from the service log:

```bash
journalctl -u jawji-agent | grep 'Pairing token'
```

Keep this handy — you'll paste it into Jawji once.

### 2.3 Pair it in Jawji

1. Make sure your computer and the Pi are on the same network.
2. Companion Dashboard in Jawji should auto-discover the Pi via mDNS (service type `_jawji-agent._tcp`, advertised as `jawji-agent-{hostname}`).
3. Select the discovered device, paste the pairing token from step 2.2.
4. Once paired, the **Dashboard** tab lights up with live CPU/memory/disk metrics, a process list, a remote terminal, and log streaming from the Pi.

---

## Part 3 — Pi camera feed in Jawji's Camera panel

**Important:** Jawji's Camera panel currently only supports **MJPEG** (plain `<img>` tag, no RTSP/H.264/WebRTC decoding built in yet — though [WebRTC via MediaMTX's WHEP endpoint](https://github.com/utachicodes/jawjideck/wiki/Companion-Board#video-streaming-mediamtx) is supported as a separate protocol option if you'd rather use that). This part covers the MJPEG path.

### 3.1 Install and run mjpg-streamer on the Pi

The one-script installer's `vision` profile sets this up automatically (`mjpg-streamer` + MediaMTX + telemetry + WiFi AP + agent, as boot services on `/dev/video0`), which is what the Store tab's "Video + Telemetry" template runs:

```bash
curl -fsSL https://jawji.space/install.sh | sudo bash -s -- vision
```

If your camera is on a different device path, pass `CAMERA_DEVICE`:

```bash
curl -fsSL https://jawji.space/install.sh | sudo CAMERA_DEVICE=/dev/video1 bash -s -- vision
```

`mjpg-streamer` only supports V4L2/UVC cameras. If you're on a recent Raspberry Pi OS using `libcamera` (the default camera stack for the official Pi Camera Module) instead of a UVC USB webcam, bridge `libcamera` to a V4L2 device first (`sudo apt install v4l2loopback-dkms rpicam-apps`, then pipe `rpicam-vid` into the loopback device) so `mjpg-streamer` has a `/dev/videoN` to open.

To install and run it manually instead (e.g. to test settings before committing to the systemd service, or on a board where you don't want the full `vision` profile):

```bash
sudo apt update
sudo apt install mjpg-streamer
mjpg_streamer -i "input_uvc.so -d /dev/video0 -r 1280x720 -f 30" \
              -o "output_http.so -p 8080 -w /usr/share/mjpg-streamer/www"
```

### 3.2 Point Jawji's Camera panel at it

1. In Jawji, open the **Telemetry Dashboard**, use **Add Panel** and select **Camera**.
2. In the panel's URL field, enter:
   ```
   http://<pi-ip>:8080/?action=stream
   ```
3. You should see live video immediately.
4. If it shows "Stream unavailable": double-check `mjpg_streamer` is actually running on the Pi (`ps aux | grep mjpg_streamer`), that port 8080 isn't blocked by a firewall, and that your computer and the Pi are on the same network/subnet.
5. Pop the panel out to its own window via the detach button in its tab header if you want it separate from the rest of the dashboard.

---

## Part 4 — Intel RealSense depth camera feed

No new code in Jawji is needed for this — the Camera panel from Part 3 already displays any MJPEG stream, and a colorized depth image is just another MJPEG stream. The only piece to build is a small script on the Pi that reads the RealSense over USB3 and serves the colorized depth output the same way `mjpg-streamer` does for the regular camera.

### 4.1 Install librealsense2 on the Pi

```bash
sudo apt update
sudo apt install python3-pip
pip3 install pyrealsense2 flask
```

> `pyrealsense2` wheels are available for common Pi architectures; if the wheel install fails for your specific Pi/OS combination, you'll need to build `librealsense2` from source with Python bindings enabled (the official Intel RealSense docs cover this — it's a longer build but only a one-time setup).

### 4.2 Depth-to-MJPEG script

Save this as `depth_stream.py` on the Pi:

```python
import pyrealsense2 as rs
import numpy as np
import cv2
from flask import Flask, Response

app = Flask(__name__)

pipeline = rs.pipeline()
config = rs.config()
config.enable_stream(rs.stream.depth, 640, 480, rs.format.z16, 30)
pipeline.start(config)

def generate():
    try:
        while True:
            frames = pipeline.wait_for_frames()
            depth_frame = frames.get_depth_frame()
            if not depth_frame:
                continue

            depth_image = np.asanyarray(depth_frame.get_data())
            # Colorize: near = red, far = blue (adjust alpha to taste)
            colorized = cv2.applyColorMap(
                cv2.convertScaleAbs(depth_image, alpha=0.03), cv2.COLORMAP_JET
            )

            ok, jpeg = cv2.imencode('.jpg', colorized)
            if not ok:
                continue

            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + jpeg.tobytes() + b'\r\n')
    finally:
        pipeline.stop()

@app.route('/stream')
def stream():
    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8081, threaded=True)
```

This grabs raw 16-bit depth frames, colorizes them (near objects red, far objects blue with the default `COLORMAP_JET`), JPEG-encodes each frame, and serves them as a standard MJPEG multipart stream — deliberately the same wire format `mjpg-streamer` produces, on a different port (`8081`) so it can run alongside the regular color camera stream from Part 3.

Run it:

```bash
python3 depth_stream.py
```

Make it a systemd service (mirroring however you made `mjpg_streamer` persistent) if you want it to survive reboots.

### 4.3 Point Jawji at it

1. Add a **second** Camera panel to your Telemetry Dashboard (**Add Panel → Camera** again — dockview allows multiple instances of the same panel type).
2. In its URL field, enter:
   ```
   http://<pi-ip>:8081/stream
   ```
3. You now have two live panels side by side: regular color camera on `:8080`, colorized depth on `:8081`.

If you later want real depth *values* (distance-at-cursor, not just a colorized preview), that needs a small data channel alongside the video — out of scope for the MJPEG-only panel today, but a natural next step if it turns out to matter once you're testing.

---

## Part 5 — Running AI object detection on the feed

Once Part 3 or Part 4 is streaming into the Camera panel, the **AI Object Detection** module (`modules/ai-object-detection/` in this repo) can draw live bounding boxes on top of it — see that module's own README for build/install steps. It runs entirely on the machine running Jawji, not on the Pi, so no extra Pi-side setup is needed beyond having a stream already configured in the Camera panel.

---

## Putting it all together

Once all four parts are running simultaneously:

- **ESP32** — wireless MAVLink link to the robot. All of Jawji's normal controls (arm/disarm, mode switching, mission planning, parameter tuning) work exactly as they would over USB.
- **Pi (Jawji Agent + mavlink-router + WiFi AP)** — installed by `install.sh -- basic` (or `-- vision` if you also want the camera feed below) — live system metrics, terminal, and logs from the companion computer, in the Companion Dashboard.
- **Pi (mjpg-streamer)** — installed by `install.sh -- vision` — live color camera feed in one Camera panel.
- **Pi (depth_stream.py)** — live colorized RealSense depth feed in a second Camera panel.

These are independent services on independent ports (MAVLink over whatever port DroneBridge serves, port 48400 for the Jawji Agent, port 8080 for the color camera stream, port 8081 for the depth stream), so there's no conflict running all four at once on the same Pi/network.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| DroneBridge tab shows nothing at `192.168.2.1` | You haven't joined the ESP32's WiFi AP yet, or its AP IP differs from default — recheck the boot log from step 1.2 |
| Connected to ESP32 but no telemetry in Jawji's main Connect panel | Wrong TCP/UDP port, or TX/RX wired backwards between ESP32 and FC (swap them) |
| Jawji Agent doesn't show up in Companion Dashboard | mDNS may be blocked by your router/network (common on guest networks or some managed WiFi) — in the Dashboard tab, enter the Pi's IP and pairing token manually instead of using "Scan for agents" |
| Camera panel says "Stream unavailable" | `mjpg_streamer` (or `depth_stream.py`) not running, wrong port, or firewall blocking the port on the Pi |
| Video is choppy/high latency | Lower resolution/framerate in the `mjpg_streamer -i` flags (e.g. `640x480 -f 15`), or in `depth_stream.py`'s `enable_stream` call — MJPEG is bandwidth-hungry compared to H.264 |
| `pyrealsense2` import fails on the Pi | No prebuilt wheel for your Pi's architecture/OS combination — you'll need to build `librealsense2` from source with Python bindings (see Intel's official RealSense docs) |
| Depth image looks solid black/white or inverted | Adjust the `alpha` value in `cv2.convertScaleAbs(depth_image, alpha=0.03)` — it controls how raw depth (millimeters) maps to the 0-255 range before colorizing; tune it to your typical working distance |
