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
- **Consistency**: every page is built from the same parts as the homepage. A new or changed page must have:
  - the background layers with the animated `#nn-canvas` and `script.js`;
  - `theme.js` in `<head>` (it adds the Light / Dark switch at the top right);
  - a back link at the top left (`← bb.style`, or `← <parent page>` one level down);
  - a title in bold Bodoni with the orange full stop, and an orange uppercase kicker above it;
  - page links at the foot in the homepage link style (`nav.links`).
  Links are underlined text in one of the homepage's two styles (`.links a` / `.cta a` for main links,
  `.also a` / `.cta a.quiet` for quiet ones). No pill buttons, no filled buttons.
  `projects/memory-evaluator.html` is a generated report: its site look lives in the marked
  "site chrome" blocks in that file and has to be re-applied if the report is regenerated.

## Photography (`photography.html`, `photography/`)

- **Only web-size, watermarked copies are ever committed.** This repository is public: never add an original
  or full-resolution photograph, not even temporarily.
- Make the copies with `python3 tools/prepare-photos.py --start <next number> <originals...>` (needs Pillow).
  It drops all camera data (including location) and writes three files per photo: `NN-s.webp` (720 px wide),
  `NN-l.webp` (1600 px on the long side; nothing larger is published), both stamped `@bb.style` at the bottom
  centre from `tools/watermark.png` and carrying author and copyright, and `NN-a.webp` (96 px, colours only).
- The page is a full-screen reel, made to impress at first sight: one photograph per screen, shown whole
  (never cropped), with the entire background taking on that photograph's colours from its `-a` copy.
  Scrolling slides the next photograph up over the current one; the pointer makes photo and backdrop lean
  slightly. Arrow keys, clicking, and swiping also move one photograph at a time.
- To add a photo, paste the two pieces of markup the tool prints: an `<img>` into `.ambient` and a
  `<li class="frame">` into `.frames`, in the same order. Write a plain description as `alt`.
  Do not invent titles or places.
- Only the current photograph and its neighbours are rendered, so the rest are not downloaded until needed.
  Without JavaScript the page is one full-height photograph after another.

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
