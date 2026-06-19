# Optional model weights

The service does not require model weights.

To enable FastSAM, install the optional `ultralytics` dependency and place
`FastSAM-s.pt` here, or set `FASTSAM_WEIGHTS` to its absolute path.

MobileSAM is exposed as a capability flag for future local integration. Until
weights and the optional package are present, requests gracefully use the
classical OpenCV detector.
