"""Original demo tones, using only Python's standard library. No sampled media."""
from pathlib import Path
import math
import struct
import wave

ROOT = Path(__file__).resolve().parents[1] / 'public' / 'audio'
ROOT.mkdir(parents=True, exist_ok=True)
RATE = 22050

def render(name, duration, notes):
    with wave.open(str(ROOT / name), 'wb') as output:
        output.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        frames = bytearray()
        for i in range(round(duration * RATE)):
            t = i / RATE
            value = 0.0
            for start, hz, length, gain in notes:
                dt = t - start
                if 0 <= dt < length:
                    envelope = min(1, dt / 0.04) * math.exp(-dt * 2.6 / length)
                    envelope *= min(1, (length - dt) / 0.15)
                    value += gain * envelope * (math.sin(2 * math.pi * hz * dt) + 0.15 * math.sin(4 * math.pi * hz * dt))
            frames.extend(struct.pack('<h', round(max(-0.95, min(0.95, value)) * 32767)))
        output.writeframes(frames)

# A sparse original C-major ambient cycle, fading to silence at both ends.
notes = []
for beat, chord in enumerate([(261.63, 329.63, 392), (220, 261.63, 329.63), (174.61, 220, 261.63), (196, 246.94, 293.66)]):
    for voice, hz in enumerate(chord):
        notes.append((beat * 6 + voice * 0.65, hz, 5, 0.07))
render('00_main_bgm_romantic_immersive_website.wav', 26, notes)
for name, duration, pitches in [
    ('01_primary_soft_tap.wav', .25, [440]),
    ('02_micro_glass_touch.wav', .2, [660]),
    ('03_confirm_soft_bloom.wav', .8, [523.25, 659.25, 783.99]),
    ('04_section_transition.wav', .9, [261.63, 392, 523.25]),
    ('05_lucky_redeem.wav', 1.1, [392, 523.25, 659.25, 783.99]),
]:
    render(name, duration, [(i * .1, hz, duration - i * .1, .12) for i, hz in enumerate(pitches)])
print('Generated six original PCM WAV files (no metadata chunks).')
