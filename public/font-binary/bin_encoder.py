#!/usr/bin/env python3
"""閱星曈 XTC .bin 字體編碼器

格式（已破解）：
- 無 header、無索引表
- 65534 個 glyph slot：U+0000 ~ U+FFFD
- 每 slot = widthByte * outerHeight bytes（widthByte = ceil(outerWidth / 8)）
- 1-bit packed, MSB first, row-major, 無 row padding

用法：
  python bin_encoder.py <ttf> <fontsize_pt> <outer_w> <outer_h> [--vertical] -o <out.bin>

範例：
  python bin_encoder.py GuanKiapTsingKhai-Tbold.ttf 42 44 51 -o test_42.bin
"""

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# 從 14 個官方 .bin 樣本實測：實際是 65536 個 slot（0x10000），不是 0xFFFE
GLYPH_COUNT = 0x10000


def render_glyph(font: ImageFont.FreeTypeFont, codepoint: int, w: int, h: int, x_off: int, y_off: int, threshold: int = 240) -> bytes:
    """單字渲染成 1-bit packed bytes（widthByte * h bytes）。

    x_off / y_off：固定錨點，由外面依字體 metrics 算好（不要每字重算）。
    官方 XTEink 把字「左上對齊 + 整體下推」放進 slot，不是 bbox 居中。
    """
    width_byte = (w + 7) // 8
    img = Image.new("L", (w, h), 255)
    draw = ImageDraw.Draw(img)
    ch = chr(codepoint)

    try:
        draw.text((x_off, y_off), ch, font=font, fill=0)
    except Exception:
        return b"\x00" * (width_byte * h)

    pixels = img.load()
    out = bytearray(width_byte * h)
    for row in range(h):
        for col in range(w):
            if pixels[col, row] < threshold:
                byte_idx = row * width_byte + (col >> 3)
                bit_mask = 0x80 >> (col & 7)
                out[byte_idx] |= bit_mask
    return bytes(out)


def encode(ttf_path: Path, font_size_pt: int, outer_w: int, outer_h: int, out_path: Path, vertical: bool = False, x_off: int = 0, y_off: int | None = None, threshold: int = 240) -> None:
    font = ImageFont.truetype(str(ttf_path), font_size_pt)
    width_byte = (outer_w + 7) // 8
    slot_size = width_byte * outer_h

    asc, des = font.getmetrics()
    if y_off is None:
        y_off = outer_h - (asc + des)

    print(f"[encoder] font={ttf_path.name} pt={font_size_pt} slot={outer_w}x{outer_h} widthByte={width_byte} slot_size={slot_size}B")
    print(f"[encoder] PIL metrics: ascent={asc} descent={des} → auto y_off={outer_h - (asc + des)} (using y_off={y_off}, x_off={x_off})")
    print(f"[encoder] total size = {slot_size * GLYPH_COUNT:,} bytes ({slot_size * GLYPH_COUNT / 1024 / 1024:.1f} MB)")
    print(f"[encoder] vertical={vertical}")

    blank_slot = b"\x00" * slot_size
    written = 0

    with open(out_path, "wb") as fp:
        for cp in range(GLYPH_COUNT):
            if cp < 0x20:
                fp.write(blank_slot)
            else:
                fp.write(render_glyph(font, cp, outer_w, outer_h, x_off, y_off, threshold))
            written += 1
            if written % 4096 == 0:
                pct = written / GLYPH_COUNT * 100
                print(f"[encoder] {written}/{GLYPH_COUNT} ({pct:.1f}%)", end="\r", file=sys.stderr)

    print(f"\n[encoder] done. wrote {out_path} ({out_path.stat().st_size:,} bytes)")


def main() -> None:
    parser = argparse.ArgumentParser(description="TTF -> 閱星曈 XTC .bin")
    parser.add_argument("ttf", type=Path, help="TTF/OTF font path")
    parser.add_argument("font_size_pt", type=int, help="numFontSizePt (e.g. 42)")
    parser.add_argument("outer_w", type=int, help="outerWidth in pixels (e.g. 44)")
    parser.add_argument("outer_h", type=int, help="outerHeight in pixels (e.g. 51)")
    parser.add_argument("--vertical", action="store_true", help="豎排模式（檔名加豎-前綴用，內部編碼相同）")
    parser.add_argument("--x-off", type=int, default=0, help="x offset (default 0)")
    parser.add_argument("--y-off", type=int, default=None, help="y offset (default = outer_h - ascent - descent)")
    parser.add_argument("--threshold", type=int, default=240, help="binarization threshold 0-255 (default 240, mimics XTEink stroke weight)")
    parser.add_argument("-o", "--output", type=Path, required=True, help="output .bin path")
    args = parser.parse_args()

    if not args.ttf.exists():
        print(f"[error] TTF not found: {args.ttf}", file=sys.stderr)
        sys.exit(1)

    encode(args.ttf, args.font_size_pt, args.outer_w, args.outer_h, args.output, args.vertical, args.x_off, args.y_off, args.threshold)


if __name__ == "__main__":
    main()
