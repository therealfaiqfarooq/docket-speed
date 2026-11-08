#!/usr/bin/env python3
"""Place a real popup capture over a real page capture, top right, the way
Chrome shows an extension popup under the toolbar. Output is 1280x800.
Usage: compose_popup_shot.py page.png popup.png out.png"""
import sys
from PIL import Image, ImageFilter

page = Image.open(sys.argv[1]).convert("RGBA")
popup = Image.open(sys.argv[2]).convert("RGBA")
assert page.size == (1280, 800), page.size
x = 1280 - popup.width - 24
y = 12
shadow = Image.new("RGBA", page.size, (0, 0, 0, 0))
box = Image.new("RGBA", (popup.width, popup.height), (0, 0, 0, 110))
shadow.alpha_composite(box, (x, y + 6))
shadow = shadow.filter(ImageFilter.GaussianBlur(10))
out = Image.alpha_composite(page, shadow)
out.alpha_composite(popup, (x, y))
out.convert("RGB").save(sys.argv[3], optimize=True)
