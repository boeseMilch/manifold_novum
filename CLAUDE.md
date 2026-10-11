# Working on Manifold Novum

## Commit after every finished request

Whenever you finish a request from the user, commit the result before reporting back:

- Run the tests first: `for t in tests/*.js; do [ "$t" = tests/harness.js ] || node "$t"; done`.
  Commit only when they pass, or say clearly in your reply what fails.
- Commit on `main` (no feature branches unless asked), with a message that says what
  changed and why.
- Don't push. There is no remote unless the user adds one.

## Pointers

- `README.md`: how to run the game (solo, or `node server.js` for LAN multiplayer).
- `PLAN.md`: what has been built so far and why. Keep it updated with every change.
- `VISION.md`: where the game is heading.
