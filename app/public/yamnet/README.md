# YAMNet (ONNX)

`yamnet.onnx` is Google's **YAMNet** audio event classifier (AudioSet, 521
classes; https://github.com/tensorflow/models/tree/master/research/audioset/yamnet),
Apache-2.0. This copy is the straight `tf2onnx` conversion published at
https://huggingface.co/audiomagic/yamnet-onnx (revision
`f25b741c2f0bdc6d7e6db24b5fddda23347dbafd`); no weights were changed. The
AudioSet ontology and labels are CC BY 4.0.

- Input `waveform`: mono float32 at **16 kHz**, any length (the log-mel
  front end is inside the graph).
- Output `output_0`: `[frames, 521]` class scores, one frame per 0.48 s
  (each covering 0.96 s). Guitar classes: 135 Guitar, 136 Electric guitar,
  138 Acoustic guitar, 139 Steel guitar, 140 Tapping, 141 Strum (137 is
  Bass guitar).
- SHA-256: `d3835ffbbd4a1bb3e777f0ca217b5007907f5171dd5d17c4236b95b2af8f908e`

Used by `src/tabs/guitar/song/transcribe/guitarPresence.js` to tell whether a
song has guitar in it, and where.
