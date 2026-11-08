#!/usr/bin/env python3
"""Regenerate Docket Speed icons with Pillow.

Writes:
  extension/icons/icon16.png, icon32.png, icon48.png  (artwork fills the canvas,
      heavier strokes so it reads at toolbar size)
  extension/icons/icon128.png and store/icons/store-icon-128.png
      (96x96 artwork centred with 16 px transparent padding, per the
      Chrome Web Store image guidelines)
  store/icons/preview-*.png  (enlarged previews on light and dark, for review)

Design: a white tile with a hairline edge, two slate square brackets (the [n]
paragraph mark of a judgment) around a red pivot dot.
Original artwork; no third-party logos.

Run: python3 scripts/make_icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
EXT_ICONS = ROOT / "extension" / "icons"
STORE_ICONS = ROOT / "store" / "icons"

TILE = (255, 255, 255, 255)
EDGE = (214, 221, 231, 255)
SLATE = (15, 23, 42, 255)
RED = (229, 72, 77, 255)

SS = 16  # supersampling factor


def artwork(px: int, heavy: bool, dot: bool = True) -> Image.Image:
    """Draw the tile at px*SS and return it downsampled to px x px.

    Light design: white rounded tile with a hairline edge (so it shows on light
    and dark toolbars), slim slate brackets, and a red pivot dot."""
    del dot  # kept for call compatibility; the dot is always drawn
    s = px * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = int(s * 0.24)
    edge = max(SS, int(s * (0.05 if heavy else 0.025)))
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=EDGE)
    d.rounded_rectangle([edge, edge, s - 1 - edge, s - 1 - edge], radius=radius - edge, fill=TILE)

    stroke = int(s * (0.11 if heavy else 0.07))
    top, bottom = int(s * (0.24 if heavy else 0.27)), int(s * (0.76 if heavy else 0.73))
    arm = int(s * (0.12 if heavy else 0.1))
    lx = int(s * (0.2 if heavy else 0.24))
    rx = s - lx
    r = stroke // 2
    # Left bracket [ and right bracket ], with softly rounded ends.
    d.rounded_rectangle([lx, top, lx + stroke, bottom], radius=r, fill=SLATE)
    d.rounded_rectangle([lx, top, lx + arm, top + stroke], radius=r, fill=SLATE)
    d.rounded_rectangle([lx, bottom - stroke, lx + arm, bottom], radius=r, fill=SLATE)
    d.rounded_rectangle([rx - stroke, top, rx, bottom], radius=r, fill=SLATE)
    d.rounded_rectangle([rx - arm, top, rx, top + stroke], radius=r, fill=SLATE)
    d.rounded_rectangle([rx - arm, bottom - stroke, rx, bottom], radius=r, fill=SLATE)

    # Pivot dot.
    cx = cy = s // 2
    dot_r = int(s * (0.12 if heavy else 0.095))
    d.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=RED)
    return img.resize((px, px), Image.LANCZOS)


def padded_128() -> Image.Image:
    canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    canvas.alpha_composite(artwork(96, heavy=False), (16, 16))
    return canvas


def preview(img: Image.Image, bg, scale: int) -> Image.Image:
    big = img.resize((img.width * scale, img.height * scale), Image.NEAREST)
    out = Image.new("RGBA", (big.width + 32, big.height + 32), bg)
    out.alpha_composite(big, (16, 16))
    return out


def main() -> None:
    EXT_ICONS.mkdir(parents=True, exist_ok=True)
    STORE_ICONS.mkdir(parents=True, exist_ok=True)
    small = {16: artwork(16, heavy=True, dot=False), 32: artwork(32, heavy=True), 48: artwork(48, heavy=False)}
    for size, img in small.items():
        img.save(EXT_ICONS / f"icon{size}.png", optimize=True)
        img.save(STORE_ICONS / f"icon{size}.png", optimize=True)
    big = padded_128()
    big.save(EXT_ICONS / "icon128.png", optimize=True)
    big.save(STORE_ICONS / "store-icon-128.png", optimize=True)
    # Large artwork for promo tiles (not shipped in the extension).
    artwork(512, heavy=False).save(STORE_ICONS / "artwork-512.png", optimize=True)

    # Review sheet: each size at 1x (top row) and enlarged (below), on light and dark.
    W = 900
    sheet = Image.new("RGBA", (W * 2, 420), (255, 255, 255, 255))
    sheet.alpha_composite(Image.new("RGBA", (W, 420), (32, 33, 36, 255)), (W, 0))
    for ox, bg in ((0, (255, 255, 255, 255)), (W, (32, 33, 36, 255))):
        x = 20
        for size, img in list(small.items()) + [(128, big)]:
            sheet.alpha_composite(img, (ox + x, 20))
            scale = {16: 8, 32: 4, 48: 3, 128: 2}[size]
            sheet.alpha_composite(preview(img, bg, scale), (ox + x, 160))
            x += img.width * scale + 50
    sheet.save(STORE_ICONS / "preview-sheet.png")
    print("Icons written to", EXT_ICONS, "and", STORE_ICONS)


if __name__ == "__main__":
    main()
