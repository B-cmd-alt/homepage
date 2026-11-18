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
  A page with nothing on it yet is not linked from the homepage (Research, for now); it says "Coming soon" in the
  shared `.soon` line, never in a pill.
- **Consistency**: every page is built from the same parts as the homepage. A new or changed page must have:
  - the background layers with the animated `#nn-canvas` and `script.js`;
  - `theme.js` in `<head>` (it adds the Light / Dark switch at the top right);
  - a back link at the top left (`← bb.style`, or `← <parent page>` one level down);
  - a title in bold Bodoni with the orange full stop (in every language), and an orange uppercase kicker above it;
  - the same foot: page links in the homepage link style (`nav.links.nav-foot`: Home, Projects, Experience, leaving
    out the page itself; a page one level down puts its parent first), then the contact line (`.contact`);
  - a tab title of the form `<Page> | BB.STYLE`, and a share image (`og.png`, or the page's own).
  The frame these are built from (`.back-link`, `.page`, `.page-title`, `.lede`, `.nav-foot`, `.soon`, the number
  cards) lives once in `style.css`. A page's own `<style>` holds only what that page alone needs; never copy the
  frame into a page.
  Links are underlined text in one of the homepage's two styles (`.links a` / `.cta a` for main links,
  `.also a` / `.cta a.quiet` for quiet ones). No pill buttons, no filled buttons.
  `projects/memory-evaluator.html` is a generated report: its site look lives in the marked
  "site chrome" blocks in that file (head tags and analytics, palette, background, back link, foot and contact line)
  and has to be re-applied if the report is regenerated.

## Projects (`projects.html`)

- Each project is told in this order: kicker, title, one-line tagline, **links** (live thing first, then evidence,
  then GitHub), **one picture**, four numbers, then at most two short paragraphs (the question, what it shows).
- The long write-up is not on this page. It lives in the project's GitHub README, which the page links to.
- The picture is drawn in HTML, CSS and inline SVG from the site tokens, so it follows the theme and reflows on a
  phone. A chart shows real numbers taken from the evidence, with the same numbers readable as text beside the bars.
- No em dashes, as on the rest of the site.

## Photography (`photography.html`, `photography/`)

- **Only web-size, watermarked copies are ever committed.** This repository is public: never add an original
  or full-resolution photograph, not even temporarily.
- Make the copies with `python3 tools/prepare-photos.py --start <next number> <originals...>` (needs Pillow).
  It drops all camera data (including location) and writes three files per photo: `NN-s.webp` (720 px wide),
  `NN-l.webp` (1600 px on the long side; nothing larger is published), both stamped `@bb.style` at the bottom
  centre from `tools/watermark.png` and carrying author and copyright, and `NN-a.webp` (96 px, colours only).
- The page is a full-screen reel, made to impress at first sight: one photograph per screen, shown whole
  (never cropped), with the entire background taking on that photograph's colours from its `-a` copy.
  While a photograph is showing, the colours of the next one glow along the bottom of the background.
  Scrolling slides the next photograph up over the current one as its colours rise to fill the screen;
  the pointer makes photo and backdrop lean slightly.
- **Nothing moves until the visitor does.** No previews, no nudges, no edge of the next photograph showing:
  moving pictures made the page look messy. The only cue is the scroll sign in the band the photograph leaves
  free at the bottom of the first screen: a small mouse with a moving wheel and "Scroll" ("Swipe up" on touch
  screens). A rail of ticks on the right shows how many photographs there are and jumps to any of them.
- **One push moves exactly one photograph**, always ending in the same smooth glide: one wheel notch
  however small, one trackpad swipe (its fading tail is ignored), one arrow key, one click, one swipe.
  Never rely on the browser's scroll snapping alone for the wheel: a single notch springs back.
- To add a photo, paste the two pieces of markup the tool prints: an `<img>` into `.ambient` and a
  `<li class="frame">` into `.frames`, in the same order. Write a plain description as `alt`.
  Do not invent titles or places.
- Under each photograph's left corner is the year it was taken (`.when`; pass `--year` to the tool), and nothing else.
- Each photograph has its own address: `photography.html#photo-03` opens on the third, and the address follows
  the photograph being shown.
- The count at the bottom right ("01 / 05") opens the overview: every photograph at once, shown whole, to jump
  to any of them. Its pictures are not fetched until it is opened.
- `photography/share.jpg` is the picture shown when the page is shared. Remake it with
  `python3 tools/prepare-photos.py --share 01` if the first photograph changes.
- Only the current photograph and its neighbours are rendered, so the rest are not downloaded until needed.
  Without JavaScript the page is one full-height photograph after another.

## Cooking (`cooking.html`, `cooking/`)

Design principles. These always hold:

1. **Every temperature is written in °C with its °F alongside**, e.g. `55°C (131°F)`. Never one without the
   other: in text, in the key numbers, in drawing labels and in the index.
2. **Everything is in English and Chinese.** Each piece of text is a pair of sibling elements,
   `lang="en"` and `lang="zh"`. Drawing descriptions and the tab title use `data-en` / `data-zh`.
   Each version is pure: no Chinese in the English view, no English words in the Chinese view
   (units such as °C, the site name, and names with no Chinese form such as GitHub are fine). Pages open in English; Chinese is shown only
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
