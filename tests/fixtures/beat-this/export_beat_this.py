"""Export Beat This! small0 to a static ONNX graph and write test fixtures.

Usage: python export_beat_this.py <app public dir> <fixtures dir>
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from beat_this.inference import Audio2Beats, load_model
from beat_this.preprocessing import LogMelSpect

public = Path(sys.argv[1])
fixtures = Path(sys.argv[2])
SR = 22050


def test_signal(seconds=31.0, bpm=120.0):
    """Deterministic drum-and-chord pattern (sines only), identical to beats.test.js's testSignal()."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    beat = 60.0 / bpm
    i = 0
    while 0.5 + i * beat < seconds - 0.5:
        start = 0.5 + i * beat
        x = t - start
        on = x >= 0
        xx = np.where(on, x, 0.0)
        if i % 2 == 0:  # kick: falling sine
            out += np.where(on, 0.8 * np.exp(-xx / 0.12) * np.sin(2 * math.pi * (50 + 80 * np.exp(-xx / 0.03)) * xx), 0.0)
        else:  # snare: inharmonic partials
            snare = sum(np.sin(2 * math.pi * f * xx) for f in (190.0, 330.0, 1150.0, 2730.0, 4100.0)) / 5
            out += np.where(on, 0.5 * np.exp(-xx / 0.08) * snare, 0.0)
        for half in (0.0, 0.5):  # hi-hat on the eighths
            y = t - (start + half * beat)
            hon = y >= 0
            yy = np.where(hon, y, 0.0)
            hat = sum(np.sin(2 * math.pi * f * yy) for f in (6000.0, 7350.0, 8300.0, 9100.0)) / 4
            out += np.where(hon, 0.15 * np.exp(-yy / 0.02) * hat, 0.0)
        i += 1
    out += 0.05 * sum(np.sin(2 * math.pi * f * t) for f in (110.0, 164.81, 220.0))  # a held chord
    return out.astype(np.float32)


# 1. Export with a static 1500-frame input, the length the reference always runs.
model = load_model("small0", device="cpu")


class Wrapped(torch.nn.Module):
    def __init__(self, inner):
        super().__init__()
        self.inner = inner

    def forward(self, spectrogram):
        out = self.inner(spectrogram)
        return out["beat"], out["downbeat"]


wrapped = Wrapped(model).eval()
dummy = torch.rand(1, 1500, 128) * 5
onnx_path = public / "small0.onnx"
torch.onnx.export(
    wrapped,
    (dummy,),
    str(onnx_path),
    input_names=["spectrogram"],
    output_names=["beat", "downbeat"],
    opset_version=17,
    dynamo=False,
)
print("exported", onnx_path, onnx_path.stat().st_size, "bytes")

# 2. The ONNX graph must give PyTorch's answers.
session = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
worst = 0.0
for seed in range(3):
    g = torch.Generator().manual_seed(seed)
    x = torch.rand(1, 1500, 128, generator=g) * 6
    with torch.no_grad():
        ref_beat, ref_down = wrapped(x)
    beat, down = session.run(None, {"spectrogram": x.numpy()})
    worst = max(worst, float(np.abs(beat - ref_beat.numpy()).max()), float(np.abs(down - ref_down.numpy()).max()))
print("max |onnx - torch| logit difference:", worst)
assert worst < 1e-3, worst

# 3. Fixtures: the log-mel spectrogram of the first 8 s, and the reference beats of the whole clip.
audio = test_signal()
spect = LogMelSpect()(torch.from_numpy(audio)).numpy().astype(np.float32)
first = spect[: 1 + int(8 * SR) // 441]
fixtures.mkdir(parents=True, exist_ok=True)
(fixtures / "test-signal-logmel-8s.bin").write_bytes(first.tobytes())
beats, downbeats = Audio2Beats(checkpoint_path="small0", device="cpu", dbn=False)(audio, SR)
(fixtures / "test-signal-beats.json").write_text(
    json.dumps({"beats": [round(float(b), 4) for b in beats], "downbeats": [round(float(d), 4) for d in downbeats], "frames": int(spect.shape[0])}, indent=1)
)
print("spectrogram", spect.shape, "beats", len(beats), "downbeats", len(downbeats), "first beats", [round(float(b), 3) for b in beats[:6]])
