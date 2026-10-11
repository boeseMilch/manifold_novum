# Manifold Novum — Ideas

A brainstorm of encounters, damage types, station mini-games and small touches. Nothing here
is built yet. Each idea notes which existing systems it reuses, and roughly how big it is
(S / M / L). Ideas marked ★ are ones I'd build first.

Design rules all of these follow:

- **Every encounter asks for someone to be somewhere.** Good encounters pull people apart:
  one inside, one at a cannon, one outside.
- **Telegraph, then punish.** Each threat shows what it's about to do (like the intruder's
  windups) and gives a window to react.
- **No softlocks.** Every bad state has a way out, even solo.
- **Physical controls.** You crank, drag, hold and aim. Menus are a last resort.

---

## 1. New damage types

### ★ Hull breach (M)

**Cause:** a big hit on a side whose hull is already damaged, a large asteroid getting
through, or a pirate breaching charge. One room gets a breach (a jagged hole in the wall
with stars behind it).

**Effects**

- **Blast doors drop** on that room's doorways to its left and right neighbors (heavy
  yellow-black shutters, a loud slam). You can only leave it up or down, through the deck
  airlock.
- **Vacuum:** your visor snaps down and you move at 70% speed, as in EVA. A hurt crew member
  in a breached room doesn't heal back over time.
- **Every fire in the room goes out at once.** So a breach can be the answer to a fire,
  which sets up the vent idea below.
- **Loose items drift** toward the hole. If nobody grabs them within ~8 s they're sucked
  out, and they float outside the hull, where you can fetch them on an EVA.
- The capacitor in a breached room leaks 1 charge every 20 s (sparks out of the hole).

**Fix**

- **From outside (fast, 6 s):** spacewalk to the hole, hold click with the repair kit, and
  weld a hull plate over it. Hull plates come from a crate in the airlock room. This is a
  core reason to go on an EVA.
- **From inside (slow, 15 s):** duct-tape a tarp over the hole. It holds only until the
  next hit on that side.
- When it's fixed, the room repressurizes (a hiss and fog clearing), and the blast doors
  lift after 2 s.

The security console shows breached rooms in red. It can't lift the blast doors, but a
manual override can force one up for 5 s (3 bonks). A full room-to-room trip through vacuum
is then possible.

### ★ Plasma fire: the violent kind (M)

**Cause:** a normal fire that reaches the reactor or a full capacitor, or a hit on a fuel
cell. It's white-violet, roars, and spreads every 6 s instead of every 15 s.

- **The extinguisher only pushes it back** for a few seconds. It doesn't put it out.
- **The fix is to vent the room:** seal the room's doors (security console), then open its
  emergency vent with a manual override (3 bonks on the red vent valve). The room becomes a
  temporary hull breach for 10 s: blast doors, vacuum, the fire is sucked out in a big
  plume, then the vent closes on its own.
- **Anyone inside without their visor down gets hurt.** So you vent with someone in the
  room only if they're ready, or you lock them out first. That's a nice coordination
  moment.
- **Rooms with an outer airlock** can vent through it instead: override both airlock doors
  open.

### Electrical surge (S)

A hit on a power line makes that line arc. Anything on it (a cannon or shield) shocks
whoever uses it (a hurt hit) until someone cuts the line at the capacitor with the wrench,
then splices it (5 s with the repair kit). This makes the new power lines matter.

### Gravity plating failure (S)

The floor plates in one room fail: you drift with momentum, like on ice, and items float.
Fix it at the plating breaker under the floor (pry up a panel with the wrench, then hold
click on it).

---

## 2. New encounters

### Outside the ship (reasons to go on an EVA)

- **★ Limpet mines (S):** a small drone flies in and sticks 1–3 beeping mines to the hull.
  Each one blinks faster as its 30 s timer runs down, then blows a hull breach. You can't
  shoot them from the cannons (they're under the guns' arc). Spacewalk to each one and pry
  it off with the wrench (2 s), or shoot it with the laser from a safe distance (it breaks
  something nearby).
- **★ Hull barnacles: organic (M):** a spore cloud drifts past and seeds barnacles that grow
  on the hull. Each one grows in 3 stages over 40 s. At full size it drills in: it drains
  the nearest capacitor 1 charge every 10 s, and eventually causes a breach. Scrape them off
  on an EVA (hold click, 3 s, gooey sound), or burn them off with the laser from a
  distance.
- **Jammed cannon track (S):** debris wedges the outside rotation track of a cannon, so it
  can only swing half its arc. Someone outside pulls the debris out while the gunner keeps
  firing.
- **Antenna misaligned (S):** after a big hit, the radar dish outside is knocked crooked,
  and scans come back garbled ("????" everywhere). Spacewalk to it and push it back into
  line.
- **Drifting fuel canister (S, a reward):** a canister tumbles past outside. Catch it on an
  EVA and haul it to the reactor for spare energy. Purely optional, which makes it greedy
  and risky.
- **Jump coil alignment (M, every mission):** before the jump, the three jump coils on the
  outside of the hull have to be aligned (each one is a dial you turn until a light turns
  green). If one wasn't done, the jump takes 15 s longer. This guarantees at least one EVA
  per mission without forcing it at a bad moment.

### Organic ships (M–L)

These are alive: weak spots move and heal, and they don't just shoot.

- **★ Grappler (M):** a squid-like creature on one side. It telegraphs by coiling, then
  throws a tentacle that wraps the hull (you see it wrapped around the outside of that
  room).
  - While it's attached, that side's shield can't go up and the ship slowly turns, so the
    front cannon's view drifts.
  - **Cut it:** the cannon shoots the tentacle (it's tough), or someone outside hacks it
    with the wrench (faster).
  - Its body heals the wound where you hit it unless you keep hitting.
- **Spore mother (L):** sits far out and puffs spore clouds that drift toward the ship. You
  can shoot the clouds (they burst into harmless glitter). Clouds that land seed barnacles
  (see above). Kill it by hitting its pulsing sac, which only opens after each puff.
- **Leech swarm (M):** a swarm of small biters latches onto the hull, like the asteroid
  swarm but sticky. Latched leeches chew a part in their room. Shields burn off any leech on
  that side, so you get a real reason to time your shields.
- **Leviathan (L, a finale):** too big to fit on screen. Only parts of it are visible as it
  passes. It's not something to kill: it bumps the ship (shake, random small hits in a
  sweeping pattern across rooms) for 30 s. You survive it by keeping people out of the
  rooms it's about to sweep (the sidebar shows which are next).

### ★ Space pirates: boarding, and boarding them back (L)

1. **Approach:** a pirate ship pulls alongside one side. It's a normal enemy ship (weak
   spots), but it doesn't try to kill you; it shoots out your engines (sabotage).
2. **Docking:** if it isn't driven off within ~40 s, it fires a docking tube onto that
   side's outer airlock. The airlock is forced open and becomes a bridge to the pirate ship.
3. **Boarding:** 2 pirates come over. They're humanoids with guns. They take cover, steal
   loose items and fuel cells, and carry them back. Your security doors work on them the
   same as on the intruder.
4. **Boarding them back:** you can walk over through the tube (visor down, it's in space)
   into their ship: a small 2–3 room map with its own reactor.
   - **Loot:** spare fuel cells, a repair kit, maybe a strong weapon.
   - **Sabotage:** their reactor works like ours. Overload it (pull its lever to the end and
     jam it with the wrench), and they detach in a panic within 15 s. Whatever you stole
     stays with you. Anyone still aboard when they leave is stranded outside, floating
     (they spacewalk back).
5. **Retrieving stolen items:** anything pirates carried off is in a crate on their ship.

### ★ Mission objective on another ship (L)

Variants of the mission frame: you still need to survive until the jump, but you also have
to bring something home.

- **The black box:** a derelict drifts nearby (one side). At a set time, you can dock with a
  tether (a button at the outer airlock). Cross on an EVA along the tether.
  - The derelict is dark (a flashlight cone), quiet, and has 3 rooms with its own hazards: a
    dormant intruder, a broken door you have to override, a fire.
  - The box is heavy: carrying it, you move at 60% speed and can't use a weapon.
  - The jump drive refuses to engage until the box is on board, or you abort and the mission
    counts as failed but survived.
- **Rescue a stranded engineer:** like the black box, but the "box" is a downed person. You
  treat them (2 s) and they follow you, slowly. On the way home they can be hit.
- **Mine an asteroid:** a big asteroid drifts in front. Shooting it is pointless. Someone
  spacewalks to it with a drill, while the front gunner keeps the small ones off them.

### Inside the ship

- **Ion storm (M):** the lights go out, and every crew member has only a flashlight cone.
  The radar and security console are scrambled for the storm's 30 s. Any capacitor at full
  charge arcs and loses 1. So you want to spend energy ahead of the storm.
- **Solar flare (S):** a 10 s warning, then radiation for 8 s. Anyone outside or in an
  upper-deck room (big windows) is hurt. The reactor room is the shelter. The cannons stop
  shooting for those 8 s, and so does the enemy.
- **Coolant leak (M):** the reactor overheats. A temperature gauge creeps up, and at the top
  the reactor scrams (no energy for 30 s). Fix: fetch a coolant canister from the left
  airlock room and screw it in (a crank mini-game), or slow it by pulling the lever to an
  empty capacitor.
- **Ship AI glitch (S):** doors lock and unlock on their own and the helm displays nonsense.
  Fix: reboot it at the security console by holding three switches in the right order (the
  order is shown on the helm, so two people talking makes it fast; solo means running back
  and forth).
- **Stealth ship (M):** an enemy invisible on screen. It only shows for 3 s after a radar
  ping, as a ghostly outline. The gunner has to fire where it was. Pairs well with the radar
  mini-game.
- **Tractor beam (M):** an enemy ship locks on. The jump timer stops counting until the beam
  is broken: shoot the emitter, or route all power through the engine (the lever to the
  engine slot, wrench-jammed) for 10 s for a burst that tears loose.

---

## 3. Station mini-games

What exists now, and a hands-on version for each.

| Station | Now | Mini-game idea |
|---|---|---|
| **Radar** | click to scan | ★ **Crank the dish.** The radar is a dish you rotate by hand (hold click and drag around the table). Pinging sends a sweep wedge out in the direction it faces, and echoes come back as blips a moment later, closer ones sooner. You only see what's in the direction you pointed, so finding everything means three directions, front-left-right. Each ping uses a bit of time (2 s), and a misaligned antenna (above) shifts the echoes. |
| **Helm diagnosis** | click to read | **Oscilloscope.** Each system shows a wave. Match two dials (frequency, amplitude) to the reference wave. A failing system's wave won't settle: it wobbles. You find the real failure by feel, not by reading. |
| **Shields** | click | **Hold to keep it up.** Press to raise, hold to keep it up longer (up to 4 s), but each extra second costs more energy. Or: **tune it** — a quick dial to the frequency of the enemy shot type (shown by color) makes it absorb double. |
| **Cannon reload** | button, 1.2 s | **Crank it.** Spin the mouse in circles at the breech (or hold R). Faster cranking, faster reload, and if you're hurt you crank slower. |
| **Reactor** | feed a cell | **Seat the fuel cell.** Push it in and turn it a quarter turn with the right timing (a lock indicator), or it spits out and you try again. |
| **Capacitors** | lever | **Patch board.** Next to the lever, a board with cables you drag between sockets to route the reactor's output: one-to-one, or split (each gets half as much). The lever stays for quick switching; the patch board is for rerouting a destroyed power line. |
| **Repair** | hold 5 s | **Duct tape.** Drag along the cracks shown on the broken part. Covering every crack fixes it, and sloppy taping falls off at the next hit. Faster than holding if you're precise. |
| **Treating** | hold 2 s | **Pulse timing.** Click with each heartbeat (a pulse line). Missed beats add time; it never fails. |
| **Jump drive** | automatic | **Spin up.** At the end, someone pulls the jump handle and holds it while the needle climbs. Releasing too early resets it. Two people make it faster (one holds, one pumps), but one can do it. |
| **Security** | click doors | **Fine as is.** It's a map, and that's the fun. |
| **Manual override** | 3 bonks | **Fine as is.** |

---

## 4. Small things

- **Snack machine** in the reactor room: buy a snack for 1 energy from the nearest
  capacitor. Eating it ends being hurt 10 s sooner.
- **Coffee:** the mug at the helm spills on big hits. Drinking it is a tiny speed boost for
  15 s. You refill it at the snack machine.
- **Intercom:** a button in every room. Press it to ping that room on everyone's sidebar
  ("Help in the left airlock!"). Solo, it works as a reminder.
- **Ship voice:** an old, polite voice announcing threats ("Hull breach. Left cannon room.
  Please hold on.").
- **Rattling panels:** loose panels rattle louder the more damaged a side is, a free
  telegraph that the hull is weak there before a breach.
- **Duct tape as a consumable:** 3 rolls on the ship. Temporary fixes (tarp on a breach,
  tape on a part) use one, and the roll gets visibly thinner.
- **The cat** reacts: it hides under the console during hull breaches and walks toward a
  fire to stare at it. (Still no hints about luck.)
- **Emergency lighting:** the room goes red and dim when its capacitor is empty.
- **Scorch marks and goo stay** for the whole mission. A messy ship at the jump is the
  scoreboard.
- **Post-mission report:** a one-screen summary: hits taken, fires, who treated who, the
  cat petted N times.

---

## Suggested order

1. **Hull breach + blast doors** and **limpet mines**: these make EVA matter right away.
2. **Radar dish mini-game** and **stealth ship**: these give the radar a real job.
3. **Plasma fire + venting**: reuses breach, security locks and manual override.
4. **Grappler**: the first organic ship.
5. **Pirates**, then a **derelict mission**: both need a second ship interior, so build that
   once and use it twice.
