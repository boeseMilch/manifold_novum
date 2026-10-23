# To test (solo), playtest fixes of 2026-10-17

Tick off what works; note what doesn't.

## Ship and controls
- [ ] **Power lever:** tap E a few times. The handle turns smoothly and clockwise only: left → mid → right, then round the bottom back to left.
- [ ] **E on repairs:** break something next to a door, hatch or shield button (middle capacitor, a cannon, a deck airlock). Hold the repair kit and hold E: it repairs instead of pressing the button or forcing the door.
- [ ] **E on servicing:** same for a part that is "FAILING — breaks in …".
- [ ] **Getting up:** when you're down, holding E gets you up wherever the mouse is.
- [ ] **End screen:** "incl. $X for bringing the ship back in one piece": about $25 with nothing broken, $0 at 5/5 damage.

## Being hurt (practice: "Get hurt", twice for down)
- [ ] Hurt: a red haze beats at the screen border with a heartbeat sound, blood in the corners, the middle stays readable. A red flash and a jolt when hit; stronger going down.
- [ ] The HURT badge above the energy panel (heals in N s, a snack helps) is noticed without being told; it doesn't cover anything you need.
- [ ] Walking hurt leaves a blood trail that fades; downed: a pool. In multiplayer your crewmates see your trail and a red cross by your name.
- [ ] Too much? (the heartbeat for 30 s, the haze while fighting)

## Spores inside the ship (2026-10-22)
- [ ] Practice "Spore clouds → the right airlock": three clumps drift to the right outer airlock, shrink into its seals; the right airlock room fills with a green-grey haze from the airlock's inner door. Readable early enough to shoot them from the right cannon?
- [ ] Infested room: now and then a part stops responding for 4 s (fuzz + "SPORES · n s" on it, a banner, the prompt says why). After a minute a part breaks. Fair? Too often / too rare?
- [ ] Walk through the deck door from an infested room: the spores follow you up (puffs through the doorway). The reactor room's doors: they shrivel, never get in.
- [ ] Vent panel (no fire needed now): PIN from the sticky note, the room vents, "aired out" ~2 s later. Then the cannon room above: from the vented room force the deck door up; then the door to the bridge. Doable alone before the vent closes?
- [ ] Spore mother: the silent scream (mouth wide, tongue up), the green cloud billowing to the ship and round the hull, "don't use the airlocks!". Go outside anyway: the airlock room gets spores. Vent during the cloud: it vents, puts out fires, but "the spore cloud blew right back in".
- [ ] Is the sidebar card ("SPORES — Left airlock · vent it: airlock panel, PIN on sticky note") enough to know what to do?

## Chapter 2 (Strange Cargo): the pods
- [ ] Two strapped cargo pods sit in the reactor room (bottom right). The objective reads "Deliver the cargo pods to the Xenobiology Institute".
- [ ] A radar scan doesn't give it away.
- [ ] About 1:30 in: the first pod twitches, then the banner "Something is moving in the cargo pod!" and a 6 s countdown card. It bursts and an alien comes out. The second pod follows about 10 s later.
- [ ] The objective switches to "Kill both intruders". The burst shells stay, with goo, and are solid to walk into.

## Chapter 4 (Red Comet Cove): back to 5 minutes
- [ ] The jump comes at 5:00. Raiders at about 1:32 and 3:36.
- [ ] Getting the nav core: grab it from a raider or fish it out of space, carry it to the helm and hold 3 s. It shows mounted on the helm.
- [ ] Your call: is 5 minutes enough? Solo is the busiest version.

## Chapter 5 (Rescue Dr. Varga): 7 minutes
- [ ] The jump is due about 6 minutes after docking (7:00 in total).
- [ ] Captain: 18 HP solo.
- [ ] No raid at the other airlock when solo (2+ players only).

## Chapter 7 (The Deep)
- [ ] An alien shows up at about 1:47, between the spores and the herd. Less "chill" than before?
- [ ] Only one gravity wave (about 1:10), knocking one jump coil out of alignment. No more after it.

## Chapter 8 (The Mother of All): the leviathan
- [ ] Can you win it solo? (It was unbeatable before; no real player has won it yet.)
- [ ] Order: front (fin) → left → right → gas → left → right → behind → engine burn. No extra laps around the ship.
- [ ] Phase 1: the fin and glowing spots can be hit as soon as they're on your side in the cannon's view, before it stops.
- [ ] Phase 3: the eye plus two glowing spots on the head, all three hittable from both side cannons (E1 is now behind the eye).
- [ ] Missing a window: fewer leeches solo (2), and no new swarm while leeches are still on the hull.
- [ ] Only one gravity wave.
- [ ] **Phase 4 (fixed 2026-10-20: it couldn't be won without a laser):** a line under the banner says what to do (MID x/3, lever to MID and hold E to wedge it, load fuel, then hold E at the OVERRIDE panel at the stern, which has a ring now). The brood comes in 3 waves, then the vents go quiet; once you start holding the override MID's energy is in the engine (crawlers can't take it); out of fuel everywhere, an emergency cell drops into the crate. Can you win it solo? Does it feel fair, not too easy?
- [ ] **Bigger brood + stomp (2026-10-20):** the crawlers are dog-sized now (twice as big, easier to hit), and you squash one by walking into it, no gear needed (standing still it still bites). Does it work for the encounter? (Else the crawlers get reused elsewhere.)

## Mines (any mission with a mine drone)
- [ ] The drone always lays 3 mines.

## Multiplayer only (later)
- [ ] Radar ping only for whoever scans.
- [ ] An OUT crawl isn't lost when a crewmate gets up.
- [ ] The captain's raid comes 15 s into his fight, not before.
- [ ] The pods look the same on both screens.

## Open decisions
- The leviathan eye (A: a big leech on its eye · B: a third glowing spot instead · C: drop it) and its fin.
- Keep the leviathan's second round of left and right?
- Build the new leeches/spores/mines set?
- Leviathan phase 4: start the first crawler wave later (or smaller solo)? (The energy way out is built: 3 brood waves, the hold keeps its energy, an emergency cell.)
- Chapter 4 timing (5 min, 6 min, or the second raider earlier), and whether solo chapter 4 may stay that busy.

## Inner doors (2026-10-21): single doors that open in front of you
- [ ] Every door between rooms and the three deck doors are shut until you walk up to one; it slides open as you arrive (no bump, no waiting) and shuts about a second after you've gone. Does it feel snappy or fiddly?
- [ ] Standing in a doorway (or lying down in one) it never shuts on you.
- [ ] Security: lock a door. Walking up, the label says "locked. Click / E: manual override"; three whacks open it.
- [ ] A broken deck door stays shut ("broken, stuck shut"); forced, it stays open until repaired.
- [ ] Hull breach (practice): the doors of that room stay shut ("pressure difference … vents the bridge!"). Forcing one vents the room you're in until it shuts again (vacuum tint, slow walking). Doors to the reactor room can't be forced (the cat).
- [ ] Intruder (practice): doors open for it like for anyone; lock them at the security console and it can't get through (it waits by the locked door towards you). Fun? Too easy?
- [ ] Chapter 2: the two pod aliens are stuck in the reactor room until someone opens a door. Still a fight?
- [ ] Pirates (practice "Pirates dock"): at a shut door they stop and force it (sparks, "PIRATE · FORCING THE DOOR", an orange ring on the door), ~3 s; a locked one ~8 s.
- [ ] The spine is thinner and the deck doors look right (sprites and ?classic); nothing sits in a wall in the bottom rooms (toilet, cat, capacitor, dumbbells, shield buttons, cables).
- [ ] Multiplayer: doors open for whoever is in front of them, on every screen.

## Outer airlocks (2026-10-21): a chamber with two doors
- [ ] Walk into the left / right outer airlock: the inner door opens in front of you, shuts behind you, the chamber pumps (amber, a ring), the outer door opens; step out and you're on a spacewalk. Quick enough? (about 2.3 s from the door to the hull)
- [ ] Back in: float to the hatch and push towards it. It cycles to you, you're on your feet in the chamber, it pumps up, the inner door opens.
- [ ] Turning back: in the chamber press E (or click it).
- [ ] The chamber looks right in both views (sprites and ?classic): floor plate lights green / red / amber, the panel beside the inner door, the walls round it, nothing sitting in it (vent panel above it now, cables round it).
- [ ] Pirates docked: they come through the chamber; you can walk over to their ship and back without waiting. The derelict: the chamber cycles on the way.
- [ ] Broken or locked outer airlock: the override vents the room, both doors stand open, then shut again.
- [ ] Vent panel with an intruder near the airlock: it gets dragged through the chamber and out.
- [ ] Multiplayer: everyone sees the doors and the pump; a crewmate stepping out shows on the hull.

## Leeches drink energy (2026-10-22, practice "Leech swarm (right)")
- [ ] Six latch on the right: nothing breaks any more. A glowing energy ball leaves the right capacitor (its pips drop), creeps along the cable, vanishes into the wall, comes out on the hull and crawls to one leech; that leech swells, the next ball sets off for the next leech. Readable? Too subtle / too much?
- [ ] Speed: with 6 latched a unit goes every ~4 s (a full capacitor in ~12 s); with 1 left, ~24 s per unit. Does the speed-up with more leeches show?
- [ ] Empty capacitor: no ball, they wait; the reactor's next energy on RIGHT is taken right away. Parking the lever on RIGHT keeps ahead of one leech, not of six.
- [ ] Pry the last one off (or shoot them all) while a ball is out: it rolls back and the energy is back in the capacitor.
- [ ] HUD: RIGHT throbs leech-red while they drink; the sidebar card says "N latched, sucking the right capacitor". The banner says they suck our energy.
- [ ] Chapter 8, phase 3: a missed window's leeches drink that side's capacitor (the cannon you need for the eye). Still a fair punishment?
- [ ] Both views (sprites and ?classic), and in multiplayer the ball moves the same for everyone.

## Getting back in when a ship is docked at our airlock (2026-10-23)
- [ ] Pirates docked: on a spacewalk, float to the raider's glass canopy (blue ring), E / click: three whacks smash it. The raider vents (its pirates get thrown about), climb in, drop into the tube, through our airlock. Fun? In-world enough?
- [ ] Derelict docked: pry the cracked viewport in its roof (over its airlock room), climb in, out through its airlock room and the tube.
- [ ] Chapter 5 (base + the raider at the other airlock): the base's service hatch in the docking bay's south wall (crank it: three heaves, it shuts again after you), and the raider's canopy. Never stranded.
- [ ] At our blocked airlock the prompt tells you where to go; the WAY IN marker points there.
- [ ] Both views (sprites and ?classic).
