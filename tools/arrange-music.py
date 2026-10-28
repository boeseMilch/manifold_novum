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
FROZEN_STEMS = {'Dr': '0 Drums', 'Ba': '1 Bass', 'Gt': '2 Guitar', 'Ky': '3 Keyboard', 'Pc': '4 Percussion', 'St': '5 Strings', 'Sy': '6 Synth',
                'Ot': '7 Other', 'Br': '8 Brass'}
TROUBLE_STEMS = {'LV': '0 Lead Vocals', 'Dr': '1 Drums', 'Ba': '2 Bass', 'Gt': '3 Guitar', 'Ky': '4 Keyboard', 'Pc': '5 Percussion', 'Sy': '6 Synth',
                 'Ot': '7 Other', 'Br': '8 Brass'}
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
# The plan (2026-10-27, smoothed: every cut chosen from the source's own join costs, tools/arrange-music.py's sibling
# measurements in PLAN.md: harmony and stem activity before and after the cut alike, on 4/8-bar phrase lines; long runs
# of the song as it is, so the build comes from the song itself and the levels). Cuts: 28→44, 68→28, 44→68, 72→8,
# 70→24, 60→20, 32→24, 54→62, 72→8, 60→20 (and the loop's wrap 60→20, the same join).
TICK_PLAN = [
    ('Intro: the tick, the music box', 0, 8, lv(mix(), -8)),
    ('Low strings under the music box', 8, 16, lv(T_SOFT, -7)),
    ('Spores: the first impact, held back', 16, 28, lv(T_THIN, -5.5)),   # 0:28 (spores 0:30)
    ('Strings swell, silence', 44, 48, lv(mix(), -4.5)),                  # 0:48
    ('The spore mother: drop', 48, 56, lv(T_MOTHER, -3.5)),               # 0:55 (the mother ~1:00)
    ('Synth groove', 56, 64, lv(T_GROOVE, -4.5)),
    ('Music box, the tick', 64, 68, lv(T_BREAK, -6)),                     # 1:23
    ('Build: drums out', 28, 32, lv(mix(), -4.5)),                        # 1:30
    ('The grappler: drop', 32, 40, lv(T_MID, -3)),                        # 1:36 (the grappler ~1:40)
    ('Strings over drums', 40, 44, lv(T_MID, -3.5)),
    ('The bass creeps back', 68, 72, lv(mix(Br=-6), -4.5)),               # 1:57
    ('Herds and tides: the valley', 8, 16, lv(T_LOW, -5)),                # 2:04
    ('Rising 1', 16, 32, lv(T_B1, -4)),                                   # 2:18
    ('Rising 2', 32, 40, lv(T_B2, -3.5)),                                 # 2:45
    ('Rising 3: strings, swell, silence', 40, 48, lv(T_MID, -3)),         # 2:59
    ('Rising 4: drop 3', 48, 56, lv(T_MID, -2.5)),                        # 3:13
    ('Rising 5: synth groove', 56, 64, lv(T_HOT, -2)),                    # 3:26
    ('Something huge: the music box', 64, 70, lv(T_BREAK, -4)),           # 3:40
    ('It comes: strings', 24, 32, lv(T_HOT, -1.5)),                       # 3:51
    ('It comes: drop 2', 32, 40, lv(T_HOT, -1)),                          # 4:04
    ('It comes: swell, silence', 40, 48, lv(T_HOT, -1)),                  # 4:18
    ('THE LEVIATHAN: the biggest drop (climax)', 48, 60, T_FULL),         # 4:32 (it arrives 4:30-4:35)
    ('The fight: drop 1 and strings', 20, 32, lv(T_HOT, -0.5)),           # 4:53
    ('The fight: strings, drop 2 (climax)', 24, 40, T_FULL),              # 5:13
    ('The fight: swell, drop 3', 40, 54, lv(T_HOT, -0.5)),                # 5:41
    ('Held breath: the strings swell', 62, 64, lv(T_HOT, -1.5)),          # 6:05 (the gas ~6:00-6:25)
    ('Held breath: the gas (music box)', 64, 72, lv(T_BREATH, -2)),       # 6:08: the song's own breakdown, then bass, drums out
    ('Held breath: strings', 8, 16, lv(T_BREATH, -2)),                    # 6:22
    ('Out again: drop 1 and strings', 16, 32, T_HOT),                     # 6:36
    ('Behind us: drop 2', 32, 40, T_HOT),                                 # 7:03
    ('The override: swell, silence', 40, 48, T_FULL),                     # 7:17 (the override ~7:30)
    ('LAST PUSH (climax)', 48, 60, T_FULL),                               # 7:31
    ('Still fighting (the loop, climax)', 20, 60, T_FULL),                # 7:51: the loop (69 s), if the fight runs long
]
# Keep S-7 Frozen, recorded (c3, the Empty Lab; from Suno: 9 stems, 3:59.5, ~81 bpm, F minor; 80 bars of 2.97 s,
# phrases of 8 from bar 0, the drums often one bar on, one bar off). Its sections (tools/arrange-music.py frozen --analyze):
#   0-7 intro (drums every other bar, guitar, synth)  8-15 verse (the piano motif in the bars between, strings 14-15)
#   16-22 the first groove (drums, bass, staccato strings; 23 the piano alone)  24-31 the same alternating, brass rising
#   30-31  32-33 the piano alone  34-39 rebuilding (the strings swell in 35, the metal percussion)  40-47 the groove
#   with strings (brass build 45-47)  48-55 the groove with guitar  56-63 the climax (brass, guitar)  64-67 stop-time
#   (a hit, silence, a hit, silence)  68-71 the last push  72-75 the piano alone  76-79 the hit on F (beat 3 of bar 76)
#   ringing out. The grooves are near copies (16 ≈ 48, 20 ≈ 44 ≈ 52, 18 ≈ 42 ≈ 50, 22 ≈ 46 ≈ 54: joins at 0.5-0.9).
# c3 (js/progress.js, the shaped timeline): a mine drone at 0:10-0:15, the derelict lab docks at 0:28 (2+ crew; solo
# ~1:50) and the crew explores it, then mines, swarms, a failing part and flares bunching at the hot times 3:30 / 4:30
# (DENSITY 70% / 90%; it gets hot a little after), the jump at 5:00 (the drive spools, then needs MID energy: often
# later, so the last section loops). The ending comes on the jump (music.jumped()).
F_DOCK = mix(Dr=OFF, Pc=OFF, Ba=-8, Gt=-6, Br=OFF)                       # the piano motif, the guitar far off
F_EMPTY = mix(Dr=OFF, Pc=OFF, Ba=OFF, Gt=OFF, Br=OFF, Sy=-6, St=-6)       # the piano and a breath: almost nothing
F_SCRAPE = mix(Dr=OFF, Pc=OFF, Ba=-12, Gt=OFF, Br=OFF, Sy=-6)            # the piano bars, the strings scraping between
F_HOT = mix(Br=1, Gt=1)
F_FULL = mix(Br=2, St=1, Gt=1)
FROZEN_PLAN = [
    ('Intro: the drone, the motif', 0, 8, lv(mix(Dr=-6, Pc=-6), -5)),     # 0:00 (the mine drone 0:10-0:15)
    ('The lab: the piano motif', 8, 16, lv(F_DOCK, -6)),                    # 0:24 (it docks 0:28)
    ('Exploring: almost nothing', 8, 16, lv(F_EMPTY, -8)),                  # 0:47
    ('Exploring: scrapes', 24, 32, lv(F_SCRAPE, -7)),                       # 1:11
    ('The piano alone, a swell', 32, 36, lv(mix(Dr=OFF, Pc=-12, Ba=-10, Gt=OFF), -6)),   # 1:35
    ('Metal percussion wakes up', 36, 40, lv(mix(Dr=-10, Ba=-6), -5)),     # 1:47
    ('Climbing: the groove, strings', 40, 48, lv(mix(Dr=-4, Br=-4), -4.5)), # 1:59
    ('Climbing: staccato strings', 16, 32, lv(mix(Br=-3), -3.5)),           # 2:23
    ('Climbing: the guitar', 48, 56, lv(mix(), -2)),                        # 3:11
    ('Hot time 1: climax', 56, 64, lv(F_HOT, -0.5)),                        # 3:34 (hot 3:30-3:45)
    ('Stop-time: silence, hits', 64, 68, lv(mix(), -1)),                    # 3:58
    ('The last push', 68, 72, lv(mix(), -0.5)),                             # 4:10
    ('Hot time 2: the groove', 48, 56, F_HOT),                              # 4:22
    ('Hot time 2: full climax', 56, 64, F_FULL),                            # 4:46 (hot 4:30-4:45, the jump 5:00)
    ('Still hot (the loop)', 48, 64, F_FULL),                               # 5:09: the loop (48 s), if the jump is late
]
# Pick Your Trouble, recorded (the custom skirmish; from Suno: 9 stems, 3:51.5, drum and bass at 174 bpm, counted here
# in half-time bars (87 bpm, 2.76 s), G minor; 84 bars in phrases of 8). Its sections (arrange-music.py trouble --analyze):
#   0-7 intro (filtered breaks building)  8-15 half-time verse (the drums thin in 8-11, back in 12-15)  16-22 drop 1
#   (full-speed breaks, Reese bass; 23 a turn)  24-31 drop 1 with guitar (a build in 30-31)  32-39 drop 2 (brass stabs)
#   40-47 the breakdown (half-time, guitar, stutters; D, the dominant, in 42-43)  48-55 the build (the Reese alone, the
#   drums back in 52-55)  56-63 drop 3  64-69 drop 3 on  70-71 a build  72-77 the last drop (the bass loudest)  78-80
#   the outro  81 the keyboard alone  82-83 the impact and sub boom. The drops are near copies (18 ≈ 22 ≈ 62 ≈ 66,
#   16 ≈ 32, 34 ≈ 38: joins at 0.4-0.7). Its stems include "lead vocals" (chops, -34 to -60 dB): muted, the prompt
#   asked for none.
# The skirmish (js/progress.js MISSIONS.custom): always 5:00 to the jump (MISSION_LENGTH; the lobby's points only set how
# many encounters), the encounters spread evenly from 0:10 / 0:15 to the finale at 4:30 (spacing 'spread': no story
# beats, no density peaks), the jump due at 5:00 (often later: the drive needs MID energy; the loop covers that). The
# arrangement follows the prompt's usual shape: arrivals from 0:10, a calm ~1:06-1:28, a climb, drop 3 at 3:41, the
# last drop at 4:47 through the jump; the ending comes with the jump.
def tmix(**g): return mix(LV=OFF, **g)
TROUBLE_PLAN = [
    ('Intro: filtered breaks', 0, 8, lv(tmix(), -6)),                       # 0:00 (the first arrivals 0:10-0:15)
    ('Half-time verse', 8, 16, lv(tmix(), -5)),                            # 0:22
    ('First drop, held back', 16, 20, lv(tmix(Br=-6), -4)),                # 0:44
    ('First drop: brass stabs', 36, 40, lv(tmix(), -4)),                    # 0:55
    ('Calm: half-time breakdown', 40, 48, lv(tmix(Pc=-4), -7)),             # 1:06 (calm ~1:00-1:20)
    ('Build: the Reese alone', 48, 56, lv(tmix(), -4.5)),                   # 1:28
    ('Climbing: drop 1, guitar', 16, 32, lv(tmix(), -3.5)),                 # 1:50
    ('Climbing: drop 2', 32, 40, lv(tmix(), -2.5)),                         # 2:34
    ('Breakdown: stutters', 40, 48, lv(tmix(), -4.5)),                      # 2:56
    ('Build: snare roll', 48, 56, lv(tmix(), -2.5)),                        # 3:18
    ('Hot time 1: drop 3 (climax)', 56, 64, lv(tmix(Br=1), -0.5)),         # 3:41 (hot ~3:45)
    ('Between: drop 1 and guitar', 28, 36, lv(tmix(), -2)),                 # 4:03
    ('Hot time 2: drop 3 on, the build', 60, 72, tmix(Br=1)),               # 4:25
    ('Hot time 2: the last drop (climax)', 72, 76, tmix(Br=2, Ba=1)),       # 4:47 (hot ~4:45, the jump 5:00)
    ('Still going (the loop, climax)', 20, 36, tmix(Br=1)),                 # 5:09: the loop (44 s), if the jump is late
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
        'bar_step': 2, 'loop': -1, 'release': 'blast', 'smooth': True, 'plan': TICK_PLAN,
        # the ending (from the engine blast on, music.release(): js/game.js): the strings swelling in where they enter in the
        # song (bar 24, G minor), D major → F major, no drums, then the song's last hit, an open G (the tonic: bVII → I)
        # ringing out (cut before the clipped next bar at 127.75 s). It comes in only on main's bar lines whose join into
        # bar 24 is cheap (stitch: cost ≤ 1.6, but at most 7 s apart), and main fades out over the beat before (stitch_xf:
        # the game's time constant 0.15 s, from 0.1 s before the bar line; Pressure Hull keeps 0.03 s from the bar line).
        'ending': [(24, 30, T_RELEASE), (72, 74, mix(St=3))], 'ending_stop': 127.6, 'ending_fade': 2.5,
        'stitch': (1.6, 7.0), 'stitch_xf': (0.15, 0.1),
    },
    'trouble': {
        'title': 'Pick Your Trouble (recorded)', 'stems': 'Pick Your Trouble', 'files': TROUBLE_STEMS, 'bpm': 87, 'missions': ['custom'], 'jump': 300,
        'bar_step': 1, 'loop': -1, 'smooth': True, 'plan': TROUBLE_PLAN,
        # the ending (on the jump): the keyboard alone for a bar (81), then the song's impact and sub boom (82-83, to the
        # file's end); stitched on bar lines whose harmony into bar 81 isn't far off, main fading over the beat before
        'ending': [(81, 84, tmix())], 'ending_stop': 231.4, 'ending_fade': 2.0,
        'stitch': (3.2, 6.0), 'stitch_xf': (0.15, 0.1),
    },
    'frozen': {
        'title': 'Keep S-7 Frozen (recorded)', 'stems': 'Keep S-7 Frozen', 'files': FROZEN_STEMS, 'bpm': 81, 'missions': ['c3'], 'jump': 300,
        'bar_step': 1, 'loop': -1, 'smooth': True, 'plan': FROZEN_PLAN,
        # the ending (on the jump, as in c7): the music stops, the piano alone for a bar (75), then the song's own hit on F
        # (bar 76's third beat) ringing out cold. Every bar line may take it, unless its harmony into bar 75 is far off
        # (stitch: cost ≤ 3.2, at most 6.5 s apart: a stop is a contrast anyway); main fades out over the beat before.
        'ending': [(75, 80, mix())], 'ending_stop': 239.4, 'ending_fade': 3.0,
        'stitch': (3.2, 6.5), 'stitch_xf': (0.15, 0.1),
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
    cb = chroma_per_beat(sum(stems[k] for k in ('St', 'Ba', 'Ky', 'Sy') if k in stems), beats)   # (the tonal stems the piece has)
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
    # ---- smooth joins (P['smooth']; 2026-10-27, Final Tick, the user: "some of the transitions are rough"). Per stem, at
    # a cut from section A into B: B's pickup comes in ahead of the bar line where its source has one leading into it (a
    # fill, a riser, a note held into the downbeat: from its attack, or swelled in over half a beat), and A's same stem
    # fades out under it; otherwise A's stem rings on past the cut until its next attack (at most a beat) instead of being
    # chopped. Equal-power fades for cuts (unrelated material); a level change on the same source bars keeps the old
    # equal-gain crossfade. Pieces without 'smooth' (Pressure Hull) take the old path, bit for bit.
    def onsets(self):                               # per stem: its attacks (s), from the onset envelope's peaks
        if not hasattr(self, '_on'):
            self._on = {}
            for k, x in self.stems.items():
                o = onset(x.mean(1)); o = o / (np.percentile(o, 99) + 1e-9)
                self._on[k] = sig.find_peaks(o, height=0.2, distance=5)[0] / 100
        return self._on
    def beat(self): return float(np.median(np.diff(self.bars))) / 4
    def lvl(self, k, t0, t1):
        x = self.stems[k][int(max(0, t0) * SR):int(t1 * SR)]
        return 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-9) if len(x) else -99
    def fades(self, A, B):
        """The fades at the join of sections A → B ((a, b, gains) each; None: the start / the end of the music):
        ({stem: (samples before B's first bar, fade-in samples, curve)}, {stem: (fade-out samples before A's last bar line,
        samples after it, curve)})."""
        inn, out = {}, {}
        for k in self.stems:
            f = int((0.12 if k in SUSTAINED else 0.03) * SR); h = f // 2
            if A is None or B is None or (A[1] == B[0] and A[2] == B[2]):     # the start, the end, or the source runs on
                inn[k] = (h, f, 'sq') if A is None else (0, 0, 'sq'); out[k] = (h, h, 'sq') if B is None else (0, 0, 'sq'); continue
            on, bt, tb, ta = self.onsets()[k], self.beat(), self.bar_t(A[1]), self.bar_t(B[0])
            onA, onB = A[2].get(k, 0) > OFF, B[2].get(k, 0) > OFF
            if A[1] == B[0]:                            # the same bars, other levels: a gain crossfade; a stem dropping out
                if onA and onB or not onB:             # plays its downbeat and rings out over a beat; one coming in, its pickup
                    inn[k], out[k] = (h, f, 'sq'), ((h, int(bt * SR), 'eq') if onA and not onB else (h, h, 'sq')); continue
            pick = 0
            if B[2].get(k, 0) > OFF:
                lead, after = self.lvl(k, ta - bt, ta - 0.04), self.lvl(k, ta, ta + bt)
                if lead > -45 and lead > after - 12:
                    o = on[(on >= ta - bt) & (on < ta - 0.04)]
                    if len(o): pick = int((ta - o[0] + 0.015) * SR); inn[k] = (pick, int(0.015 * SR), 'eq')   # from its attack
                    else: pick = int(bt / 2 * SR); inn[k] = (pick, pick, 'eq')                               # held: swelled in
            if k not in inn: inn[k] = (h, f, 'eq')
            if pick: out[k] = (pick, h, 'eq')          # B's pickup takes this stem over: A's fades out under it
            else:
                o = on[on > tb - 0.04]
                if len(o) and o[0] < tb + 0.04: out[k] = (h, h, 'verb')        # a new attack on the bar line: a reverb tail instead
                else: out[k] = (h, max(h, int((min(o[0] if len(o) else tb + bt, tb + bt) - tb - 0.01) * SR)), 'eq')   # rings on
        return inn, out
    def place_smooth(self, out, t0, a, b, g, inn, outf, clip=None):
        s0, s1 = int(self.bar_t(a) * SR), int(self.bar_t(b) * SR); p = int(t0 * SR); N = len(out)
        for k, x in self.stems.items():
            if g.get(k, 0) <= OFF: continue
            pre, fin, cin = inn[k]; fo, post, cout = outf[k]
            lo, hi = s0 - pre, s1 + post
            if clip is not None and s0 + clip < hi:     # cut short: a short fade at the cut (clip 0: only the pickup, at full level at its end)
                hi = s0 + clip; fo, post, cout = (min(fo, (hi - lo) // 2) if clip > 0 else 0), 0, 'sq'
            if hi <= lo: continue
            seg = np.zeros((hi - lo, 2), np.float32); src = x[max(0, lo):min(len(x), hi)]
            seg[max(0, lo) - lo:max(0, lo) - lo + len(src)] = src
            seg *= 10 ** ((g.get(k, 0) + g.get('All', 0)) / 20)
            curve = lambda n, c: (np.sin(np.linspace(0, 1, n, dtype=np.float32) * np.pi / 2) if c == 'eq' else xf(n))
            if fin: n = min(fin, len(seg)); seg[:n] *= curve(fin, cin)[:n, None]
            if fo + post and hi > s1 - fo: n = min(fo + post, len(seg)); seg[-n:] *= curve(fo + post, 'sq' if cout == 'sq' else 'eq')[::-1][-n:, None]
            st = p - (s0 - lo); a0 = max(0, st); e = min(N, st + len(seg))
            if e > a0: out[a0:e] += seg[a0 - st:e - st]
            if cout == 'verb':                          # the source attacks again on the bar line, so it can't ring on: a tail
                y = self.tail(k, x, s1) * 10 ** ((g.get(k, 0) + g.get('All', 0)) / 20)   # (what was sounding, through a
                q = p + (s1 - s0); a0, e = max(0, q), min(N, q + len(y))                  #  short reverb, from the cut on)
                if e > a0: out[a0:e] += y[a0 - q:e - q]
    def tail(self, k, x, s1):
        """A reverb tail for stem k's last 150 ms before sample s1 (decaying noise, RT60 1 s, drums 0.5 s; seeded, so
        every render is the same), starting at the cut at half the level just before it, fading in over 20 ms."""
        w, n = int(0.15 * SR), int((1.0 if k in SUSTAINED else 0.5) * SR)
        src = x[max(0, s1 - w):s1].astype(np.float32)
        if len(src) < w: return np.zeros((1, 2), np.float32)
        rng = np.random.default_rng(1 + s1 % 100003); t = np.arange(n) / SR
        ir = rng.standard_normal((n, 2)).astype(np.float32) * np.exp(-t * 6.9 / (n / SR))[:, None]
        y = np.stack([sig.fftconvolve(src[:, c] * np.hanning(2 * w)[:w], ir[:, c]) for c in range(2)], 1)[w:w + n]
        ref = np.sqrt((src[-int(0.05 * SR):] ** 2).mean()); got = np.sqrt((y[:int(0.05 * SR)] ** 2).mean()) + 1e-12
        y *= 0.5 * ref / got; m = int(0.02 * SR); y[:m] *= np.linspace(0, 1, m, dtype=np.float32)[:, None]
        return y.astype(np.float32)
    def run(self, out, t0, items, after=None, clip_at=None, last_clip=None):
        """Places sections [(a, b, gains)] one after another from t0 with smooth joins; after: what follows the last
        (the loop's start: its fades are worked out as if it came next); clip_at: s into the run where it stops."""
        for i, (a, b, g) in enumerate(items):
            if clip_at is not None and t0 >= clip_at: break
            A = items[i - 1] if i else None
            B = items[i + 1] if i + 1 < len(items) else after
            ln = self.bar_t(b) - self.bar_t(a)
            clip = int((clip_at - t0) * SR) if clip_at is not None and t0 + ln > clip_at else (last_clip if i == len(items) - 1 else None)
            if clip is not None and clip_at is not None and t0 + ln > clip_at: B = None
            self.place_smooth(out, t0, a, b, g, self.fades(A, (a, b, g))[0], self.fades((a, b, g), B)[1], clip)
            t0 += ln
        return t0
    # Join costs (jukebox-style: leaving the source at bar b, going on at bar a): the harmony (chroma of the tonal stems)
    # in the two beats before b against the two before a, and after b against after a, plus how different every stem's
    # level is in the beat before / after; cuts off the 8-bar (or 4-bar) phrase lines cost a little more. 0: the source
    # running on; the plans' cuts are ~0.6-2, the rough ones were 2.2-4.5.
    TONAL = ['St', 'Br', 'Sy', 'Ky', 'Ww', 'Ba']
    def _feat(self, i):
        if not hasattr(self, '_feats'): self._feats = {}
        if i not in self._feats:
            t, bt = self.bar_t(i), self.beat()
            def chroma(t0, t1):
                x = sum(m.mean(1)[int(max(0, t0) * SR):int(t1 * SR)] for k, m in self.stems.items() if k in self.TONAL)
                f, P_ = sig.welch(x, SR, nperseg=8192); ok = (f > 60) & (f < 1500); pc = np.round(12 * np.log2(f[ok] / 440)).astype(int) % 12
                c = np.array([P_[ok][pc == k].sum() for k in range(12)]); return c / (np.linalg.norm(c) + 1e-12)
            lv = lambda t0, t1: np.array([max(-50, self.lvl(k, t0, t1)) for k in self.stems])
            self._feats[i] = (chroma(t - 2 * bt, t) if i > 0 else None, chroma(t, t + 2 * bt), lv(t - bt, t) if i > 0 else None, lv(t, t + bt))
        return self._feats[i]
    def cost(self, b, a):
        if b == a: return 0.0
        fb, fa = self._feat(b), self._feat(a)
        if fb[0] is None or fa[0] is None: return 9.0
        h = (1 - fb[0] @ fa[0]) + (1 - fb[1] @ fa[1])
        t = (np.abs(fb[2] - fa[2]).mean() + np.abs(fb[3] - fa[3]).mean()) / 20
        return float(2 * h + t + (0 if b % 8 == 0 and a % 8 == 0 else 0.15 if b % 4 == 0 and a % 4 == 0 else 0.3))
    def stitches(self, lay, total):
        """main's bar lines (every bar_step source bars) where the ending may come in; with 'stitch' (max cost, max gap
        s): only those whose join into the ending's first bar is cheap, but never more than the gap apart."""
        P, ea = self.P, self.ending()[0][0][0]
        pts = sorted({(round(t0 + self.bar_t(i) - self.bar_t(a), 3), i) for t0, _, a, b, _ in lay for i in range(a, b, P.get('bar_step', 1))})
        if not P.get('stitch'): return [t for t, _ in pts]
        thr, gap = P['stitch']
        c = {t: self.cost(i, ea) for t, i in pts}
        keep = {t for t in c if c[t] <= thr} | {0.0}
        while True:                                 # a gap too long: the cheapest bar line in it too
            ks = sorted(keep) + [total]; bad = [(x, y) for x, y in zip(ks, ks[1:]) if y - x > gap]
            if not bad: break
            x, y = bad[0]; inside = [t for t in c if x < t < y]
            if not inside: break
            keep.add(min(inside, key=lambda t: c[t]))
        return sorted(keep)
    def ending(self):                               # the ending's sections [(a, b, gains)] and their length (s)
        E = self.P['ending']; E = [E] if isinstance(E, tuple) else E
        stop = self.P.get('ending_stop')            # (s in the source: the last section rings out to there, not to its bar line)
        return E, sum(self.bar_t(b) - self.bar_t(a) for a, b, _ in E[:-1]) + (stop if stop else self.bar_t(E[-1][1])) - self.bar_t(E[-1][0])
    def place_ending(self, out, t0):
        E, _ = self.ending(); stop = self.P.get('ending_stop')
        if self.P.get('smooth'):
            self.run(out, t0, E, last_clip=int((stop - self.bar_t(E[-1][0])) * SR) if stop else None); return
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
        if jump is not None and self.P.get('smooth'):
            cut = next((t for t in self.stitches(lay, total) if t >= jump), total)
        elif jump is not None:
            for t0, _, a, b, _ in lay:
                hit = [t0 + self.bar_t(i) - self.bar_t(a) for i in range(a, b) if t0 + self.bar_t(i) - self.bar_t(a) >= jump]
                if hit: cut = hit[0]; break
        elen = self.ending()[1] if ending else 0
        out = np.zeros((int((lead + cut + elen + 0.5) * SR), 2), np.float32)
        if self.P.get('smooth'):
            items = [(a, b, g) for _, _, a, b, g in lay]; L = lay[self.P.get('loop', -1)]
            if cut < total and self.P.get('stitch_xf'):   # main fading out under the ending as the game does it (stitch_xf)
                tc, xl = self.P['stitch_xf']; self.run(out, lead, items, clip_at=cut + 1.5)
                i0 = int((lead + cut - xl) * SR); env = np.exp(-np.arange(len(out) - i0) / SR / tc).astype(np.float32)
                out[i0:] *= env[:, None]
            else: self.run(out, lead, items, after=None if cut < total else (L[2], L[3], L[4]), clip_at=cut if cut < total else None)
            if cut >= total:                        # the loop's wrap: the loop start's pickup before main's end, as at its join
                self.place_smooth(out, lead + total, L[2], L[3], L[4], self.fades(items[-1], (L[2], L[3], L[4]))[0],
                                  {k: (0, 0, 'sq') for k in self.stems}, clip=0)
            if ending: self.place_ending(out, lead + cut)
            return out, lay, total, cut
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
    loop = [round(lay[P.get('loop', -1)][0], 3), round(total, 3)]           # (loop: the section it starts with, the last by default)
    bars = sorted(set(S.stitches(lay, total)) | {round(total, 3), loop[0]})
    data = {'name': name, 'title': P['title'], 'missions': P['missions'], 'main': f'assets/music/{name}/main.mp3',
            'ending': f'assets/music/{name}/ending.mp3', 'length': round(total, 3), 'loop': loop, 'preroll': PREROLL,
            'gain': round(10 ** ((LEVEL_LUFS - ENC_LUFS) / 20) / MUSIC_VOL, 4), 'jump': P['jump'],
            **({'xf': P['stitch_xf'][0], 'xfLead': P['stitch_xf'][1]} if P.get('stitch_xf') else {}), **({'release': P['release']} if P.get('release') else {}),
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
    ap.add_argument('--wav'); ap.add_argument('--jump', type=float); ap.add_argument('--joins', action='store_true')
    A = ap.parse_args()
    if A.analyze: analyze(A.piece)
    elif A.joins:                                   # every cut of the plan with its join cost (Song.cost), and the ending's stitches
        S = Song(A.piece); lay, total = S.layout(S.P['plan'])
        for (t0, lab, a, b, g), (t1, lab1, a1, b1, g1) in zip(lay, lay[1:] + [lay[S.P.get('loop', -1)]]):
            if b != a1: print(f'{int(t1 // 60)}:{t1 % 60:04.1f}  {b - 1:2d}|{a1:<2d} cost {S.cost(b, a1):.2f}  {lab} → {lab1}' if t1 > t0 else f'loop wrap {b - 1}|{a1} cost {S.cost(b, a1):.2f}')
        st = S.stitches(lay, total); print(f'the ending may come in at {len(st)} bar lines, at most {max(np.diff(st + [total])):.1f} s apart')
    elif A.wav:
        S = Song(A.piece); out, lay, total, cut = S.render(S.P['plan'], jump=A.jump)
        fade = int(1.5 * SR); out[-fade:] *= np.linspace(1, 0, fade)[:, None]
        pk = np.abs(out).max(); out *= 0.89 / pk if pk > 0.89 else 1
        wavfile.write(A.wav, SR, (out * 32767).astype(np.int16)); print(f'{A.wav}: arrangement {total:.1f} s, ending at {cut:.1f} s')
    else: build(A.piece)
