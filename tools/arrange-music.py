#!/usr/bin/env python3
# Arranges a recorded song (Suno stems) into a mission's soundtrack: whole bars of the stems, cut on downbeats,
# laid out over the mission's clock with per-section stem levels, plus a separate ending for the jump.
#
#   python3 tools/arrange-music.py hull --analyze   beat-track the stems, find the downbeats, print a bar table
#                                                   (which stems play in which bar, its chord) and cache the
#                                                   downbeats in assets/music/<piece>/bars.json
#   python3 tools/arrange-music.py hull             render assets/music/<piece>/main.mp3 + ending.mp3 and the
#                                                   arrangement's data js/music/recorded-<piece>.js (bar lines,
#                                                   the loop, the level), from the cached downbeats
#   python3 tools/arrange-music.py hull --wav out.wav [--jump 308]   one listening render (the jump: the ending
#                                                   from the next bar line after it; default: no jump)
#
# The stems (12 WAVs from Suno, ~550 MB) live in assets/music/<Stem folder>/ and are NOT in git (.gitignore);
# only the rendered MP3s, bars.json and the data file are. Needs numpy, scipy and ffmpeg.
#
# How it works (2026-10-25, Pressure Hull for c7):
#  - Beats: an onset envelope (spectral flux, 100 frames a second) of the summed stems (or the full mix, if it's
#    there) and a dynamic-programming beat tracker (Ellis 2007) around the song's tempo: Suno drifts (Pressure Hull
#    goes 85 → 88 bpm), so no fixed grid. Downbeats: the beat phase (mod 4) where the chords change most.
#  - The arrangement (PIECES below): sections of whole source bars [first, end), each with dB per stem (OFF: muted),
#    placed one after another. Cuts get short crossfades (30 ms drums/percussion, 120 ms sustained stems);
#    runs that continue in the source with the same levels aren't cut at all.
#  - main.mp3 is the whole arrangement without the ending; it's laid out for the mission + 30 s (as the synth
#    music: MUSIC_TAIL, js/game.js), the last section is the loop (a late jump). ending.mp3: the song's own ending,
#    with PREROLL s of silence before its first downbeat: the game starts it muted ~2 s ahead and steers it onto the
#    first bar line of main at least 1.6 s after the jump (an audio element starts 0.1-0.3 s late after play()).
#  - Loudness: both files are encoded at ENC_LUFS; the data file's `gain` brings them to the synth music's level
#    (LEVEL_LUFS, measured on an offline render of the synth Pressure Hull through the music bus).
import argparse, json, os, subprocess, sys, tempfile, warnings
import numpy as np, scipy.io.wavfile as wavfile, scipy.signal as sig

warnings.filterwarnings('ignore')
ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..'))
SR, OFF, PREROLL = 48000, -99, 2.5    # (PREROLL: silence before the ending's downbeat: the game starts it muted that early and steers it onto main's bar line)
ENC_LUFS, LEVEL_LUFS, MUSIC_VOL = -16.0, -21.5, 0.25   # (MUSIC_VOL: js/music.js VOL, the bus the recording plays through)

STEMS = {'LV': '0 Lead Vocals', 'BV': '1 Backing Vocals', 'Dr': '2 Drums', 'Ba': '3 Bass', 'Gt': '4 Guitar', 'Ky': '5 Keyboard',
         'Pc': '6 Percussion', 'St': '7 Strings', 'Sy': '8 Synth', 'Ot': '9 Other', 'Br': '10 Brass', 'Ww': '11 Woodwinds'}
SUSTAINED = {'Ba', 'St', 'Sy', 'Ky', 'Br', 'Ww', 'LV', 'BV', 'Gt'}       # longer crossfades at cuts
def mix(**g):
    d = {k: 0 for k in STEMS}; d.update(g); return d

# Pressure Hull (c7, 300 s, jump at 300): the hot times are at 70% / 90% of the mission (js/mission.js DENSITY); it
# only gets hot ~15 s after the encounters arrive, so the climaxes come that much later. Encounters for 3 crew:
# 0:10, 0:28, 1:21, 2:10, 2:45, 3:15, 3:41, 4:06, 4:30.
CALM = mix(Dr=OFF, Pc=OFF, Ba=-4, Br=OFF, LV=OFF, BV=OFF, Gt=OFF)
LOW = mix(Dr=OFF, Pc=-8, Br=-6, Ky=-3, Ot=-3, St=-3, Ba=-4, LV=OFF, BV=OFF, Gt=OFF)
B1 = mix(Dr=-6, Pc=-4, Br=-4, LV=OFF, BV=OFF, Gt=-6)
B2 = mix(Dr=-3, Pc=-2, Br=-2, BV=OFF)
MID = mix(LV=OFF, BV=OFF)
HOTA = mix(LV=OFF, BV=OFF, Gt=-6)
FULL = mix(Br=2, St=1)
PIECES = {
    'hull': {
        'title': 'Pressure Hull (recorded)', 'stems': 'Hull Pressure', 'mix': 'Hull Pressure.wav', 'bpm': 87, 'missions': ['c7'],
        'plan': [('Drifting in (sonar, synth, strings)', 0, 8, CALM),     # (covers the first encounter at 0:10)
                 ('First contacts: drums in', 1, 11, MID),                # 0:22
                 ('Calm', 11, 22, LOW),                                   # 0:51, the density's valley
                 ('Building', 22, 31, B1),
                 ('Woodwinds, distant voice', 31, 39, B2),
                 ('Building more', 11, 22, MID),
                 ('Rising', 37, 48, MID),
                 ('Hull squeeze, drums build', 48, 56, MID),              # 3:09
                 ('Hot time 1: climax', 56, 65, HOTA),                    # 3:31
                 ('Still hot: drums drive on', 49, 56, MID),
                 ('Hot time 2: full climax', 56, 73, FULL),               # 4:15, through the jump at 5:00
                 ('Still rising (the tail past the jump)', 57, 73, FULL)],   # the loop, if the jump is late
        'ending': (75, 79, FULL),
    },
}

def load(path):
    _, x = wavfile.read(path)
    x = x.astype(np.float32) / (32768 if x.dtype == np.int16 else 1)
    return x if x.ndim == 2 else np.stack([x, x], 1)

def stem_dir(P): return os.path.join(ROOT, 'assets', 'music', P['stems'])
def out_dir(name): return os.path.join(ROOT, 'assets', 'music', name)

# ---------------------------------------------------------------- analysis
def onset(m, fps=100):
    hop = SR // fps
    _, _, Z = sig.stft(m, SR, nperseg=2048, noverlap=2048 - hop)
    S = np.log1p(100 * np.abs(Z)); o = np.maximum(0, np.diff(S, axis=1)).sum(0)
    return np.maximum(o - sig.medfilt(o, 31), 0)

def track(o, bpm, fps=100, tight=100):          # Ellis' dynamic-programming beat tracker
    p = fps * 60 / bpm; n = len(o); score = o.copy(); back = -np.ones(n, int)
    lags = np.arange(int(-2 * p), int(-p / 2)); tx = -tight * np.log(-lags / p) ** 2
    for i in range(n):
        lo = i + lags; ok = lo >= 0
        if ok.any():
            c = tx[ok] + score[lo[ok]]; j = np.argmax(c); score[i] = o[i] + c[j]; back[i] = lo[ok][j]
    i = int(np.argmax(score[-int(p * 2):]) + n - int(p * 2)); b = [i]
    while back[b[-1]] >= 0: b.append(back[b[-1]])
    return np.array(b[::-1]) / fps

def chroma_per_beat(h, beats):
    f, _, Z = sig.stft(h, SR, nperseg=8192, noverlap=8192 - 480); M = np.abs(Z)[1:]; fr = f[1:]
    pc = np.round(12 * np.log2(fr / 440)).astype(int) % 12; ok = (fr > 50) & (fr < 2000)
    C = np.array([M[ok & (pc == k)].sum(0) for k in range(12)]); C /= C.sum(0) + 1e-9
    bi = np.clip((beats * 100).astype(int), 0, C.shape[1] - 1)
    return np.array([C[:, bi[i]:bi[i + 1]].mean(1) for i in range(len(beats) - 1)])

def analyze(name):
    P = PIECES[name]; d = stem_dir(P)
    stems = {k: load(os.path.join(d, v + '.wav')).mean(1) for k, v in STEMS.items()}
    mixp = os.path.join(d, P.get('mix') or '')
    m = load(mixp).mean(1) if P.get('mix') and os.path.exists(mixp) else sum(stems.values())
    o = onset(m); o /= o.std()
    beats = track(o, P['bpm'])
    ib = np.diff(beats)
    print(f'{len(beats)} beats; bpm by 20 s:', ' '.join(f'{t0}:{60 / np.median(ib[(beats[:-1] >= t0) & (beats[:-1] < t0 + 20)]):.1f}'
                                                 for t0 in range(0, int(beats[-1]) - 5, 20)))
    cb = chroma_per_beat(stems['St'] + stems['Ba'] + stems['Ky'] + stems['Sy'], beats)
    chg = np.r_[0, np.linalg.norm(np.diff(cb, axis=0), axis=1)]
    ph = int(np.argmax([chg[k::4].mean() for k in range(4)]))      # the downbeat: where the chords change
    bars = beats[ph::4]
    notes = 'A A# B C C# D D# E F F# G G#'.split()
    print('bar     t ' + ' '.join(f'{k:>3s}' for k in STEMS) + '  chord')
    for i in range(len(bars) - 1):
        a, e = int(bars[i] * SR), int(bars[i + 1] * SR)
        db = [max(-60, int(20 * np.log10(np.sqrt((s[a:e] ** 2).mean()) + 1e-9))) for s in stems.values()]
        print(f'{i:3d} {bars[i]:6.1f} ' + ' '.join(f'{v:3d}' for v in db) + '  ' + notes[int(np.argmax(cb[ph + 4 * i:ph + 4 * i + 4].mean(0)))])
    os.makedirs(out_dir(name), exist_ok=True)
    json.dump([round(float(b), 4) for b in bars], open(os.path.join(out_dir(name), 'bars.json'), 'w'))
    print('downbeats cached in', os.path.relpath(os.path.join(out_dir(name), 'bars.json'), ROOT))

# ---------------------------------------------------------------- rendering
def xf(n): t = np.linspace(0, 1, n, dtype=np.float32); return np.sin(t * np.pi / 2) ** 2

class Song:
    def __init__(self, name):
        self.P = PIECES[name]; d = stem_dir(self.P)
        self.bars = np.array(json.load(open(os.path.join(out_dir(name), 'bars.json'))))
        self.stems = {k: load(os.path.join(d, v + '.wav')) for k, v in STEMS.items()}
        self.n = len(self.stems['Dr'])
    def bar_t(self, i): return self.bars[i] if i < len(self.bars) else self.n / SR
    def layout(self, plan):                         # [(t in the arrangement, label, a, b, gains)], its length
        t, out = 0.0, []
        for lab, a, b, g in plan: out.append((t, lab, a, b, g)); t += self.bar_t(b) - self.bar_t(a)
        return out, t
    def place(self, out, t0, a, b, g, prev_cont, next_cont, clip=None):
        """Adds source bars [a, b) at t0 s of out (crossfaded unless the neighbour continues the source)."""
        s0, s1 = int(self.bar_t(a) * SR), int(self.bar_t(b) * SR); p = int(t0 * SR); N = len(out)
        for k, x in self.stems.items():
            if g[k] <= OFF: continue
            f = int((0.12 if k in SUSTAINED else 0.03) * SR)
            lo = s0 - (0 if prev_cont else f // 2); hi = s1 + (0 if next_cont else f // 2)
            if clip is not None: hi = min(hi, s0 + clip)
            seg = np.zeros((hi - lo, 2), np.float32); src = x[max(0, lo):min(len(x), hi)]
            seg[max(0, lo) - lo:max(0, lo) - lo + len(src)] = src
            seg *= 10 ** (g[k] / 20)
            if not prev_cont: seg[:f] *= xf(f)[:, None]
            if not next_cont: seg[-f:] *= xf(f)[::-1][:, None]
            st = p - (s0 - lo); a0 = max(0, st); e = min(N, st + len(seg))
            if e > a0: out[a0:e] += seg[a0 - st:e - st]
    def render(self, plan, jump=None, ending=True, lead=0.0):
        """The arrangement (+ the ending from the first bar line after `jump`); lead: silence before it (s)."""
        lay, total = self.layout(plan)
        cut = total
        if jump is not None:
            for t0, _, a, b, _ in lay:
                hit = [t0 + self.bar_t(i) - self.bar_t(a) for i in range(a, b) if t0 + self.bar_t(i) - self.bar_t(a) >= jump]
                if hit: cut = hit[0]; break
        ea, eb, eg = self.P['ending']
        elen = self.bar_t(eb) - self.bar_t(ea) if ending else 0
        out = np.zeros((int((lead + cut + elen + 0.5) * SR), 2), np.float32)
        for i, (t0, lab, a, b, g) in enumerate(lay):
            if t0 >= cut: break
            prev_cont = i > 0 and lay[i - 1][3] == a and lay[i - 1][4] == g
            nxt = lay[i + 1] if i + 1 < len(lay) else None
            next_cont = bool(nxt) and nxt[2] == b and nxt[4] == g and nxt[0] < cut
            clip = int((cut - t0) * SR) if t0 + self.bar_t(b) - self.bar_t(a) > cut else None
            self.place(out, lead + t0, a, b, g, prev_cont, next_cont, clip)
        if ending: self.place(out, lead + cut, ea, eb, eg, False, True)
        return out, lay, total, cut

def loudness(wav):
    r = subprocess.run(['ffmpeg', '-nostats', '-i', wav, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(r.split('Integrated loudness:')[1].split('I:')[1].split('LUFS')[0])

def encode(x, path, gain_db):
    with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
        wavfile.write(tmp.name, SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp.name, '-af', f'volume={gain_db:.2f}dB,alimiter=limit=0.95:level=false',
                        '-ar', '44100', '-b:a', '160k', path], check=True)

def build(name):
    S = Song(name); P = S.P
    main, lay, total, _ = S.render(P['plan'], ending=False)
    main = main[:int((total + 0.07) * SR)]                       # (the last cut's fade-out tail)
    ea, eb, eg = P['ending']; elen = S.bar_t(eb) - S.bar_t(ea)
    end = np.zeros((int((PREROLL + elen + 0.1) * SR), 2), np.float32)
    S.place(end, PREROLL, ea, eb, eg, False, True)
    fade = int(1.5 * SR); end[-fade:] *= np.linspace(1, 0, fade)[:, None]
    pk = max(np.abs(main).max(), np.abs(end).max()); sc = 0.89 / pk if pk > 0.89 else 1
    main *= sc; end *= sc
    with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:          # one gain for both, from main's loudness
        wavfile.write(tmp.name, SR, (main * 32767).astype(np.int16)); I = loudness(tmp.name)
    g = ENC_LUFS - I
    D = out_dir(name); os.makedirs(D, exist_ok=True)
    encode(main, os.path.join(D, 'main.mp3'), g); encode(end, os.path.join(D, 'ending.mp3'), g)
    # bar lines of main: every downbeat of every section, and the end (the loop's end is a bar line too)
    bars = sorted({round(t0 + S.bar_t(i) - S.bar_t(a), 3) for t0, _, a, b, _ in lay for i in range(a, b)} | {round(total, 3)})
    loop = [round(lay[-1][0], 3), round(total, 3)]
    data = {'name': name, 'title': P['title'], 'missions': P['missions'], 'main': f'assets/music/{name}/main.mp3',
            'ending': f'assets/music/{name}/ending.mp3', 'length': round(total, 3), 'loop': loop, 'preroll': PREROLL,
            'gain': round(10 ** ((LEVEL_LUFS - ENC_LUFS) / 20) / MUSIC_VOL, 4),
            'sections': [{'t': round(t0, 2), 'label': lab} for t0, lab, *_ in lay], 'bars': bars}
    js = os.path.join(ROOT, 'js', 'music', f'recorded-{name}.js')
    with open(js, 'w') as f:
        f.write(f'// {P["title"]}: generated by tools/arrange-music.py {name} (do not edit; change the arrangement there and\n'
                f'// rerun it). The recording\'s files, its bar lines (s into main.mp3), the loop for a late jump, its level.\n')
        f.write('music.record(' + json.dumps(data, separators=(',', ':')) + ');\n')
    for t0, lab, a, b, _ in lay: print(f'{t0:6.1f}s  {lab:42s} source bars {a}-{b - 1}')
    print(f'main {total:.1f} s, loop {loop}, loudness {I:.1f} → {ENC_LUFS} LUFS, files in {os.path.relpath(D, ROOT)}, data {os.path.relpath(js, ROOT)}')

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Arrange a recorded song into a mission soundtrack (see the top of this file).')
    ap.add_argument('piece', choices=sorted(PIECES)); ap.add_argument('--analyze', action='store_true')
    ap.add_argument('--wav'); ap.add_argument('--jump', type=float)
    A = ap.parse_args()
    if A.analyze: analyze(A.piece)
    elif A.wav:
        S = Song(A.piece); out, lay, total, cut = S.render(S.P['plan'], jump=A.jump)
        fade = int(1.5 * SR); out[-fade:] *= np.linspace(1, 0, fade)[:, None]
        pk = np.abs(out).max(); out *= 0.89 / pk if pk > 0.89 else 1
        wavfile.write(A.wav, SR, (out * 32767).astype(np.int16)); print(f'{A.wav}: arrangement {total:.1f} s, ending at {cut:.1f} s')
    else: build(A.piece)
