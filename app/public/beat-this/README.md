# Beat This! small0 (ONNX)

`small0.onnx` is the beat and downbeat tracker from **Beat This! Accurate
Beat Tracking Without DBN Postprocessing** (Foscarin, Schlüter & Widmer,
ISMIR 2024, https://github.com/CPJKU/beat_this), small model, seed 0
(2.1M parameters). Code and weights are MIT-licensed by their authors.

It was exported from the official `small0` checkpoint with a **fixed input
of 1 × 1500 × 128** (a log-mel spectrogram, 30 s at 50 fps). Outputs `beat`
and `downbeat` are 1 × 1500 logits. The ONNX graph agrees with PyTorch to
within 1e-5 on the logits. A third-party export with a variable input
length gave wrong beats beyond a few seconds, so don't swap it for one.

- SHA-256: `863d2a0e7575299739804814a3167ff2f40f8a90e54c3eaf0cf201786558e8e2`
- Rebuild: `tests/fixtures/beat-this/export_beat_this.py` (needs `torch`,
  `torchaudio`, `beat-this`, `onnx`, `onnxruntime`); it also writes the
  test fixtures beside it.

Used by `src/tabs/guitar/song/transcribe/beats.js`, which computes the input
spectrogram and runs the reference chunking and peak picking.
