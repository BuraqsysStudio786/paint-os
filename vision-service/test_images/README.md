# Wall segmentation test images

Place local regression images here when testing the classical detector.

Primary regression case:

- `wall.jpg`, 738 x 402
- broad, plain grey wall on the left
- floor boundary around y=315 to y=335
- cabinet, plant, window, and wood accent panel on the right

Acceptance checks:

1. Classical mode returns at least one mask.
2. The main mask covers the broad left wall.
3. No returned polygon extends below the detected floor line.
4. No polygon covers nearly the entire image.
5. Click mode at `(100, 120)` returns the clicked wall.
6. Debug mode returns a readable floor line and polygon overlay.

Do not commit customer photos or other images without permission.
