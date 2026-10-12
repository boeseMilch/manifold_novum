# Manifold Novum

A cooperative, real-time Space Alert-style game. Your crew jumps a duct-taped ship into a
dangerous region of space, survives a pile of overlapping threats for about five minutes,
and jumps out again. It runs in the browser and is drawn entirely in code, with no assets
and no build step.

## Play solo

Open `index.html` in a browser (double-clicking it works). Pick a mission in the lobby and
press **START MISSION**.

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

**Everyone:**

1. Open the address the host shared.
2. Type your name and pick a mission (anyone can choose).
3. Anyone presses **START MISSION**, and everyone in the lobby goes in together. People
   who join later drop straight into the running game.
4. When the mission ends, anyone presses **R** to send everybody back to the lobby.

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
- **The lobby says "No server found — playing solo":** the page was opened as a file or
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
| Left click | interact with whatever you point at: airlocks, ladders, hatches, shield buttons, consoles, items, manual override. Hold to repair (with the repair kit) or to treat someone |
| E | the same as a click on what's highlighted: under the mouse, or else the nearest thing in reach (hold E for repairs and treating) |
| Right click / Space | use your weapon (Space fires the way you face): laser gun, heavy blaster (hold to charge), thrown wrench, hold to spray the extinguisher |
| In a cannon | mouse to aim, left click / Space to fire, hold right click / Shift to raise cover, R or the button to reload (1 energy), the CLIMB DOWN button to leave |
| Tab | hold for a ship overview |
| M | mute (or the speaker button, top left) |
| P | practice panel (in practice mode) |
| ` | debug menu (spawn threats, teleport, …) |

The prompt above you always says what a click (or E) will do.

## Campaign, progression, practice

- **Campaign:** eight chapters with a story (pirates, a stowaway alien, a kidnapped scientist, the
  spore nebula, the deep). Each has a briefing and an objective; finishing one unlocks the next.
- **Rewards:** if the ship jumps out, the crew gets paid (more when the objective is done; some
  chapters pay per pirate). XP only if you're back aboard and on your feet at the end.
  Reputation comes from finished objectives.
- **Suit color:** pick it in the lobby (free).
- **Locker** (money): general gear for anyone (gravity boots, suit thrusters, first aid course,
  armor vest, stim pack); from level 2 a profession (engineer or weapons specialist) and its track:
  engineer (own repair kit, toolbelt, reactor overcharge), weapons specialist (own laser gun, heavy
  blaster).
- **Shipyard** (reputation): an upgrade for nearly every system — fuel inserter, efficient cannons,
  bigger capacitors, shield capacitors, reinforced hull, sprinklers, … In multiplayer the
  ship gets every upgrade anyone in the crew has bought.
- Progress is saved in your browser (a cookie), separately for each player.
- **Skirmish:** standalone missions, from the easy intro to Nightmare.
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
- Anyone can treat anyone: hold click on them for 2 s. Alone on the ship, you crawl back up
  on your own after 20 s.

## Missions

- **Intro run:** one of everything, about a minute apart.
- **Rush hour:** 7 incidents in random order, about 40 s apart.

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
  - `index.html?mission=rush&autostart` skips the lobby.
  - `index.html#do=4,8&w=5` runs debug-menu entries 4 and 8 and fast-forwards 5 seconds
    (solo, no lobby).
  - `index.html?classic` draws the old top-down 2D look instead of the sprites (also the automatic
    fallback without WebGL2, or when `index.html` is opened as a file). `?gfxscale=0.75` changes the
    sprite renderer's internal resolution (remembered; the default renders at most 2048 px wide).
