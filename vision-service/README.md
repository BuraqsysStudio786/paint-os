# PaintOS local vision service

This FastAPI service provides free, local, AI-assisted wall proposals. Its
CPU-compatible baseline uses OpenCV and always marks automatic masks for
review. Manual polygon correction in the web visualizer remains the final
authority.

## Run

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001
```

Open `http://localhost:8001/health`.

Optional FastSAM support is enabled when `ultralytics` is installed and a
weight file exists at `models/FastSAM-s.pt` (or `FASTSAM_WEIGHTS` points to
one). The service falls back to the classical detector when optional models
are unavailable or fail.

`fastsam:false` and `mobilesam:false` are normal for the default installation.
The OpenCV detector remains available, and the web app always offers manual
polygon correction. Weak detections return no mask instead of a broad fallback
rectangle.

## Endpoints

- `GET /health` reports classical and optional model capabilities.
- `POST /segment-walls` accepts multipart `image` plus optional `mode`,
  click hints, room type, and expected wall count.
- `POST /apply-paint-preview` renders approved polygon masks.

Classical masks use original-image coordinates, include confidence, use
`source: local-python-classical`, and are marked `needsReview: true`.
