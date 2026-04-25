#!/usr/bin/env python3
"""閱星曈刷機版 .epdfont 字體編碼器

格式（已破解）：
- Magic "EPDFN" + 48 byte header
- range table (12 byte × N)
- glyph metadata table (13 byte × glyph_count)
- bitmap data：2-bit packed 灰階（4 級），MSB first，row-major

關鍵字級對應（從官方 38號 樣本反推）：
  XTEink 字級 38 → PIL pt 64 → pixel_size 48
  比例：PIL_pt = round(xteink_pt × 64/38)
        pixel_size = round(xteink_pt × 48/38)

用法：
  python epdfont_encoder.py <ttf> <pt> -o <out.epdfont> [--charset common|big5|all]
"""

import argparse
import json
import struct
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def load_default_ranges() -> list[tuple[int, int]]:
    p = Path(__file__).parent / "epdfont_ranges.json"
    with open(p) as f:
        return [tuple(r) for r in json.load(f)]


def big5_ranges() -> list[tuple[int, int]]:
    return [
        (0x0020, 0x007E),
        (0x3000, 0x303F),
        (0x4E00, 0x9FA0),
        (0xFF01, 0xFF9F),
    ]


def all_bmp_ranges() -> list[tuple[int, int]]:
    return [(0x0020, 0xFFFD)]


PIL_PT_RATIO = 64 / 38      # XTEink pt → PIL pt（從官方 38 號樣本反推）
DEVICE_CELL_SIZE = 48       # 裝置字格大小（兩個官方樣本實測都是 48，固定）


def encode(ttf_path: Path, font_size_pt: int, out_path: Path, charset: str = "common") -> None:
    if charset == "common":
        ranges = load_default_ranges()
    elif charset == "big5":
        ranges = big5_ranges()
    elif charset == "all":
        ranges = all_bmp_ranges()
    else:
        raise ValueError(f"unknown charset: {charset}")

    pil_pt = round(font_size_pt * PIL_PT_RATIO)
    pixel_size = DEVICE_CELL_SIZE
    font = ImageFont.truetype(str(ttf_path), pil_pt)
    asc, des = font.getmetrics()

    print(f"[encoder] font={ttf_path.name} xteink_pt={font_size_pt} → PIL pt={pil_pt} pixel_size={pixel_size}")
    print(f"[encoder] charset={charset} ({len(ranges)} ranges, {sum(e-s+1 for s,e in ranges):,} chars)")
    print(f"[encoder] PIL ascent={asc} descent={des}")

    # 渲染 canvas（給足夠空間）
    canvas_w = pil_pt * 2
    canvas_h = asc + des + 20

    metas = []
    bitmaps = []
    bitmap_offset = 0
    glyph_count = 0

    img = Image.new("L", (canvas_w, canvas_h), 255)
    draw = ImageDraw.Draw(img)
    baseline_y = asc

    for s, e in ranges:
        for cp in range(s, e + 1):
            ch = chr(cp)
            draw.rectangle((0, 0, canvas_w, canvas_h), fill=255)

            try:
                bbox = draw.textbbox((0, baseline_y), ch, font=font, anchor="ls")
                draw.text((0, baseline_y), ch, font=font, fill=0, anchor="ls")
                advance = int(round(font.getlength(ch)))
            except Exception:
                metas.append((0, 0, pil_pt // 2, 0, 0, 0, 0))
                glyph_count += 1
                continue

            x0, y0, x1, y1 = bbox
            bw = x1 - x0
            bh = y1 - y0

            if bw <= 0 or bh <= 0:
                metas.append((0, 0, max(advance, 0), 0, 0, 0, 0))
                glyph_count += 1
                continue

            # 裁出 glyph 區
            sub = img.crop((x0, y0, x1, y1))
            px = sub.load()

            # 2-bit packed 灰階：白(0) 淺(1) 中(2) 深(3)
            bmp = bytearray((bw * bh * 2 + 7) // 8)
            for row in range(bh):
                for col in range(bw):
                    g = px[col, row]
                    if g >= 192:
                        v = 0
                    elif g >= 128:
                        v = 1
                    elif g >= 64:
                        v = 2
                    else:
                        v = 3
                    if v:
                        bit_pos = (row * bw + col) * 2
                        bmp[bit_pos // 8] |= v << (6 - (bit_pos % 8))

            xb = max(0, x0)
            yb = baseline_y - y0  # baseline 距 bbox top（正值，往下）

            metas.append((bw, bh, advance, xb, yb, len(bmp), bitmap_offset))
            bitmaps.append(bytes(bmp))
            bitmap_offset += len(bmp)
            glyph_count += 1

        if glyph_count > 0 and glyph_count % 4000 == 0:
            print(f"[encoder] {glyph_count:,} glyphs done", file=sys.stderr)

    # Range table — 官方 range_count field = 實際筆數 + 1，但實體只寫 N 筆 range
    range_table = []
    cum_idx = 0
    for s, e in ranges:
        range_table.append((s, e, cum_idx))
        cum_idx += (e - s + 1)

    range_table_size = len(range_table) * 12
    metadata_size = glyph_count * 13
    metadata_start = 48 + range_table_size
    bitmap_start = metadata_start + metadata_size

    with open(out_path, "wb") as fp:
        # Header（48 byte）
        # 對 4 個官方樣本（粉圓/GuanKiap/順風順水 17 號 + GuanKiap 38 號）反推得：
        #   off 0-3:   magic 'EPDF'（**只有 4 byte，不是 5 byte**）
        #   off 4-7:   range_count（實際筆數，**不要 +1**）
        #   off 8-11:  glyph_count
        #   off 12-15: 不明（17 號常見 35、38 號 79，我寫 0 試試，裝置似乎不檢查）
        fp.write(b"EPDF")                                # off 0-3
        fp.write(struct.pack("<I", len(range_table)))    # off 4-7: range_count（實際筆數）
        fp.write(struct.pack("<I", glyph_count))         # off 8-11
        fp.write(struct.pack("<I", 0))                   # off 12-15: 未知欄位
        fp.write(struct.pack("<I", 0))                   # off 16-19
        fp.write(struct.pack("<I", asc + des))           # off 20-23: line_height
        fp.write(struct.pack("<I", 0))                   # off 24-27
        fp.write(struct.pack("<i", -des))                # off 28-31: 負 descent
        fp.write(struct.pack("<I", 1))                   # off 32-35: version
        fp.write(struct.pack("<I", pixel_size))          # off 36-39: pixel_size 固定 48
        fp.write(struct.pack("<I", metadata_start))      # off 40-43
        fp.write(struct.pack("<I", bitmap_start))        # off 44-47

        for s, e, ci in range_table:
            fp.write(struct.pack("<III", s, e, ci))

        for bw, bh, aw, xb, yb, blen, boff in metas:
            fp.write(struct.pack(
                "<BBBBBHHI",
                max(0, min(bw, 255)),
                max(0, min(bh, 255)),
                max(0, min(aw, 255)),
                max(0, min(xb, 255)),
                0,
                max(0, min(yb, 0xFFFF)),
                max(0, min(blen, 0xFFFF)),
                boff,
            ))

        for bmp in bitmaps:
            fp.write(bmp)

    print(f"\n[encoder] done. wrote {out_path} ({out_path.stat().st_size:,} bytes, {glyph_count:,} glyphs)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("ttf", type=Path)
    parser.add_argument("font_size_pt", type=int, help="XTEink 字級（38 對應官方樣本）")
    parser.add_argument("-o", "--output", type=Path, required=True)
    parser.add_argument("--charset", choices=["common", "big5", "all"], default="common")
    args = parser.parse_args()

    if not args.ttf.exists():
        print(f"[error] TTF not found: {args.ttf}", file=sys.stderr)
        sys.exit(1)

    encode(args.ttf, args.font_size_pt, args.output, args.charset)


if __name__ == "__main__":
    main()
