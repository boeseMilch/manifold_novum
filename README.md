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
| WASD / arrows | move |
| E | use (lifts, airlocks, ladders, hatches, shield buttons, manual override) |
| Left click | grab / use items, click consoles, hold to repair (with the repair kit) |
| Right click | attack with your weapon (laser gun, thrown wrench), hold to spray the extinguisher |
| In a cannon | mouse to aim, click / Space to fire, R to reload (1 energy), Shift / right mouse to raise cover |
| Tab | hold for a ship overview |
| M | mute (or the speaker button, top left) |
| ` | debug menu (spawn threats, teleport, …) |

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
