// 閱星曈字體編碼器 — Web Worker
// 支援兩種格式：
//   .bin     — 閱星曈 XTC 墨水屏（無 header、1-bit 黑白、固定 slot）
//   .epdfont — 閱星曈刷機版（48 byte header、2-bit 灰階、變長 bitmap）

importScripts('https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js');

// ============ 共用 ============
const PROGRESS_STEP = 4096;

self.addEventListener('message', async (e) => {
  const msg = e.data;
  try {
    if (msg.format === 'bin') {
      await runBin(msg);
    } else if (msg.format === 'epdfont') {
      await runEpdfont(msg);
    } else {
      throw new Error(`unknown format: ${msg.format}`);
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message, stack: err.stack });
  }
});

function progress(current, total) {
  self.postMessage({ type: 'progress', current, total });
}

// ============ .bin encoder（對齊 XTEink 字体转换工具 v1.3.0.0）============
// 完整逆向自 costura.xteinktools.dll 的 XTEinkFontRenderer.RenderFont
// 規格文件：reference/xteink-spec.md
//
// 檔案 layout：fontbin = byte[slotSize * 65536]，無 header
// slot index = unicode codepoint，bit MSB first
// 字格 W/H 由 GDI MeasureString("坐") 決定，這裡用 Canvas measureText 模擬
// 渲染：黑底白字 + 字置中（平移 CharSpacing/2, LineSpacing/2）
// 取 bit：R channel > LightThrehold（128）視為前景

const BIN_GLYPH_COUNT = 0x10000;
const BIN_BASE_CHAR = '坐';  // XTEink 用「坐」當基準字測量 W/H

async function runBin({ ttfBuffer, fontSizePx, outerW, outerH, charSpacingPx = 0, lineSpacingPx = 0, lightThreshold = 128, antiAlias = true, vertical = false, renderBorder = false, fontName = 'font' }) {
  // 透過 FontFace API 把 TTF 註冊給 OffscreenCanvas 用
  const fontFamily = `xteink_font_${Date.now()}`;
  const fontFace = new FontFace(fontFamily, ttfBuffer);
  await fontFace.load();
  self.fonts.add(fontFace);

  const widthByte = Math.ceil(outerW / 8);
  const slotSize = widthByte * outerH;
  const out = new Uint8Array(slotSize * BIN_GLYPH_COUNT);

  const canvas = new OffscreenCanvas(outerW, outerH);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.font = `${fontSizePx}px "${fontFamily}"`;
  ctx.textBaseline = 'top';
  // antiAlias=false 對應 XTEink 的 System1Bit（無 anti-alias）
  // Canvas 沒法完全關掉，但用 'optimizeSpeed' 可以接近
  if ('textRendering' in ctx) {
    ctx.textRendering = antiAlias ? 'geometricPrecision' : 'optimizeSpeed';
  }

  // 從第 32 個 codepoint 開始（U+0020 之前都是控制字元）
  let lastReport = 0;
  for (let cp = 0x20; cp < BIN_GLYPH_COUNT; cp++) {
    renderBinGlyphXTEink(cp, ctx, out, cp * slotSize, outerW, outerH, widthByte, charSpacingPx, lineSpacingPx, lightThreshold, vertical, renderBorder);
    if (cp - lastReport >= PROGRESS_STEP) {
      progress(cp, BIN_GLYPH_COUNT);
      lastReport = cp;
    }
  }
  progress(BIN_GLYPH_COUNT, BIN_GLYPH_COUNT);

  // 清掉註冊的字體（worker scope，可能其實不需要）
  self.fonts.delete(fontFace);

  const filename = (vertical ? '豎-' : '') + `${fontName}_${outerW}x${outerH}.bin`;
  self.postMessage({ type: 'done', buffer: out.buffer, filename }, [out.buffer]);
}

function renderBinGlyphXTEink(cp, ctx, out, slotOffset, w, h, widthByte, charSpacing, lineSpacing, threshold, vertical, renderBorder) {
  // 1. 黑底
  ctx.resetTransform();
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, w, h);

  // 2. 邊框（選用）
  if (renderBorder) {
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }

  // 3. 直排：先平移到底部、再逆時針 90 度
  if (vertical) {
    ctx.translate(0, h);
    ctx.rotate(-Math.PI / 2);
  }

  // 4. 行距偏移（字往下移 LineSpacing/2 置中）
  if (vertical) {
    ctx.translate(Math.floor(lineSpacing / 2), 0);
  } else {
    ctx.translate(0, Math.floor(lineSpacing / 2));
  }

  // 5. 字距偏移（**只對非 ASCII 字生效**）
  if (charSpacing > 0 && cp > 0xFF) {
    if (vertical) {
      ctx.translate(0, Math.floor(charSpacing / 2));
    } else {
      ctx.translate(Math.floor(charSpacing / 2), 0);
    }
  }

  // 6. 畫字（白色字、黑底）
  const ch = String.fromCodePoint(cp);
  ctx.fillStyle = 'white';
  ctx.fillText(ch, 0, 0);

  // 7. 取 R channel，> threshold 即為前景
  ctx.resetTransform();
  const px = ctx.getImageData(0, 0, w, h).data;
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      if (px[(row * w + col) * 4] > threshold) {
        // MSB first：col=0 是 byte 的最高位
        out[slotOffset + row * widthByte + (col >>> 3)] |= 0x80 >>> (col & 7);
      }
    }
  }
}

// ============ .epdfont encoder ============
// 對齊社群逆向版（reference/crosspoint-font-tool.py）
// 關鍵：social/Streamlit 版用 freetype set_char_size(size*64, size*64, 150, 150)
// 瀏覽器無 freetype，改用 Canvas 渲染 + opentype.js metrics 模擬
// pt → px 換算：freetype 在 150 DPI 下的 pixel size = pt * 150/72
const EPDFONT_DPI_RATIO = 150 / 72;

function clampS8(v) { return Math.max(-128, Math.min(127, v | 0)); }

async function runEpdfont({ ttfBuffer, fontSizePt, charset = 'common', fontName = 'font', defaultRanges, is2Bit = true }) {
  const font = opentype.parse(ttfBuffer);

  let ranges;
  if (charset === 'common') {
    ranges = defaultRanges;
  } else if (charset === 'big5') {
    ranges = [[0x0020, 0x007E], [0x3000, 0x303F], [0x4E00, 0x9FA0], [0xFF01, 0xFF9F]];
  } else if (charset === 'all-bmp') {
    ranges = [[0x0020, 0xFFFD]];
  } else if (charset === 'all') {
    // 對齊社群版「所有字體」模式：CJK 全範圍 + 拉丁 + 假名 + 韓文等
    ranges = [
      [0x0020, 0x007F], [0x0080, 0x00FF], [0x0100, 0x017F],
      [0x0300, 0x036F], [0x0370, 0x03FF], [0x0400, 0x04FF],
      [0x1100, 0x11FF],
      [0x2010, 0x206F], [0x2070, 0x209F], [0x20A0, 0x20CF],
      [0x2190, 0x21FF], [0x2200, 0x22FF],
      [0x2E80, 0x2EFF], [0x2F00, 0x2FDF],
      [0x3000, 0x303F], [0x3040, 0x309F], [0x30A0, 0x30FF],
      [0x3130, 0x318F], [0x31F0, 0x31FF], [0x3400, 0x4DBF],
      [0x4E00, 0x9FFF],
      [0xA960, 0xA97F], [0xAC00, 0xD7AF], [0xD7B0, 0xD7FF],
      [0xF900, 0xFAFF], [0xFE10, 0xFE1F], [0xFE30, 0xFE4F],
      [0xFF00, 0xFFEF], [0xFFFD, 0xFFFD],
    ];
  } else {
    throw new Error(`unknown charset: ${charset}`);
  }

  // freetype 在 150 DPI 下的 pixel size = pt * 150/72
  const pixelSize = Math.round(fontSizePt * EPDFONT_DPI_RATIO);
  const scale = pixelSize / font.unitsPerEm;
  const ascent = Math.round(font.ascender * scale);
  const descent = Math.round(-font.descender * scale);  // 正值
  const lineHeight = ascent + descent;

  const canvasW = pixelSize * 2;
  const canvasH = lineHeight + 20;
  const canvas = new OffscreenCanvas(canvasW, canvasH);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.textBaseline = 'alphabetic';
  const baselineY = ascent;

  // ---- Pass 1: 掃所有 ranges，找出有字形的 code point + 渲染 bitmap ----
  const totalChars = ranges.reduce((s, [a, b]) => s + (b - a + 1), 0);
  const glyphsByCode = new Map();  // cp -> { width, height, advance_x, left, top, data }
  let processed = 0;
  let lastReport = 0;

  for (const [s, e] of ranges) {
    for (let cp = s; cp <= e; cp++) {
      processed++;
      if (processed - lastReport >= PROGRESS_STEP) {
        progress(processed, totalChars);
        lastReport = processed;
      }

      const ch = String.fromCodePoint(cp);
      const glyph = font.charToGlyph(ch);
      if (!glyph || glyph.index === 0) continue;  // 字體沒這個字 → 跳過（社群版邏輯）

      // 清畫布
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.fillStyle = 'black';

      const path = glyph.getPath(0, baselineY, pixelSize);
      path.fill = 'black';
      path.draw(ctx);

      // 找 bbox（掃任何非白像素）
      const fullPx = ctx.getImageData(0, 0, canvasW, canvasH).data;
      let x0 = canvasW, y0 = canvasH, x1 = -1, y1 = -1;
      for (let yy = 0; yy < canvasH; yy++) {
        for (let xx = 0; xx < canvasW; xx++) {
          if (fullPx[(yy * canvasW + xx) * 4] < 250) {
            if (xx < x0) x0 = xx;
            if (yy < y0) y0 = yy;
            if (xx > x1) x1 = xx;
            if (yy > y1) y1 = yy;
          }
        }
      }

      const advance = Math.round(glyph.advanceWidth * scale);

      if (x1 < 0) {
        // 空白字（如 U+0020 空格）— 仍記入，但 bitmap 0 byte
        glyphsByCode.set(cp, { width: 0, height: 0, advance_x: advance, left: 0, top: 0, data: new Uint8Array(0) });
        continue;
      }

      const bw = x1 - x0 + 1;
      const bh = y1 - y0 + 1;

      // ---- Bitmap 編碼（對齊社群版 freetype 4-bit → 2-bit/1-bit）----
      // Canvas 8-bit grayscale → 4-bit anti-aliased（v4 = (255-g) >> 4），再依模式量化：
      //   2-bit: 12/8/4 階梯 → 0..3，每 4 px 打包 1 byte
      //   1-bit: v4 >= 2 視為有色 → 0/1，每 8 px 打包 1 byte
      const data = [];
      const bitsPerPx = is2Bit ? 2 : 1;
      const pxPerByte = 8 / bitsPerPx;
      const quantize = is2Bit
        ? (v4) => v4 >= 12 ? 3 : v4 >= 8 ? 2 : v4 >= 4 ? 1 : 0
        : (v4) => v4 >= 2 ? 1 : 0;
      let acc = 0;
      const totalPixels = bw * bh;
      for (let row = 0; row < bh; row++) {
        for (let col = 0; col < bw; col++) {
          const g = fullPx[((y0 + row) * canvasW + (x0 + col)) * 4];
          const v4 = (255 - g) >> 4;
          acc = (acc << bitsPerPx) | quantize(v4);
          if (((row * bw + col) % pxPerByte) === pxPerByte - 1) {
            data.push(acc & 0xFF);
            acc = 0;
          }
        }
      }
      const remainder = totalPixels % pxPerByte;
      if (remainder !== 0) {
        acc <<= (pxPerByte - remainder) * bitsPerPx;
        data.push(acc & 0xFF);
      }

      // freetype 的 bitmap_left = bbox 起點 x 偏移；bitmap_top = baseline 到 bbox 頂端的距離
      const bitmap_left = x0;          // signed int8（社群版這欄是 signed）
      const bitmap_top = baselineY - y0;  // signed int8

      glyphsByCode.set(cp, {
        width: bw,
        height: bh,
        advance_x: advance,
        left: bitmap_left,
        top: bitmap_top,
        data: new Uint8Array(data),
      });
    }
  }
  progress(totalChars, totalChars);

  // ---- 合併連續 code point 成 intervals（對齊社群版邏輯）----
  const sortedCodes = Array.from(glyphsByCode.keys()).sort((a, b) => a - b);
  if (sortedCodes.length === 0) {
    throw new Error('字體沒有任何可用字形（檢查字符範圍）');
  }
  const outIntervals = [];
  let segStart = sortedCodes[0];
  let segEnd = segStart;
  for (let i = 1; i < sortedCodes.length; i++) {
    const c = sortedCodes[i];
    if (c === segEnd + 1) {
      segEnd = c;
    } else {
      outIntervals.push([segStart, segEnd]);
      segStart = segEnd = c;
    }
  }
  outIntervals.push([segStart, segEnd]);

  // ---- 重建 glyph 表：interval 內所有 cp（含中間缺字位）都要佔 slot ----
  const finalGlyphs = [];   // { width, height, advance_x, left, top, data_length, data_offset }
  const dataChunks = [];
  let dataOffset = 0;

  for (const [s, e] of outIntervals) {
    for (let cp = s; cp <= e; cp++) {
      const g = glyphsByCode.get(cp);
      if (g) {
        finalGlyphs.push({
          width: g.width, height: g.height, advance_x: g.advance_x,
          left: g.left, top: g.top,
          data_length: g.data.length, data_offset: dataOffset,
        });
        if (g.data.length > 0) dataChunks.push(g.data);
        dataOffset += g.data.length;
      } else {
        // interval 內缺字 → 0 byte 佔位（社群版邏輯）
        finalGlyphs.push({ width: 0, height: 0, advance_x: 0, left: 0, top: 0, data_length: 0, data_offset: 0 });
      }
    }
  }

  // ---- 計算 offset ----
  const headerSize = 48;
  const intervalsSize = outIntervals.length * 12;
  const glyphsSize = finalGlyphs.length * 13;
  let totalDataSize = 0;
  for (const c of dataChunks) totalDataSize += c.length;

  const oi = headerSize;
  const og = oi + intervalsSize;
  const od = og + glyphsSize;
  const totalSize = od + totalDataSize;

  const out = new Uint8Array(totalSize);
  const dv = new DataView(out.buffer);

  // ---- Header 48 byte（完全對齊社群版順序）----
  // off 0-3:   'EPDF'
  // off 4-7:   range_count
  // off 8-11:  od + d_len（檔案總長）
  // off 12-15: line_height
  // off 16-19: glyph_count
  // off 20-23: ascender (signed)
  // off 24-27: 0
  // off 28-31: descender (signed, 正值或負值依字體)
  // off 32-35: is2Bit flag
  // off 36-39: oi (intervals offset)
  // off 40-43: og (glyphs offset)
  // off 44-47: od (data offset)
  out[0] = 0x45; out[1] = 0x50; out[2] = 0x44; out[3] = 0x46;
  dv.setUint32(4, outIntervals.length, true);
  dv.setUint32(8, totalSize, true);
  dv.setUint32(12, lineHeight, true);
  dv.setUint32(16, finalGlyphs.length, true);
  dv.setInt32(20, ascent, true);
  dv.setInt32(24, 0, true);
  dv.setInt32(28, -descent, true);  // freetype size.descender 是負值
  dv.setUint32(32, is2Bit ? 1 : 0, true);
  dv.setUint32(36, oi, true);
  dv.setUint32(40, og, true);
  dv.setUint32(44, od, true);

  // ---- Intervals table（每段 12 byte：start, end, glyph_idx）----
  let off = oi;
  let cumIdx = 0;
  for (const [s, e] of outIntervals) {
    dv.setUint32(off, s, true);
    dv.setUint32(off + 4, e, true);
    dv.setUint32(off + 8, cumIdx, true);
    cumIdx += (e - s + 1);
    off += 12;
  }

  // ---- Glyphs metadata（每個 13 byte：'<BBB b B b B H I'）----
  for (const g of finalGlyphs) {
    out[off]     = Math.min(g.width, 255);
    out[off + 1] = Math.min(g.height, 255);
    out[off + 2] = Math.min(g.advance_x, 255);
    dv.setInt8(off + 3, clampS8(g.left));
    out[off + 4] = 0;
    dv.setInt8(off + 5, clampS8(g.top));
    out[off + 6] = 0;
    dv.setUint16(off + 7, Math.min(g.data_length, 0xFFFF), true);
    dv.setUint32(off + 9, g.data_offset, true);
    off += 13;
  }

  // ---- Bitmap data ----
  for (const c of dataChunks) {
    out.set(c, off);
    off += c.length;
  }

  const filename = `${fontName}${fontSizePt}.epdfont`;
  self.postMessage({ type: 'done', buffer: out.buffer, filename }, [out.buffer]);
}
