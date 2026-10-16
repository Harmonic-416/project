# Beat This! test fixtures

- `mel-filterbank.bin`: torchaudio's mel filterbank for Beat This!'s input
  (513 × 128 float32, row-major: `MelScale.fb` with 22050 Hz, n_fft 1024,
  30 Hz – 11 kHz, 128 slaney mels, no normalisation), from
  https://huggingface.co/musetric/beat-this-onnx (MIT, after CPJKU/beat_this).
- `test-signal-logmel-8s.bin`: the reference `LogMelSpect` of the first 8 s
  of the deterministic test signal (401 × 128 float32).
- `test-signal-beats.json`: the reference beats and downbeats of the whole
  31 s test signal (beat_this `Audio2Beats`, small0, no DBN).
- `export_beat_this.py`: exports `app/public/beat-this/small0.onnx` and
  writes the two test-signal fixtures. The test signal is built identically
  in `app/tests/beats.test.js`.

`app/tests/beats.test.js` checks the filterbank, the spectrogram and the beats
against these.
