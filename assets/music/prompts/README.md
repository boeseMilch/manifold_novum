# Mission songs (Suno prompts)

One song per mission: no two missions share a piece any more. Each file here has the Suno prompt (Style of Music,
Exclude Styles, the section tags for the Lyrics box) and the mission's shape the song has to fit.

| mission | song | status |
|---|---|---|
| menu / lobby | Held Together | to generate |
| tutorial | Basic Training | to generate |
| training (crew training) | Side by Side | to generate |
| practice | Free Play | to generate |
| custom (skirmish) | Pick Your Trouble | generated (stems in, arranging) |
| c1 · First Contract | Outlaws of the Kessler Lanes | to generate |
| c2 · Strange Cargo | Strange Cargo | to generate |
| c3 · The Empty Lab | Keep S-7 Frozen | generated (stems in, arranging) |
| c4 · Red Comet Cove | Red Comet Gallop | to generate |
| c5 · Rescue Dr. Varga | A Signal in the Dark | to generate |
| c6 · Spore Season | Bloom | to generate |
| c7 · The Deep | Pressure Hull | **done** (rearranged from stems, in the game) |
| c8 · The Mother of All | Last Jump Home (the take: "Final Tick") | **done** (rearranged from stems, in the game) |

## Workflow
1. Generate in Suno (v4.5 or newer). Paste Style of Music and Exclude Styles. Turn Instrumental **off** so the section
   tags in the Lyrics box steer the structure (they hold no words to sing). If a version comes out short, use Extend.
2. Pick the take with the widest range: really calm parts, builds, two big climaxes and a clean ending hit. The
   arranger can only rearrange what's there.
3. Download the **stems** (all of them) into `assets/music/<Song Title>/`. The full mix is optional: it's only used to
   compare before and after.
4. The arranger in `tools/` lays the stems out bar by bar on the mission's timeline: calm while the first encounters
   arrive, climaxes about 15 s after the hot times, and still rising when the drive spools, since the music runs about
   30 s past the jump. Suno's own ending plays at the first bar line after the jump.

## One score, not a playlist (2026-10-28)

The first rule here was "keep them distinct": the old synthesized pieces all sounded alike. With Suno, diversity comes
by itself, and the first takes in different genres (western, B-movie lounge, pirate folk...) didn't sound like one
game. So every prompt now shares the **score's core**, taken from the takes the user liked (Pressure Hull, Final Tick,
Keep S-7 Frozen), and each mission adds a **colour** on top instead of switching genre.

**The core** (in every Style of Music, in these words, so Suno hears the same palette):
- hybrid cinematic orchestra: a **solo cello theme** and a low string ostinato,
- a **sub pulse like the ship's heartbeat**,
- **struck metal pipe percussion** (the hull as an instrument),
- half-time cinematic drums, wide reverb,
- minor key, and the mission pieces **end on one big major chord** (B major, G, F major so far); the loops end on the
  chord they start on.

Tempos stay in a family: 84-100 BPM, or double-time felt in half-time (Final Tick 139.5, the skirmish 172).
Keep the core words when you change a prompt; change the colour.

| song | colour on top of the core |
|---|---|
| Held Together (menu) | the home theme: felt piano, the cello melody, brushed drums, ship hum (loop) |
| Basic Training | chamber and cheeky: pizzicato, clarinet, bassoon, ticking pipes (loop) |
| Side by Side | heist-movie groove: funky drums and bass, staccato strings, brass stabs (loop) |
| Free Play | synths up front: analog arpeggios over the strings (loop) |
| Pick Your Trouble | drum and bass arena (generated before this rule: the outlier) |
| Outlaws of the Kessler Lanes | Morricone: baritone twang guitar, harmonica, galloping drums, trumpet |
| Strange Cargo | B-movie: theremin, vibraphone, walking bass, then a surf-guitar chase |
| Keep S-7 Frozen | cold derelict: detuned piano, col legno cello, industrial groove |
| Red Comet Gallop | swashbuckler in 6/8: fiddle, accordion, stomps, HEY shouts |
| A Signal in the Dark | rescue: radio flugelhorn, heroic brass, spiccato strings |
| Bloom | organic: marimba 3 against 4, breathing wordless voices, hand drums |
| Pressure Hull | deep sea: sonar, hull groans, the cello at its darkest |
| Last Jump Home | finale: ticking clock, music box, growl bass, full orchestra |

**More coherence in Suno** (worth trying, check what your plan offers): generate with the same model version every
time; if you can, give Suno one of the liked takes as a reference (a Persona or audio "inspiration" made from Pressure
Hull or Final Tick) and keep the prompt's colour words; generate the menu's home theme early and pick the take whose
cello melody you like, since it is the one the others should echo.
