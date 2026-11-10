# Review, 2026-11-10

Everything committed in the last month (which is the whole history: 239 commits up to 157fd3b),
held against three questions: is the code right and clean, are the assets up to the game's own
standard, and does it play well. Five reviewers read the code, cut the sprites out of the atlases,
measured the music and played the game in the headless browser (software GL: mostly `?classic`,
no sound).

Priorities: **P1** a player sees it break (crash, softlock, lost save, dead end), **P2** a real
defect or clearly below the rest of the game, **P3** cleanup. Each line: where, the commit that
brought it in, what happens. `[fix]` = being fixed in this pass, `[owner]` = a design or balance
decision left to the game's owner, `[later]` = real but too big or risky for this pass.
What became of each line is at the bottom of this file ("Outcome").

## P1

| # | Area | Where | Commit | What |
|---|---|---|---|---|
| 1 | server | `server.js:27,32` | 826a7e1 | One request for `/%` or `/a%00b` ends the server process and every running game (reproduced with curl). `[fix]` |
| 2 | saves | `js/progress.js:499-516`, `js/net.js:313` | 30ab078, b7ed9e2 | Split screen: when the host retypes their name to a local player's, that view's next save replaces the host's profile ($900 + c1,c2 became $5, nothing done). `[fix]` |
| 3 | sim | `js/captain.js:419-431`, `js/dock.js:321` | e895cfa | c5 with 2+ players: a raid pirate still aboard when the jump is due becomes a plain pirate, `updatePirate` reads `g.crate.x` on the base (no crate) and throws every tick; Varga, the captain, the base and the brig lockdown freeze. `[fix]` |
| 4 | sim | `js/minigames.js:13`, `js/hazards.js:31`, `js/systems.js:398` | 9abce65 | c7: a bridge hull breach sits 0.4 from the jump handle and wins the click; with no tape left the jump handle can't be reached (3 % of its disc still hits). `[fix]` |
| 5 | sim | `js/mission.js:194-196,261` | a201986 on ce0582c | Hard does nothing in chapter 5: the extra encounters keep `t = Infinity` in the written layout, the banner still says "(hard)". `[fix]` |
| 6 | sim | `js/encounters.js:203` | 12fef1c | Two tractor tugs: each adds `dt` to `jumpAt`, the countdown runs backwards (skirmish builder / practice). `[fix]` |
| 7 | sim | `js/eva.js:97-98`, `js/hazards.js:105-110` | 84897a0, d6c45ce | One limpet mine can breach two rooms (two rules that disagree about the room). `[fix]` |
| 8 | sim | `js/organic.js:189,203`, `js/eva.js:126,130,141` | 307c0fe, 84897a0 | Solo, below 60 fps: shells tunnel through tentacles, leeches, spore clumps, drones and mines (tentacle hit rate 100 % at 60 fps, 52 % at 30, 34 % at 20). `[fix]` |
| 9 | audio | `js/music.js:897-901,476` | c9f6925 | Menu → skirmish: the menu piece's pad and drone keep sounding under the recorded track for the whole mission (10 oscillators at 30 s in a simulation). `[fix]` |
| 10 | render | `js/gfx.js:146,1724`, `js/lights.js:213-258,479` | 4edeb80, e895cfa, 74a054b | The pirate base needs 30 light areas, the shader takes 24 and drops the rest silently: our four outer airlocks and two base doorways are lit as open space and ignore power-out all mission. `[fix]` |
| 11 | lobby | `index.html` lobby CSS | 60eab1f, c06f0ee | START MISSION is below the fold at 1280×720 and 1024×600 (top edge at y 727 / 702 / 826); the briefing's Objective and Pay are cut off too. `[fix]` |
| 12 | tests | `tests/netlink.js:44-50`, `tools/netsim.js` | 8eeee8a | Fails about half the time: the control run sits on its threshold (1830-2500 against 2000) with unseeded randomness. The flow control itself is fine. `[fix]` |
| 13 | tests | `README.md:193`, `CLAUDE.md:9` | 191f136 | The documented test loop exits with the last test's status, so a failure scrolls past. `[fix]` (a runner; CLAUDE.md's wording is the owner's) |
| 14 | balance | `js/mission.js:224`, `HIT_FIRE` (e045fc7), `updateFires` | b6bada2, e045fc7 | Chapter 1, Normal, solo: 0 wins in 4 tries in the playtest (first raider at 0:15, 24 % fire per small hit, fires 3 → 14, lost at 2:00 / 4:10 / 5:09); Very easy won cleanly. The model says 18 % idle against the 29.6 % aim, c7 solo −12 %, c8 solo "impossible", c6 with 8 "objective out of reach". The solo chapters were playtested and accepted by the owner, and the playtester was partly a bot, so nothing is retuned here. `[owner]` |

## P2

### Server and multiplayer
- `server.js:30-32` (826a7e1): the static server hands out the whole folder: `/.git/config`, `/CLAUDE.md` answer 200. `[fix]`
- `server.js:54-75,196-207` (826a7e1, 60eab1f): no ping, no idle timeout. A sleeping laptop stays in the lobby for good; if it's the host nobody can start. `[fix]`
- `js/net.js:401-405` (826a7e1): input is sent on every rendered frame (78 kbit/s at 60 Hz, 188 at 144 Hz), `bufferedAmount` never checked: 144 fps on a 100 kbit/s uplink falls 0.7 s behind in 20 s and keeps growing. `[fix]`
- `tools/netlink.js:54` (8eeee8a): flow control gives up when a snapshot is 2 s unacknowledged and floods again: at 16 kbit/s snapshots are 6.9 s old (2.3 s with one probe a second). `[fix]`
- `js/net.js:352-354` (60eab1f): a connection blip mid-mission throws the player to the main menu; no way back into the game. `[fix]`
- `server.js:55`, `prototype3/netserver.js:47,98-102` (98e44e4): prototype 3's message / tick / snapshot run inside the production server with no try/catch: an exception there ends the real games. `[fix]`
- `server.js:76-109` vs `prototype3/netserver.js:33-61` (98e44e4): the WebSocket code exists twice and has drifted (one has a frame cap, the other the try/catch). `[fix]` (frame cap in both; one module `[later]`)
- `server.js:34` (826a7e1): everything `Cache-Control: no-store`, no gzip: 14.5 MB on first load, 6-9 MB of sprites and an MP3 again after every mission (the page reloads). `[fix]`
- `server.js` debug commands (826a7e1): any player can send `debug`; `m` restarts with a new run id, so a mission can pay twice. `[fix]`
- `js/progress.js:527-541`, `server.js:225`: joining at the end screen pays in full. `[fix]`

### Simulation
- `js/dock.js:120-123` (2ff1418): `undock()` casts adrift everyone in the tube (the "pull them in" rect is empty). `[fix]`
- `js/claims.js:158,168-175,188,204-206` (3c65eb2): the claim guide arrows point at the wrong spot for breach, jump handle, gravity panel and plasma fire (a click at the breach arrow spends tape; the jump arrow opens the helm diagnosis); outside jobs go through the airlock nearest the player, not the job. `[fix]`
- `js/combat.js:70`, callers `js/dock.js:122,141,174`, `js/culture.js:152` (819300a, 2ff1418, 1c0de4a): one banner slot: "nav core flung clear … grab it within 60 s!" is overwritten in the same tick by "Pirate raider destroyed!"; the black box and cast-adrift lines too. `[fix]`
- `js/minigames.js:32-66`, `js/game.js:549` (7102d84, 9abce65): a downed / out crew member keeps working an open mini-game, and can lock doors. `[fix]`
- `js/encounters.js:41-45` (12fef1c): a second AI glitch before the first reboot leaves the first one's doors locked. `[fix]`
- `js/eva.js:33-38,106` (84897a0): two mine drones stack their mines on one hull spot (33 of 40 runs). `[fix]`
- `tools/balance.js:78` (19bbae1 vs 34495b7): the model still breaks 1.3 parts per big hit; the game breaks exactly 1. Fixing it shifts the calibrated crew tables. `[owner]`
- `tools/balance.js:1362`: `--help` throws. `[fix]`
- Dead features still carried: the prison barge (`js/dock.js:99-104,756-766`, `js/dockentry.js:83-86`, dead since 42637de), the dormant alien (`js/invader.js:205,299-304,314,798`, nothing sets it since ef672e8); unused `plasmaIn`, `cloudOutside`, `sideCol`, `dockOn`, `BASE_ROOMS`, `s7BoxHeld`, `shipStrain`, `miniDrag`, `hfRandB`; write-only `mission.banner`, `mission.eventGap`, `mission.scanT`, `a.prevRoom`, `e.lash`. `[fix]`
- Route following written four times (`js/dock.js:324,397,1108`, `js/captain.js:402`); the copies drifting apart is P1 #3. `[later]`
- `js/combat.js:289` (42637de): one enemy shot puts a gunner out cold (20 s on the floor solo); the tutorial and README say hurt → down → out. `[owner]`
- `js/dock.js:333` (2ff1418): pirates can leave with the only repair kit and every spare cell, with no pointer to their loot crate. `[owner]`

### Rendering and audio
- `js/music.js:854-860` (9553921): once a mission outruns the arrangement the recording stutters at every loop wrap (five seeks, the tail plays twice). `[fix]`
- `js/music.js:828` (9553921): one refused `play()` turns the recording off for the rest of the page's life. `[fix]`
- `js/audio.js:49-54` (826a7e1): every noise sound longer than 1 s is cut at 1 s (whoosh, break-up, whale, jump-out, explosion, creak, tear, lurch). `[fix]`
- `js/gfx.js:2103`, `js/menugl.js:504` (faea847, 0539f60): a lost WebGL context is never recovered or announced; textures are uncompressed and never evicted (about 1 GB a view in a base / organic mission), 208 MB of ImageBitmaps kept for a one-off tint measurement. `[fix]` (notice + bitmaps; eviction `[later]`)
- `js/hitfx.js:225-250` (fcad765): two objects allocated per particle per frame (up to 1400). `[fix]`
- `js/gfx.js:2079-2096`: `GFX.setPathScratches(true)` does nothing until reload (getters snapshotted by `Object.assign`). `[fix]`
- `js/game.js:994`: `updateLightLevels(1 / 60)` per rendered frame: the power-out fade depends on the refresh rate. `[fix]`
- `js/audio.js:176`: the charge whine has no stop of its own. `[fix]`

### HUD, menus, tutorial
- `js/sidebar.js:195` (826a7e1): plates cut the instruction off ("Destroy 2 pirate ships (0 so f…", "loot crate · jam …"). `[fix]`
- `js/sidebar.js`, `js/game.js` HUD: the HURT / DOWN badge covers the sixth plate; off-screen pointer pills overlap; "ONE MORE = LOST" prints over the jump timer. `[fix]`
- `js/game.js:696` `updateCamera`: the bridge nose (the tutorial's first stop, the helm) is hidden under the top bar and banners. `[fix]`
- `js/systems.js` reload text: "Left capacitor empty — no reload" when it is broken, not empty. `[fix]`
- `js/mission.js`: chapters 7 and 8 have `objective: null`: no objective plate (every chapter needs its own goal). `[fix]`
- `js/local.js` (b7ed9e2, 64040c8): split screen at 1280×720: a 170 px black band, views 387 and 555 px wide, the left banner clipped, HUD text about 5 px. `[fix]`
- `js/tutorial.js`: the windshield marker is partly behind the weapon cable; the lever steps by itself during "turn it to LEFT"; in mouse mode the marker rings the whole lever; the ending is 14 pages about things never tried. `[fix]` the first three; the ending `[owner]`
- Skirmish builder (`index.html`, 3b3465d): two sliders both called "difficulty". `[fix]`
- Economy (`js/progress.js:409`): the first-clear star isn't shown in the lobby; pay ignores difficulty and c1 ($152-177) pays more than c2-c7, so the best job is chapter 1 on Very easy; the profession is permanent while every mission from c3 recommends an engineer. `[fix]` the star; the rest `[owner]`
- Pacing: 85 s of empty radar in c1 solo; the solo jump is fully automatic. `[owner]`

### Assets
- `js/dock.js:669,705` (819300a): `dock/raider_navconsole` and `items/navcore` don't exist: chapter 4's objective is the only one in old 2D art. `[fix]`
- `organic/levb_scar`, `levb_nest*`, `levb_zone*` (6601c55): the leviathan's weak-point overlays are flat discs and squiggles on a shaded boss. `[fix]`
- `base/*`, `dock/*` props (d834170, 9a4c26d): baked ground shadows end in a straight vertical line at the sprite's left edge (`server_rack`, `cover_1`, `tube_port`, `s7_freezer_off`, `grog_machine`, `terminal_broken`, `crate_cargo`, `lockers`, …), and are drawn on top of the runtime shadow. `[fix]`
- `crew/gear_armor_down` missing: the armour vest vanishes on a downed crew member (`js/sprites.js:400`). `[fix]`
- `fx/explosion_*`, `fire_*`, `smoke_*`, `boss_gen_burst` (e040ae2, 6601c55): faceted cel-shaded blobs next to softly shaded ships; `explosion_l` frame 0 is one flat yellow polygon. `[owner]` (which look is wanted)
- Atlas grouping (2e3d657): `fx/page0` is loaded in every mission but two thirds of it is the c8-only `fx/engine_blast`; the captain is 16.7 Mpx of `chars`; any leech loads all 13.4 MB of `organic`. `[later]`
- `items/icon_gear_*`, `items/icon_ship_*` (007af3e): twenty finished icons shown nowhere. `[later]`
- Music: the endings of c3 / c6 / c1 start 7.7 / 5.7 / 5.2 dB under the loop before them (may be the songs' own outros; not heard). `[owner]`

### Tests and docs
- `tests/systems.js:196` flakes about 6 %; `tests/mission.js:251-282` about 0.9 % (unseeded). `[fix]`
- `tests/network.js`, `tests/netlink.js`: exit 0 with zero checks when their port is taken; the random range includes 8080 / 8081. `[fix]`
- `js/cables.js` is never loaded by `tests/harness.js`; no test for gfx / hitfx / menugl / local / breakup; three hand-kept script lists (`index.html`, `server.js`, `tests/harness.js`). `[fix]` the harness; the rest `[later]`
- `PLAN.md:7-8,2014-2027,2689-2700,2704-2784`, `VISION.md:39-40`, `IDEAS.md:11,59,64-80`, `README.md:204`, `js/net.js:257`, `music.html`: describe procedural art, XP and levels, deleted missions, old balance targets, `?mission=rush`, "seven pieces". `[fix]`

## P3
- Tracked by mistake: `assets/sprites/manifest.json.lock`, `assets/sprites/test/*`, `tools/blender/models/test/crate.py`, `tools/sprites/scratch_proto.html`. `[fix]`
- 97 sprites shipped and never drawn (`hull/gun_fire` ×48, `organic/barnacle_*`, `fx/plasma_*`, 18 props, …); atlas pages 36-56 % filled. `[later]` (needs a clean re-render: `build/renders` can't rebuild `props`, `cargo`, `doorlock`, `power` today)
- Dead drawing code: `js/art.js:64` `octagon`, `:454` `drawSlideDoor`, `js/decor.js:172,460,494`, the can / wrapper / tape branches of `drawJunk`, 19 of 25 palette keys; music options no piece sets (`keepRegister`, `shepRate`, `breakdownSkip`, `endingPlanned`, `'drive'`, `ostInst`, `recOn`). `[fix]`
- Leftovers: `split.html` in comments (`js/progress.js:467`, `js/gamepad.js:106`, `js/audio.js:15`), the XP-era `survived` parameter (`js/progress.js:393,405,534`), stale comments about barnacles, intercoms, held shields. `[fix]`
- `js/game.js:592`: debug "Restart the mission" always starts chapter 1 on a stock ship. `[fix]`
- `js/leviathan.js:328-338`: solo, the tail flick lands on the wrong side after the gas. `[fix]`
- `js/ship.js:180-181`: the 0.15-thick stall walls can be walked through at 20 fps. `[fix]`
- Names: 20 characters on the server, 24 for local players; split-screen colours looked up by name. `[fix]`
- Locker and Shipyard reopen at the other's scroll position; the end screen says "Nobody had to be treated" after the player was down; no favicon (the only 404). `[fix]`
- `assets/ui/*.png` 1.05 MB and a 215 KB TTF could be WebP / WOFF2. `[later]`
- History carries 663 MB of blobs not in HEAD (a fresh clone is 194 MB). `[owner]`

## Checked and in order
Save format (version 4, every older version migrates, cookie 1020 bytes at most); lobby seats and
host hand-over; 13 groups of malformed WebSocket messages (no crash); no XSS; both balance tables
up to date; sprites.json (1237 entries, none overlapping or outside its page, no alpha fringes,
normal / height / mask pages aligned); music levels (-16.4 LUFS ±0.05 across the six recordings,
no clipping); mission lengths on target (5:00, c5 7:00, c8 7:20); no console errors in a full
session; fuzzing every mission with crews of 1-8 found no exception or NaN.

## Outcome (2026-11-10)

Every line marked `[fix]` above is fixed, each bug reproduced first and covered by a test that fails on 157fd3b
(`node tests/run.js`: 71 files, 2954 checks), with the exceptions below. The visible ones were checked in the headless
browser (lobby at 1280×720 and 1024×600, the skirmish tab, the locker, split screen, the HUD under a pile of fires and
breaks, the helm) and the new art looked at sprite by sprite; sound could not be heard in the sandbox and the sprite
renderer runs at about a frame a second there, so music, the long noises and the art under the game's own lighting
rest on tests and on composites.

Fixed differently than the line says, or only in part:
- A lost WebGL context shows a "graphics lost, reload" notice; it isn't rebuilt (every GL resource is created once).
- The favicon 404 came from the prototype pages (`index.html` and `music.html` have one); they still have none.
- The lobby pins START only in the two-column layout (wider than 960 px); the one-column layout still scrolls.
- Dead code left: `hfRandB` and `shipStrain` (`js/breakup.js`), the extinguisher cone test written four times
  (`js/mission.js`, `dock.js`, `captain.js`, `culture.js`).
- The baked shadows of the captain's quarters (`tools/blender/models/base/quarters.py`) remain: they aren't cut off,
  but still double the runtime shadow; removing them changes canvas sizes.
- The tutorial's first cannon shot: the marker moved off the cable, and the training interceptor sways 0.2 instead
  of 0.7 until the first hit (`TUT_SWAY_FIRST` in `js/tutorial.js`): at 0.7 a shot at the marker hit 15 of 80 times.
  The owner may want 0.7 back.

Changes in behaviour that came with the fixes:
- A big hit on an already damaged side near the airlock deck now holes the airlock room, not the cannon room (one
  rule for the room behind a hull spot); the number of breaches is the same.
- Shots that graze the outer tenth of a tentacle / leech / spore / drone / mine hit circle always hit now (at 60 fps
  they hit only some of the time before); the radii are unchanged.
- A browser that refuses to play a recording is silent until the first input and then plays it (before: the
  synthesized stand-in for the whole mission).
- The same-tick banner that used to be lost is shown second, 3 s later.
- The server no longer serves tools/ (but the sprite gallery), tests/, the notes or dot-files.
- Encounter tables for every mission, crew size and difficulty are byte-identical to before, except chapter 5 on
  Hard; so are `node tools/balance.js` and both saved tables.

Found on the way, not fixed:
- The right airlock's gravity breaker lies 0.69 from the right shield line's surge spot, and surges win the click:
  with both live the breaker waits for the splice (`js/hazards.js` `hazardClickTarget`). Not a dead end.
- `js/leviathan.js:439` `levShells` still assumes 60 fps; pirates, the NPC and intruders don't move in sub-steps.
- The leviathan's sores are drawn at 1.5× (the scar under the nest 2.4×), so at two thirds of the body's texel
  density; the nest hangs over the flank on segment 3 (placement in `js/leviathan.js`).
- A guest's debug menu still opens (its entries do nothing).
- `MAX_WALLS = 16` in `js/gfx.js` still cuts silently (9 used).
- `tests/network.js` is timed with sleeps and failed once under heavy load.
- Stale: `assets/music/prompts/README.md` (c3 and the skirmish "arranging"), `tools/blender/README.md`, `BRIEF.md`,
  `prototype3/DESIGN.md`, VISION.md's open questions; CLAUDE.md still gives the `for` loop as the test command and
  mentions XP.
- Five agent worktrees from 2026-10-11/12 under `.claude/worktrees/`, all with uncommitted changes, two with commits
  that aren't on main.

Open, for the owner: every line marked `[owner]`; `[later]` lines are untouched.
