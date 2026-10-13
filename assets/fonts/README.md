# Fonts

| File | Font | Author | License |
|---|---|---|---|
| `PatrickHand-Regular.ttf` | Patrick Hand (Regular, v1.003) | Patrick Wagesreiter | SIL Open Font License 1.1, full text in `PatrickHand-OFL.txt` |

Source: https://github.com/google/fonts/tree/main/ofl/patrickhand (also on Google Fonts), unmodified.

Used for handwriting in the game (e.g. sticky notes), declared with `@font-face` in `index.html` as
`'Patrick Hand'`. Canvas text only uses it once it has loaded, so call
`document.fonts.load("20px 'Patrick Hand'")` before drawing with it.

OFL rules in short: keep the license file next to the font, don't sell the font file on its own
(shipping it inside the game is fine), and if the font itself is ever modified, the modified version
must not be called "Patrick Hand" (Reserved Font Name).
