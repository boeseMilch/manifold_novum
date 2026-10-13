# Manifold Novum

A cooperative, real-time Space Alert-style game. Your crew jumps a duct-taped ship into a
dangerous region of space, survives a pile of overlapping threats for about five minutes,
and jumps out again. It runs in the browser, with no build step.

## Play solo

Open `index.html` in a browser (double-clicking it works). New? Press **TUTORIAL**. Otherwise
press **PLAY SOLO**, pick a mission and press **START MISSION**.

## Play together on a local network

One person hosts. Everyone else only needs a browser on the same network (Wi-Fi or cable).

**Host:**

1. Install [Node.js](https://nodejs.org) 18 or newer. Nothing else is needed: the server
   has no dependencies, so there's no `npm install`.
2. In this folder, run:

   ```sh
   node server.js
   ```

   It prints the address to share, for example:

   ```
   Manifold Novum server on port 8080
     open  http://192.168.4.56:8080
   ```

   To use a different port: `node server.js 9000`, or `PORT=9000 node server.js`.
3. Open that address yourself too (or `http://localhost:8080` on the host machine).
   One server holds any number of games, each with up to 8 players.

**Everyone:**

1. Open the address the host shared. You land in the main menu: your name, suit color,
   locker and shipyard, **PLAY SOLO**, **OPEN A GAME**, and the live list of open games
   (host, mission, players n/8; "in mission" if it's already running).
2. One of you presses **OPEN A GAME** and becomes that game's host. The others press **JOIN**
   next to it in the list. A game at 8/8 shows as full: open another one.
3. Only the host picks the mission and presses **START MISSION**; everyone else sees the
   choice live. People who join later drop straight into the running mission. If the host
   leaves, the next player (earliest joined) takes over.
4. When the mission ends, anyone presses **R** to send everybody back to that game's lobby.
   **‹ LEAVE GAME** goes back to the main menu. A game closes when its last player leaves.

Stop the server with `Ctrl+C`.

### If others can't connect

- **Same network?** The other devices must be on the host's local network (some guest
  Wi-Fis block device-to-device traffic).
- **Firewall:** the host's firewall must allow incoming connections on the port (8080 by
  default).
  - Windows / macOS: allow Node.js when the system asks the first time.
  - Linux with ufw: `sudo ufw allow 8080/tcp`
  - Linux with firewalld: `sudo firewall-cmd --add-port=8080/tcp`
- **"Port in use":** another program has 8080. Pick another port: `node server.js 9000`.
- **The menu says "offline" next to OPEN GAMES:** the page was opened as a file or
  the server isn't reachable. Use the `http://…` address from the server instead.

### How the networking works

The host's server runs the one shared game simulation (60 times a second) and sends the
state to every browser 30 times a second. Browsers send their keys and mouse and draw what
they receive.

To hide latency, your own crew member moves the instant you press a key (your browser runs
the same movement code), and quietly corrects toward the server's position when you stop
or drift off. The cannon you're manning aims straight from your mouse. On a local network
this should feel close to playing solo.

## Controls

| | |
|---|---|
| WASD | move |
| Arrow keys | aim (8 directions) while held; otherwise you face the way you walk |
| Left click / E | use what you point at (E: or the nearest thing). Hold to repair or treat. Power lever: tap E to turn, hold E for the wrench |
| Right click / Space | use your weapon (Space fires the way you face): laser gun, heavy blaster (hold to charge), thrown wrench, hold to spray the extinguisher |
| In a cannon | mouse or A / D to aim, click / Space to fire, hold right click / Shift for cover, R to reload (1 energy), E or CLIMB DOWN to leave |
| M | mute (or the speaker button, top left) |
| P | practice panel (in practice mode) |
| ` | debug menu (spawn threats, teleport, …) |

The prompt above you always says what a click (or E) will do.

## Campaign, progression, practice

- **Campaign:** eight chapters with a story (pirates, a stowaway alien, a kidnapped scientist, the
  spore nebula, the deep). Each has a briefing and an objective; finishing one unlocks the next.
- **Rewards:** if the ship jumps out, the crew gets paid (some chapters also pay per pirate). XP
  only if you're back aboard and on your feet at the end. The mission only counts as completed
  (reputation, next chapter unlocked) if the objective is done too.
- **Suit color:** pick it in the lobby (free).
- **Locker** (money): general gear for anyone (gravity boots, suit thrusters, first aid course,
  armor vest, stim pack); from level 2 a profession (engineer or weapons specialist) and its track:
  engineer (own repair kit, toolbelt, reactor overcharge), weapons specialist (own laser gun, heavy
  blaster).
- **Shipyard** (reputation): an upgrade for nearly every system — fuel inserter, efficient cannons,
  bigger capacitors, longer shields, reinforced hull, sprinklers, … In multiplayer the
  ship gets every upgrade anyone in the crew has bought.
- Progress is saved in your browser (a cookie), separately for each player.
- **Skirmish:** Intro run, Rush hour, Ore run, Pirate cove, Black box, Stranded engineer, Deep drift, Nightmare.
- **Music:** every mission has its own synthesized piece that builds up to a crescendo at the jump
  and ends on a final hit when you jump out. Listen to them on their own with the ♪ MUSIC button in
  the lobby (or open `music.html`): it plays each piece along a simulated mission, sped up if you like.
- **Practice:** a free-play ship. The PRACTICE panel (button top right, or P) starts any encounter,
  damage type or mini-game, toggles the harder rules, fills energy, repairs, gives items and
  teleports you. The quickest way to try everything.

## Getting hurt

- The first hit hurts you for 30 s: tunnel vision, and you move slower.
- A second hit puts you down. Hold click on yourself for 10 s to get back up (still hurt).
- A hit while you're down knocks you out cold. Someone else has to treat you.
- Anyone can treat anyone: hold click on them for 2 s. Alone on the ship, you can still crawl
  back up: hold click on yourself for 20 s.

## For developers

- The code lives in `js/` (plain browser scripts, loaded by `index.html`), plus
  `server.js`. `PLAN.md` describes everything that's been built and why.
- Tests: headless Node, no browser needed. Run all of them with:

  ```sh
  for t in tests/*.js; do [ "$t" = tests/harness.js ] || node "$t"; done
  ```

  `tests/network.js` starts a real server on a random port and connects WebSocket clients.
- Balance estimate (shots and energy per encounter): `node tools/balance.js`
- Dev URLs:
  - `index.html?mission=rush&autostart` skips the menu: solo it starts the mission, over the
    server it opens a game with that mission and starts it.
  - `index.html#do=4,8&w=5` runs debug-menu entries 4 and 8 and fast-forwards 5 seconds
    (solo, no lobby).
  - `index.html?classic` draws the old top-down 2D look instead of the sprites (also the automatic
    fallback without WebGL2, or when `index.html` is opened as a file). `?gfxscale=0.75` changes the
    sprite renderer's internal resolution (remembered; the default renders at most 2048 px wide).
