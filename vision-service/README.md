# PaintOS local vision service

This FastAPI service generates free, local wall-mask proposals for the PaintOS
visualizer. The default engine is CPU-only OpenCV: no SAM model, Replicate
account, or paid API is required.

The classical detector combines:

- probable floor/baseboard-line detection
- low-texture and low-edge planar-region detection
- Lab color/smoothness clustering
- scored blank-wall fallback regions
- click-assisted color region growing
- object, plant, window-edge, and floor suppression

Automatic masks are proposals. Masks below 0.85 confidence are marked
`needsReview: true`, and the visualizer's manual polygon editor remains the
final authority.

## Run locally

```powershell
cd vision-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001
```

Open `http://localhost:8001/health`.

## Endpoints

### `GET /health`

Reports service status and available backends. `fastsam: false` and
`mobilesam: false` are normal for the default installation.

### `POST /segment-walls`

Multipart form fields:

| Field | Required | Description |
| --- | --- | --- |
| `image` | yes | JPG or PNG, maximum 16 MB |
| `mode` | no | `auto`, `classical`, `click`, or `blank-wall` |
| `expectedWalls` | no | Number from 1 to 4 |
| `positivePoints` | no | JSON: `[{"x":120,"y":130}]` or `[[120,130]]` |
| `negativePoints` | no | Same point formats as above |
| `minConfidence` | no | Candidate threshold from 0 to 1; default `0.48` |

Legacy web-client fields `clickPoints` and `expectedWallsCount` are also
accepted.

```powershell
curl.exe -X POST http://localhost:8001/segment-walls `
  -F "image=@wall.jpg" `
  -F "mode=classical"
```

Click-assisted example:

```powershell
curl.exe -X POST http://localhost:8001/segment-walls `
  -F "image=@wall.jpg" `
  -F "mode=click" `
  -F 'positivePoints=[{"x":100,"y":120}]'
```

Successful masks use original-image coordinates and contain:

```json
{
  "id": "main-wall",
  "name": "Main Wall",
  "points": [[0, 0], [420, 0], [420, 312], [0, 312]],
  "confidence": 0.68,
  "source": "blank-wall-fallback",
  "needsReview": true
}
```

The detector rejects masks that are floor-heavy or effectively cover the
whole image. If no defensible proposal exists, `manualRequired` is `true`.

### `POST /segment-walls-debug`

Accepts the same fields as `/segment-walls` and returns its normal JSON plus:

- `floorY`
- `floorDetected`
- `rawCandidateCount`
- `acceptedCandidateCount`
- `candidateDiagnostics` with quality metrics and rejection reasons
- `debugImageBase64`
- `debugImageDataUrl`

The PNG overlay shows the detected floor line, polygons, labels, and
confidence scores.

### Other endpoints

- `POST /mask-to-polygon` converts a binary image mask to polygons.
- `POST /apply-paint-preview` renders paint over approved polygons while
  preserving wall luminance and softening polygon edges.

## Required regression case

Test image:

- size: 738 x 402
- large plain grey wall on the left
- wooden floor at the bottom
- cabinet, plant, window, and vertical accent panel on the right

Expected:

- `success: true`
- at least one mask covering the main left wall
- no floor pixels and no whole-image rectangle
- `needsReview: true` is acceptable
- a rough polygon near `[[0,0],[420,0],[420,312],[0,312]]`
- `mode=click` with `{"x":100,"y":120}` returns the clicked wall

Store local, non-sensitive regression images under `test_images/`; do not add
customer images without permission.

## Render deployment

Render should run:

```text
uvicorn main:app --host 0.0.0.0 --port $PORT
```

After pushing:

```powershell
curl.exe https://paint-os.onrender.com/health
curl.exe -X POST https://paint-os.onrender.com/segment-walls `
  -F "image=@wall.jpg" `
  -F "mode=classical"
```

Optional FastSAM support remains available when `ultralytics` is installed
and `models/FastSAM-s.pt` exists (or `FASTSAM_WEIGHTS` points to the file).
