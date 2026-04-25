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

// ============ .bin encoder ============
const BIN_GLYPH_COUNT = 0xFFFE;

async function runBin({ ttfBuffer, fontSizePt, outerW, outerH, threshold = 240, vertical = false, fontName = 'font' }) {
  const font = opentype.parse(ttfBuffer);
  const widthByte = Math.ceil(outerW / 8);
  const slotSize = widthByte * outerH;
  const out = new Uint8Array(slotSize * BIN_GLYPH_COUNT);

  const scale = fontSizePt / font.unitsPerEm;
  const ascent = Math.round(font.ascender * scale);
  const descent = Math.round(-font.descender * scale);
  const yOff = outerH - (ascent + descent);
  const xOff = 0;

  const canvas = new OffscreenCanvas(outerW, outerH);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.textBaseline = 'alphabetic';

  let lastReport = 0;
  for (let cp = 0x20; cp < BIN_GLYPH_COUNT; cp++) {
    renderBinGlyph(font, cp, fontSizePt, outerW, outerH, xOff, yOff, ctx, out, cp * slotSize, widthByte, threshold);
    if (cp - lastReport >= PROGRESS_STEP) {
      progress(cp, BIN_GLYPH_COUNT);
      lastReport = cp;
    }
  }
  progress(BIN_GLYPH_COUNT, BIN_GLYPH_COUNT);

  const filename = (vertical ? '豎-' : '') + `${fontName}_${fontSizePt}_${outerW}x${outerH}.bin`;
  self.postMessage({ type: 'done', buffer: out.buffer, filename }, [out.buffer]);
}

function renderBinGlyph(font, cp, fontSizePt, w, h, xOff, yOff, ctx, out, slotOffset, widthByte, threshold) {
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, w, h);

  const ch = String.fromCodePoint(cp);
  const glyph = font.charToGlyph(ch);
  if (!glyph || glyph.index === 0) return;

  const scale = fontSizePt / font.unitsPerEm;
  const ascent = Math.round(font.ascender * scale);
  const baselineY = yOff + ascent;

  ctx.fillStyle = 'black';
  const path = glyph.getPath(xOff, baselineY, fontSizePt);
  path.fill = 'black';
  path.draw(ctx);

  const px = ctx.getImageData(0, 0, w, h).data;
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      if (px[(row * w + col) * 4] < threshold) {
        out[slotOffset + row * widthByte + (col >>> 3)] |= 0x80 >>> (col & 7);
      }
    }
  }
}

// ============ .epdfont encoder ============
const EPDFONT_PIL_PT_RATIO = 64 / 38;
const EPDFONT_DEVICE_CELL_SIZE = 48;  // 裝置字格大小（兩個官方樣本實測都是 48，固定）

async function runEpdfont({ ttfBuffer, fontSizePt, charset = 'common', fontName = 'font', defaultRanges }) {
  const font = opentype.parse(ttfBuffer);

  let ranges;
  if (charset === 'common') {
    ranges = defaultRanges;
  } else if (charset === 'big5') {
    ranges = [[0x0020, 0x007E], [0x3000, 0x303F], [0x4E00, 0x9FA0], [0xFF01, 0xFF9F]];
  } else if (charset === 'all') {
    ranges = [[0x0020, 0xFFFD]];
  } else {
    throw new Error(`unknown charset: ${charset}`);
  }

  const renderPt = Math.round(fontSizePt * EPDFONT_PIL_PT_RATIO);
  const pixelSize = EPDFONT_DEVICE_CELL_SIZE;
  const scale = renderPt / font.unitsPerEm;
  const ascent = Math.round(font.ascender * scale);
  const descent = Math.round(-font.descender * scale);

  const canvasW = renderPt * 2;
  const canvasH = ascent + descent + 20;
  const canvas = new OffscreenCanvas(canvasW, canvasH);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.textBaseline = 'alphabetic';
  const baselineY = ascent;

  const totalChars = ranges.reduce((s, [a, b]) => s + (b - a + 1), 0);

  const metas = [];        // {bw, bh, aw, xb, yb, blen, boff}
  const bitmaps = [];      // Uint8Array
  let bitmapOffset = 0;
  let glyphCount = 0;
  let lastReport = 0;

  for (const [s, e] of ranges) {
    for (let cp = s; cp <= e; cp++) {
      const ch = String.fromCodePoint(cp);
      const glyph = font.charToGlyph(ch);

      // 清畫布
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvasW, canvasH);

      const advance = glyph && glyph.index !== 0
        ? Math.round(glyph.advanceWidth * scale)
        : Math.round(renderPt / 2);

      if (!glyph || glyph.index === 0) {
        metas.push({ bw: 0, bh: 0, aw: advance, xb: 0, yb: 0, blen: 0, boff: 0 });
        glyphCount++;
        continue;
      }

      // 畫字
      ctx.fillStyle = 'black';
      const path = glyph.getPath(0, baselineY, renderPt);
      path.fill = 'black';
      path.draw(ctx);

      // 找 bbox（掃 alpha < threshold 的範圍）
      const fullPx = ctx.getImageData(0, 0, canvasW, canvasH).data;
      let x0 = canvasW, y0 = canvasH, x1 = 0, y1 = 0;
      let hasInk = false;
      for (let yy = 0; yy < canvasH; yy++) {
        for (let xx = 0; xx < canvasW; xx++) {
          if (fullPx[(yy * canvasW + xx) * 4] < 192) {
            if (xx < x0) x0 = xx;
            if (yy < y0) y0 = yy;
            if (xx > x1) x1 = xx;
            if (yy > y1) y1 = yy;
            hasInk = true;
          }
        }
      }

      if (!hasInk) {
        metas.push({ bw: 0, bh: 0, aw: advance, xb: 0, yb: 0, blen: 0, boff: 0 });
        glyphCount++;
        continue;
      }

      const bw = x1 - x0 + 1;
      const bh = y1 - y0 + 1;
      const bmp = new Uint8Array(Math.ceil(bw * bh * 2 / 8));

      for (let row = 0; row < bh; row++) {
        for (let col = 0; col < bw; col++) {
          const g = fullPx[((y0 + row) * canvasW + (x0 + col)) * 4];
          let v;
          if (g >= 192) v = 0;
          else if (g >= 128) v = 1;
          else if (g >= 64) v = 2;
          else v = 3;
          if (v) {
            const bitPos = (row * bw + col) * 2;
            bmp[bitPos >>> 3] |= v << (6 - (bitPos & 7));
          }
        }
      }

      const xb = Math.max(0, x0);
      const yb = baselineY - y0;
      metas.push({ bw, bh, aw: advance, xb, yb, blen: bmp.length, boff: bitmapOffset });
      bitmaps.push(bmp);
      bitmapOffset += bmp.length;
      glyphCount++;

      if (glyphCount - lastReport >= PROGRESS_STEP) {
        progress(glyphCount, totalChars);
        lastReport = glyphCount;
      }
    }
  }
  progress(totalChars, totalChars);

  // Build range table
  const rangeTable = [];
  let cumIdx = 0;
  for (const [s, e] of ranges) {
    rangeTable.push([s, e, cumIdx]);
    cumIdx += (e - s + 1);
  }

  const rangeTableSize = rangeTable.length * 12;
  const metadataSize = glyphCount * 13;
  const metadataStart = 48 + rangeTableSize;
  const bitmapStart = metadataStart + metadataSize;
  const bitmapTotal = bitmaps.reduce((s, b) => s + b.length, 0);

  const total = bitmapStart + bitmapTotal;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);

  // Header（48 byte）— 對 4 個官方樣本反推得：
  //   off 0-3:   magic 'EPDF'（只有 4 byte）
  //   off 4-7:   range_count（實際筆數，不要 +1）
  //   off 8-11:  glyph_count
  //   off 12-15: 不明（17 號常見 35、38 號 79，寫 0 試）
  //   off 20-23: line_height = ascent + descent
  //   off 28-31: -descent
  //   off 32-35: version=1
  //   off 36-39: pixel_size 固定 48
  out[0] = 0x45; out[1] = 0x50; out[2] = 0x44; out[3] = 0x46;  // 'EPDF'
  dv.setUint32(4, rangeTable.length, true);   // range_count（實際筆數）
  dv.setUint32(8, glyphCount, true);
  dv.setUint32(12, 0, true);                  // 未知欄位
  dv.setUint32(16, 0, true);
  dv.setUint32(20, ascent + descent, true);   // line_height
  dv.setUint32(24, 0, true);
  dv.setInt32(28, -descent, true);
  dv.setUint32(32, 1, true);
  dv.setUint32(36, pixelSize, true);
  dv.setUint32(40, metadataStart, true);
  dv.setUint32(44, bitmapStart, true);

  // Range table
  let off = 48;
  for (const [s, e, ci] of rangeTable) {
    dv.setUint32(off, s, true);
    dv.setUint32(off + 4, e, true);
    dv.setUint32(off + 8, ci, true);
    off += 12;
  }

  // Metadata
  for (const m of metas) {
    out[off] = Math.min(m.bw, 255);
    out[off + 1] = Math.min(m.bh, 255);
    out[off + 2] = Math.min(m.aw, 255);
    out[off + 3] = Math.min(m.xb, 255);
    out[off + 4] = 0;
    dv.setUint16(off + 5, Math.min(m.yb, 0xFFFF), true);
    dv.setUint16(off + 7, Math.min(m.blen, 0xFFFF), true);
    dv.setUint32(off + 9, m.boff, true);
    off += 13;
  }

  // Bitmaps
  for (const b of bitmaps) {
    out.set(b, off);
    off += b.length;
  }

  const filename = `${fontName}-${fontSizePt}號.epdfont`;
  self.postMessage({ type: 'done', buffer: out.buffer, filename }, [out.buffer]);
}
