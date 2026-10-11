# Working on Manifold Novum

## Commit after every finished request

Whenever you finish a request from the user, commit the result before reporting back:

- Run the tests first: `for t in tests/*.js; do [ "$t" = tests/harness.js ] || node "$t"; done`.
  Commit only when they pass, or say clearly in your reply what fails.
- Commit on `main` (no feature branches unless asked), with a message that says what
  changed and why.
- Commit as `boeseMilch <10449052+boeseMilch@users.noreply.github.com>` (set in the repo's git
  config), never under a real name.
- After committing, push to `origin` (github.com/boeseMilch/manifold_novum), pulling with rebase
  first if it moved.

## Saved progress must stay backwards compatible

Every player's progress (XP, money, reputation, upgrades, gear, finished chapters) is saved in
their own browser (cookie `mn-profile`, mirrored to localStorage; see `js/progress.js`).

- Never rename or remove a profile field, or change what a value means, without a migration.
- When the format changes: bump `PROFILE_VERSION` and add a step in `migrateProfile()` that turns
  every older version into the new one. Unknown fields must be kept, missing ones defaulted.
- Upgrade, gear and mission ids are stored in saves: don't rename them; add new ones instead.
- `tests/progress.js` loads old-style profiles; add a case for every migration.

## Pointers

- `README.md`: how to run the game (solo, or `node server.js` for LAN multiplayer).
- `PLAN.md`: what has been built so far and why. Keep it updated with every change.
- `VISION.md`: where the game is heading.
- `IDEAS.md`: brainstormed encounters, damage types and mini-games (not built yet).
