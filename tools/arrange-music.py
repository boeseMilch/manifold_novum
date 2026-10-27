#!/usr/bin/env python3
# Arranges a recorded song (Suno stems) into a mission's soundtrack: whole bars of the stems, cut on downbeats,
# laid out over the mission's clock with per-section stem levels, plus a separate ending for the jump.
# Pieces: hull (Pressure Hull, c7), tick (Last Jump Home from "Final Tick", c8).
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
# The stems (12 / 9 WAVs from Suno, 550 / 220 MB) live in assets/music/<Stem folder>/ and are NOT in git (.gitignore);
# only the rendered MP3s, bars.json and the data file are. Needs numpy, scipy and ffmpeg.
#
# How it works (2026-10-25, Pressure Hull for c7):
#  - Beats: an onset envelope (spectral flux, 100 frames a second) of the summed stems (or the full mix, if it's
#    there) and a dynamic-programming beat tracker (Ellis 2007) around the song's tempo: Suno drifts (Pressure Hull
#    goes 85 → 88 bpm; Final Tick holds 139.5), so no fixed grid. Downbeats: the beat phase (mod 4) where the chords
#    change most.
#  - The arrangement (PIECES below): sections of whole source bars [first, end), each with dB per stem (OFF: muted),
#    placed one after another (a section may repeat or reorder source bars: a 2-minute song fills an 8-minute
#    mission); 'All' in the levels: dB on the whole section (the arc's build). Cuts get short crossfades (30 ms
#    drums/percussion, 120 ms sustained stems); runs that continue in the source with the same levels aren't cut at all.
#  - main.mp3 is the whole arrangement without the ending; it's laid out for the mission + 30 s (as the synth
#    music: MUSIC_TAIL, js/game.js), the last section (or the last `loop` ones) is the loop (a late jump); bar lines in
#    the data every `bar_step` source bars (2: whole half-time bars). ending.mp3: the song's own ending (one section or
#    a list, the last cut at `ending_stop` s of the source),
#    with PREROLL s of silence before its first downbeat: the game starts it muted ~2 s ahead and steers it onto the
#    first bar line of main at least 1.6 s after the jump (an audio element starts 0.1-0.3 s late after play()); with
#    `release` (c8) the game asks for it earlier, at the engine blast (music.release()).
#  - Loudness: both files are encoded at ENC_LUFS; the data file's `gain` brings them to the synth music's level
#    (LEVEL_LUFS, measured on an offline render of the synth Pressure Hull through the music bus).
import argparse, json, os, subprocess, sys, tempfile, warnings
import numpy as np, scipy.io.wavfile as wavfile, scipy.signal as sig

warnings.filterwarnings('ignore')
ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..'))
SR, OFF, PREROLL = 48000, -99, 2.5    # (PREROLL: silence before the ending's downbeat: the game starts it muted that early and steers it onto main's bar line)
ENC_LUFS, LEVEL_LUFS, MUSIC_VOL = -16.0, -21.5, 0.25   # (MUSIC_VOL: js/music.js VOL, the bus the recording plays through)

# The stems of a piece (its 'files'): short name → WAV file name (without .wav) in its stem folder.
HULL_STEMS = {'LV': '0 Lead Vocals', 'BV': '1 Backing Vocals', 'Dr': '2 Drums', 'Ba': '3 Bass', 'Gt': '4 Guitar', 'Ky': '5 Keyboard',
              'Pc': '6 Percussion', 'St': '7 Strings', 'Sy': '8 Synth', 'Ot': '9 Other', 'Br': '10 Brass', 'Ww': '11 Woodwinds'}
TICK_STEMS = {'Dr': '0 Drums', 'Ba': '1 Bass', 'Ky': '2 Keyboard', 'Pc': '3 Percussion', 'St': '4 Strings', 'Sy': '5 Synth', 'Ot': '6 Other',
              'Br': '7 Brass', 'Ww': '8 Woodwinds'}
SUSTAINED = {'Ba', 'St', 'Sy', 'Ky', 'Br', 'Ww', 'LV', 'BV', 'Gt'}       # longer crossfades at cuts
def mix(**g):                                 # dB per stem (a stem not named: 0 dB, as recorded; All: dB on top for every stem)
    return dict(g)
def lv(g, db): return {**g, 'All': db}        # a mix, db quieter / louder as a whole (the arc's level)

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
# Last Jump Home, recorded (c8, "Final Tick" from Suno: 9 stems, 2:08, 139.5 bpm half-time (the snare on 3), G minor;
# 74 bars of 1.72 s in 8-bar phrases from bar 0). Its sections (tools/arrange-music.py tick --analyze):
#   0-7 intro (music box, synth, the tick; bass hits 3-5)  8-15 verse (light drums, bass, low strings, woodwinds 13-15)
#   16-23 drop 1 (drums, bass, brass)  24-31 drop 1 + strings (Gm, D, F major; drums out in 31)  32-39 drop 2 (heavier
#   bass, brass hits)  40-47 strings over drums (45-47: bass out, a strings swell, drums out in 47)  48-55 drop 3 (the
#   fullest)  56-63 the synth groove (keys out; a strings swell C → D in 62-63)  64-67 breakdown (music box, no bass)
#   68-71 the last build (bass out, a gap in 71)  72-73 the final hit, an open G ringing (the file stops at 128 s).
# c8 (js/progress.js, spacing 'even'): the encounters evenly from 0:30 (spores) to the leviathan at 4:30 (270 s, every
# crew size; the mother and the grappler early on, then herds and the one tide); the fight (~3.5 min: the pass, the gas
# ~6:00 for 25 s, the side, behind and the override ~7:30-8:00) holds the jump drive; the engine blast frees it, the
# ship jumps 10 s later by itself (no handle). The nominal jump is at 500 s; main runs to ~530 s, its last 24 bars
# loop for a long fight. The ending comes with the engine blast (release: 'blast'), not with the jump.
T_SOFT = mix(Dr=OFF, Pc=OFF)                       # music box and low strings
T_VERSE = mix(Dr=-4, Pc=-3)
T_THIN = mix(Dr=-6, Pc=-4, Br=-8, Ba=-3)           # the first impact, held back
T_MOTHER = mix(Dr=-2, Br=-3)
T_GROOVE = mix(Dr=-4, Pc=-3, Br=-6)
T_BREAK = mix(Dr=OFF, Pc=-6)
T_LOW = mix(Dr=-8, Pc=-6, Br=-8, Ba=-4)            # the valley after the grappler
T_B1 = mix(Dr=-5, Pc=-3, Br=-5)
T_B2 = mix(Dr=-3, Pc=-2, Br=-3)
T_MID = mix()
T_HOT = mix(Br=1, St=1)
T_FULL = mix(Br=2, St=2, Ba=1)                     # the leviathan, the last push
T_BREATH = mix(Dr=OFF, Pc=OFF, Ba=OFF, Br=-6, Ot=-6)   # the held breath: music box and strings only
T_RELEASE = mix(Dr=OFF, Pc=-12, Ba=-6, St=3)
TICK_PLAN = [
    ('Intro: the tick, the music box', 0, 8, lv(mix(), -8)),
    ('Low strings under the music box', 8, 16, lv(T_SOFT, -7)),
    ('Spores: light drums', 8, 16, lv(T_VERSE, -6)),                              # 0:27 (spores 0:30)
    ('First impact, held back', 16, 24, lv(T_THIN, -5)),                          # 0:41
    ('Strings swell, silence', 44, 48, lv(mix(), -4.5)),                            # 0:55
    ('The spore mother: drop', 48, 56, lv(T_MOTHER, -3.5)),                         # 1:02 (the mother ~1:00)
    ('Synth groove', 56, 64, lv(T_GROOVE, -4.5)),
    ('Music box, the tick', 64, 68, lv(T_BREAK, -6)),                             # 1:29
    ('Build', 68, 72, lv(mix(), -4)),
    ('The grappler: drop', 32, 40, lv(T_MID, -3)),                                # 1:43 (the grappler ~1:40)
    ('Strings over drums', 40, 44, lv(T_MID, -3.5)),
    ('Herds and tides: the valley', 8, 16, lv(T_LOW, -5)),                        # 2:04
    ('Rising 1', 16, 32, lv(T_B1, -4)),                                           # 2:17
    ('Rising 2', 32, 40, lv(T_B2, -3.5)),                                           # 2:45
    ('Rising 3: synth groove', 56, 64, lv(T_MID, -3)),
    ('Rising 4: drop 3', 48, 56, lv(T_MID, -2.5)),                                  # 3:12
    ('Rising 5: strings', 24, 32, lv(T_HOT, -2)),
    ('Rising 6', 32, 40, lv(T_HOT, -1.5)),                                          # 3:40
    ('Swell, silence: not yet', 40, 48, lv(T_HOT, -1.5)),                           # 3:53
    ('Something huge: the music box alone', 62, 72, lv(T_BREAK, -4)),             # 4:07
    ('It comes: swell, silence', 44, 48, lv(T_HOT, -1)),                          # 4:24
    ('THE LEVIATHAN: the biggest drop (climax)', 48, 56, T_FULL),         # 4:31 (it arrives 4:30-4:35)
    ('The fight: synth groove (climax)', 56, 64, T_FULL),
    ('The fight: drop 1 and strings', 16, 32, lv(T_HOT, -0.5)),                     # 4:59
    ('The fight: drop 2', 32, 40, T_FULL),                                # 5:26
    ('The fight: strings, swell', 40, 48, lv(T_HOT, -0.5)),                         # 5:40
    ('Held breath: the gas (music box)', 64, 68, lv(T_BREATH, -2)),               # 5:54 (the gas ~6:00-6:25)
    ('Held breath: strings', 8, 16, lv(T_BREATH, -2)),                            # 6:00
    ('Out again: build', 68, 72, lv(mix(), -1)),                                  # 6:14
    ('The side: drop 3 (climax)', 48, 56, T_HOT),                         # 6:21
    ('The side: groove', 56, 64, lv(T_HOT, -0.5)),
    ('Behind us: drop 2', 32, 40, lv(T_HOT, -0.5)),                                 # 6:49
    ('Behind us: strings', 24, 32, T_FULL),                               # 7:02
    ('The override: swell, silence', 40, 48, T_FULL),                     # 7:16 (the override ~7:30)
    ('LAST PUSH (climax)', 48, 56, T_FULL),                               # 7:30
    ('Last push: drop 1 and strings (climax)', 16, 32, T_FULL),           # 7:43
    ('Still fighting: drop 2 (the loop, climax)', 32, 40, T_FULL),        # 8:11: the loop (41 s), if the fight runs long
    ('Still fighting: drop 3, groove (the loop, climax)', 48, 64, T_FULL),
]
PIECES = {
    'hull': {
        'title': 'Pressure Hull (recorded)', 'stems': 'Hull Pressure', 'files': HULL_STEMS, 'mix': 'Hull Pressure.wav', 'bpm': 87, 'missions': ['c7'], 'jump': 300,
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
    'tick': {
        'title': 'Last Jump Home (recorded)', 'stems': 'Final Tick', 'files': TICK_STEMS, 'bpm': 140, 'missions': ['c8'], 'jump': 500,
        'bar_step': 2, 'loop': -2, 'release': 'blast', 'plan': TICK_PLAN,
        # the ending (from the engine blast on, music.release(): js/game.js): D major → F major on soaring strings, no drums,
        # then the song's last hit, an open G (the tonic: bVII → I) ringing out (cut before the clipped next bar at 127.75 s)
        'ending': [(26, 30, T_RELEASE), (72, 74, mix(St=3))], 'ending_stop': 127.6, 'ending_fade': 2.5,
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
    stems = {k: load(os.path.join(d, v + '.wav')).mean(1) for k, v in P['files'].items()}
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
    print('bar     t ' + ' '.join(f'{k:>3s}' for k in P['files']) + '  chord')
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
        self.stems = {k: load(os.path.join(d, v + '.wav')) for k, v in self.P['files'].items()}
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
            if g.get(k, 0) <= OFF: continue
            f = int((0.12 if k in SUSTAINED else 0.03) * SR)
            lo = s0 - (0 if prev_cont else f // 2); hi = s1 + (0 if next_cont else f // 2)
            if clip is not None: hi = min(hi, s0 + clip)
            seg = np.zeros((hi - lo, 2), np.float32); src = x[max(0, lo):min(len(x), hi)]
            seg[max(0, lo) - lo:max(0, lo) - lo + len(src)] = src
            seg *= 10 ** ((g.get(k, 0) + g.get('All', 0)) / 20)
            if not prev_cont: seg[:f] *= xf(f)[:, None]
            if not next_cont: seg[-f:] *= xf(f)[::-1][:, None]
            st = p - (s0 - lo); a0 = max(0, st); e = min(N, st + len(seg))
            if e > a0: out[a0:e] += seg[a0 - st:e - st]
    def ending(self):                               # the ending's sections [(a, b, gains)] and their length (s)
        E = self.P['ending']; E = [E] if isinstance(E, tuple) else E
        stop = self.P.get('ending_stop')            # (s in the source: the last section rings out to there, not to its bar line)
        return E, sum(self.bar_t(b) - self.bar_t(a) for a, b, _ in E[:-1]) + (stop if stop else self.bar_t(E[-1][1])) - self.bar_t(E[-1][0])
    def place_ending(self, out, t0):
        E, _ = self.ending(); stop = self.P.get('ending_stop')
        for i, (a, b, g) in enumerate(E):
            last = i == len(E) - 1
            prev_cont = i > 0 and E[i - 1][1] == a and E[i - 1][2] == g
            next_cont = last or (E[i + 1][0] == b and E[i + 1][2] == g)
            self.place(out, t0, a, b, g, prev_cont, next_cont, int((stop - self.bar_t(a)) * SR) if last and stop else None)
            t0 += self.bar_t(b) - self.bar_t(a)
    def render(self, plan, jump=None, ending=True, lead=0.0):
        """The arrangement (+ the ending from the first bar line after `jump`); lead: silence before it (s)."""
        lay, total = self.layout(plan)
        cut = total
        if jump is not None:
            for t0, _, a, b, _ in lay:
                hit = [t0 + self.bar_t(i) - self.bar_t(a) for i in range(a, b) if t0 + self.bar_t(i) - self.bar_t(a) >= jump]
                if hit: cut = hit[0]; break
        elen = self.ending()[1] if ending else 0
        out = np.zeros((int((lead + cut + elen + 0.5) * SR), 2), np.float32)
        for i, (t0, lab, a, b, g) in enumerate(lay):
            if t0 >= cut: break
            prev_cont = i > 0 and lay[i - 1][3] == a and lay[i - 1][4] == g
            nxt = lay[i + 1] if i + 1 < len(lay) else None
            next_cont = bool(nxt) and nxt[2] == b and nxt[4] == g and nxt[0] < cut
            clip = int((cut - t0) * SR) if t0 + self.bar_t(b) - self.bar_t(a) > cut else None
            self.place(out, lead + t0, a, b, g, prev_cont, next_cont, clip)
        if ending: self.place_ending(out, lead + cut)
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
    elen = S.ending()[1]
    end = np.zeros((int((PREROLL + elen + 0.1) * SR), 2), np.float32)
    S.place_ending(end, PREROLL)
    fade = int(P.get('ending_fade', 1.5) * SR); end[-fade:] *= np.linspace(1, 0, fade)[:, None]
    pk = max(np.abs(main).max(), np.abs(end).max()); sc = 0.89 / pk if pk > 0.89 else 1
    main *= sc; end *= sc
    with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:          # one gain for both, from main's loudness
        wavfile.write(tmp.name, SR, (main * 32767).astype(np.int16)); I = loudness(tmp.name)
    g = ENC_LUFS - I
    D = out_dir(name); os.makedirs(D, exist_ok=True)
    encode(main, os.path.join(D, 'main.mp3'), g); encode(end, os.path.join(D, 'ending.mp3'), g)
    # bar lines of main: every downbeat of every section, and the end (the loop's end is a bar line too)
    # (bar_step 2: every other bar line from each section's start, a half-time piece's whole bars)
    bars = sorted({round(t0 + S.bar_t(i) - S.bar_t(a), 3) for t0, _, a, b, _ in lay for i in range(a, b, P.get('bar_step', 1))} | {round(total, 3)})
    loop = [round(lay[P.get('loop', -1)][0], 3), round(total, 3)]           # (loop: the section it starts with, the last by default)
    data = {'name': name, 'title': P['title'], 'missions': P['missions'], 'main': f'assets/music/{name}/main.mp3',
            'ending': f'assets/music/{name}/ending.mp3', 'length': round(total, 3), 'loop': loop, 'preroll': PREROLL,
            'gain': round(10 ** ((LEVEL_LUFS - ENC_LUFS) / 20) / MUSIC_VOL, 4), 'jump': P['jump'], **({'release': P['release']} if P.get('release') else {}),
            'sections': [{'t': round(t0, 2), 'label': lab} for t0, lab, *_ in lay], 'bars': bars}
    js = os.path.join(ROOT, 'js', 'music', f'recorded-{name}.js')
    with open(js, 'w') as f:
        f.write(f'// {P["title"]}: generated by tools/arrange-music.py {name} (do not edit; change the arrangement there and\n'
                f'// rerun it). The recording\'s files, its bar lines (s into main.mp3), the loop for a late jump, its level.\n')
        f.write('music.record(' + json.dumps(data, separators=(',', ':')) + ');\n')
    for t0, lab, a, b, _ in lay: print(f'{int(t0 // 60)}:{t0 % 60:04.1f}  {lab:58s} source bars {a}-{b - 1}')
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
