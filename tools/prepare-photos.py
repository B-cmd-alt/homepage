#!/usr/bin/env python3
"""Prepare photographs for the Photography page.

Only web-size, watermarked copies ever go into this repository. The originals stay outside it.

    python3 tools/prepare-photos.py --start 6 --year 2026 ~/Pictures/a.jpg ~/Pictures/b.jpg

writes photography/06-s.webp, 06-l.webp, 06-a.webp (and the same for 07) and prints the two
pieces of markup to paste into photography.html. Needs Pillow (pip install pillow).

    python3 tools/prepare-photos.py --share 01

writes photography/share.jpg, the picture shown when the page is shared, from photograph 01's
published copies (so it is watermarked and needs no original).

What it does to each photo:
  - turns it upright and drops all camera data (including any location);
  - makes two sizes: small (720 px wide, phones) and large (1600 px on the long side, bigger screens);
  - stamps "@bb.style" at the bottom centre of each size;
  - makes a tiny blurred-colour copy (96 px wide, no detail left) that fills the screen behind the photo;
  - writes the author and copyright into the file.
"""
import argparse
import datetime
import os
from PIL import Image, ImageFilter, ImageOps

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'photography')
MARK = Image.open(os.path.join(HERE, 'watermark.png')).convert('RGBA')

SMALL_WIDTH = 720        # phones and small windows
LARGE_LONG_EDGE = 1600   # bigger screens; never publish anything bigger than this
AMBIENT_WIDTH = 96       # backdrop colours only
MARK_WIDTH = 0.27        # watermark width as a share of the photo's width
MARK_BOTTOM = 0.035      # gap under the watermark as a share of the photo's height
MARK_OPACITY = 0.92
QUALITY = {'s': 76, 'l': 82, 'a': 60}
AUTHOR = 'Bihan Qian'
COPYRIGHT = '(c) Bihan Qian, bb.style. All rights reserved.'


def stamp(photo):
    """Return the photo with the watermark at the bottom centre."""
    w, h = photo.size
    mw = max(120, round(w * MARK_WIDTH))
    mark = MARK.resize((mw, round(MARK.height * mw / MARK.width)), Image.LANCZOS)
    x, y = (w - mark.width) // 2, h - mark.height - round(h * MARK_BOTTOM)

    # a soft dark halo so the white text reads on mist and on rock alike
    pad = round(mark.height * 0.6)
    alpha = Image.new('L', (mark.width + 2 * pad, mark.height + 2 * pad), 0)
    alpha.paste(mark.getchannel('A'), (pad, pad))
    halo = alpha.filter(ImageFilter.GaussianBlur(mark.height * 0.11)).point(lambda v: min(255, int(v * 0.9)))
    out = photo.convert('RGBA')
    out.paste(Image.new('RGBA', halo.size, (0, 0, 0, 255)), (x - pad, y - pad + max(1, mark.height // 40)), halo)

    faded = mark.copy()
    faded.putalpha(mark.getchannel('A').point(lambda v: int(v * MARK_OPACITY)))
    out.alpha_composite(faded, (x, y))
    return out.convert('RGB')


def credit():
    exif = Image.Exif()
    exif[0x013B] = AUTHOR      # Artist
    exif[0x8298] = COPYRIGHT   # Copyright
    return exif.tobytes()


def prepare(src, number):
    photo = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
    w, h = photo.size
    scale = min(1.0, LARGE_LONG_EDGE / max(w, h))
    large = photo.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    small = photo.resize((SMALL_WIDTH, round(h * SMALL_WIDTH / w)), Image.LANCZOS)
    name = f'{number:02d}'
    for tag, im in (('s', small), ('l', large)):
        stamp(im).save(os.path.join(OUT, f'{name}-{tag}.webp'), 'WEBP', quality=QUALITY[tag], method=6, exif=credit())
    ambient = photo.resize((AMBIENT_WIDTH, round(h * AMBIENT_WIDTH / w)), Image.LANCZOS).filter(ImageFilter.GaussianBlur(3))
    ambient.save(os.path.join(OUT, f'{name}-a.webp'), 'WEBP', quality=QUALITY['a'], method=6, exif=credit())
    return name, small.size, large.size


def share(name):
    """The 1200 x 630 picture for link previews: the photograph whole, on its own colours, as on the page."""
    W, H, PAGE = 1200, 630, (250, 249, 247)
    back = Image.open(os.path.join(OUT, f'{name}-a.webp')).convert('RGB')
    back = ImageOps.fit(back, (W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(40))
    back = Image.blend(back, Image.new('RGB', (W, H), PAGE), 0.56)
    photo = Image.open(os.path.join(OUT, f'{name}-l.webp')).convert('RGB')
    h = H - 60
    photo = photo.resize((round(photo.width * h / photo.height), h), Image.LANCZOS)
    x, y = (W - photo.width) // 2, (H - h) // 2
    shadow = Image.new('L', (W, H), 0)
    shadow.paste(110, (x - 6, y + 14, x + photo.width + 6, y + h + 22))
    back.paste(Image.new('RGB', (W, H), (0, 0, 0)), (0, 0), shadow.filter(ImageFilter.GaussianBlur(26)))
    back.paste(photo, (x, y))
    back.save(os.path.join(OUT, 'share.jpg'), 'JPEG', quality=84, optimize=True, progressive=True, exif=credit())


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('photos', nargs='*', help='original photo files, in the order they should appear')
    ap.add_argument('--start', type=int, default=1, help='number of the first photo (default 1)')
    ap.add_argument('--year', default=str(datetime.date.today().year), help='year the photos were taken, shown under each (default: this year)')
    ap.add_argument('--share', metavar='NN', help='make photography/share.jpg from the published copies of photo NN, e.g. 01')
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    if args.share:
        share(args.share)
        print('Wrote photography/share.jpg')
    if not args.photos:
        raise SystemExit(0 if args.share else 'Give at least one photo, or --share NN.')
    ambient, frames = [], []
    for i, src in enumerate(args.photos):
        name, (sw, sh), (lw, lh) = prepare(src, args.start + i)
        ambient.append(f'<img src="photography/{name}-a.webp" alt="">')
        frames.append(
            f'<li class="frame" id="photo-{name}"><figure class="pin"><span class="hold">'
            f'<img class="shot" src="photography/{name}-s.webp" srcset="photography/{name}-s.webp {sw}w, photography/{name}-l.webp {lw}w" '
            f'sizes="(max-aspect-ratio: 2/3) 92vw, 60vh" width="{lw}" height="{lh}" loading="lazy" decoding="async" '
            f'alt="DESCRIBE THE PHOTO">'
            f'<span class="when"><time datetime="{args.year}">{args.year}</time></span></span></figure></li>')
    print('Add inside <div class="ambient">, in the same order as the photos:')
    print('\n'.join(ambient))
    print('\nAdd inside <ol class="frames">:')
    print('\n'.join(frames))
