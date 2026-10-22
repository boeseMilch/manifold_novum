# Manifold Novum — Vision

## Pitch

A cooperative, **live-action Space Alert**. The crew jumps their ship into a dangerous
region of space for a mission, survives a pile of overlapping encounters for a fixed
amount of time, and jumps out again. It is not turn-based: everything happens in real
time, and combat is live action.

## Pillars

- **Overwhelming, parallel pressure.** Several threats arrive at once, so one player
  can't handle everything. The crew has to split up across the ship and coordinate.
- **Running the ship is the game.** Each job on board (firing a cannon, moving power
  around, flying the ship, repairs, …) is its own small hands-on mini-game, played in
  real time while running between rooms.
- **Fixed mission clock.** A mission lasts a set amount of time. You don't win by
  clearing every threat, you win by still being alive when the jump drive spins up.
- **Ship systems as signal networks (later).** Most automation is meant to work like
  Factorio's circuit network: wiring systems together, not placing things on a build
  grid. A grid can be added later as an extra layer if it's needed.

## The ship (modeled on Space Alert)

Six rooms in two decks of three zones (red / white / blue):

|            | Port (red)      | Center (white)        | Starboard (blue)  |
|------------|-----------------|-----------------------|-------------------|
| Upper deck | Port cannon     | Bridge + main cannon  | Starboard cannon  |
| Lower deck | Port airlock    | Reactor               | Starboard airlock |

- Every lower-deck room has a capacitor, and every capacitor starts with 1 charge.
- Each zone has one way between the decks: a **deck door** through the hull block between them (the
  lifts were taken out; the deck airlocks that came after them became single doors on 2026-10-21).
  Every inner door is shut until someone stands in front of it.

## Presentation

- Top-down view.
- Graphics in the style of RimWorld, drawn procedurally in code.

## Open questions

- What threats are there, and how do they map onto the zones and rooms? (See `IDEAS.md`.)
- What exactly is the mini-game for each station?
- How many players, and how do they split roles? Is there a single-player mode with bots?
- How long is a mission, and how does progression work between missions?
