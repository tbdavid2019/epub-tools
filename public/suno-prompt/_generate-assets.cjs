// 用 node-canvas 生 favicon / apple-touch-icon / og-image
// 跑：node public/suno-prompt/_generate-assets.cjs
const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

const OUT_DIR = __dirname;

// 配色
const C = {
  paper: '#F5F1EA',
  paperDeep: '#EDE6D9',
  ink: '#1A1614',
  inkSoft: '#3D3530',
  rec: '#E94F37',
  gold: '#D4A656',
  mute: '#A89580',
};

// ============== 通用 · 畫黑膠唱片 ==============
function drawVinyl(ctx, cx, cy, radius, opts = {}) {
  const { showLabel = true, labelText = '蘇', topArc = '', bottomArc = '', highlightOpacity = 0.18 } = opts;

  // 黑膠盤
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();

  // 黑膠細紋
  ctx.strokeStyle = '#2A2422';
  ctx.lineWidth = Math.max(0.5, radius / 90);
  for (let r = radius * 0.93; r > radius * 0.45; r -= radius * 0.06) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (showLabel) {
    const labelR = radius * 0.42;
    ctx.fillStyle = C.rec;
    ctx.beginPath();
    ctx.arc(cx, cy, labelR, 0, Math.PI * 2);
    ctx.fill();

    if (topArc) {
      drawTextOnArc(ctx, topArc, cx, cy, labelR * 0.85, -Math.PI, 0, {
        fontSize: Math.max(8, labelR * 0.18),
        italic: true,
        color: C.paper,
      });
    }
    if (bottomArc) {
      drawTextOnArc(ctx, bottomArc, cx, cy, labelR * 0.85, 0, Math.PI, {
        fontSize: Math.max(7, labelR * 0.15),
        italic: true,
        color: C.paper,
        opacity: 0.9,
        flip: true,
      });
    }

    // 中央「蘇」
    ctx.fillStyle = C.paper;
    ctx.font = `900 ${Math.round(labelR * 0.7)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, cx, cy + labelR * 0.04);

    // 軸孔
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2, radius * 0.04), 0, Math.PI * 2);
    ctx.fill();
  }

  // 黃金外圈
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = Math.max(1, radius * 0.018);
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(cx, cy, radius - ctx.lineWidth / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 反光
  if (highlightOpacity > 0) {
    const grad = ctx.createRadialGradient(
      cx - radius * 0.4, cy - radius * 0.4, 0,
      cx - radius * 0.4, cy - radius * 0.4, radius * 0.5
    );
    grad.addColorStop(0, `rgba(245, 241, 234, ${highlightOpacity})`);
    grad.addColorStop(1, 'rgba(245, 241, 234, 0)');
    ctx.fillStyle = grad;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
  }
}

function drawTextOnArc(ctx, text, cx, cy, radius, startAngle, endAngle, opts) {
  const { fontSize, italic, color, opacity = 1, flip = false } = opts;
  ctx.save();
  ctx.font = `${italic ? 'italic ' : ''}${fontSize}px serif`;
  ctx.fillStyle = color;
  ctx.globalAlpha = opacity;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const angleSpan = endAngle - startAngle;
  const charSpacing = angleSpan / Math.max(text.length, 1);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const angle = startAngle + (i + 0.5) * charSpacing;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + (flip ? -Math.PI / 2 : Math.PI / 2));
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ============== Favicon 64×64 ==============
function makeFavicon() {
  const c = createCanvas(64, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = C.paper;
  ctx.beginPath();
  ctx.arc(32, 32, 32, 0, Math.PI * 2);
  ctx.fill();
  drawVinyl(ctx, 32, 32, 28, { showLabel: false });
  ctx.fillStyle = C.rec;
  ctx.beginPath();
  ctx.arc(32, 32, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(32, 32, 1.6, 0, Math.PI * 2);
  ctx.fill();
  return c.toBuffer('image/png');
}

// ============== Apple Touch Icon 180×180 ==============
function makeAppleIcon() {
  const c = createCanvas(180, 180);
  const ctx = c.getContext('2d');
  ctx.fillStyle = C.paper;
  roundRect(ctx, 0, 0, 180, 180, 36);
  ctx.fill();
  drawVinyl(ctx, 90, 90, 76, {
    showLabel: true,
    labelText: '蘇',
    topArc: 'SUNO · HELLORURU',
    bottomArc: "LET'S MAKE A RECORD",
  });
  return c.toBuffer('image/png');
}

// ============== OG Image 1200×630 ==============
function makeOgImage() {
  const c = createCanvas(1200, 630);
  const ctx = c.getContext('2d');

  // 米白底
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, 1200, 630);

  // 紙紋
  ctx.fillStyle = 'rgba(168, 149, 128, 0.04)';
  for (let i = 0; i < 800; i++) {
    ctx.fillRect(Math.random() * 1200, Math.random() * 630, 1, 1);
  }

  // 黑膠（左側出血）
  drawVinyl(ctx, 280, 315, 360, {
    showLabel: true,
    labelText: '蘇',
    topArc: 'SUNO V5.5 · HELLORURU TOOLS',
    bottomArc: 'NO.01 / 7-QUESTION METHOD',
  });

  // 右側標題
  const rightX = 720;

  // Eyebrow
  ctx.fillStyle = C.gold;
  ctx.font = 'italic 24px serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('HELLORURU × SUNO', rightX, 130);

  // 主標（縮小一級避免右側裁切）
  ctx.fillStyle = C.ink;
  ctx.font = '900 72px serif';
  ctx.fillText('來，姊姊問你', rightX, 180);
  ctx.fillText('幾題', rightX, 265);

  // 副標
  ctx.fillStyle = C.rec;
  ctx.font = 'italic 900 38px serif';
  ctx.fillText("Let's Make a Record", rightX, 360);

  // 副副標
  ctx.fillStyle = C.inkSoft;
  ctx.font = '500 22px sans-serif';
  ctx.fillText('3 分鐘配出一首 Suno 不會跑掉的歌', rightX, 425);

  // 黃金細線
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rightX, 475);
  ctx.lineTo(rightX + 220, 475);
  ctx.stroke();

  // URL
  ctx.fillStyle = C.mute;
  ctx.font = 'italic 20px serif';
  ctx.fillText('tools.helloruru.com/suno-prompt', rightX, 495);

  return c.toBuffer('image/png');
}

// ============== 寫檔 ==============
fs.writeFileSync(path.join(OUT_DIR, 'favicon.png'), makeFavicon());
console.log('✓ favicon.png (64×64)');

fs.writeFileSync(path.join(OUT_DIR, 'apple-touch-icon.png'), makeAppleIcon());
console.log('✓ apple-touch-icon.png (180×180)');

fs.writeFileSync(path.join(OUT_DIR, 'og-image.png'), makeOgImage());
console.log('✓ og-image.png (1200×630)');

console.log('\nAll assets generated to:', OUT_DIR);
