# Mission songs (Suno prompts)

One song per mission: no two missions share a piece any more. Each file here has the Suno prompt (Style of Music,
Exclude Styles, the section tags for the Lyrics box) and the mission's shape the song has to fit.

| mission | song | status |
|---|---|---|
| menu / lobby | Held Together | to generate |
| tutorial | Basic Training | to generate |
| training (crew training) | Side by Side | to generate |
| practice | Free Play | to generate |
| custom (skirmish) | Pick Your Trouble | generated, liked (stems in, arranging) |
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
Keep S-7 Frozen, Pick Your Trouble), and each mission adds a **colour** on top instead of switching genre.

**The core** is a style and a dynamic, not a fixed band: every song draws its instruments from the same pool, a
little differently each time, so they sound related without sounding identical.
- **Style:** hybrid cinematic, wide reverb; minor key; the mission pieces build from sparse to two big climaxes and
  **end on one big major chord** (the loops end on the chord they start on).
- **Lead (one or two):** solo cello, violin or viola; brass at the climaxes; sometimes a wordless choir.
- **Low end (one):** a sub pulse like the ship's heartbeat, deep sub drops / 808s, growl bass, wobble bass,
  distorted bass, or a plain electric or upright bass.
- **Percussion:** half-time cinematic drums plus metal (struck pipes, anvil, clanks, industrial hits), taikos at climaxes.
- **Tempo family:** 84-100 BPM, or double time felt in half time (Final Tick 139.5, Pick Your Trouble 172).

The four takes the user liked span that whole range, from orchestral (Pressure Hull, Final Tick, Keep S-7 Frozen) to
drum and bass (Pick Your Trouble). When you change a prompt, keep its style and dynamic, swap within the pool, and
don't give two neighbouring missions the same lead and bass.

| song | lead | low end | colour on top |
|---|---|---|---|
| Held Together (menu) | cello | heartbeat pulse | the home theme: felt piano, brushed drums, ship hum (loop) |
| Basic Training | viola, clarinet | ticking pulse | chamber and cheeky: pizzicato, bassoon, ticking pipes (loop) |
| Side by Side | violin | electric + wobble bass | heist-movie groove: funky drums, staccato strings, brass stabs (loop) |
| Free Play | violin + synth lead | analog synth bass | synths up front: arpeggios over the strings (loop) |
| Pick Your Trouble | synth stabs | Reese bass | drum and bass arena (liked) |
| Outlaws of the Kessler Lanes | cello, trumpet, choir | sub drops | Morricone: baritone twang guitar, harmonica, galloping drums |
| Strange Cargo | theremin, violin | upright, then distorted bass | B-movie: vibraphone, then a surf-guitar chase |
| Keep S-7 Frozen | detuned piano, col legno cello | sub pulse, distorted bass | cold derelict into an industrial groove (liked) |
| Red Comet Gallop | fiddle, accordion | growl bass | swashbuckler in 6/8: stomps, HEY shouts |
| A Signal in the Dark | flugelhorn, violin, choir | sub bass, 808s | rescue: radio crackle, heroic brass, spiccato strings |
| Bloom | wordless choir, cello | wobble bass | organic: marimba 3 against 4, hand drums |
| Pressure Hull | cello | heartbeat sub | deep sea: sonar, hull groans (liked) |
| Last Jump Home | music box, brass | growl bass, 808 | finale: ticking clock, full orchestra (liked) |

**More coherence in Suno** (worth trying, check what your plan offers): generate with the same model version every
time; if you can, give Suno one of the liked takes as a reference (a Persona or audio "inspiration" made from Pressure
Hull or Final Tick) and keep the prompt's colour words; generate the menu's home theme early and pick the take whose
cello melody you like, since it is the one the others should echo.
