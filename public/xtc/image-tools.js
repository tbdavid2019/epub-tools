// image-tools.js — 圖片工具模組
// 閱星曈轉檔工具 | HelloRuru Tools
//
// 功能：
//   1. 待機畫面 / 桌布制圖（XTG/XTH 匯出）
//   2. 圖片書製作（多圖 → XTC/XTCH 容器）
//   3. 透明書封（PNG 匯出）
//   4. 曈卡制圖（BMP 匯出）
//
// 不依賴 CREngine WASM，純 Canvas 處理

(function () {
  'use strict';

  // ==================== 常數 ====================

  /** 裝置解析度預設值 */
  var DEVICE_PRESETS = {
    'xteink-x4': { width: 480, height: 800, label: 'XTEink X4 (480x800)' },
    'xteink-x3': { width: 528, height: 792, label: 'XTEink X3 (528x792)' }
  };

  /** 曈卡預設尺寸（正方形） */
  var CARD_SIZE = 200;

  /** 支援的圖片 MIME 類型 */
  var ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  /** XTG 標頭魔數 */
  var XTG_MAGIC = [0x58, 0x54, 0x47, 0x00]; // "XTG\0"

  /** XTH 標頭魔數 */
  var XTH_MAGIC = [0x58, 0x54, 0x48, 0x00]; // "XTH\0"

  /** 標頭長度（兩種格式共用） */
  var HEADER_SIZE = 22;

  // ==================== 工具函式 ====================

  /**
   * 將檔案讀取為 Image 元素
   * @param {File} file - 圖片檔案（JPG/PNG/WebP）
   * @returns {Promise<HTMLImageElement>} 載入完成的 Image
   */
  function fileToImage(file) {
    return new Promise(function (resolve, reject) {
      if (ACCEPTED_TYPES.indexOf(file.type) === -1) {
        reject(new Error('不支援的圖片格式：' + file.type));
        return;
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('圖片載入失敗：' + file.name));
      };
      img.src = url;
    });
  }

  /**
   * 將 Image 繪製到指定尺寸的 Canvas，回傳 ImageData
   * @param {HTMLImageElement} img - 來源圖片
   * @param {number} targetW - 目標寬度
   * @param {number} targetH - 目標高度
   * @param {string} cropMode - 裁切模式：'fill' | 'fit' | 'stretch'
   * @returns {ImageData} 處理後的像素資料
   */
  function resizeImage(img, targetW, targetH, cropMode) {
    var canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    var ctx = canvas.getContext('2d');

    // 預設白底（fit 模式需要）
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);

    var srcW = img.naturalWidth;
    var srcH = img.naturalHeight;
    var dx = 0, dy = 0, dw = targetW, dh = targetH;

    if (cropMode === 'fill') {
      // Cover：填滿目標、裁掉超出部分
      var scale = Math.max(targetW / srcW, targetH / srcH);
      var sw = targetW / scale;
      var sh = targetH / scale;
      var sx = (srcW - sw) / 2;
      var sy = (srcH - sh) / 2;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
    } else if (cropMode === 'fit') {
      // Contain：完整顯示、白邊填充
      var scale = Math.min(targetW / srcW, targetH / srcH);
      dw = Math.round(srcW * scale);
      dh = Math.round(srcH * scale);
      dx = Math.round((targetW - dw) / 2);
      dy = Math.round((targetH - dh) / 2);
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      // Stretch：直接拉伸
      ctx.drawImage(img, 0, 0, targetW, targetH);
    }

    return ctx.getImageData(0, 0, targetW, targetH);
  }

  /**
   * 將 Image 裁切為正方形
   * @param {HTMLImageElement} img - 來源圖片
   * @param {number} size - 正方形邊長
   * @returns {ImageData} 裁切後的像素資料
   */
  function cropToSquare(img, size) {
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');

    var srcW = img.naturalWidth;
    var srcH = img.naturalHeight;
    var side = Math.min(srcW, srcH);
    var sx = (srcW - side) / 2;
    var sy = (srcH - side) / 2;

    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    return ctx.getImageData(0, 0, size, size);
  }

  /**
   * 調整亮度與對比度
   * @param {ImageData} imageData - 像素資料（會直接修改）
   * @param {number} brightness - 亮度 (-100 ~ 100)
   * @param {number} contrast - 對比度 (-100 ~ 100)
   * @returns {ImageData} 同一份 imageData（方便鏈式呼叫）
   */
  function adjustBrightnessContrast(imageData, brightness, contrast) {
    var d = imageData.data;
    var b = brightness / 100;       // -1 ~ 1
    var c = (contrast + 100) / 100; // 0 ~ 2
    c = c * c;                       // 讓曲線更自然

    for (var i = 0; i < d.length; i += 4) {
      for (var ch = 0; ch < 3; ch++) {
        var v = d[i + ch] / 255;
        v += b;
        v = ((v - 0.5) * c) + 0.5;
        d[i + ch] = Math.max(0, Math.min(255, Math.round(v * 255)));
      }
    }
    return imageData;
  }

  /**
   * 轉灰階（BT.601 加權）
   * @param {ImageData} imageData - 像素資料（會直接修改）
   * @returns {ImageData}
   */
  function toGrayscale(imageData) {
    var d = imageData.data;
    for (var i = 0; i < d.length; i += 4) {
      var gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = d[i + 1] = d[i + 2] = Math.round(gray);
    }
    return imageData;
  }

  // ==================== Floyd-Steinberg 抖色 ====================

  /**
   * 量化單一灰階值
   * @param {number} value - 灰階值 0-255
   * @param {number} bits - 位元深度（1 或 2）
   * @returns {number} 量化後的灰階值
   */
  function quantize(value, bits) {
    if (bits === 1) {
      return value < 128 ? 0 : 255;
    }
    // 2-bit：四級灰階（對應 XTH 規格）
    if (value > 212) return 255;      // 白
    if (value > 127) return 170;      // 淺灰
    if (value > 42) return 85;        // 深灰
    return 0;                          // 黑
  }

  /**
   * Floyd-Steinberg 抖色演算法
   * @param {ImageData} imageData - 像素資料（會直接修改）
   * @param {number} bits - 位元深度：1 (XTG) 或 2 (XTH)
   * @param {number} strength - 抖色強度 0-1（0=不抖色、1=完整抖色）
   * @returns {ImageData}
   */
  function floydSteinbergDither(imageData, bits, strength) {
    var w = imageData.width;
    var h = imageData.height;
    var d = imageData.data;

    // 建立灰階浮點數緩衝區
    var gray = new Float32Array(w * h);
    for (var i = 0; i < w * h; i++) {
      gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    }

    // 抖色
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = y * w + x;
        var oldVal = gray[idx];
        var newVal = quantize(oldVal, bits);
        gray[idx] = newVal;

        var err = (oldVal - newVal) * strength;

        if (x + 1 < w) gray[idx + 1] += err * 7 / 16;
        if (y + 1 < h) {
          if (x > 0) gray[idx + w - 1] += err * 3 / 16;
          gray[idx + w] += err * 5 / 16;
          if (x + 1 < w) gray[idx + w + 1] += err * 1 / 16;
        }
      }
    }

    // 寫回 RGBA
    for (var i = 0; i < w * h; i++) {
      var v = Math.max(0, Math.min(255, Math.round(gray[i])));
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    }

    return imageData;
  }

  /**
   * 4 色量化（黑 / 白 / 紅 / 黃，用於彩色曈卡）
   * @param {ImageData} imageData - 像素資料（會直接修改）
   * @returns {ImageData}
   */
  function quantize4Color(imageData) {
    var d = imageData.data;
    // 調色盤：黑、白、紅、黃
    var palette = [
      [0, 0, 0],
      [255, 255, 255],
      [200, 0, 0],
      [220, 200, 0]
    ];

    for (var i = 0; i < d.length; i += 4) {
      var r = d[i], g = d[i + 1], b = d[i + 2];
      var bestDist = Infinity;
      var bestIdx = 0;

      for (var p = 0; p < palette.length; p++) {
        var dr = r - palette[p][0];
        var dg = g - palette[p][1];
        var db = b - palette[p][2];
        var dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = p;
        }
      }

      d[i] = palette[bestIdx][0];
      d[i + 1] = palette[bestIdx][1];
      d[i + 2] = palette[bestIdx][2];
    }

    return imageData;
  }

  // ==================== XTG 編碼（1-bit 單色） ====================

  /**
   * 將 ImageData 編碼為 XTG 格式（1-bit 單色點陣圖）
   *
   * 標頭 22 bytes：
   *   0x00-0x03  魔數 "XTG\0" (mark=0x00475458)
   *   0x04-0x05  寬度 (LE uint16)
   *   0x06-0x07  高度 (LE uint16)
   *   0x08       colorMode (0=單色)
   *   0x09       compression (0=無壓縮)
   *   0x0A-0x0D  dataSize (LE uint32)
   *   0x0E-0x15  md5（預留填零）
   *
   * 像素：row-major，MSB 在左，0=黑 1=白
   *
   * @param {ImageData} imageData - 灰階像素資料
   * @returns {Uint8Array} XTG 二進位資料
   */
  function encodeXTG(imageData) {
    var w = imageData.width;
    var h = imageData.height;
    var d = imageData.data;

    var header = new Uint8Array(HEADER_SIZE);
    var view = new DataView(header.buffer);

    header[0] = XTG_MAGIC[0];
    header[1] = XTG_MAGIC[1];
    header[2] = XTG_MAGIC[2];
    header[3] = XTG_MAGIC[3];

    view.setUint16(4, w, true);
    view.setUint16(6, h, true);
    header[8] = 0;   // colorMode
    header[9] = 0;   // compression

    var rowBytes = Math.ceil(w / 8);
    var dataSize = rowBytes * h;
    view.setUint32(10, dataSize, true);

    var bitmap = new Uint8Array(dataSize);

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var gray = d[(y * w + x) * 4];
        if (gray >= 128) {
          var byteIdx = y * rowBytes + Math.floor(x / 8);
          var bitIdx = 7 - (x % 8);
          bitmap[byteIdx] |= (1 << bitIdx);
        }
      }
    }

    var result = new Uint8Array(HEADER_SIZE + dataSize);
    result.set(header, 0);
    result.set(bitmap, HEADER_SIZE);
    return result;
  }

  // ==================== XTH 編碼（2-bit 灰階） ====================

  /**
   * 將 ImageData 編碼為 XTH 格式（2-bit 四級灰階）
   *
   * 標頭 22 bytes（結構同 XTG，魔數改為 "XTH\0"）
   *
   * 像素：兩層 bit plane，column-major，由右至左掃描
   *   level 0b00 = 白
   *   level 0b10 = 淺灰
   *   level 0b01 = 深灰
   *   level 0b11 = 黑
   *
   * @param {ImageData} imageData - 灰階像素資料
   * @returns {Uint8Array} XTH 二進位資料
   */
  function encodeXTH(imageData) {
    var w = imageData.width;
    var h = imageData.height;
    var d = imageData.data;

    var header = new Uint8Array(HEADER_SIZE);
    var view = new DataView(header.buffer);

    header[0] = XTH_MAGIC[0];
    header[1] = XTH_MAGIC[1];
    header[2] = XTH_MAGIC[2];
    header[3] = XTH_MAGIC[3];

    view.setUint16(4, w, true);
    view.setUint16(6, h, true);
    header[8] = 0;
    header[9] = 0;

    var colBytes = Math.ceil(h / 8);
    var planeSize = colBytes * w;
    var dataSize = planeSize * 2;
    view.setUint32(10, dataSize, true);

    var plane0 = new Uint8Array(planeSize);
    var plane1 = new Uint8Array(planeSize);

    for (var x = w - 1; x >= 0; x--) {
      var colIdx = w - 1 - x;

      for (var y = 0; y < h; y++) {
        var gray = d[(y * w + x) * 4];

        var level;
        if (gray > 212) level = 0x00;
        else if (gray > 127) level = 0x02;
        else if (gray > 42) level = 0x01;
        else level = 0x03;

        var byteIdx = colIdx * colBytes + Math.floor(y / 8);
        var bitIdx = 7 - (y % 8);

        if (level & 0x01) plane0[byteIdx] |= (1 << bitIdx);
        if (level & 0x02) plane1[byteIdx] |= (1 << bitIdx);
      }
    }

    var result = new Uint8Array(HEADER_SIZE + dataSize);
    result.set(header, 0);
    result.set(plane0, HEADER_SIZE);
    result.set(plane1, HEADER_SIZE + planeSize);
    return result;
  }

  // ==================== XTC 容器打包 ====================

  /**
   * 將多張 XTG/XTH 頁面打包為 XTC/XTCH 容器
   *
   * 適用於圖片書製作：每張圖片 = 一頁
   *
   * @param {Uint8Array[]} pages - 每頁的 XTG 或 XTH 二進位資料
   * @param {Object} opts - 打包選項
   * @param {boolean} opts.isHQ - true=XTCH(2-bit)、false=XTC(1-bit)
   * @param {string} opts.title - 書名
   * @param {string} opts.author - 作者
   * @param {number} opts.width - 頁面寬度
   * @param {number} opts.height - 頁面高度
   * @param {Array} [opts.chapters] - 章節清單 [{title, page}]
   * @returns {Uint8Array} XTC/XTCH 容器二進位資料
   */
  function buildXTCContainer(pages, opts) {
    var isHQ = opts.isHQ || false;
    var magic = isHQ ? 'XTCH' : 'XTC\0';
    var title = opts.title || '圖片書';
    var author = opts.author || '';
    var pageWidth = opts.width || 480;
    var pageHeight = opts.height || 800;
    var chapters = opts.chapters || [];

    var headerSize = 56;
    var metadataSize = 256;
    var chapterEntrySize = 96;
    var chaptersSize = chapters.length * chapterEntrySize;
    var indexEntrySize = 16;
    var indexSize = pages.length * indexEntrySize;

    var metadataOffset = headerSize;
    var chapterOffset = metadataOffset + metadataSize;
    var indexOffset = chapterOffset + chaptersSize;
    var pageDataOffset = indexOffset + indexSize;

    // 算出每頁的偏移量
    var pageOffsets = [];
    var curOffset = pageDataOffset;
    for (var i = 0; i < pages.length; i++) {
      pageOffsets.push({ offset: curOffset, size: pages[i].length });
      curOffset += pages[i].length;
    }

    var totalSize = curOffset;
    var buffer = new ArrayBuffer(totalSize);
    var view = new DataView(buffer);
    var bytes = new Uint8Array(buffer);

    // --- 主標頭 (56 bytes) ---
    for (var i = 0; i < 4; i++) {
      bytes[i] = magic.charCodeAt(i);
    }
    view.setUint16(4, 1, true);                // 版本號
    view.setUint16(6, pages.length, true);     // 頁數
    bytes[8] = 0;                               // readDirection (0=左到右)
    bytes[9] = 1;                               // hasMetadata
    bytes[10] = 0;                              // hasThumbnails
    bytes[11] = chapters.length > 0 ? 1 : 0;   // hasChapters
    view.setUint32(12, 1, true);               // 目前頁碼 (1-indexed)

    view.setBigUint64(16, BigInt(metadataOffset), true);
    view.setBigUint64(24, BigInt(indexOffset), true);
    view.setBigUint64(32, BigInt(pageDataOffset), true);
    view.setBigUint64(40, BigInt(0), true);     // 保留
    view.setBigUint64(48, BigInt(chapterOffset), true);

    // --- 中繼資料 (256 bytes) ---
    var encoder = new TextEncoder();
    var titleBytes = encoder.encode(title.substring(0, 126));
    var authorBytes = encoder.encode(author.substring(0, 62));

    bytes.set(titleBytes, metadataOffset);
    bytes[metadataOffset + 127] = 0;
    bytes.set(authorBytes, metadataOffset + 128);
    bytes[metadataOffset + 191] = 0;
    view.setUint32(metadataOffset + 192, Math.floor(Date.now() / 1000), true);
    view.setUint16(metadataOffset + 196, chapters.length, true);

    // --- 章節表 ---
    var chapterPos = chapterOffset;
    for (var i = 0; i < chapters.length; i++) {
      var ch = chapters[i];
      var chTitle = ch.title || '章節 ' + (i + 1);
      var chPage = ch.page || 0;
      var chNameBytes = encoder.encode(chTitle.substring(0, 78));
      bytes.set(chNameBytes, chapterPos);
      bytes[chapterPos + 79] = 0;
      view.setUint16(chapterPos + 80, chPage + 1, true);
      view.setUint16(chapterPos + 82, chPage + 1, true);
      chapterPos += chapterEntrySize;
    }

    // --- 頁面索引 ---
    var indexPos = indexOffset;
    for (var i = 0; i < pages.length; i++) {
      view.setBigUint64(indexPos, BigInt(pageOffsets[i].offset), true);
      view.setUint32(indexPos + 8, pageOffsets[i].size, true);
      view.setUint16(indexPos + 12, pageWidth, true);
      view.setUint16(indexPos + 14, pageHeight, true);
      indexPos += indexEntrySize;
    }

    // --- 頁面資料 ---
    var dataPos = pageDataOffset;
    for (var i = 0; i < pages.length; i++) {
      bytes.set(pages[i], dataPos);
      dataPos += pages[i].length;
    }

    return bytes;
  }

  // ==================== BMP 編碼 ====================

  /**
   * 將 ImageData 編碼為 24-bit BMP 檔案
   *
   * BMP 結構：
   *   File Header (14 bytes) → DIB Header (40 bytes) → Pixel Data
   *   像素由下往上、每列補齊到 4 byte 邊界
   *
   * @param {ImageData} imageData - RGBA 像素資料
   * @returns {Uint8Array} BMP 二進位資料
   */
  function encodeBMP(imageData) {
    var w = imageData.width;
    var h = imageData.height;
    var d = imageData.data;

    var rowSize = Math.ceil(w * 3 / 4) * 4; // 每列對齊 4 bytes
    var pixelDataSize = rowSize * h;
    var fileSize = 14 + 40 + pixelDataSize;

    var buf = new ArrayBuffer(fileSize);
    var view = new DataView(buf);
    var bytes = new Uint8Array(buf);

    // --- BMP File Header (14 bytes) ---
    bytes[0] = 0x42; // 'B'
    bytes[1] = 0x4D; // 'M'
    view.setUint32(2, fileSize, true);
    view.setUint16(6, 0, true);   // 保留
    view.setUint16(8, 0, true);   // 保留
    view.setUint32(10, 54, true); // 像素資料偏移量

    // --- DIB Header (BITMAPINFOHEADER, 40 bytes) ---
    view.setUint32(14, 40, true);       // DIB 標頭長度
    view.setInt32(18, w, true);         // 寬度
    view.setInt32(22, h, true);         // 高度（正值=由下往上）
    view.setUint16(26, 1, true);        // 色彩平面數
    view.setUint16(28, 24, true);       // 每像素位元數
    view.setUint32(30, 0, true);        // 壓縮方式（0=無壓縮）
    view.setUint32(34, pixelDataSize, true);
    view.setInt32(38, 2835, true);      // 水平解析度 (72 DPI)
    view.setInt32(42, 2835, true);      // 垂直解析度
    view.setUint32(46, 0, true);        // 調色盤顏色數
    view.setUint32(50, 0, true);        // 重要顏色數

    // --- 像素資料（由下往上、BGR 順序）---
    for (var y = 0; y < h; y++) {
      var srcRow = h - 1 - y; // BMP 由下往上
      var dstOffset = 54 + y * rowSize;

      for (var x = 0; x < w; x++) {
        var srcIdx = (srcRow * w + x) * 4;
        var dstIdx = dstOffset + x * 3;
        bytes[dstIdx] = d[srcIdx + 2];     // B
        bytes[dstIdx + 1] = d[srcIdx + 1]; // G
        bytes[dstIdx + 2] = d[srcIdx];     // R
      }
      // 列尾補零（padding）已經是 0 了（ArrayBuffer 預設填零）
    }

    return bytes;
  }

  // ==================== 下載輔助 ====================

  /**
   * 觸發瀏覽器下載
   * @param {Uint8Array|Blob} data - 檔案資料
   * @param {string} filename - 下載檔名
   */
  function downloadFile(data, filename) {
    var blob = data instanceof Blob ? data : new Blob([data]);
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ==================== 預覽輔助 ====================

  /**
   * 將 ImageData 繪製到指定的 Canvas（用於即時預覽）
   * @param {ImageData} imageData - 要預覽的像素資料
   * @param {HTMLCanvasElement} canvas - 目標 Canvas 元素
   */
  function drawPreview(imageData, canvas) {
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    var ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);
  }

  // ==================== 非同步分批處理 ====================

  /**
   * 分批處理（避免阻塞 UI 執行緒）
   *
   * 每批處理 batchSize 個項目後，用 requestAnimationFrame 讓出控制權
   *
   * @param {Array} items - 待處理項目
   * @param {function(*, number):*} processFn - 處理函式 (item, index) → result
   * @param {function(number, number):void} [onProgress] - 進度回呼 (done, total)
   * @param {number} [batchSize=1] - 每批處理數量
   * @returns {Promise<Array>} 所有處理結果
   */
  function processBatched(items, processFn, onProgress, batchSize) {
    batchSize = batchSize || 1;

    return new Promise(function (resolve) {
      var results = [];
      var idx = 0;

      function nextBatch() {
        var end = Math.min(idx + batchSize, items.length);
        for (; idx < end; idx++) {
          results.push(processFn(items[idx], idx));
        }

        if (typeof onProgress === 'function') {
          onProgress(idx, items.length);
        }

        if (idx < items.length) {
          requestAnimationFrame(nextBatch);
        } else {
          resolve(results);
        }
      }

      requestAnimationFrame(nextBatch);
    });
  }

  // ==================== 1. 桌布 / 待機畫面制圖 ====================

  /**
   * 桌布制圖主流程
   *
   * @param {File} file - 來源圖片檔案
   * @param {Object} opts - 製作選項
   * @param {string} opts.device - 裝置代號（'xteink-x4' | 'xteink-x3'）
   * @param {number} [opts.width] - 自訂寬度（device='custom' 時使用）
   * @param {number} [opts.height] - 自訂高度
   * @param {string} [opts.cropMode='fill'] - 裁切模式：'fill' | 'fit' | 'stretch'
   * @param {number} [opts.brightness=0] - 亮度 (-100 ~ 100)
   * @param {number} [opts.contrast=0] - 對比度 (-100 ~ 100)
   * @param {boolean} [opts.dither=true] - 是否啟用 Floyd-Steinberg 抖色
   * @param {number} [opts.ditherStrength=100] - 抖色強度 (0-100)
   * @param {string} [opts.format='xtg'] - 輸出格式：'xtg' (1-bit) 或 'xth' (2-bit)
   * @param {HTMLCanvasElement} [opts.previewCanvas] - 即時預覽 Canvas
   * @returns {Promise<{data: Uint8Array, imageData: ImageData}>} 編碼資料 + 預覽像素
   */
  async function makeWallpaper(file, opts) {
    var preset = DEVICE_PRESETS[opts.device];
    var targetW = preset ? preset.width : (opts.width || 480);
    var targetH = preset ? preset.height : (opts.height || 800);
    var cropMode = opts.cropMode || 'fill';
    var brightness = opts.brightness || 0;
    var contrast = opts.contrast || 0;
    var dither = opts.dither !== false;
    var strength = (opts.ditherStrength != null ? opts.ditherStrength : 100) / 100;
    var format = opts.format || 'xtg';
    var bits = format === 'xth' ? 2 : 1;

    // 載入圖片
    var img = await fileToImage(file);

    // 縮放 / 裁切
    var imageData = resizeImage(img, targetW, targetH, cropMode);

    // 亮度 / 對比度
    if (brightness !== 0 || contrast !== 0) {
      adjustBrightnessContrast(imageData, brightness, contrast);
    }

    // 轉灰階
    toGrayscale(imageData);

    // 抖色
    if (dither) {
      floydSteinbergDither(imageData, bits, strength);
    }

    // 即時預覽
    if (opts.previewCanvas) {
      drawPreview(imageData, opts.previewCanvas);
    }

    // 編碼
    var encoded = (format === 'xth') ? encodeXTH(imageData) : encodeXTG(imageData);

    return { data: encoded, imageData: imageData };
  }

  // ==================== 2. 圖片書製作 ====================

  /**
   * 圖片書製作主流程
   *
   * 將多張圖片打包為 XTC/XTCH 容器，每張圖片 = 一頁
   *
   * @param {File[]} files - 圖片檔案陣列（已排好順序）
   * @param {Object} opts - 製作選項
   * @param {string} opts.device - 裝置代號
   * @param {number} [opts.width] - 自訂寬度
   * @param {number} [opts.height] - 自訂高度
   * @param {string} [opts.cropMode='fill'] - 裁切模式
   * @param {number} [opts.brightness=0] - 亮度
   * @param {number} [opts.contrast=0] - 對比度
   * @param {boolean} [opts.dither=true] - 是否抖色
   * @param {number} [opts.ditherStrength=100] - 抖色強度
   * @param {string} [opts.format='xtg'] - 'xtg' 或 'xth'
   * @param {string} [opts.title='圖片書'] - 書名
   * @param {string} [opts.author=''] - 作者
   * @param {function(number, number):void} [opts.onProgress] - 進度回呼 (done, total)
   * @returns {Promise<{container: Uint8Array, pageCount: number}>} XTC 容器
   */
  async function makeImageBook(files, opts) {
    var preset = DEVICE_PRESETS[opts.device];
    var targetW = preset ? preset.width : (opts.width || 480);
    var targetH = preset ? preset.height : (opts.height || 800);
    var cropMode = opts.cropMode || 'fill';
    var brightness = opts.brightness || 0;
    var contrast = opts.contrast || 0;
    var dither = opts.dither !== false;
    var strength = (opts.ditherStrength != null ? opts.ditherStrength : 100) / 100;
    var format = opts.format || 'xtg';
    var bits = format === 'xth' ? 2 : 1;
    var isHQ = format === 'xth';

    var pages = [];

    for (var i = 0; i < files.length; i++) {
      // 進度通知
      if (typeof opts.onProgress === 'function') {
        opts.onProgress(i, files.length);
      }

      var img = await fileToImage(files[i]);
      var imageData = resizeImage(img, targetW, targetH, cropMode);

      if (brightness !== 0 || contrast !== 0) {
        adjustBrightnessContrast(imageData, brightness, contrast);
      }

      toGrayscale(imageData);

      if (dither) {
        floydSteinbergDither(imageData, bits, strength);
      }

      var encoded = isHQ ? encodeXTH(imageData) : encodeXTG(imageData);
      pages.push(encoded);
    }

    if (typeof opts.onProgress === 'function') {
      opts.onProgress(files.length, files.length);
    }

    var container = buildXTCContainer(pages, {
      isHQ: isHQ,
      title: opts.title || '圖片書',
      author: opts.author || '',
      width: targetW,
      height: targetH,
      chapters: []
    });

    return { container: container, pageCount: pages.length };
  }

  // ==================== 3. 透明書封 ====================

  /**
   * 透明書封製作
   *
   * 將圖片等比縮放到指定尺寸，保留透明區域，輸出 PNG
   *
   * @param {File} file - 來源圖片（建議 PNG 帶透明通道）
   * @param {Object} opts - 選項
   * @param {number} opts.maxWidth - 最大寬度
   * @param {number} opts.maxHeight - 最大高度
   * @param {HTMLCanvasElement} [opts.previewCanvas] - 預覽 Canvas
   * @returns {Promise<{blob: Blob, width: number, height: number}>} PNG Blob
   */
  async function makeTransparentCover(file, opts) {
    var maxW = opts.maxWidth || 480;
    var maxH = opts.maxHeight || 800;

    var img = await fileToImage(file);

    var srcW = img.naturalWidth;
    var srcH = img.naturalHeight;

    // 等比縮放（不超過限制）
    var scale = Math.min(maxW / srcW, maxH / srcH, 1);
    var outW = Math.round(srcW * scale);
    var outH = Math.round(srcH * scale);

    var canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    var ctx = canvas.getContext('2d');

    // 不填白底，保留透明
    ctx.clearRect(0, 0, outW, outH);
    ctx.drawImage(img, 0, 0, outW, outH);

    // 預覽
    if (opts.previewCanvas) {
      opts.previewCanvas.width = outW;
      opts.previewCanvas.height = outH;
      var previewCtx = opts.previewCanvas.getContext('2d');
      // 棋盤格表示透明
      drawCheckerboard(previewCtx, outW, outH);
      previewCtx.drawImage(canvas, 0, 0);
    }

    var blob = await new Promise(function (resolve) {
      canvas.toBlob(function (b) { resolve(b); }, 'image/png');
    });

    return { blob: blob, width: outW, height: outH };
  }

  /**
   * 繪製棋盤格背景（表示透明區域）
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w - 寬度
   * @param {number} h - 高度
   */
  function drawCheckerboard(ctx, w, h) {
    var tileSize = 8;
    for (var y = 0; y < h; y += tileSize) {
      for (var x = 0; x < w; x += tileSize) {
        var isLight = ((x / tileSize + y / tileSize) % 2) === 0;
        ctx.fillStyle = isLight ? '#FFFFFF' : '#CCCCCC';
        ctx.fillRect(x, y, tileSize, tileSize);
      }
    }
  }

  // ==================== 4. 曈卡制圖 ====================

  /**
   * 曈卡制圖主流程
   *
   * 將圖片裁切為正方形，量化後輸出 BMP
   *
   * @param {File} file - 來源圖片
   * @param {Object} opts - 選項
   * @param {string} [opts.mode='mono'] - 'mono'（黑白 2 色）或 'color'（黑/白/紅/黃 4 色）
   * @param {number} [opts.size=200] - 卡片邊長（像素）
   * @param {boolean} [opts.dither=true] - 是否抖色（僅 mono 模式有效）
   * @param {number} [opts.ditherStrength=100] - 抖色強度
   * @param {number} [opts.brightness=0] - 亮度
   * @param {number} [opts.contrast=0] - 對比度
   * @param {HTMLCanvasElement} [opts.previewCanvas] - 預覽 Canvas
   * @returns {Promise<{data: Uint8Array, imageData: ImageData}>} BMP 資料 + 預覽像素
   */
  async function makeCard(file, opts) {
    var mode = opts.mode || 'mono';
    var size = opts.size || CARD_SIZE;
    var dither = opts.dither !== false;
    var strength = (opts.ditherStrength != null ? opts.ditherStrength : 100) / 100;
    var brightness = opts.brightness || 0;
    var contrast = opts.contrast || 0;

    var img = await fileToImage(file);
    var imageData = cropToSquare(img, size);

    // 亮度 / 對比度
    if (brightness !== 0 || contrast !== 0) {
      adjustBrightnessContrast(imageData, brightness, contrast);
    }

    if (mode === 'color') {
      // 4 色量化（黑 / 白 / 紅 / 黃）
      quantize4Color(imageData);
    } else {
      // 單色：先轉灰階再抖色
      toGrayscale(imageData);
      if (dither) {
        floydSteinbergDither(imageData, 1, strength);
      }
    }

    // 預覽
    if (opts.previewCanvas) {
      drawPreview(imageData, opts.previewCanvas);
    }

    // 輸出 BMP
    var bmpData = encodeBMP(imageData);

    return { data: bmpData, imageData: imageData };
  }

  // ==================== 快捷下載函式 ====================

  /**
   * 製作桌布並直接下載
   * @param {File} file - 圖片檔案
   * @param {Object} opts - 同 makeWallpaper 選項
   */
  async function downloadWallpaper(file, opts) {
    var result = await makeWallpaper(file, opts);
    var ext = (opts.format || 'xtg') === 'xth' ? 'xth' : 'xtg';
    var name = file.name.replace(/\.[^.]+$/, '') + '.' + ext;
    downloadFile(result.data, name);
  }

  /**
   * 製作圖片書並直接下載
   * @param {File[]} files - 圖片檔案陣列
   * @param {Object} opts - 同 makeImageBook 選項
   */
  async function downloadImageBook(files, opts) {
    var result = await makeImageBook(files, opts);
    var ext = (opts.format || 'xtg') === 'xth' ? 'xtch' : 'xtc';
    var name = (opts.title || '圖片書') + '.' + ext;
    downloadFile(result.container, name);
  }

  /**
   * 製作透明書封並直接下載
   * @param {File} file - 圖片檔案
   * @param {Object} opts - 同 makeTransparentCover 選項
   */
  async function downloadTransparentCover(file, opts) {
    var result = await makeTransparentCover(file, opts);
    var name = file.name.replace(/\.[^.]+$/, '') + '_cover.png';
    downloadFile(result.blob, name);
  }

  /**
   * 製作曈卡並直接下載
   * @param {File} file - 圖片檔案
   * @param {Object} opts - 同 makeCard 選項
   */
  async function downloadCard(file, opts) {
    var result = await makeCard(file, opts);
    var name = file.name.replace(/\.[^.]+$/, '') + '_card.bmp';
    downloadFile(result.data, name);
  }

  // ==================== 匯出到 window ====================

  window.ImageTools = {
    // 常數
    DEVICE_PRESETS: DEVICE_PRESETS,
    CARD_SIZE: CARD_SIZE,
    ACCEPTED_TYPES: ACCEPTED_TYPES,

    // 底層工具
    fileToImage: fileToImage,
    resizeImage: resizeImage,
    cropToSquare: cropToSquare,
    adjustBrightnessContrast: adjustBrightnessContrast,
    toGrayscale: toGrayscale,
    floydSteinbergDither: floydSteinbergDither,
    quantize4Color: quantize4Color,
    drawPreview: drawPreview,
    drawCheckerboard: drawCheckerboard,
    processBatched: processBatched,

    // 編碼器
    encodeXTG: encodeXTG,
    encodeXTH: encodeXTH,
    encodeBMP: encodeBMP,
    buildXTCContainer: buildXTCContainer,

    // 四大功能
    makeWallpaper: makeWallpaper,
    makeImageBook: makeImageBook,
    makeTransparentCover: makeTransparentCover,
    makeCard: makeCard,

    // 快捷下載
    downloadWallpaper: downloadWallpaper,
    downloadImageBook: downloadImageBook,
    downloadTransparentCover: downloadTransparentCover,
    downloadCard: downloadCard,
    downloadFile: downloadFile
  };

})();
