// ============================================
// status-bar-themes.js — 書頁進度條主題擴充
// 閱星曈轉檔工具 | HelloRuru Tools
//
// 在原版 Theme 1（細線）、Theme 2（條狀）基礎上
// 新增 3 款台灣特色主題，用 Canvas 像素繪製
// 適合 1-bit/2-bit e-ink 顯示
// ============================================

(function () {
  'use strict';

  // === 主題定義 ===
  var STATUS_BAR_THEMES = {
    // 原版主題（由 app.js drawStatusBar/drawProgressBar 處理）
    'theme-1': { name: '細線（原版）', id: 'theme-1', custom: false },
    'theme-2': { name: '條狀（原版）', id: 'theme-2', custom: false },

    // 新增主題
    'theme-bookmark': { name: '書籤風', id: 'theme-bookmark', custom: true },
    'theme-dots': { name: '極簡點點', id: 'theme-dots', custom: true },
  };

  // 掛到全域
  window.STATUS_BAR_THEMES = STATUS_BAR_THEMES;

  // 書籤形狀（12x16 像素）
  var BOOKMARK_SHAPE = [
    [1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1],
    [1,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,0,0,0,0,0,0,0,0,1,1],
    [0,1,1,0,0,0,0,0,0,1,1,0],
    [0,0,1,1,0,0,0,0,1,1,0,0],
    [0,0,0,1,1,1,1,1,1,0,0,0],
  ];

  // === 像素繪製工具函式 ===

  /**
   * 在 ImageData 上畫一個像素
   * @param {ImageData} imageData
   * @param {number} x
   * @param {number} y
   * @param {number} gray - 0(黑)~255(白)
   */
  function setPixel(imageData, x, y, gray) {
    var w = imageData.width;
    var h = imageData.height;
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    var idx = (y * w + x) * 4;
    imageData.data[idx] = gray;
    imageData.data[idx + 1] = gray;
    imageData.data[idx + 2] = gray;
    imageData.data[idx + 3] = 255;
  }

  /**
   * 畫一條水平線
   */
  function drawHLine(imageData, x1, x2, y, gray) {
    for (var x = x1; x <= x2; x++) {
      setPixel(imageData, x, y, gray);
    }
  }

  /**
   * 畫一個點陣圖案（放大 scale 倍）
   */
  function drawBitmap(imageData, bitmap, startX, startY, scale, gray) {
    scale = scale || 1;
    gray = (gray !== undefined) ? gray : 0;
    for (var row = 0; row < bitmap.length; row++) {
      for (var col = 0; col < bitmap[row].length; col++) {
        if (bitmap[row][col] === 1) {
          for (var sy = 0; sy < scale; sy++) {
            for (var sx = 0; sx < scale; sx++) {
              setPixel(imageData, startX + col * scale + sx, startY + row * scale + sy, gray);
            }
          }
        }
      }
    }
  }

  /**
   * 清除區域為白色
   */
  function clearArea(imageData, x, y, w, h) {
    for (var row = y; row < y + h; row++) {
      for (var col = x; col < x + w; col++) {
        setPixel(imageData, col, row, 255);
      }
    }
  }

  /**
   * 用 offscreen Canvas 畫文字，回傳 ImageData
   */
  function renderText(text, fontSize, maxWidth) {
    var canvas = document.createElement('canvas');
    canvas.width = maxWidth;
    canvas.height = fontSize + 4;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = fontSize + 'px sans-serif';
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'middle';
    return { canvas: canvas, ctx: ctx, height: canvas.height };
  }

  /**
   * 把 offscreen Canvas 的內容複製到 ImageData
   */
  function blitCanvas(sourceCanvas, imageData, destX, destY) {
    var srcCtx = sourceCanvas.getContext('2d');
    var srcData = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    var src = srcData.data;
    var dst = imageData.data;
    var dstW = imageData.width;
    var dstH = imageData.height;

    for (var row = 0; row < sourceCanvas.height; row++) {
      var dy = destY + row;
      if (dy < 0 || dy >= dstH) continue;
      for (var col = 0; col < sourceCanvas.width; col++) {
        var dx = destX + col;
        if (dx < 0 || dx >= dstW) continue;
        var srcIdx = (row * sourceCanvas.width + col) * 4;
        var dstIdx = (dy * dstW + dx) * 4;
        dst[dstIdx] = src[srcIdx];
        dst[dstIdx + 1] = src[srcIdx + 1];
        dst[dstIdx + 2] = src[srcIdx + 2];
        dst[dstIdx + 3] = src[srcIdx + 3];
      }
    }
  }

  // ============================================
  // === Theme 3：書籤風 ===
  // ============================================
  /**
   * 右下角書籤形狀裡放頁碼，進度用細虛線表示
   */
  function drawBookmarkTheme(imageData, pageNum, totalPgs, chapterInfo, options) {
    var w = imageData.width;
    var h = imageData.height;
    var margin = options.sideMargin || 8;
    var barY = h - 22;
    var barStartX = margin;
    var barEndX = w - margin - 40; // 留空間給書籤
    var barWidth = barEndX - barStartX;

    // 清除狀態列區域
    clearArea(imageData, 0, barY - 4, w, 26);

    // 進度比例
    var progress = totalPgs > 0 ? (pageNum + 1) / totalPgs : 0;
    var progressWidth = Math.floor(barWidth * progress);

    // 畫進度線（虛線風格）
    for (var x = barStartX; x <= barEndX; x++) {
      var isProgress = (x - barStartX) <= progressWidth;
      if (isProgress) {
        // 已讀：粗黑點（每 2px 一點）
        if ((x - barStartX) % 3 < 2) {
          setPixel(imageData, x, barY + 8, 0);
          setPixel(imageData, x, barY + 9, 0);
        }
      } else {
        // 未讀：細灰點（每 6px 一點）
        if ((x - barStartX) % 6 === 0) {
          setPixel(imageData, x, barY + 8, 160);
        }
      }
    }

    // 畫書籤（右下角）
    var bookmarkScale = 1;
    var bookmarkX = w - margin - 14;
    var bookmarkY = barY - 2;
    drawBitmap(imageData, BOOKMARK_SHAPE, bookmarkX, bookmarkY, bookmarkScale, 0);

    // 在書籤裡寫頁碼
    if (options.showPageNumber) {
      var pageStr = String(pageNum + 1);
      var fontSize = 9;
      var txtCanvas = document.createElement('canvas');
      txtCanvas.width = 10;
      txtCanvas.height = 12;
      var txtCtx = txtCanvas.getContext('2d');
      txtCtx.fillStyle = '#fff';
      txtCtx.fillRect(0, 0, 10, 12);
      txtCtx.font = fontSize + 'px sans-serif';
      txtCtx.fillStyle = '#000';
      txtCtx.textAlign = 'center';
      txtCtx.textBaseline = 'middle';
      txtCtx.fillText(pageStr, 5, 6);
      blitCanvas(txtCanvas, imageData, bookmarkX + 1, bookmarkY + 2);
    }

    // 百分比文字（左下角，小字）
    if (options.showPercentage) {
      var pct = Math.round(progress * 100) + '%';
      var pctObj = renderText(pct, 10, 40);
      pctObj.ctx.textAlign = 'left';
      pctObj.ctx.fillText(pct, 2, pctObj.height / 2);
      blitCanvas(pctObj.canvas, imageData, margin, barY);
    }
  }

  // ============================================
  // === Theme 5：極簡點點 ===
  // ============================================
  /**
   * 底部一排小圓點代表進度，頁碼極小置右下角
   */
  function drawDotsTheme(imageData, pageNum, totalPgs, chapterInfo, options) {
    var w = imageData.width;
    var h = imageData.height;
    var margin = options.sideMargin || 12;
    var dotY = h - 10;

    // 清除區域
    clearArea(imageData, 0, dotY - 4, w, 14);

    // 計算要畫幾個點（最多 20 個，每個代表 5% 進度）
    var totalDots = 20;
    var progress = totalPgs > 0 ? (pageNum + 1) / totalPgs : 0;
    var filledDots = Math.round(progress * totalDots);

    var dotSpacing = Math.floor((w - margin * 2) / (totalDots + 1));
    var dotRadius = 2;

    for (var i = 0; i < totalDots; i++) {
      var cx = margin + dotSpacing * (i + 1);
      var isFilled = (i < filledDots);

      if (isFilled) {
        // 實心圓（黑色）
        for (var dy = -dotRadius; dy <= dotRadius; dy++) {
          for (var dx = -dotRadius; dx <= dotRadius; dx++) {
            if (dx * dx + dy * dy <= dotRadius * dotRadius) {
              setPixel(imageData, cx + dx, dotY + dy, 0);
            }
          }
        }
      } else {
        // 空心圓（灰色邊框）
        for (var dy = -dotRadius; dy <= dotRadius; dy++) {
          for (var dx = -dotRadius; dx <= dotRadius; dx++) {
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist >= dotRadius - 0.8 && dist <= dotRadius + 0.8) {
              setPixel(imageData, cx + dx, dotY + dy, 160);
            }
          }
        }
      }
    }

    // 頁碼（右下角極小字）
    if (options.showPageNumber) {
      var pageText = (pageNum + 1) + '/' + totalPgs;
      var fontSize = 9;
      var txtObj = renderText(pageText, fontSize, 60);
      txtObj.ctx.textAlign = 'right';
      txtObj.ctx.fillText(pageText, 56, txtObj.height / 2);
      blitCanvas(txtObj.canvas, imageData, w - margin - 60, dotY - 6);
    }
  }

  // ============================================
  // === 主題路由 ===
  // ============================================

  /**
   * 根據選擇的主題繪製狀態列
   * @param {ImageData} imageData - 頁面的 RGBA 像素資料
   * @param {number} pageNum - 目前頁碼（0-based）
   * @param {number} totalPgs - 總頁數
   * @param {object} chapterInfo - 章節資訊
   * @param {string} themeId - 主題 ID
   */
  window.drawCustomStatusBar = function (imageData, pageNum, totalPgs, chapterInfo, themeId) {
    var theme = STATUS_BAR_THEMES[themeId];
    if (!theme || !theme.custom) return false; // 非自訂主題，交給原版處理

    // 讀取使用者設定
    var options = {
      sideMargin: parseInt(getElValue('statusSideMargin', '8')),
      fontSize: parseInt(getElValue('statusFontSize', '11')),
      showPageNumber: getElValue('showPageNumber', true),
      showPercentage: getElValue('showPercentage', false),
      showChapterMarks: getElValue('showChapterMarks', false),
    };

    // 取得 checkbox 值的輔助函式
    function getElValue(id, defaultVal) {
      var el = document.getElementById(id);
      if (!el) return defaultVal;
      if (el.type === 'checkbox') return el.checked;
      return el.value || defaultVal;
    }

    switch (themeId) {
      case 'theme-bookmark':
        drawBookmarkTheme(imageData, pageNum, totalPgs, chapterInfo, options);
        return true;
      case 'theme-dots':
        drawDotsTheme(imageData, pageNum, totalPgs, chapterInfo, options);
        return true;
      default:
        return false;
    }
  };

  /**
   * 取得所有可用主題清單
   * @returns {Array<{id: string, name: string}>}
   */
  window.getStatusBarThemes = function () {
    var list = [];
    for (var key in STATUS_BAR_THEMES) {
      list.push({ id: STATUS_BAR_THEMES[key].id, name: STATUS_BAR_THEMES[key].name });
    }
    return list;
  };

  console.log('[status-bar-themes] 載入完成，共 ' + Object.keys(STATUS_BAR_THEMES).length + ' 種主題');
})();
