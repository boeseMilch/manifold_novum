# Mission songs (Suno prompts)

One song per mission: no two missions share a piece any more. Each file here has the Suno prompt (Style of Music,
Exclude Styles, the section tags for the Lyrics box) and the mission's shape the song has to fit.

| mission | song | status |
|---|---|---|
| menu / lobby | Held Together | to generate |
| tutorial | Basic Training | to generate |
| training (crew training) | Side by Side | to generate |
| practice | Free Play | to generate |
| custom (skirmish) | Pick Your Trouble | to generate |
| c1 · First Contract | Outlaws of the Kessler Lanes | to generate |
| c2 · Strange Cargo | Strange Cargo | to generate |
| c3 · The Empty Lab | Keep S-7 Frozen | to generate |
| c4 · Red Comet Cove | Red Comet Gallop | to generate |
| c5 · Rescue Dr. Varga | A Signal in the Dark | to generate |
| c6 · Spore Season | Bloom | to generate |
| c7 · The Deep | Pressure Hull | **done** (rearranged from stems, in the game) |
| c8 · The Mother of All | Last Jump Home | to generate |

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

## Keep them distinct
The playtest complaint about the old score was that every piece sounded alike ("they all begin with hum and bells").
Each prompt gives its song its own lead instrument, groove, tempo and key, and its own opening. When you change a
prompt, keep it unlike the others.

| song | identity |
|---|---|
| Held Together | lo-fi jazz hangar: Rhodes, upright bass, brushes, muted trumpet (loop) |
| Basic Training | cheeky marching band: pizzicato, clarinet, bassoon, tuba (loop) |
| Side by Side | tight funk: slap bass, clavinet, horn stabs (loop) |
| Free Play | 80s synthwave arcade: arpeggios, gated drums (loop) |
| Pick Your Trouble | drum and bass arena: Reese bass, breakbeats |
| Outlaws of the Kessler Lanes | spaghetti western: twang guitar, whistle, harmonica, galloping drums |
| Strange Cargo | 1950s B-movie lounge turning into a surf-rock chase: theremin, Hammond |
| Keep S-7 Frozen | cold derelict suspense into an industrial groove: detuned piano, col legno cello |
| Red Comet Gallop | pirate folk-rock 6/8 jig: accordion, fiddle, stomps, HEY shouts |
| A Signal in the Dark | cinematic rescue: radio flugelhorn, a far voice, spiccato strings, heroic brass |
| Bloom | organic and alive: breathing wordless choir, marimba 3 against 4, hand drums |
| Pressure Hull | deep sea: sonar, heartbeat, hull groans, cello, half-time drums |
| Last Jump Home | epic hybrid finale: ticking clock, music box, growl bass, orchestra, merciful ending |
