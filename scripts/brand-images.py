#!/usr/bin/env python3
"""Regenerate the static brand images the site cannot render at runtime.

Two of them, both under `apps/web/public`:

  img/og-default.jpg   1200x630, the share card every page falls back to
  favicon.ico + icon-*.png + apple-touch-icon.png

Run by hand after a logo or hero change — the output is committed, so a normal
build never needs Python or a network round trip:

    pip install pillow
    curl -sL "https://fonts.googleapis.com/css2?family=Golos+Text:wght@500;800" \
      | grep -o 'https://[^)]*\\.ttf' > /tmp/golos.txt   # 500 first, then 800
    python3 scripts/brand-images.py --font-500 … --font-800 …

Golos Text is the site's display face (`tokens.css`); the share card has to look
like the site it links to, so the card is drawn with the same font rather than
with whatever the machine happens to have.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "apps" / "web"
PUBLIC = WEB / "public"

BRAND_950 = (15, 31, 74)
OG_SIZE = (1200, 630)

HEADLINE = ["Солонгост суралцах", "зуучлалын платформ"]
SUBLINE = "135 их сургууль · зөвлөгөөнөөс виз хүртэл нэг дор"
DOMAIN = "gksedu.mn"


def cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    """Scale to fill, then crop the overflow off the centre — CSS `object-fit: cover`."""
    target_w, target_h = size
    scale = max(target_w / image.width, target_h / image.height)
    resized = image.resize(
        (round(image.width * scale), round(image.height * scale)), Image.LANCZOS
    )
    left = (resized.width - target_w) // 2
    top = (resized.height - target_h) // 2
    return resized.crop((left, top, left + target_w, top + target_h))


def build_og(font_800: Path, font_500: Path) -> None:
    hero = Image.open(WEB / "public/img/hero-campus.jpg").convert("RGB")
    card = cover(hero, OG_SIZE)

    # A left-to-right wash: opaque enough on the left that white type is legible
    # at Facebook's thumbnail size, thin enough on the right that the campus is
    # still recognisably a photograph.
    wash = Image.new("RGBA", OG_SIZE, (0, 0, 0, 0))
    pixels = wash.load()
    for x in range(OG_SIZE[0]):
        alpha = round(242 - (x / OG_SIZE[0]) * 130)
        for y in range(OG_SIZE[1]):
            pixels[x, y] = (*BRAND_950, alpha)
    card = Image.alpha_composite(card.convert("RGBA"), wash)

    logo = Image.open(WEB / "app/assets/img/gks-logo-full-knockout.png").convert("RGBA")
    logo_h = 46
    logo = logo.resize((round(logo.width * logo_h / logo.height), logo_h), Image.LANCZOS)
    card.alpha_composite(logo, (72, 66))

    draw = ImageDraw.Draw(card)
    headline = ImageFont.truetype(str(font_800), 64)
    sub = ImageFont.truetype(str(font_500), 27)
    domain = ImageFont.truetype(str(font_500), 24)

    y = 226
    for line in HEADLINE:
        draw.text((72, y), line, font=headline, fill=(255, 255, 255))
        y += 78

    draw.text((72, y + 26), SUBLINE, font=sub, fill=(147, 197, 253))
    draw.text((72, 520), DOMAIN, font=domain, fill=(255, 255, 255, 200))

    out = PUBLIC / "img/og-default.jpg"
    card.convert("RGB").save(out, "JPEG", quality=86, optimize=True, progressive=True)
    print(f"{out.relative_to(ROOT)}  {out.stat().st_size // 1024} KB")


def build_icons() -> None:
    """Favicons off the "G" alone.

    The full lockup is a 2.3:1 wordmark with "EDU GROUP" set in 8% of its
    height — at 32px that is a grey smear. The G with the red arrow through it
    is the one part of the mark that survives the shrink and is still only ours,
    so the icons carry that and nothing else, on white: Google renders the
    favicon in the mobile result next to the domain, and a white tile is what
    sits cleanly on both a light and a dark result row.
    """
    # Bounds measured off `gks-logo-mark.png` — the G, stopping short of the K.
    mark = Image.open(WEB / "app/assets/img/gks-logo-mark.png").convert("RGBA")
    glyph = mark.crop((24, 24, 372, 366))

    def tile(size: int, pad_ratio: float = 0.12) -> Image.Image:
        canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
        inner = round(size * (1 - pad_ratio * 2))
        scale = min(inner / glyph.width, inner / glyph.height)
        art = glyph.resize(
            (max(1, round(glyph.width * scale)), max(1, round(glyph.height * scale))),
            Image.LANCZOS,
        )
        canvas.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
        return canvas

    tile(512).save(PUBLIC / "icon-512.png")
    tile(192).save(PUBLIC / "icon-192.png")
    # iOS composites onto its own rounded mask and drops alpha — flatten to RGB.
    tile(180).convert("RGB").save(PUBLIC / "apple-touch-icon.png")
    # A tighter crop for the 16px entry: at that size the padding is the picture.
    tile(64, pad_ratio=0.06).save(
        PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)]
    )
    for name in ("icon-512.png", "icon-192.png", "apple-touch-icon.png", "favicon.ico"):
        print(f"public/{name}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--font-800", type=Path, required=True, help="Golos Text ExtraBold .ttf")
    parser.add_argument("--font-500", type=Path, required=True, help="Golos Text Medium .ttf")
    args = parser.parse_args()

    build_og(args.font_800, args.font_500)
    build_icons()


if __name__ == "__main__":
    main()
