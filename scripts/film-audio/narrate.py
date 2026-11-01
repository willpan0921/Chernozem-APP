# WHAT THIS FILE DOES
# Makes the sound for a walkthrough film (Field or Atlas): a narrated voice
# that walks through every step, over quiet original music, and the
# English captions of that narration.
#
#   python3 narrate.py fit field      render the lines and check each one
#                                     fits inside its step (nothing written)
#   python3 narrate.py build field    everything below
#
# 1. The steps are the film's own burnt-in captions, with their times from
#    the recorder's log (field-events.json / atlas-events.json), plus the
#    opening and the closing card.
# 2. narration.json has one line per step. Each is read aloud by the Siri
#    voice "Nora" (voice.swift) and placed so it starts shortly after its
#    step begins (0.3 s by default) and ends before the next step begins.
#    A line that would run into the next step stops the build.
# 3. The music is composed here from scratch, no samples: soft pad chords,
#    a sparse bell line and a low bass, slow, with a gentle reverb, fading
#    in and out. It is turned down by 9 dB while the voice speaks.
# 4. The mix is set to about -16 LUFS with peaks under -1.5 dB (a gentle
#    limiter takes the loudest syllables down a little), written as
#    a 48 kHz WAV, and encoded to AAC (afconvert, 96 kb/s stereo).
# 5. It writes the captions (WebVTT, at the top of the picture: line:5%,
#    so they never cover the film's own caption bar) and the narration
#    script with its times (narration-<film>.md), so it can be re-recorded
#    in another voice later.
#
# Then mux.swift puts the sound into the film without touching the video.
#
# WHO EDITS IT
# Whoever changes the narration: edit narration.json (the words), run
# "fit" until every line fits, then "build", then mux.swift.
import hashlib
import json
import os
import re
import struct
import subprocess
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter, oaconvolve, resample_poly, sosfilt

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.dirname(HERE)  # $S/r5-audio
VOICE_ID = "com.apple.siri.natural.Nora"
DEFAULT_LEAD = 0.30   # the voice starts this long after its step begins
END_GAP = 0.15        # and ends at least this long before the next step
DUCK_DB = -9.0        # the music under the voice
VOICE_LUFS = -17.0    # each line's loudness
MUSIC_LUFS = -24.0    # the music alone (before ducking)
TARGET_LUFS = -16.0   # the whole mix
PEAK_DBTP = -1.5      # the mix's highest (true) peak


# ---------- the film ----------

def mp4_video_seconds(path):
    """The length of the first video track of an MP4, from its mdhd box."""
    data = open(path, "rb").read()

    def boxes(start, end):
        i = start
        while i + 8 <= end:
            size, kind = struct.unpack(">I4s", data[i:i + 8])
            head = 8
            if size == 1:
                size = struct.unpack(">Q", data[i + 8:i + 16])[0]
                head = 16
            elif size == 0:
                size = end - i
            yield kind.decode("latin-1"), i + head, i + size
            i += size

    for kind, a, b in boxes(0, len(data)):
        if kind != "moov":
            continue
        for k2, a2, b2 in boxes(a, b):
            if k2 != "trak":
                continue
            handler, seconds = None, None
            for k3, a3, b3 in boxes(a2, b2):
                if k3 != "mdia":
                    continue
                for k4, a4, b4 in boxes(a3, b3):
                    if k4 == "hdlr":
                        handler = data[a4 + 8:a4 + 12].decode("latin-1")
                    if k4 == "mdhd":
                        version = data[a4]
                        if version == 1:
                            timescale, duration = struct.unpack(">IQ", data[a4 + 20:a4 + 32])
                        else:
                            timescale, duration = struct.unpack(">II", data[a4 + 12:a4 + 20])
                        seconds = duration / timescale
            if handler == "vide":
                return seconds
    raise SystemExit(f"no video track in {path}")


def load_steps(events_path, film_seconds):
    log = json.load(open(events_path))
    events = sorted(log["events"], key=lambda e: e["t"])
    steps = []
    for i, e in enumerate(events):
        start = (e["t"] - log["t0"]) / 1000
        nxt = (events[i + 1]["t"] - log["t0"]) / 1000 if i + 1 < len(events) else film_seconds
        steps.append({
            "t": start, "next": nxt, "card": bool(e.get("card")),
            "chapter": e.get("chapter", ""), "caption": e.get("text", ""),
        })
    return steps


# ---------- the voice ----------

def render_lines(lines):
    """Renders every line with Nora (cached by its words and speed); returns
    each line's samples (mono float32, 48 kHz) and where each of its words
    starts (from the voice's own word marks)."""
    cache = os.path.join(WORK, "voice", "cache")
    os.makedirs(cache, exist_ok=True)
    jobs, outs = [], []
    for line in lines:
        say = line.get("say", line["text"])
        rate = float(line.get("rate", 0.5))
        key = hashlib.sha1(f"{VOICE_ID}|{rate}|{say}".encode()).hexdigest()[:16]
        out = os.path.join(cache, key)
        outs.append(out)
        if not (os.path.exists(out + ".f32") and os.path.exists(out + ".words.json")):
            jobs.append({"id": key, "text": say, "rate": rate, "out": out, "voice": VOICE_ID})
    if jobs:
        jobs_path = os.path.join(cache, "jobs.json")
        json.dump(jobs, open(jobs_path, "w"), indent=1)
        result = subprocess.run(["swift", "-swift-version", "5", os.path.join(HERE, "voice.swift"), jobs_path],
                                capture_output=True, text=True)
        if result.returncode != 0:
            raise SystemExit("voice.swift failed:\n" + result.stderr)
        for row in result.stdout.strip().splitlines():
            info = json.loads(row)
            if info["voice"] != VOICE_ID or info["sampleRate"] != SR or not info["finished"]:
                raise SystemExit(f"the voice did not render as Nora at 48 kHz: {info}")
    sounds = [np.fromfile(out + ".f32", dtype="<f4").astype(np.float64) for out in outs]
    words = [json.load(open(out + ".words.json"))["words"] for out in outs]
    return sounds, words


MAX_CUE = 90   # characters in one caption: two lines
MAX_LINE = 48  # characters in one caption line (70 fit on one line in Chrome)
# Small words a line should not end on ("press its / bin", "and the / fields").
JOINING = {"a", "an", "the", "and", "or", "of", "to", "on", "in", "by", "for", "with", "at", "as", "from",
           "its", "their", "your", "those", "these", "this", "that", "each", "every", "any"}


def two_lines(text):
    """A caption set in at most two lines, broken by hand: Chrome does not
    wrap a caption line that is too wide, it cuts it off at both edges of
    the picture (its caption font grows with the picture, so this holds at
    every width). The break goes after a comma or other stop when there is
    one, never right after a small joining word, else near the middle."""
    if len(text) <= MAX_LINE:
        return text
    best = None
    for m in re.finditer(r" ", text):
        left, right = text[:m.start()], text[m.end():]
        if len(left) > MAX_LINE or len(right) > MAX_LINE:
            continue
        score = abs(len(left) - len(right))
        if left[-1] in ",;:.":
            score -= 20
        if left.split()[-1].lower() in JOINING:
            score += 12
        if best is None or score < best[0]:
            best = (score, f"{left}\n{right}")
    if best is None:
        raise SystemExit(f"cannot set this caption in two lines of {MAX_LINE}: {text}")
    return best[1]


def caption_parts(text):
    """A caption longer than two lines, split where it reads naturally:
    between sentences, else at a colon or semicolon, else at a comma (the
    first kind that leaves both parts short enough; of those, the one
    nearest the middle). Returns (start offset in text, part) pairs."""
    if len(text) <= MAX_CUE:
        return [(0, text)]
    cuts = []
    for stops in (".!?", ":;", ","):
        found = [m.end() for m in re.finditer(f"[{re.escape(stops)}]\\s+", text) if m.end() < len(text)]
        cuts = [c for c in found if len(text[:c].rstrip()) <= MAX_CUE and len(text) - c <= MAX_CUE] or cuts or found
        if any(len(text[:c].rstrip()) <= MAX_CUE and len(text) - c <= MAX_CUE for c in found):
            break
    if not cuts:
        return [(0, text)]
    cut = min(cuts, key=lambda c: abs(c - len(text) / 2))
    left, right = text[:cut].rstrip(), text[cut:]
    return caption_parts(left) + [(cut + o, p) for o, p in caption_parts(right)]


def speech_span(x):
    """Where the speech starts and ends inside a rendered line (s): the first
    and last 10 ms with sound above -50 dBFS."""
    win = SR // 100
    n = len(x) // win
    rms = np.sqrt(np.mean(x[:n * win].reshape(n, win) ** 2, axis=1) + 1e-20)
    loud = np.where(20 * np.log10(rms) > -50)[0]
    return loud[0] * 0.01, (loud[-1] + 1) * 0.01


# ---------- loudness (ITU-R BS.1770-4) ----------

_K1 = ([1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585])
_K2 = ([1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621])


def lufs(stereo):
    """Integrated loudness of a (n, 2) signal at 48 kHz."""
    y = lfilter(*_K1, stereo, axis=0)
    y = lfilter(*_K2, y, axis=0)
    block, hop = int(0.4 * SR), int(0.1 * SR)
    if len(y) < block:
        return -120.0
    sq = np.cumsum(np.concatenate([np.zeros((1, y.shape[1])), y ** 2]), axis=0)
    starts = np.arange(0, len(y) - block + 1, hop)
    ms = (sq[starts + block] - sq[starts]) / block
    z = ms.sum(axis=1)
    lk = -0.691 + 10 * np.log10(z + 1e-20)
    gated = z[lk > -70]
    if not len(gated):
        return -120.0
    rel = -0.691 + 10 * np.log10(gated.mean()) - 10
    final = z[(lk > -70) & (lk > rel)]
    return -0.691 + 10 * np.log10(final.mean())


def true_peak_db(stereo):
    up = resample_poly(stereo, 4, 1, axis=0)
    return 20 * np.log10(np.abs(up).max() + 1e-20)


def limit(stereo, ceiling_db, window=0.04):
    """A gentle look-ahead limiter: wherever a peak would pass the ceiling,
    the gain is lowered just enough, eased in and out over about 20 ms, the
    same on both sides. (The lowest gain needed within +-window, smoothed
    by a Hann window half as long, never lets a peak through.)"""
    from scipy.ndimage import minimum_filter1d
    ceiling = 10 ** (ceiling_db / 20)
    peak = np.abs(stereo).max(axis=1)
    need = np.minimum(1.0, ceiling / np.maximum(peak, 1e-12))
    w = int(window * SR)
    held = minimum_filter1d(need, size=2 * w + 1, mode="nearest")
    h = np.hanning(w | 1)
    half = len(h) // 2
    # (Padded with its own end values, so the film's first and last moments
    # are not turned down by the smoothing running off the ends.)
    gain = np.convolve(np.pad(held, half, mode="edge"), h / h.sum(), mode="valid")
    return stereo * gain[:, None], 20 * np.log10(gain.min())


# ---------- the music ----------

def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# Chords as offsets from the key's tonic (T = the tonic in the 4th octave):
# I (major 9), vi (minor 7 add 11), IV (major 9, no root in the pad), V
# (suspended: its fourth falls to the third halfway through), so every
# fourth chord comes home. "bass" is the low note, "pad" the held chord,
# "sus" the one note that moves (from, to), "bell" the notes the bell
# line may use (chord tones in the octave above).
CHORDS = {
    "I": {"bass": -24, "pad": [-12, -5, -1, 2, 4], "bell": [7, 11, 12, 14, 16, 19]},
    "vi": {"bass": -27, "pad": [-15, -8, -5, 0, 2], "bell": [7, 9, 12, 14, 16, 19]},
    "IV": {"bass": -19, "pad": [-12, -8, -5, -3, 2], "bell": [7, 9, 11, 14, 16, 17]},
    "V": {"bass": -17, "pad": [-10, -5, 2, 7], "sus": (0, -1), "bell": [7, 9, 11, 14, 16, 19]},
}
PROGRESSION = ["I", "vi", "IV", "V"]
# The tonic of each key in the 4th octave: Field in D major, Atlas in F
# major (the same register, three steps up, so the two films are related
# but not the same).
TONIC = {"D": 62, "F": 65}


def wavetable(harmonics, power):
    k = np.arange(1, harmonics + 1)
    phase = np.linspace(0, 1, 4096, endpoint=False)
    table = (np.sin(2 * np.pi * np.outer(k, phase)) / k[:, None] ** power).sum(axis=0)
    return table / np.abs(table).max()


PAD_TABLE = wavetable(8, 1.35)


def osc(table, freq, n, phase0):
    phase = (phase0 + freq * np.arange(n) / SR) % 1.0
    idx = phase * len(table)
    i0 = idx.astype(np.int64)
    frac = idx - i0
    return table[i0] * (1 - frac) + table[(i0 + 1) % len(table)] * frac


def smooth_env(n, attack, release_at, release):
    """1 after a sine-shaped attack, until release_at (samples), then a
    sine-shaped fall to 0 over `release` samples."""
    env = np.ones(n)
    a = min(attack, n)
    env[:a] = np.sin(0.5 * np.pi * np.arange(a) / max(a, 1)) ** 2
    r0 = min(release_at, n)
    r = np.arange(n - r0)
    env[r0:] *= np.cos(0.5 * np.pi * np.minimum(r / max(release, 1), 1)) ** 2
    return env


def reverb_ir(seconds, rt60_low, rt60_high, rng):
    """A stereo room: decaying noise, the highs dying faster than the lows,
    25 ms before the first reflection."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    lo = butter(2, 1200, "low", fs=SR, output="sos")
    hi = butter(2, 1200, "high", fs=SR, output="sos")
    for ch in range(2):
        noise = rng.standard_normal(n)
        low = sosfilt(lo, noise) * 10 ** (-3 * t / rt60_low)
        high = sosfilt(hi, noise) * 10 ** (-3 * t / rt60_high)
        out[:, ch] = low + 0.6 * high
    out[: int(0.025 * SR)] = 0
    fade_in = int(0.01 * SR)
    out[int(0.025 * SR): int(0.025 * SR) + fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    return out / np.sqrt((out ** 2).sum(axis=0)).max()


def compose(seconds, key, seed, busy):
    """The music for a film of `seconds`: 21 chords of two bars each, from
    the tonic back to the tonic. `busy` lists the times the voice speaks:
    the bell plays fewer notes there."""
    rng = np.random.default_rng(seed)
    total = int(round(seconds * SR))
    tonic = TONIC[key]
    slots = 21  # 21 = 5 x 4 + 1: starts and ends on the home chord
    d = seconds / slots
    beat = d / 8
    pad = np.zeros((total, 2))
    bass = np.zeros(total)
    bell = np.zeros((total, 2))
    pans = [(0.85, 0.35), (0.6, 0.6), (0.35, 0.85)]
    detune = [-5, 0, 5]  # cents
    last_bell = None

    def speaking(t):
        return any(a - 0.3 <= t <= b + 0.3 for a, b in busy)

    for s in range(slots):
        name = PROGRESSION[s % 4]
        chord = CHORDS[name]
        t0 = s * d
        start = int(t0 * SR)
        hold = int(d * SR)
        rel = int(3.0 * SR)
        n = min(total - start, hold + rel)
        # The pad: each note three slightly detuned voices, left, centre,
        # right. (note, from, for how long, attack, release), in samples.
        parts = [(m, 0, hold, int(2.2 * SR), rel) for m in chord["pad"]]
        if "sus" in chord:
            first, then = chord["sus"]
            parts.append((first, 0, hold // 2, int(2.2 * SR), int(1.0 * SR)))
            parts.append((then, hold // 2, hold - hold // 2, int(0.9 * SR), rel))
        for m, off, length, attack, release in parts:
            f = midi_hz(tonic + m)
            for v in range(3):
                a = start + off
                nn = min(total - a, length + release)
                if nn <= 0:
                    continue
                y = osc(PAD_TABLE, f * 2 ** (detune[v] / 1200), nn, rng.random())
                y *= smooth_env(nn, attack, length, release)
                gl, gr = pans[v]
                pad[a:a + nn, 0] += y * gl
                pad[a:a + nn, 1] += y * gr
        # The bass: a soft low note under each chord.
        fb = midi_hz(tonic + chord["bass"])
        tt = np.arange(n) / SR
        yb = np.sin(2 * np.pi * fb * tt) + 0.12 * np.sin(4 * np.pi * fb * tt + 0.3)
        bass[start:start + n] += yb * smooth_env(n, int(1.2 * SR), hold, int(2.5 * SR))
        # The bell: two to four notes in the chord's two bars, a small step
        # from the note before, fewer while the voice speaks.
        patterns = [[0, 3, 5.5], [0.5, 2, 4.5, 6], [0, 4], [1, 2.5, 5], [0, 1.5, 3, 6.5], [2, 5]]
        pattern = patterns[rng.integers(len(patterns))]
        if s == 0:
            pattern = [3, 5.5]       # the music comes in before the bell
        if s == slots - 1:
            pattern = [0, 2.5, 5]    # the last chord: a few notes, then the fade
        for b in pattern:
            tb = t0 + b * beat
            if tb > seconds - 3.0:
                continue
            if speaking(tb) and rng.random() > 0.35:
                continue
            choices = [tonic + m for m in chord["bell"]]
            if last_bell is None:
                note = choices[len(choices) // 2]
            else:
                weights = np.array([1.0 / (1 + abs(c - last_bell)) ** 1.6 for c in choices])
                weights[[c == last_bell for c in choices]] *= 0.3
                note = choices[rng.choice(len(choices), p=weights / weights.sum())]
            last_bell = note
            f = midi_hz(note)
            nb = min(total - int(tb * SR), int(4.5 * SR))
            tt = np.arange(nb) / SR
            y = np.zeros(nb)
            for ratio, amp, decay in [(1, 1.0, 1.9), (2, 0.32, 0.8), (3, 0.10, 0.45), (4.07, 0.05, 0.22)]:
                y += amp * np.sin(2 * np.pi * f * ratio * tt) * np.exp(-tt / decay)
            y *= 1 - np.exp(-tt / 0.006)
            y *= np.cos(0.5 * np.pi * np.clip((tt - (nb / SR - 0.4)) / 0.4, 0, 1)) ** 2
            vel = 0.55 + 0.4 * rng.random()
            pan = 0.35 + 0.3 * rng.random()
            a = int(tb * SR)
            bell[a:a + nb, 0] += y * vel * (1 - pan) * 2
            bell[a:a + nb, 1] += y * vel * pan * 2

    # Warm it: the pad filtered soft, a slow breath in its level.
    pad = sosfilt(butter(2, 1800, "low", fs=SR, output="sos"), pad, axis=0)
    pad = sosfilt(butter(2, 70, "high", fs=SR, output="sos"), pad, axis=0)
    breath = 10 ** ((1.0 * np.sin(2 * np.pi * 0.07 * np.arange(total) / SR)) / 20)
    pad *= breath[:, None]
    bell = sosfilt(butter(2, 3800, "low", fs=SR, output="sos"), bell, axis=0)
    bass = sosfilt(butter(2, 300, "low", fs=SR, output="sos"), bass)
    ir = reverb_ir(3.6, 2.8, 1.3, rng)
    wet_pad = np.stack([oaconvolve(pad[:, c], ir[:, c])[:total] for c in range(2)], axis=1)
    wet_bell = np.stack([oaconvolve(bell[:, c], ir[:, c])[:total] for c in range(2)], axis=1)
    pad_rms = np.sqrt(np.mean(pad ** 2)) + 1e-12
    music = (0.75 * pad + 0.40 * wet_pad * pad_rms / (np.sqrt(np.mean(wet_pad ** 2)) + 1e-12)) / pad_rms
    bell_rms = np.sqrt(np.mean(bell[bell != 0] ** 2)) if np.any(bell) else 1
    music += 0.28 * (0.65 * bell + 0.55 * wet_bell * np.sqrt(np.mean(bell ** 2)) / (np.sqrt(np.mean(wet_bell ** 2)) + 1e-12)) / bell_rms
    music += 0.35 * bass[:, None] / (np.sqrt(np.mean(bass ** 2)) + 1e-12)
    music = sosfilt(butter(2, 30, "high", fs=SR, output="sos"), music, axis=0)
    # In and out.
    fade_in, fade_out = int(2.5 * SR), int(4.0 * SR)
    music[:fade_in] *= (np.sin(0.5 * np.pi * np.arange(fade_in) / fade_in) ** 2)[:, None]
    music[-fade_out:] *= (np.cos(0.5 * np.pi * np.arange(fade_out) / fade_out) ** 2)[:, None]
    return music


def duck_gain(total, busy):
    """The music's gain: 0 dB, and DUCK_DB while the voice speaks (from 0.2 s
    before each line to 0.3 s after, gaps under a second bridged), with a
    0.35 s glide down and a 0.8 s glide back up."""
    spans = []
    for a, b in sorted(busy):
        a, b = a - 0.2, b + 0.3
        if spans and a - spans[-1][1] < 1.0:
            spans[-1][1] = max(spans[-1][1], b)
        else:
            spans.append([a, b])
    db = np.zeros(total)
    t = np.arange(total) / SR
    for a, b in spans:
        down = np.clip((t - (a - 0.35)) / 0.35, 0, 1)
        up = np.clip(1 - (t - b) / 0.8, 0, 1)
        depth = np.minimum(np.sin(0.5 * np.pi * down) ** 2, np.sin(0.5 * np.pi * up) ** 2)
        db = np.minimum(db, DUCK_DB * depth)
    return 10 ** (db / 20), spans


# ---------- captions and the script ----------

def clock(seconds):
    ms = int(round(seconds * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d}.{ms % 1000:03d}"


def mmss(seconds):
    return f"{int(seconds // 60)}:{seconds % 60:05.2f}"


def main():
    mode, film = sys.argv[1], sys.argv[2]
    spec = json.load(open(os.path.join(HERE, "narration.json")))[film]
    video = os.path.normpath(os.path.join(HERE, spec["video"]))
    seconds = mp4_video_seconds(video)
    steps = load_steps(os.path.join(HERE, spec["events"]), seconds)
    lines = spec["lines"]
    if len(lines) != len(steps):
        raise SystemExit(f"{film}: {len(lines)} lines for {len(steps)} steps")
    for i, (line, step) in enumerate(zip(lines, steps)):
        want = line["check"]
        ok = step["card"] if want == "[card]" else (not step["card"] and step["caption"].startswith(want))
        if not ok:
            raise SystemExit(f"{film} line {i}: expected the step '{want}', the film has '{step['caption'] or '[card]'}'")
    voices, word_marks = render_lines(lines)
    placed, problems = [], []
    for i, (line, step, x, marks) in enumerate(zip(lines, steps, voices, word_marks)):
        on, off = speech_span(x)
        speak_at = step["t"] + float(line.get("lead", DEFAULT_LEAD))
        until = float(line.get("until", step["next"]))
        gap = float(line.get("gap", END_GAP))
        speak_end = speak_at + (off - on)
        room = until - gap - speak_at
        placed.append({"i": i, "step": step, "line": line, "x": x, "on": on, "off": off, "marks": marks,
                       "start": speak_at, "end": speak_end, "until": until, "gap": gap})
        flag = "" if speak_end <= until - gap else f"  <-- {speak_end - (until - gap):.2f} s too long"
        if flag:
            problems.append(i)
        print(f"{i:2d} {mmss(step['t'])}-{mmss(until)} speech {off - on:5.2f} s of {room:5.2f} s{flag}  {line.get('say', line['text'])}")
    if problems:
        raise SystemExit(f"{film}: {len(problems)} line(s) run into the next step: {problems}")
    print(f"{film}: every line fits; the film is {seconds:.3f} s")
    if mode == "fit":
        return
    out = os.path.join(WORK, "mix")
    os.makedirs(out, exist_ok=True)
    if mode == "build":
        build_sound(film, spec, seconds, placed, out)
    elif mode != "captions":
        raise SystemExit("mode: fit, build or captions")
    write_captions(film, seconds, placed, out)


def build_sound(film, spec, seconds, placed, out):
    """The voice placed on the film's timeline, the music under it, the
    mix, and its AAC copy; the levels measured into <film>-mix.json."""
    total = int(round(seconds * SR))
    voice = np.zeros(total)
    busy = []
    for p in placed:
        x = p["x"]
        x = sosfilt(butter(2, 70, "high", fs=SR, output="sos"), x)
        on_i, off_i = int(p["on"] * SR), int(p["off"] * SR)
        level = lufs(np.stack([x[on_i:off_i], x[on_i:off_i]], axis=1))
        x = x * 10 ** ((VOICE_LUFS - level) / 20)
        a = int(round((p["start"] - p["on"]) * SR))
        voice[a:a + len(x)] += x[: total - a]
        busy.append((p["start"], p["end"]))
    music = compose(seconds, spec["key"], 5 if film == "field" else 11, busy)
    music *= 10 ** ((MUSIC_LUFS - lufs(music)) / 20)
    gain, spans = duck_gain(total, busy)
    mix = music * gain[:, None] + voice[:, None]
    level = lufs(mix)
    mix *= 10 ** ((TARGET_LUFS - level) / 20)
    # The voice's loudest syllables would pass the ceiling at this level:
    # the limiter takes those few peaks down a little (it reports how much).
    mix, most_limited_db = limit(mix, PEAK_DBTP - 0.7)
    peak = true_peak_db(mix)
    if peak > PEAK_DBTP:
        mix *= 10 ** ((PEAK_DBTP - peak) / 20)
    final_lufs, final_peak = lufs(mix), true_peak_db(mix)
    wav = os.path.join(out, f"{film}-walkthrough.wav")
    wavfile.write(wav, SR, mix.astype(np.float32))
    wavfile.write(os.path.join(out, f"{film}-voice.wav"), SR, voice.astype(np.float32))
    wavfile.write(os.path.join(out, f"{film}-music.wav"), SR, (music * gain[:, None]).astype(np.float32))
    m4a = os.path.join(out, f"{film}-walkthrough.m4a")
    if os.path.exists(m4a):
        os.remove(m4a)
    subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "96000", "-q", "127", wav, m4a], check=True)
    # Under the voice, how far down the music sits (the duck, measured).
    under = np.concatenate([np.arange(int(a * SR), int(b * SR)) for a, b in busy])
    music_under = lufs((music * gain[:, None])[under])
    voice_alone = lufs(np.stack([voice[under], voice[under]], axis=1))
    report = {
        "film": film, "seconds": seconds, "samples": total, "lufs": round(final_lufs, 2),
        "true_peak_db": round(final_peak, 2), "voice_lufs_while_speaking": round(voice_alone, 2),
        "music_lufs_under_voice": round(music_under, 2), "music_lufs_alone": round(lufs(music), 2),
        "duck_db": DUCK_DB, "lines": len(placed), "most_limited_db": round(most_limited_db, 2),
        "voice_share": round(sum(b - a for a, b in busy) / seconds, 3), "m4a_bytes": os.path.getsize(m4a),
    }
    json.dump(report, open(os.path.join(out, f"{film}-mix.json"), "w"), indent=1)
    print(json.dumps(report))
    print("wrote", wav, m4a)


def write_captions(film, seconds, placed, out):
    """The captions (WebVTT) and the narration script (Markdown)."""
    # Each line from when it is spoken until a moment after, never into the
    # next line or past the film's end. A line longer than two caption lines
    # is shown in parts, each from the moment its first word is spoken (the
    # voice's own word marks); each part is set in at most two lines.
    cues = []
    for k, p in enumerate(placed):
        line_end = p["end"] + 0.7
        if k + 1 < len(placed):
            line_end = min(line_end, placed[k + 1]["start"] - 0.1)
        line_end = min(line_end, p["until"], seconds - 0.05)
        text = p["line"]["text"]
        parts = caption_parts(text)
        if len(parts) > 1 and p["line"].get("say", text) != text:
            raise SystemExit(f"line {p['i']}: a long caption must be said as written, to be split by its words")
        starts = [p["start"]]
        for offset, _ in parts[1:]:
            mark = next((m for m in p["marks"] if m["loc"] >= offset), None)
            if mark is None:
                raise SystemExit(f"line {p['i']}: no word mark at or after character {offset}")
            starts.append(p["start"] + mark["sample"] / SR - p["on"])
        for j, (_, part) in enumerate(parts):
            end = starts[j + 1] - 0.05 if j + 1 < len(parts) else line_end
            cues.append((starts[j], end, two_lines(part)))
    for (a1, b1, _), (a2, _, _) in zip(cues, cues[1:]):
        assert a1 < b1 <= a2, "captions must not overlap"
    title = "Field" if film == "field" else "Atlas"
    vtt = ["WEBVTT", "",
           "NOTE",
           f"The narration of the {title} walkthrough film ({film}-walkthrough.mp4), as",
           "captions. They sit at the top of the picture (line:5%), so they never",
           "cover the film's own caption bar at its foot. The words, with the times",
           "they are spoken, are the narration script.", ""]
    for start, end, text in cues:
        vtt += [f"{clock(start)} --> {clock(end)} line:5%", text, ""]
    vtt_path = os.path.join(out, f"{film}-walkthrough.vtt")
    open(vtt_path, "w").write("\n".join(vtt))

    md = [f"# The {title} walkthrough: narration script", "",
          f"The film is public/site/film/{film}-walkthrough.mp4 ({seconds:.2f} s). Each line is spoken by the "
          "Siri voice Nora over quiet original music; the same words are the film's English captions "
          f"(public/site/film/{film}-walkthrough.vtt). To re-record it in another voice, record each line on its "
          "own and keep it inside its window: it starts just after its step begins and must end before the next "
          "step does (the 'Ends by' column).", "",
          "| Step on screen | Film's own caption | Narration | Voice starts | Voice ends | Ends by |",
          "| --- | --- | --- | --- | --- | --- |"]
    said = []
    for p in placed:
        step = p["step"]
        caption = "(opening card)" if step["card"] and p["i"] == 0 else ("(closing card)" if step["card"] else step["caption"])
        md.append(f"| {mmss(step['t'])} | {caption} | {p['line']['text']} | {mmss(p['start'])} | {mmss(p['end'])} | {mmss(p['until'] - p['gap'])} |")
        if p["line"].get("say", p["line"]["text"]) != p["line"]["text"]:
            said.append(f"- At {mmss(p['start'])} the voice says: \"{p['line']['say']}\"")
    if said:
        md += ["", "Said differently from how it is written (so the voice pronounces it right):", ""] + said
    levels = json.load(open(os.path.join(out, f"{film}-mix.json")))
    md += ["", f"Mix: {levels['lufs']:.1f} LUFS, peaks {levels['true_peak_db']:.1f} dBTP; the music is "
           f"{abs(levels['duck_db']):.0f} dB lower while the voice speaks.", ""]
    open(os.path.join(WORK, f"narration-{film}.md"), "w").write("\n".join(md))
    print("wrote", vtt_path, os.path.join(WORK, f"narration-{film}.md"))


if __name__ == "__main__":
    main()
