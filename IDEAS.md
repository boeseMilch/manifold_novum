# Manifold Novum — Ideas, by difficulty

Everything from the original brainstorm, ordered from easiest to hardest to build, with where
it shows up. ✅ = built (details in `PLAN.md`, step 8). Harder encounters are kept for harder
missions; every one of them can be tried in **Practice** mode.

Mission tiers: ★ First Contract, Strange Cargo · ★★ Empty Lab, Red Comet Cove · ★★★ Rescue Dr. Varga,
Spore Season, The Deep · ★★★★ The Mother of All. (Plus the skirmish builder: any mix of encounters.)

## 1. Small things (all missions)
- ✅ Snack machine (free, one a minute; being hurt ends 10 s sooner)
- ✅ Coffee in the kitchen (15 s of walking faster; a big hit can tip the mug over)
- ✅ Ship voice for the big moments
- ✅ Rattling panels on a damaged side (the warning before a breach)
- ✅ Duct tape and hull plates are counted
- ✅ The cat hides during breaches and stares at fires
- ✅ Red emergency lighting, lasting scorch marks, the mission report
- ✖ Intercom: removed (unnecessary)

## 2. Damage types (switched on per mission)
- ✅ Power surges (★★ and up): arcing lines zap whoever uses them; splice with the repair kit
- ✅ Hull breach (★★ and up): blast doors, vacuum, items sucked out; weld outside or tarp inside
- ✅ Gravity failure (★★★): floaty floor until the breaker is reset
- ✅ Plasma fire (★★★): only in the lower side rooms; vented with a manual override at the
  airlock panel; the reactor-room blast door is sealed meanwhile (the cat lives there)

## 3. Spacewalk jobs
- ✅ Fuel canister drifting past (optional loot; ★★ and up)
- ✅ Crooked radar antenna (★★★)
- ✅ Debris in a cannon track (★★★)
- ✅ Limpet mines (★★ and up)
- ✅ Spore clouds: drift to an airlock and seep in (since 2026-10-22: spores inside the ship, see 6.; the hull barnacles are gone)
- ✅ Jump coils to align before the jump (The Deep; a gravity tide knocks one out of line in any mission)

## 4. Ship-wide encounters
- ✅ Solar flare (★★ and up): shelter on the lower deck
- ✅ AI glitch (★★ and up): reboot in the order the helm shows
- ✅ Coolant leak (★★★): coolant canister into the reactor
- ✅ Ion storm (★★★): darkness and a flashlight, radar and security static
- ✅ Stealth fighter (★★★): only visible after a radar ping
- ✅ Tractor tug (★★★): freezes the jump countdown until its emitter is shot

## 5. Station mini-games (all missions)
- ✅ Crank the cannon reload · heartbeat treatment
- ✖ Held shields: removed (a shield is up 15 s for 1 energy, holding the button adds nothing)
- ✅ Seat the fuel cell · oscilloscope at the helm · tape job for quick repairs
- ✅ Patch board (only when a feed line arcs or a capacitor is broken)
- ✅ Radar dish: point it, ping, echoes from that direction only
- ✅ Jump handle (The Deep): hold it while the drive spools

## 6. Organic ships (★★★ and up)
- ✅ Leech swarm: latch on and drink a capacitor dry, one energy ball at a time (2026-10-22; they used to chew parts); shields don't stop them, shoot them on the way in or pry them off outside
- ✅ Grappler: a tentacle blocks that side's shield and turns the ship; healing weak spots
- ✅ Spore mother: a silent scream fills space round the hull with a spore cloud (don't use the airlocks!); its tongue can only be hit while it screams
- ✅ Spores inside (2026-10-22): an infested room's parts glitch, then break; spores spread through open doors (never into the reactor room); vent them out (not while a cloud is outside)
- ✅ Leviathan (★★★★): unkillable; stay out of the rooms it bumps

## 7. Other ships
- ✅ Pirates: they dock, steal and get boarded back (jam their reactor and they cast off)
- ✅ Derelict lab with the black box (heavy) and S-7, a growth that has taken over the lab: its tendrils grab whoever comes close (chapter 3)
- ✅ Rescue: treat the stranded person, lead them home (Dr. Varga, in the brig of the pirate base; chapter 5)
- ✅ The pirate base and its boss, Captain Red Comet, in the room before the brig (chapter 5)
- ✅ Mining: drill an ore sample on a spacewalk

## 8. Progression, music
- ✅ Campaign with a story and briefings, objectives, pay and reputation (saved per player)
- ✅ Ship upgrades (reputation), gear (money) and a profession (open once chapter 1 is finished)
- ✅ A music piece per mission that builds to a crescendo; the jump lands mid-battle (six of them recorded songs)

## Still open
- Shield frequency tuning (the "or" half of the shield idea)
- Taped parts falling off on their own (only the next big hit breaks them now)
- A second ship layout for the derelict / pirate interiors (they share one three-room template)

## Docking encounters (concept pitches, 2026-10-16)
One lead concept and two alternatives per dockable ship, in `concepts/docking/` (the concept art is a
mock-up rendered by `tools/blender/models/concepts/*.py`; images not in git). What became of them:
- Derelict lab: ✅ built as **The Culture** (S-7, the thawed growth; chapter 3). The pitches (**Lights Out**:
  Specimen 7 only moves in the dark; alts: Hush, Tumble) were not taken.
- Pirate base: ✅ built with a boss, **Captain Red Comet**, in the room before Varga's brig (chapter 5). The pitches
  (**The Security Desk**: node tug-of-war with the captain; alts: Shift Change, Scuttle Protocol) were not taken.
- Raider: not built. **The Quota** (con their loot scale with ballast) · alts: hijack the raider, catnapping.
  (Chapter 4's raiders carry a nav core to steal instead.)
- Tractor tug (doesn't dock): not built. **Final Notice** (repo tug: jam the winch, pay, dispute or overload) ·
  alts: Jump Start, Grab the Wheel
- Prison barge: there is no barge in the game any more (Dr. Varga is held in the pirate base). **The Cell-O-Matic**
  (revolving cell drum, don't free the goat) · alts: searchlight stealth, cat swap

## Big ship: interactables that need more than one person (2026-11-07, ideas; the prototype in `prototype3/` builds the artillery and the chart table)
The rule for all of them: the person who *sees* isn't the person who *acts*, or the two halves are too far
apart for one person. Each one has an in-world reason for being split up.
- **Engine telegraph.** The bridge sets the order on a brass telegraph (full ahead / slow / stop / astern). The engine
  room can't see out, and they have to match the order by balancing a fuel lever against a coolant valve (too much
  fuel without coolant overheats it). Speed decides how fast a step passes, and whether a rock field is dodged or
  rammed. Why split: a ship this size is run from the bridge, and the engine is at the far end.
- **Triangulation.** Two radar dishes, one at the bow and one at the stern. Each operator only gets a bearing line to a
  stealthy contact. The chart table draws both lines, and where they cross is where it is, for the gunner. Why split:
  you need two places far apart to fix a position.
- **Wire-guided torpedo.** The torpedo officer flies it through a narrow nose camera (sees only a small cone ahead).
  The radar operator sees the whole picture and calls "left… left… now down". The tube is loaded from the torpedo room
  at the magazine (heavy: two people carry one torpedo, one at each end, walking in step).
- **Shield frequency.** An enemy's weapon frequency shows only on the sensor desk. The shield's tuning dial is in the
  emitter room, with no readout of the enemy. The two read numbers to each other, and the enemy keeps re-tuning.
  (The open "shield frequency tuning" item above.)
- **Fire hose.** One person holds the nozzle at the fire. Another opens the pump valve in the pump room and watches the
  pressure gauge. Too little pressure doesn't reach, too much knocks the holder over. Water is limited and refilled
  from the reclaimer.
- **Harpoon and winch.** Catch drifting salvage or a boarding pod: one aims and fires the harpoon from the cupola. The
  winch operator reels it in by feel on a tension gauge, because the cable snaps if it's pulled too fast while the
  target swings.
- **Two-key reactor scram.** Dumping an overloading reactor needs two keys turned within one second. The keyholes are
  in two different rooms on purpose (so nobody vents the core on a whim). The countdown is short, so someone has to be
  near each one in time.
- **Pneumatic tubes.** Shells and parts go between decks by tube: one person loads and sends, the other has to be at
  the receiving end to catch the capsule before it drops back. It's the fast alternative to hauling through the
  spine.
- **Damage-control board.** One person at the board sees which bulkheads hold pressure and where the fires are, and
  cannot leave it. The others run to the valves and hatches the board calls. A breach is sealed only when the right
  hatches close in the right order, and the runners can't see the whole picture.
- **Searchlight and point defence.** In an ion storm or a nebula the gunner is blind. One crew member sweeps the
  searchlight from its own mount, and the point-defence gunner can only hit what the beam lights.
- **Belt-fed point defence.** A rapid-fire gun that eats an ammo belt. A second person has to crank the next belt
  into the feed while it fires (fumble it and it jams, and the gunner has to clear it).
