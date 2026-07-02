# AI Object Detection

Draws bounding boxes on Jawji's Camera panel using YOLOv8 object detection,
running as a local Python process.

## Requirements

Install on the machine running Jawji (not the drone/companion computer):

```bash
pip install ultralytics opencv-python
```

The first run downloads the YOLOv8n model weights (~6MB) automatically.

## Build

```bash
npm install
npm run build
```

## Install into Jawji

1. Jawji → Module Manager → **Install from folder (dev)…**
2. Select this module's `dist/` folder (must contain `module.json`, `renderer.js`, `detect.py`).
3. Restart Jawji.
4. Open the Camera panel and point it at a live MJPEG stream — detection starts automatically once a stream URL is set.

## Scope

- Detects the 80 COCO classes YOLOv8n ships with (person, car, dog, etc.) —
  no custom model training/swapping in this version.
- Runs on CPU by default. GPU acceleration depends on your local PyTorch/CUDA
  setup — this module doesn't configure that for you.
- No detection history, alerts, or vehicle-command integration — bounding
  boxes on the live feed only.
