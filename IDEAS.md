# Manifold Novum — Ideas, by difficulty

Everything from the original brainstorm, ordered from easiest to hardest to build, with where
it shows up. ✅ = built (details in `PLAN.md`, step 8). Harder encounters are kept for harder
missions; every one of them can be tried in **Practice** mode.

Mission tiers: ★ First Contract, Strange Cargo · ★★ Empty Lab, Red Comet Cove · ★★★ Rescue Dr. Varga,
Spore Season, The Deep · ★★★★ The Mother of All. (Plus the skirmish builder: any mix of encounters.)

## 1. Small things (all missions)
- ✅ Snack machine (1 energy; being hurt ends 10 s sooner)
- ✅ Coffee at the helm (15 s faster; big hits tip it over)
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
- ✅ Jump coils to align before the jump (The Deep and up)

## 4. Ship-wide encounters
- ✅ Solar flare (★★ and up): shelter on the lower deck
- ✅ AI glitch (★★ and up): reboot in the order the helm shows
- ✅ Coolant leak (★★★): coolant canister into the reactor
- ✅ Ion storm (★★★): darkness and a flashlight, radar and security static
- ✅ Stealth fighter (★★★): only visible after a radar ping
- ✅ Tractor tug (★★★): freezes the jump countdown until its emitter is shot

## 5. Station mini-games (all missions)
- ✅ Crank the cannon reload · held shields · heartbeat treatment
- ✅ Seat the fuel cell · oscilloscope at the helm · tape job for quick repairs
- ✅ Patch board (only when a feed line arcs or a capacitor is broken)
- ✅ Radar dish: point it, ping, echoes from that direction only
- ✅ Jump handle (The Deep and up): hold it while the drive spools

## 6. Organic ships (★★★ and up)
- ✅ Leech swarm: latch on and drink a capacitor dry, one energy ball at a time (2026-10-22; they used to chew parts); shields don't stop them, shoot them on the way in or pry them off outside
- ✅ Grappler: a tentacle blocks that side's shield and turns the ship; healing weak spots
- ✅ Spore mother: a silent scream fills space round the hull with a spore cloud (don't use the airlocks!); its tongue can only be hit while it screams
- ✅ Spores inside (2026-10-22): an infested room's parts glitch, then break; spores spread through open doors (never into the reactor room); vent them out (not while a cloud is outside)
- ✅ Leviathan (★★★★): unkillable; stay out of the rooms it bumps

## 7. Other ships
- ✅ Pirates: they dock, steal and get boarded back (jam their reactor and they cast off)
- ✅ Derelict with the black box (heavy) and a sleeping intruder
- ✅ Rescue: treat the stranded person, lead them home (Dr. Varga on the pirate barge)
- ✅ Mining: drill an ore sample on a spacewalk

## 8. Progression, music
- ✅ Campaign with a story and briefings, objectives, pay, XP, reputation (saved per player)
- ✅ Ship upgrades (reputation), gear and professions (money / level)
- ✅ A music piece per mission that builds to a crescendo; the jump lands mid-battle

## Still open
- Shield frequency tuning (the "or" half of the shield idea)
- Taped parts falling off on their own (only the next big hit breaks them now)
- A second ship layout for the derelict / pirate interiors (they share one three-room template)

## Docking encounters (concept pitches, 2026-10-16, awaiting the user's feedback)
One lead concept and two alternatives per dockable ship, in `concepts/docking/` (the concept art is a
mock-up rendered by `tools/blender/models/concepts/*.py`; images not in git):
- Raider: **The Quota** (con their loot scale with ballast) · alts: hijack the raider, catnapping
- Prison barge (unused today): **The Cell-O-Matic** (revolving cell drum, don't free the goat) · alts: searchlight stealth, cat swap
- Derelict lab: **Lights Out** (Specimen 7 only moves in the dark; the lights run on our reactor) · alts: Hush, Tumble
- Pirate base: **The Security Desk** (node tug-of-war with Captain Red Comet) · alts: Shift Change, Scuttle Protocol
- Tractor tug (doesn't dock yet): **Final Notice** (repo tug: jam the winch, pay, dispute or overload) · alts: Jump Start, Grab the Wheel
