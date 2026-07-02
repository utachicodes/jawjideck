import sys
import json
import argparse
import cv2
from ultralytics import YOLO

parser = argparse.ArgumentParser()
parser.add_argument('--stream-url', required=True)
args = parser.parse_args()

model = YOLO('yolov8n.pt')  # auto-downloads on first run if not cached
cap = cv2.VideoCapture(args.stream_url)  # OpenCV reads MJPEG-over-HTTP natively

while True:
    ok, frame = cap.read()
    if not ok:
        continue
    h, w = frame.shape[:2]
    results = model(frame, verbose=False)[0]

    detections = []
    for box in results.boxes:
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        detections.append({
            'label': model.names[int(box.cls[0])],
            'confidence': float(box.conf[0]),
            'x1': x1 / w, 'y1': y1 / h, 'x2': x2 / w, 'y2': y2 / h,
        })

    print(json.dumps(detections), flush=True)
