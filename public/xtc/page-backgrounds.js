// ============================================
// page-backgrounds.js — 書頁背景 / 邊框裝飾模組
// 閱星瞳轉檔工具 | HelloRuru Tools
//
// 在 CREngine 渲染文字「之後」疊加裝飾背景，
// 使用 alpha blending 只影響淺色（白/淺灰）區域，
// 保留深色文字像素不受干擾。
//
// 所有圖樣僅使用黑/白/灰，適合 1-bit/2-bit e-ink
// ============================================

(function () {
  'use strict';

  // ==================== 背景定義 ====================

  var PAGE_BACKGROUNDS = {
    'none':           { name: '無背景',     id: 'none' },
    'grid':           { name: '格子',       id: 'grid' },
    'dots':           { name: '點點',       id: 'dots' },
    'lines':          { name: '橫線',       id: 'lines' },
    'border-simple':  { name: '簡約邊框',   id: 'border-simple' },
    'border-cat':     { name: '貓咪邊框',   id: 'border-cat' },
    'border-floral':  { name: '花邊',       id: 'border-floral' },
    'custom':         { name: '自訂背景圖', id: 'custom' }
  };

  // ==================== 像素圖案 ====================

  // 貓咪肉球（6x6，1=填色 0=透明）
  var CAT_PAW = [
    [0,1,0,0,1,0],
    [1,1,1,1,1,1],
    [1,1,1,1,1,1],
    [0,1,1,1,1,0],
    [0,1,0,0,1,0],
    [0,0,0,0,0,0]
  ];

  // 小花（7x7）
  var FLOWER = [
    [0,0,1,0,1,0,0],
    [0,1,1,1,1,1,0],
    [1,1,1,1,1,1,1],
    [0,1,1,1,1,1,0],
    [1,1,1,1,1,1,1],
    [0,1,1,1,1,1,0],
    [0,0,1,0,1,0,0]
  ];

  // 小葉子（5x7）
  var LEAF = [
    [0,0,1,0,0],
    [0,1,1,1,0],
    [1,1,1,1,0],
    [0,1,1,1,1],
    [0,1,1,1,0],
    [0,0,1,0,0],
    [0,0,1,0,0]
  ];

  // ==================== 尺寸對照表 ====================

  var GRID_SIZES  = { small: 8, medium: 16, large: 24 };
  var DOT_SPACING = { small: 8, medium: 16, large: 24 };
  var LINE_SPACING_DEFAULT = 28; // 與一般文字行高接近

  // ==================== 核心：像素混合 ====================

  /**
   * 將裝飾灰度值混入 ImageData 的指定像素。
   * 只影響「淺色」區域（灰度 > threshold），
   * 深色文字像素保持不變。
   *
   * @param {ImageData} imageData - 已渲染文字的頁面像素
   * @param {number} x
   * @param {number} y
   * @param {number} gray  - 裝飾灰度 0-255（越小越深）
   * @param {number} opacity - 0~1
   */
  function blendPixel(imageData, x, y, gray, opacity) {
    var w = imageData.width;
    var h = imageData.height;
    if (x < 0 || x >= w || y < 0 || y >= h) return;

    var idx = (y * w + x) * 4;
    var d = imageData.data;
    var existing = d[idx]; // 灰階頁面 R=G=B

    // 保護深色像素：若現有像素較深（文字），不覆蓋
    if (existing < 160) return;

    // 線性混合：result = existing * (1-opacity) + gray * opacity
    var blended = Math.round(existing * (1 - opacity) + gray * opacity);
    d[idx]     = blended;
    d[idx + 1] = blended;
    d[idx + 2] = blended;
    // alpha 不動（保持 255）
  }

  // ==================== 繪圖工具 ====================

  /**
   * 畫一條水平線（帶混合）
   */
  function blendHLine(imageData, x1, x2, y, gray, opacity) {
    for (var x = x1; x <= x2; x++) {
      blendPixel(imageData, x, y, gray, opacity);
    }
  }

  /**
   * 畫一條垂直線（帶混合）
   */
  function blendVLine(imageData, x, y1, y2, gray, opacity) {
    for (var y = y1; y <= y2; y++) {
      blendPixel(imageData, x, y, gray, opacity);
    }
  }

  /**
   * 畫矩形外框（帶混合）
   */
  function blendRect(imageData, x, y, w, h, gray, opacity) {
    blendHLine(imageData, x, x + w - 1, y, gray, opacity);
    blendHLine(imageData, x, x + w - 1, y + h - 1, gray, opacity);
    blendVLine(imageData, x, y, y + h - 1, gray, opacity);
    blendVLine(imageData, x + w - 1, y, y + h - 1, gray, opacity);
  }

  /**
   * 畫圓角矩形外框（帶混合）
   * radius: 圓角半徑（像素）
   */
  function blendRoundedRect(imageData, x, y, w, h, radius, gray, opacity) {
    var r = Math.min(radius, Math.floor(w / 2), Math.floor(h / 2));

    // 四條直線（扣除圓角）
    blendHLine(imageData, x + r, x + w - 1 - r, y, gray, opacity);         // 上
    blendHLine(imageData, x + r, x + w - 1 - r, y + h - 1, gray, opacity); // 下
    blendVLine(imageData, x, y + r, y + h - 1 - r, gray, opacity);         // 左
    blendVLine(imageData, x + w - 1, y + r, y + h - 1 - r, gray, opacity); // 右

    // 四個圓角（Bresenham 四分之一圓弧）
    var cx, cy;
    var px = r, py = 0, d = 1 - r;
    while (px >= py) {
      // 右上
      cx = x + w - 1 - r; cy = y + r;
      blendPixel(imageData, cx + px, cy - py, gray, opacity);
      blendPixel(imageData, cx + py, cy - px, gray, opacity);
      // 左上
      cx = x + r; cy = y + r;
      blendPixel(imageData, cx - px, cy - py, gray, opacity);
      blendPixel(imageData, cx - py, cy - px, gray, opacity);
      // 右下
      cx = x + w - 1 - r; cy = y + h - 1 - r;
      blendPixel(imageData, cx + px, cy + py, gray, opacity);
      blendPixel(imageData, cx + py, cy + px, gray, opacity);
      // 左下
      cx = x + r; cy = y + h - 1 - r;
      blendPixel(imageData, cx - px, cy + py, gray, opacity);
      blendPixel(imageData, cx - py, cy + px, gray, opacity);

      py++;
      if (d < 0) {
        d += 2 * py + 1;
      } else {
        px--;
        d += 2 * (py - px) + 1;
      }
    }
  }

  /**
   * 畫點陣圖案（帶混合、放大）
   */
  function drawBitmap(imageData, bitmap, startX, startY, scale, gray, opacity) {
    scale = scale || 1;
    gray = (gray !== undefined) ? gray : 180;
    opacity = (opacity !== undefined) ? opacity : 1;
    for (var row = 0; row < bitmap.length; row++) {
      for (var col = 0; col < bitmap[row].length; col++) {
        if (bitmap[row][col] === 1) {
          for (var sy = 0; sy < scale; sy++) {
            for (var sx = 0; sx < scale; sx++) {
              blendPixel(
                imageData,
                startX + col * scale + sx,
                startY + row * scale + sy,
                gray, opacity
              );
            }
          }
        }
      }
    }
  }

  /**
   * 畫水平鏡像的點陣圖案
   */
  function drawBitmapFlipH(imageData, bitmap, startX, startY, scale, gray, opacity) {
    scale = scale || 1;
    gray = (gray !== undefined) ? gray : 180;
    opacity = (opacity !== undefined) ? opacity : 1;
    for (var row = 0; row < bitmap.length; row++) {
      var cols = bitmap[row].length;
      for (var col = 0; col < cols; col++) {
        if (bitmap[row][cols - 1 - col] === 1) {
          for (var sy = 0; sy < scale; sy++) {
            for (var sx = 0; sx < scale; sx++) {
              blendPixel(
                imageData,
                startX + col * scale + sx,
                startY + row * scale + sy,
                gray, opacity
              );
            }
          }
        }
      }
    }
  }

  // ==================== 各背景繪製函式 ====================

  /**
   * 格子 — 淺灰格線，如方格筆記本
   */
  function drawGrid(imageData, options) {
    var w = imageData.width;
    var h = imageData.height;
    var sizeKey = (options && options.gridSize) || 'medium';
    var step = GRID_SIZES[sizeKey] || GRID_SIZES.medium;
    var opacity = (options && options.opacity !== undefined) ? options.opacity / 100 : 0.25;
    var gray = 140; // e-ink 上需要足夠深的灰才看得到

    // 垂直線
    for (var x = step; x < w; x += step) {
      blendVLine(imageData, x, 0, h - 1, gray, opacity);
    }
    // 水平線
    for (var y = step; y < h; y += step) {
      blendHLine(imageData, 0, w - 1, y, gray, opacity);
    }
  }

  /**
   * 點點 — 規則圓點，如點陣筆記本
   */
  function drawDots(imageData, options) {
    var w = imageData.width;
    var h = imageData.height;
    var spacingKey = (options && options.dotSpacing) || 'medium';
    var step = DOT_SPACING[spacingKey] || DOT_SPACING.medium;
    var opacity = (options && options.opacity !== undefined) ? options.opacity / 100 : 0.35;
    var gray = 130;

    for (var y = step; y < h; y += step) {
      for (var x = step; x < w; x += step) {
        // 畫一個 2x2 的小點（比 1px 更清楚）
        blendPixel(imageData, x,     y,     gray, opacity);
        blendPixel(imageData, x + 1, y,     gray, opacity);
        blendPixel(imageData, x,     y + 1, gray, opacity);
        blendPixel(imageData, x + 1, y + 1, gray, opacity);
      }
    }
  }

  /**
   * 橫線 — 水平線，如筆記本橫線
   */
  function drawLines(imageData, options) {
    var w = imageData.width;
    var h = imageData.height;
    var spacing = (options && options.lineSpacing) || LINE_SPACING_DEFAULT;
    var opacity = (options && options.opacity !== undefined) ? options.opacity / 100 : 0.2;
    var gray = 140;
    var margin = (options && options.margin) || 20; // 左右留白

    for (var y = spacing; y < h; y += spacing) {
      blendHLine(imageData, margin, w - 1 - margin, y, gray, opacity);
    }
  }

  /**
   * 簡約邊框 — 細線圓角外框 + 角落裝飾
   */
  function drawSimpleBorder(imageData, options) {
    var w = imageData.width;
    var h = imageData.height;
    var opacity = (options && options.opacity !== undefined) ? options.opacity / 100 : 0.5;
    var gray = 120;
    var margin = 12;
    var cornerLen = 20; // 角落裝飾線長度

    // 主外框（圓角）
    blendRoundedRect(imageData, margin, margin, w - margin * 2, h - margin * 2, 6, gray, opacity);

    // 四角加粗裝飾（雙線）
    var innerM = margin + 4;
    var darkerGray = 80;

    // 左上角
    blendHLine(imageData, innerM, innerM + cornerLen, innerM, darkerGray, opacity);
    blendVLine(imageData, innerM, innerM, innerM + cornerLen, darkerGray, opacity);
    // 右上角
    blendHLine(imageData, w - 1 - innerM - cornerLen, w - 1 - innerM, innerM, darkerGray, opacity);
    blendVLine(imageData, w - 1 - innerM, innerM, innerM + cornerLen, darkerGray, opacity);
    // 左下角
    blendHLine(imageData, innerM, innerM + cornerLen, h - 1 - innerM, darkerGray, opacity);
    blendVLine(imageData, innerM, h - 1 - innerM - cornerLen, h - 1 - innerM, darkerGray, opacity);
    // 右下角
    blendHLine(imageData, w - 1 - innerM - cornerLen, w - 1 - innerM, h - 1 - innerM, darkerGray, opacity);
    blendVLine(imageData, w - 1 - innerM, h - 1 - innerM - cornerLen, h - 1 - innerM, darkerGray, opacity);
  }

  /**
   * 貓咪邊框 — 四角肉球 + 細線連接
   */
  function drawCatBorder(imageData, options) {
    var w = imageData.width;
    var h = imageData.height;
    var opacity = (options && options.opacity !== undefined) ? options.opacity / 100 : 0.55;
    var gray = 110;
    var pawGray = 80; // 肉球要夠深才看得到
    var margin = 10;
    var pawScale = 3; // 6x6 放大 3 倍 = 18x18 像素
    var pawW = 6 * pawScale;
    var pawH = 6 * pawScale;

    // 細線邊框（從肉球邊緣開始）
    var lineInset = margin + pawW / 2;

    // 上邊線（兩隻肉球之間）
    blendHLine(imageData, lineInset, w - 1 - lineInset, margin + pawH / 2, gray, opacity * 0.7);
    // 下邊線
    blendHLine(imageData, lineInset, w - 1 - lineInset, h - 1 - margin - pawH / 2, gray, opacity * 0.7);
    // 左邊線
    blendVLine(imageData, margin + pawW / 2, lineInset, h - 1 - lineInset, gray, opacity * 0.7);
    // 右邊線
    blendVLine(imageData, w - 1 - margin - pawW / 2, lineInset, h - 1 - lineInset, gray, opacity * 0.7);

    // 四角肉球
    // 左上
    drawBitmap(imageData, CAT_PAW, margin, margin, pawScale, pawGray, opacity);
    // 右上
    drawBitmapFlipH(imageData, CAT_PAW, w - margin - pawW, margin, pawScale, pawGray, opacity);
    // 左下
    drawBitmap(imageData, CAT_PAW, margin, h - margin - pawH, pawScale, pawGray, opacity);
    // 右下
    drawBitmapFlipH(imageData, CAT_PAW, w - margin - pawW, h - margin - pawH, pawScale, pawGray, opacity);

    // 上下邊中央再各放一顆小肉球（scale=2）
    var smallScale = 2;
    var smallW = 6 * smallScale;
    var smallH = 6 * smallScale;
    var centerX = Math.floor((w - smallW) / 2);
    drawBitmap(imageData, CAT_PAW, centerX, margin, smallScale, pawGray, opacity * 0.8);
    drawBitmap(imageData, CAT_PAW, centerX, h - margin - smallH, smallScale, pawGray, opacity * 0.8);
  }

  /**
   * 花邊 — 四角花 + 邊緣葉片 + 細線
   */
  function drawFloralBorder(imageData, options) {
    var w = imageData.width;
    var h = imageData.height;
    var opacity = (options && options.opacity !== undefined) ? options.opacity / 100 : 0.5;
    var gray = 110;
    var floralGray = 80;
    var margin = 10;
    var flowerScale = 2; // 7x7 放大 2 倍 = 14x14
    var leafScale = 2;   // 5x7 放大 2 倍 = 10x14
    var flowerW = 7 * flowerScale;
    var flowerH = 7 * flowerScale;
    var leafW = 5 * leafScale;
    var leafH = 7 * leafScale;

    // 細線外框
    blendRoundedRect(imageData, margin + 6, margin + 6,
      w - (margin + 6) * 2, h - (margin + 6) * 2, 4, gray, opacity * 0.6);

    // 四角花朵
    drawBitmap(imageData, FLOWER, margin, margin, flowerScale, floralGray, opacity);
    drawBitmapFlipH(imageData, FLOWER, w - margin - flowerW, margin, flowerScale, floralGray, opacity);
    drawBitmap(imageData, FLOWER, margin, h - margin - flowerH, flowerScale, floralGray, opacity);
    drawBitmapFlipH(imageData, FLOWER, w - margin - flowerW, h - margin - flowerH, flowerScale, floralGray, opacity);

    // 上下邊緣中央放花
    var centerX = Math.floor((w - flowerW) / 2);
    drawBitmap(imageData, FLOWER, centerX, margin, flowerScale, floralGray, opacity * 0.85);
    drawBitmap(imageData, FLOWER, centerX, h - margin - flowerH, flowerScale, floralGray, opacity * 0.85);

    // 左右邊緣中央放花
    var centerY = Math.floor((h - flowerH) / 2);
    drawBitmap(imageData, FLOWER, margin, centerY, flowerScale, floralGray, opacity * 0.85);
    drawBitmapFlipH(imageData, FLOWER, w - margin - flowerW, centerY, flowerScale, floralGray, opacity * 0.85);

    // 上邊散佈葉片（花與花之間）
    var topLeafY = margin + 1;
    var segmentW = Math.floor((centerX - margin - flowerW) / 2);
    if (segmentW > leafW + 4) {
      // 左半段中央
      var lx1 = margin + flowerW + Math.floor((segmentW - leafW) / 2);
      drawBitmap(imageData, LEAF, lx1, topLeafY, leafScale, floralGray, opacity * 0.7);
      // 右半段中央
      var lx2 = centerX + flowerW + Math.floor((segmentW - leafW) / 2);
      drawBitmapFlipH(imageData, LEAF, lx2, topLeafY, leafScale, floralGray, opacity * 0.7);
    }

    // 下邊散佈葉片
    var bottomLeafY = h - margin - leafH - 1;
    if (segmentW > leafW + 4) {
      drawBitmap(imageData, LEAF, lx1, bottomLeafY, leafScale, floralGray, opacity * 0.7);
      drawBitmapFlipH(imageData, LEAF, lx2, bottomLeafY, leafScale, floralGray, opacity * 0.7);
    }
  }

  /**
   * 自訂背景圖 — 使用者上傳圖片
   * options.customImage: 已載入的 HTMLImageElement
   * options.fitMode: 'stretch' | 'tile' | 'center'
   * options.brightness: -100 ~ 100（預設 0）
   * options.contrast: -100 ~ 100（預設 0）
   */
  function drawCustomBackground(imageData, options) {
    if (!options || !options.customImage) return;

    var w = imageData.width;
    var h = imageData.height;
    var opacity = (options.opacity !== undefined) ? options.opacity / 100 : 0.3;
    var fitMode = options.fitMode || 'stretch';
    var brightness = (options.brightness || 0) / 100; // -1 ~ 1
    var contrast = (options.contrast || 0) / 100;     // -1 ~ 1
    var img = options.customImage;

    // 用 offscreen Canvas 取得圖片像素
    var offCanvas = document.createElement('canvas');
    offCanvas.width = w;
    offCanvas.height = h;
    var offCtx = offCanvas.getContext('2d');

    // 白底
    offCtx.fillStyle = '#FFFFFF';
    offCtx.fillRect(0, 0, w, h);

    if (fitMode === 'stretch') {
      offCtx.drawImage(img, 0, 0, w, h);
    } else if (fitMode === 'center') {
      var scale = Math.min(w / img.width, h / img.height, 1); // 不放大
      var dw = Math.round(img.width * scale);
      var dh = Math.round(img.height * scale);
      var dx = Math.floor((w - dw) / 2);
      var dy = Math.floor((h - dh) / 2);
      offCtx.drawImage(img, dx, dy, dw, dh);
    } else if (fitMode === 'tile') {
      for (var ty = 0; ty < h; ty += img.height) {
        for (var tx = 0; tx < w; tx += img.width) {
          offCtx.drawImage(img, tx, ty);
        }
      }
    }

    // 取得像素、轉灰階、調整亮度對比
    var bgData = offCtx.getImageData(0, 0, w, h);
    var bg = bgData.data;

    // 對比度轉換係數
    var contrastFactor = (1 + contrast) / (1 - contrast + 0.001);

    for (var i = 0; i < bg.length; i += 4) {
      // 灰階：加權平均
      var lum = bg[i] * 0.299 + bg[i + 1] * 0.587 + bg[i + 2] * 0.114;

      // 亮度調整
      lum += brightness * 255;

      // 對比度調整（以 128 為中心）
      lum = contrastFactor * (lum - 128) + 128;

      // 鉗制
      lum = Math.max(0, Math.min(255, Math.round(lum)));

      bg[i] = lum;
      bg[i + 1] = lum;
      bg[i + 2] = lum;
    }

    // 混合到頁面 ImageData
    var dst = imageData.data;
    for (var j = 0; j < dst.length; j += 4) {
      var existing = dst[j];
      // 保護深色文字
      if (existing < 160) continue;

      var bgVal = bg[j];
      // 白色背景像素不需要混合
      if (bgVal >= 250) continue;

      var blended = Math.round(existing * (1 - opacity) + bgVal * opacity);
      dst[j]     = blended;
      dst[j + 1] = blended;
      dst[j + 2] = blended;
    }
  }

  // ==================== 主入口 ====================

  /**
   * 在已渲染的頁面 ImageData 上疊加背景裝飾。
   * 呼叫時機：CREngine 渲染完文字後、dither 之前。
   *
   * @param {ImageData} imageData - 頁面像素（會被直接修改）
   * @param {string} bgId - 背景 ID（對應 PAGE_BACKGROUNDS 的 key）
   * @param {object} [options] - 各背景的參數
   *   @param {string}  [options.gridSize]    - 格子大小 'small'|'medium'|'large'
   *   @param {string}  [options.dotSpacing]  - 點間距 'small'|'medium'|'large'
   *   @param {number}  [options.lineSpacing] - 橫線間距（px）
   *   @param {number}  [options.opacity]     - 不透明度 0-100（預設依各背景不同）
   *   @param {number}  [options.margin]      - 邊框留白（px）
   *   @param {HTMLImageElement} [options.customImage] - 自訂背景圖
   *   @param {string}  [options.fitMode]     - 'stretch'|'tile'|'center'
   *   @param {number}  [options.brightness]  - 亮度 -100~100
   *   @param {number}  [options.contrast]    - 對比 -100~100
   */
  function drawPageBackground(imageData, bgId, options) {
    if (!bgId || bgId === 'none') return;
    if (!imageData || !imageData.data) return;

    options = options || {};

    switch (bgId) {
      case 'grid':
        drawGrid(imageData, options);
        break;
      case 'dots':
        drawDots(imageData, options);
        break;
      case 'lines':
        drawLines(imageData, options);
        break;
      case 'border-simple':
        drawSimpleBorder(imageData, options);
        break;
      case 'border-cat':
        drawCatBorder(imageData, options);
        break;
      case 'border-floral':
        drawFloralBorder(imageData, options);
        break;
      case 'custom':
        drawCustomBackground(imageData, options);
        break;
      default:
        // 未知 ID，靜默略過
        break;
    }
  }

  // ==================== 掛到全域 ====================

  window.PAGE_BACKGROUNDS = PAGE_BACKGROUNDS;
  window.drawPageBackground = drawPageBackground;

})();
