# bb.style

Static site served by GitHub Pages from `main`. Plain HTML, CSS and JS: no build step, no dependencies.
`node serve.js` previews it at http://localhost:8000.

## Site-wide

- **Style**: succinct, clean, open. Bodoni Moda for display, JetBrains Mono for text, one orange accent.
- **Theme**: follows the browser (`prefers-color-scheme`) until the reader picks Light or Dark with the switch
  at the top right of every page (`theme.js`, loaded in each page's `<head>`); the choice is remembered.
  Colours come from the tokens at the top of `style.css`; never hard-code a colour that has to change between
  light and dark. Dark values are written twice (browser setting, reader's choice): keep the two blocks equal.
- **Loading comes first**: no images or video where inline SVG and CSS will do, no extra font files,
  nothing fetched that the page does not need.
- **Homepage**: Projects and Experience are the two main links. Everything else sits on the small line below them.

## Cooking (`cooking.html`, `cooking/`)

Design principles. These always hold:

1. **Every temperature is written in °C with its °F alongside**, e.g. `55°C (131°F)`. Never one without the
   other: in text, in the key numbers, in drawing labels and in the index.
2. **Everything is in English and Chinese.** Each piece of text is a pair of sibling elements,
   `lang="en"` and `lang="zh"`. Drawing descriptions and the tab title use `data-en` / `data-zh`.
   Each version is pure: no Chinese in the English view, no English words in the Chinese view
   (units such as °C and the site name are fine). Pages open in English; Chinese is shown only
   after the reader picks it, and that choice is remembered.
   Chinese uses the reader's system fonts; do not add a Chinese web font.
3. **One page per dish.** `cooking.html` only lists dishes (one `<li>` each), so it stays light at 100+ dishes.
   A dish page carries only its own drawings.
4. **Every step is drawn**: an inline SVG line drawing that plays as a short loop while on screen.
   Drawings use the classes in `cooking/cooking.css` (`ln`, `pa`, `ac`, `tint`, ...) so they follow the theme.
   Loops reused across dishes live in `cooking.css`; a loop only one dish uses lives in that dish's `<style>`.
5. Keep the recipe to what was actually given: the numbers that matter, short steps, no invented quantities.

To add a dish: copy an existing page in `cooking/` (they share one structure), write the steps and their
drawings, then add one row to the list in `cooking.html`.
