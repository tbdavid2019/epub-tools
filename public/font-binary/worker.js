// 閱星曈 XTC .bin encoder — Web Worker
// 對應 Python bin_encoder.py（已驗證視覺一致）
//
// 格式：65534 個 glyph slot（U+0000 ~ U+FFFD）
//   每 slot = widthByte * outerHeight bytes
//   widthByte = ceil(outerWidth / 8)
//   1-bit packed, MSB first, row-major, 無 row padding

importScripts('https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js');

const GLYPH_COUNT = 0xFFFE;
const PROGRESS_STEP = 4096;

self.addEventListener('message', async (e) => {
  const { ttfBuffer, fontSizePt, outerW, outerH, threshold = 240, vertical = false, fontName = 'font' } = e.data;

  try {
    const font = opentype.parse(ttfBuffer);
    const result = encode(font, fontSizePt, outerW, outerH, threshold);
    const filename = buildFilename(fontName, fontSizePt, outerW, outerH, vertical);
    self.postMessage({ type: 'done', buffer: result.buffer, filename }, [result.buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message, stack: err.stack });
  }
});

function buildFilename(name, pt, w, h, vertical) {
  const prefix = vertical ? '豎-' : '';
  return `${prefix}${name}_${pt}_${w}x${h}.bin`;
}

function encode(font, fontSizePt, outerW, outerH, threshold) {
  const widthByte = Math.ceil(outerW / 8);
  const slotSize = widthByte * outerH;
  const totalSize = slotSize * GLYPH_COUNT;
  const out = new Uint8Array(totalSize);

  // opentype.js 的 unitsPerEm → pixel 比例
  // 對齊 PIL：PIL 的 ImageFont(pt) 用 1pt = 1px（已驗證）
  // y_offset 對應 Python：outerH - (ascent + descent)
  const scale = fontSizePt / font.unitsPerEm;
  const ascent = Math.round(font.ascender * scale);
  const descent = Math.round(-font.descender * scale);
  const yOff = outerH - (ascent + descent);
  const xOff = 0;

  // 用 OffscreenCanvas 一次只畫一個字（slot 大小）
  const canvas = new OffscreenCanvas(outerW, outerH);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.textBaseline = 'alphabetic';

  let lastReport = 0;

  for (let cp = 0; cp < GLYPH_COUNT; cp++) {
    const slotOffset = cp * slotSize;

    if (cp < 0x20) {
      // 控制字元 → 全 0 slot（已是 0）
    } else {
      renderGlyph(font, cp, fontSizePt, outerW, outerH, xOff, yOff, ctx, out, slotOffset, widthByte, threshold);
    }

    if (cp - lastReport >= PROGRESS_STEP) {
      self.postMessage({ type: 'progress', current: cp, total: GLYPH_COUNT });
      lastReport = cp;
    }
  }

  self.postMessage({ type: 'progress', current: GLYPH_COUNT, total: GLYPH_COUNT });
  return out;
}

function renderGlyph(font, cp, fontSizePt, w, h, xOff, yOff, ctx, out, slotOffset, widthByte, threshold) {
  // 清畫布
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, w, h);

  // opentype.js Path → 渲染到 canvas
  const ch = String.fromCodePoint(cp);
  const glyph = font.charToGlyph(ch);

  // 沒有字形（.notdef 用 index 0）→ 跳過
  if (!glyph || glyph.index === 0) return;

  // 對齊 PIL ImageDraw.text((xOff, yOff), ...) 行為：
  // PIL 的 (x, y) 是字「頂部 bbox」位置，opentype 的 path 用 baseline
  // 所以 baseline_y = yOff + ascent（PIL 風格）
  const scale = fontSizePt / font.unitsPerEm;
  const ascent = Math.round(font.ascender * scale);
  const baselineY = yOff + ascent;

  ctx.fillStyle = 'black';
  const path = glyph.getPath(xOff, baselineY, fontSizePt);
  path.fill = 'black';
  path.draw(ctx);

  // 讀像素 → 二值化 → 寫入 1-bit packed
  const imgData = ctx.getImageData(0, 0, w, h);
  const px = imgData.data;

  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const i = (row * w + col) * 4;
      // 用灰度（R 即可，反正畫黑色）
      const gray = px[i];
      if (gray < threshold) {
        const byteIdx = row * widthByte + (col >>> 3);
        const bitMask = 0x80 >>> (col & 7);
        out[slotOffset + byteIdx] |= bitMask;
      }
    }
  }
}
