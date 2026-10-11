# Manifold Novum — Mockup Plan

Goal: a tiny, single-player browser mockup that shows the core loop:

> shoot asteroid → rock lands in a chest inside the ship → belts carry it → gun loads it → gun shoots more asteroids

Tech: one HTML page, a canvas, and plain JavaScript with no dependencies. All art is
drawn from scratch in code with canvas paths, with no external assets.

## Step 0 — Art style sample (first)

A static scene to settle the look before building any mechanics:

- Top-down view, RimWorld-like: flat colors, soft shading, dark outlines, readable silhouettes.
- Contents: starfield, ship hull and floor tiles, walls, chest, belts (straight and
  corner) with rock items on them, gun turret, asteroids of a few sizes, one crew member.
- File: `art_sample.html`.

## Step 1 — Ship and space

- The ship is a tile grid (about 14×9) with a hull outline and floor tiles.
- The ship moves continuously through space in world coordinates. The camera follows it,
  and a parallax starfield shows the motion.
- Tile coordinates are relative to the ship, so everything inside moves with it.

## Step 2 — Transport belts

- Each belt tile has a direction (N/E/S/W) and holds **at most one item**.
- An item moves to the next tile only if that tile is free. Its position is interpolated
  for smooth movement, and a blocked belt backs up tile by tile.
- Corners are inferred from the neighbor that feeds into the tile.
- Belts hand items to machines (chest → belt, belt → gun) through the same
  "is the target free / can it accept" check.

## Step 3 — Asteroids and the chest

- Asteroids spawn ahead of the ship and drift. Each has HP and a size.
- When an asteroid is destroyed, a fixed amount of **rock** (e.g. 2) appears in a chest
  inside the ship, with a small pop-in animation.
- The chest pushes rock onto the belt tile it faces.

## Step 4 — Gun

- The gun is a turret on the hull that stores up to **5 rock** as ammo, shown as pips.
- It pulls rock from the belt that ends in it while it has fewer than 5.
- It auto-targets the nearest asteroid in range, and each shot uses 1 rock.
- It starts with 5 rock, so the loop can get going.

## Step 5 — Minimal interaction

- A preset layout (chest → belt path → gun) that works out of the box.
- Click to place a belt, click again to rotate it, right-click to remove it, so the
  player can reroute.

## Open questions

- ~~Fixed chest or random spot?~~ Resolved: one hull intake feeding a fixed chest.
- ~~Auto-targeting gun?~~ Resolved: it fires forward when unmanned and is mouse-aimed when manned.
- Should asteroids that hit the ship cause damage? That's out of scope for prototype 1.
- Only belts can be built so far. Picking up and moving other entities is next.

---

## Prototype 1 — built (`index.html`)

Open `index.html` in a browser. There's no build step. The code is in `js/art.js` (all
procedural art), `js/ship.js` (layout and the intake → chest → belt → gun logistics) and
`js/game.js` (simulation, input, camera, HUD).

Grid: the ship is a tile mask (`SHIP_ROWS` in `js/ship.js`). Mask tiles that touch the
outside are walls, and everything inside is a floor grid that entities occupy. Stair steps
in the outline become diagonals automatically, and floor tiles cut by a diagonal are hatched
and can't be built on. Every interior object is a grid entity with a footprint and a
direction: belt 1×1, chest 1×1, dispenser 1×1, helm 2×1 (seat + console), turret 2×2
(hopper, seat, gun), reactor 2×2. This is the basis for picking up and rearranging
everything later.

Starting layout: the rear intake feeds the chest. Next to the chest, a dispenser (toggled
between rock and metal with E) pushes items onto a belt that runs to the turret's hopper in
the nose. The chest holds 50 items in total.

Stations (walk up and press **E**):

- **Console (pilot):** the camera zooms out. W/S thrust, A/D turn, Space fires the
  turret straight forward (slow fire rate).
- **Gunner seat:** the camera zooms out. The mouse aims the turret, and Click or Space
  fires (fast fire rate).
- **Airlock:** EVA with a jetpack (WASD), mouse aim, and a laser with unlimited ammo
  for bootstrapping. Loose rock you fly into gets its own rope to you (no chain). Each rock
  adds 0.35× your mass, so you accelerate slower and have a lower top speed. Flying into
  the vacuum's range hands the towed loot over to the ship. Otherwise pressing E at the
  airlock to board puts it all in the chest.

Rules:

| Asteroid | HP | Damage reduction | On death |
|---|---|---|---|
| Small | 8 | 0 | 1–3 rock |
| Medium | 15 | 1 | 1–3 small asteroids + 1–3 items (0–1 of them metal) |
| Large | 30 | 3 | 2 medium asteroids + 1–2 metal |

- **Turret shell:** 12 damage (18 with metal ammo) and pierces. Whatever power is left after a hit (damage
  dealt + reduction) carries on to the next asteroid. Fragments of an asteroid the shell
  just killed don't count. Range is ~2100px.
- **Laser:** 3 damage within 5 tiles, 2 within 10, 1 beyond. It can't hurt large asteroids.
- **Vacuum intake:** pulls loose rock within 7 tiles of the rear into the chest. A
  dashed ring shows its range.
- **Ship friction:** deceleration of `max(120, 14.1·√speed)`, about constant. Sideways
  friction is 2.5× stronger. Top speed is about 450. Friction always applies, so an
  unmanned ship coasts to a stop. The main engines only burn while thrusting forward, and
  blue braking jets near the nose fire on reverse.
- Asteroids bounce off the hull and don't cause damage yet.

Building (on foot):

- **1** toggles belt placement. Click or drag to place (1 metal each); dragging points the
  belts along the drag.
  Placing onto an existing belt just turns it to the held direction, for free, and keeps
  whatever it carries.
- **R** rotates the hovered belt or dispenser, or the ghost belt when nothing is hovered.
- **Right-click** removes a belt. Its metal and any item it carried go back to the chest
  (lost if the chest is full).

Debug: `index.html#pilot`, `#gunner` or `#eva` starts in that mode.
