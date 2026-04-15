// ============================================
// app-bridge.js — 橋接原版 app.js 與新版 UI
// 閱星曈轉檔工具 | HelloRuru Tools
//
// 載入順序：app.js → app-bridge.js
// 本檔負責：
//   1. 新舊 DOM ID 對應
//   2. 字型系統整合（font-config.js）
//   3. 多格式檔案處理（format-handlers.js）
//   4. UI 狀態同步（品質、對齊、邊距、抖動等）
//   5. 進度顯示與中文錯誤訊息
//   6. PDF / Markdown 獨立管線
// ============================================

(function () {
  'use strict';

  // 避免重複載入
  if (window.__appBridgeLoaded) return;
  window.__appBridgeLoaded = true;

  /**
   * 處理 HTML/XHTML 中的文字節點（不破壞標籤和屬性）
   * 用正則把 > 和 < 之間的純文字抽出來跑 TextTools
   */
  async function processHtmlTextNodes(html, opts, totalChanges) {
    // 分割 HTML：標籤和文字交替
    var parts = html.split(/(<[^>]*>)/);
    var changed = false;

    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      // 跳過標籤、空白、純 ASCII（不需要處理）
      if (!part || part.charAt(0) === '<' || !/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(part)) continue;

      var result = await TextTools.processAll(part, {
        s2tw: opts.s2tw, halfToFull: opts.halfToFull,
        punctuation: opts.punctuation, cleanSpaces: opts.cleanSpaces
      });

      if (result.text !== part) {
        parts[i] = result.text;
        changed = true;
        totalChanges.s2tw += result.changes.s2tw || 0;
        totalChanges.halfToFull += result.changes.halfToFull || 0;
        totalChanges.punctuation += result.changes.punctuation || 0;
        totalChanges.cleanSpaces += result.changes.cleanSpaces || 0;
      }
    }

    return changed ? parts.join('') : html;
  }

  console.log('[app-bridge] 初始化橋接層...');

  // === Debounce 渲染（避免設定變更時重複渲染） ===
  var _renderTimer = null;
  window.debouncedRender = function () {
    if (_renderTimer) clearTimeout(_renderTimer);
    _renderTimer = setTimeout(function () {
      if (typeof applySettings === 'function') applySettings();
      if (typeof renderCurrentPage === 'function' && window._currentEngine !== 'pdfjs') {
        renderCurrentPage();
      } else if (window._currentEngine === 'pdfjs' && typeof renderPdfCurrentPage === 'function') {
        renderPdfCurrentPage();
      }
    }, 300);
  };

  // ============================================
  // === 一、雙向同步橋接層 ===
  // ============================================
  // 為原版 app.js 預期的舊 ID 建立隱藏 shim 元素，
  // 並在新版 UI ↔ shim 之間建立雙向事件同步。
  // 設計原則：
  //   - shim 元素帶完整 options / type / 預設值
  //   - 任一端 change 時，另一端自動同步值 + 觸發 change
  //   - 按鈕 click 轉發到對應的 shim 按鈕（或反向）
  //   - 用 _syncing 旗標防止無限迴圈

  var _syncing = false; // 防止同步迴圈

  /**
   * 安全取得或建立隱藏 shim 元素
   * @param {string} id - 要建立的元素 ID
   * @param {string} tag - HTML 標籤名（'button'|'input'|'select'|'div'|'span'）
   * @param {Object} [attrs] - 要設定的屬性（type, value, checked, min, max 等）
   * @returns {HTMLElement} 既有或新建的元素
   */
  function shimGetOrCreate(id, tag, attrs) {
    var el = document.getElementById(id);
    if (el) return el;
    el = document.createElement(tag || 'input');
    el.id = id;
    el.style.display = 'none';
    if (attrs) {
      var keys = Object.keys(attrs);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k === 'checked') { el.checked = attrs[k]; }
        else if (k === 'disabled') { el.disabled = attrs[k]; }
        else { el.setAttribute(k, attrs[k]); }
      }
    }
    document.body.appendChild(el);
    return el;
  }

  /**
   * 雙向同步兩個元素的 value（用於 input/select）
   * @param {HTMLElement} real - 新版 UI 元素
   * @param {HTMLElement} shim - 隱藏 shim 元素
   * @param {string} [prop] - 同步的屬性名（預設 'value'）
   */
  function biSync(real, shim, prop) {
    if (!real || !shim) return;
    prop = prop || 'value';
    real.addEventListener('change', function () {
      if (_syncing) return;
      _syncing = true;
      shim[prop] = real[prop];
      shim.dispatchEvent(new Event('change'));
      _syncing = false;
    });
    real.addEventListener('input', function () {
      if (_syncing) return;
      _syncing = true;
      shim[prop] = real[prop];
      shim.dispatchEvent(new Event('input'));
      _syncing = false;
    });
    shim.addEventListener('change', function () {
      if (_syncing) return;
      _syncing = true;
      real[prop] = shim[prop];
      real.dispatchEvent(new Event('change'));
      _syncing = false;
    });
  }

  /**
   * 雙向同步 checkbox（checked 屬性）
   */
  function biSyncCheckbox(real, shim) {
    biSync(real, shim, 'checked');
  }

  /**
   * 轉發按鈕 click：點 src → 觸發 dest 的 click
   */
  function forwardClick(src, dest) {
    if (!src || !dest) return;
    src.addEventListener('click', function () {
      dest.click();
    });
  }

  // === 1.1 按鈕映射 ===
  // 新版: prevPageBtn / nextPageBtn / exportXtcBtn / exportPageBtn / refreshBtn
  // 舊版: prevBtn / nextBtn / exportBtn / exportAllBtn / optimizeBtn

  var _prevPageBtn = document.getElementById('prevPageBtn');
  var _nextPageBtn = document.getElementById('nextPageBtn');
  var _exportXtcBtn = document.getElementById('exportXtcBtn');
  var _exportPageBtn = document.getElementById('exportPageBtn');
  var _refreshBtn = document.getElementById('refreshBtn');

  // 建立 shim 按鈕並轉發 click
  var _prevBtnShim = shimGetOrCreate('prevBtn', 'button', { disabled: true });
  var _nextBtnShim = shimGetOrCreate('nextBtn', 'button', { disabled: true });
  var _exportBtnShim = shimGetOrCreate('exportBtn', 'button', { disabled: true });
  shimGetOrCreate('exportAllBtn', 'button', { disabled: true });
  shimGetOrCreate('optimizeBtn', 'button', { disabled: true });

  // 雙向：點 shim → 觸發 real，點 real → 觸發 shim
  forwardClick(_prevBtnShim, _prevPageBtn);
  forwardClick(_nextBtnShim, _nextPageBtn);
  forwardClick(_exportBtnShim, _exportXtcBtn);
  // real → shim 方向在六的事件綁定處理（避免重複 click）

  // === 1.2 fontSelect (real) ↔ fontFamily (shim) ===
  var _fontSelect = document.getElementById('fontSelect');
  var _fontFamilyShim = shimGetOrCreate('fontFamily', 'select');
  // 複製 fontSelect 的所有 option 到 fontFamily shim
  if (_fontSelect) {
    var opts = _fontSelect.options;
    for (var fi = 0; fi < opts.length; fi++) {
      var cloned = document.createElement('option');
      cloned.value = opts[fi].value;
      cloned.textContent = opts[fi].textContent;
      if (opts[fi].selected) cloned.selected = true;
      _fontFamilyShim.appendChild(cloned);
    }
    biSync(_fontSelect, _fontFamilyShim);
  }

  // === 1.3 Range slider ↔ Num shim 雙向同步 ===
  // fontSize (real range) ↔ fontSizeNum (shim number)
  var _fontSizeReal = document.getElementById('fontSize');
  var _fontSizeNumShim = shimGetOrCreate('fontSizeNum', 'input', {
    type: 'number', value: _fontSizeReal ? _fontSizeReal.value : '34'
  });
  biSync(_fontSizeReal, _fontSizeNumShim);

  // fontWeight (real range) ↔ fontWeightNum (shim number)
  var _fontWeightReal = document.getElementById('fontWeight');
  var _fontWeightNumShim = shimGetOrCreate('fontWeightNum', 'input', {
    type: 'number', value: _fontWeightReal ? _fontWeightReal.value : '400'
  });
  biSync(_fontWeightReal, _fontWeightNumShim);

  // lineHeight (real range) ↔ lineHeightNum (shim number)
  var _lineHeightReal = document.getElementById('lineHeight');
  var _lineHeightNumShim = shimGetOrCreate('lineHeightNum', 'input', {
    type: 'number', value: _lineHeightReal ? _lineHeightReal.value : '120'
  });
  biSync(_lineHeightReal, _lineHeightNumShim);

  // ditherStrength (real range) ↔ ditherStrengthNum (shim number)
  var _ditherStrengthReal = document.getElementById('ditherStrength');
  var _ditherStrengthNumShim = shimGetOrCreate('ditherStrengthNum', 'input', {
    type: 'number', value: _ditherStrengthReal ? _ditherStrengthReal.value : '20'
  });
  biSync(_ditherStrengthReal, _ditherStrengthNumShim);

  // === 1.4 四邊邊距 (real) → 單一 margin (shim) ===
  var _marginShim = shimGetOrCreate('margin', 'input', {
    type: 'range', min: '0', max: '64', value: '16'
  });
  var _marginNumShim = shimGetOrCreate('marginNum', 'input', {
    type: 'number', value: '16'
  });
  // 同步邏輯在「四、UI 狀態管理」的 syncMarginsToDummy 處理

  // === 1.5 textAlign shim（帶完整 options）===
  if (!document.getElementById('textAlign')) {
    var _textAlignShim = document.createElement('select');
    _textAlignShim.id = 'textAlign';
    _textAlignShim.style.display = 'none';
    var _alignOpts = ['left', 'center', 'right', 'justify'];
    for (var ai = 0; ai < _alignOpts.length; ai++) {
      var aOpt = document.createElement('option');
      aOpt.value = _alignOpts[ai];
      aOpt.textContent = _alignOpts[ai];
      if (_alignOpts[ai] === 'justify') aOpt.selected = true;
      _textAlignShim.appendChild(aOpt);
    }
    document.body.appendChild(_textAlignShim);
  }
  // align-btn (real) → textAlign (shim) 同步在「四、4.4」處理

  // === 1.6 qualityMode shim（帶完整 options）===
  if (!document.getElementById('qualityMode')) {
    var _qualityModeShim = document.createElement('select');
    _qualityModeShim.id = 'qualityMode';
    _qualityModeShim.style.display = 'none';
    var _qFast = document.createElement('option');
    _qFast.value = 'fast'; _qFast.textContent = '快刷'; _qFast.selected = true;
    _qualityModeShim.appendChild(_qFast);
    var _qHq = document.createElement('option');
    _qHq.value = 'hq'; _qHq.textContent = '高清';
    _qualityModeShim.appendChild(_qHq);
    document.body.appendChild(_qualityModeShim);
  }
  // quality-btn (real) → qualityMode (shim) 同步在「四、4.3」處理

  // === 1.7 enableDithering shim ← ditherMode (real) ===
  var _ditherModeReal = document.getElementById('ditherMode');
  var _enableDitheringShim = shimGetOrCreate('enableDithering', 'input', {
    type: 'checkbox', checked: _ditherModeReal ? (_ditherModeReal.value !== 'none') : true
  });
  // ditherMode change → enableDithering 同步在「四、4.5」處理

  // === 1.8 negativeMode (real) ↔ enableNegative (shim) ===
  var _negativeMode = document.getElementById('negativeMode');
  var _enableNegShim = shimGetOrCreate('enableNegative', 'input', {
    type: 'checkbox', checked: _negativeMode ? _negativeMode.checked : false
  });
  biSyncCheckbox(_negativeMode, _enableNegShim);

  // === 1.9 進度條 checkbox 同步 ===
  // showProgressLine (real) → showBookProgress (shim) + enableProgressBar (shim)
  var _showProgressLineReal = document.getElementById('showProgressLine');
  var _enableProgBarShim = shimGetOrCreate('enableProgressBar', 'input', {
    type: 'checkbox', checked: _showProgressLineReal ? _showProgressLineReal.checked : true
  });
  var _showBookProgressShim = shimGetOrCreate('showBookProgress', 'input', {
    type: 'checkbox', checked: _showProgressLineReal ? _showProgressLineReal.checked : true
  });
  if (_showProgressLineReal) {
    _showProgressLineReal.addEventListener('change', function () {
      if (_syncing) return;
      _syncing = true;
      _enableProgBarShim.checked = _showProgressLineReal.checked;
      _enableProgBarShim.dispatchEvent(new Event('change'));
      _showBookProgressShim.checked = _showProgressLineReal.checked;
      _showBookProgressShim.dispatchEvent(new Event('change'));
      _syncing = false;
    });
    // shim → real 反向同步
    _enableProgBarShim.addEventListener('change', function () {
      if (_syncing) return;
      _syncing = true;
      _showProgressLineReal.checked = _enableProgBarShim.checked;
      _showBookProgressShim.checked = _enableProgBarShim.checked;
      _showProgressLineReal.dispatchEvent(new Event('change'));
      _syncing = false;
    });
  }

  // showPageNumber (real) → showPageXY (shim)
  var _showPageNumberReal = document.getElementById('showPageNumber');
  var _showPageXYShim = shimGetOrCreate('showPageXY', 'input', {
    type: 'checkbox', checked: _showPageNumberReal ? _showPageNumberReal.checked : true
  });
  biSyncCheckbox(_showPageNumberReal, _showPageXYShim);

  // showPercentage (real) → showBookPercent (shim)
  var _showPercentageReal = document.getElementById('showPercentage');
  var _showBookPercentShim = shimGetOrCreate('showBookPercent', 'input', {
    type: 'checkbox', checked: _showPercentageReal ? _showPercentageReal.checked : false
  });
  biSyncCheckbox(_showPercentageReal, _showBookPercentShim);

  // 其他進度條 shim（新版沒有對應 UI，純佔位）
  var _progressOnlyShims = ['showChapterProgress', 'progressFullWidth', 'showChapterXY', 'showChapterPercent'];
  for (var ps = 0; ps < _progressOnlyShims.length; ps++) {
    shimGetOrCreate(_progressOnlyShims[ps], 'input', { type: 'checkbox' });
  }

  // progressSettings 容器
  shimGetOrCreate('progressSettings', 'div');

  // === 1.10 狀態列字型/邊距 shim ===
  var _sfsSizeShim = shimGetOrCreate('statusFontSize', 'input', { type: 'range', value: '14' });
  var _sfsSizeNumShim = shimGetOrCreate('statusFontSizeNum', 'input', { type: 'number', value: '14' });
  biSync(_sfsSizeShim, _sfsSizeNumShim);

  var _statusMarginShims = [
    ['statusEdgeMargin', 'range', '0'], ['statusEdgeMarginNum', 'number', '0'],
    ['statusSideMargin', 'range', '0'], ['statusSideMarginNum', 'number', '0']
  ];
  for (var smi = 0; smi < _statusMarginShims.length; smi++) {
    shimGetOrCreate(_statusMarginShims[smi][0], 'input', {
      type: _statusMarginShims[smi][1], value: _statusMarginShims[smi][2]
    });
  }
  // 雙向同步 range ↔ num
  biSync(document.getElementById('statusEdgeMargin'), document.getElementById('statusEdgeMarginNum'));
  biSync(document.getElementById('statusSideMargin'), document.getElementById('statusSideMarginNum'));

  // === 1.11 monitorDpi / previewScale shim ===
  var _monitorDpiShim = shimGetOrCreate('monitorDpi', 'input', { type: 'range', value: '96' });
  var _monitorDpiNumShim = shimGetOrCreate('monitorDpiNum', 'input', { type: 'number', value: '96' });
  biSync(_monitorDpiShim, _monitorDpiNumShim);
  shimGetOrCreate('monitorDpiValue', 'span');
  document.getElementById('monitorDpiValue').textContent = '96';
  shimGetOrCreate('previewScaleValue', 'span');
  document.getElementById('previewScaleValue').textContent = '100';

  // === 1.12 progressContainer / customDimensions / customFontInput shim ===
  shimGetOrCreate('progressContainer', 'div');
  shimGetOrCreate('customDimensions', 'div');

  var _fontFileInput = document.getElementById('fontFileInput');
  var _customFontShim = shimGetOrCreate('customFontInput', 'input', {
    type: 'file', accept: '.ttf,.otf'
  });
  // 雙向轉發 click + change
  if (_fontFileInput) {
    _customFontShim.addEventListener('click', function (e) {
      e.preventDefault();
      _fontFileInput.click();
    });
    _fontFileInput.addEventListener('change', function () {
      // 讓 shim 也觸發 change（供舊程式碼監聽）
      _customFontShim.dispatchEvent(new Event('change'));
    });
  }

  // === 1.13 hyphenationLang / hyphenationLangGroup shim ===
  if (!document.getElementById('hyphenationLang')) {
    var _hyphenLangShim = document.createElement('select');
    _hyphenLangShim.id = 'hyphenationLang';
    _hyphenLangShim.style.display = 'none';
    var _hlAutoOpt = document.createElement('option');
    _hlAutoOpt.value = 'auto';
    _hlAutoOpt.textContent = '自動偵測';
    _hlAutoOpt.selected = true;
    _hyphenLangShim.appendChild(_hlAutoOpt);
    document.body.appendChild(_hyphenLangShim);
  }
  shimGetOrCreate('hyphenationLangGroup', 'div');

  // === 1.14 EPUB 最佳化面板 shim ===
  var _optimizerShimDefs = [
    ['optRemoveCss', 'checkbox'], ['optStripFonts', 'checkbox'],
    ['optProcessImages', 'checkbox'], ['optRemoveUnsupported', 'checkbox'],
    ['optGrayscale', 'checkbox'], ['optInjectCss', 'checkbox'],
    ['maxImageWidth', 'range', '480'], ['maxImageWidthNum', 'number', '480']
  ];
  for (var oi = 0; oi < _optimizerShimDefs.length; oi++) {
    var _oDef = _optimizerShimDefs[oi];
    shimGetOrCreate(_oDef[0], 'input', {
      type: _oDef[1],
      value: _oDef[2] || ''
    });
  }

  // === 1.15 裝置預設值轉換 ===
  // 新版 UI 用 'x4'/'x3'/'custom'，舊版 app.js 可能預期 'xteink-x4'/'xteink-x3'
  // 建一個轉換層：舊值 → 新值
  var _devicePresetMap = {
    'xteink-x4': 'x4',
    'xteink-x3': 'x3'
  };
  var _devicePresetReverseMap = {
    'x4': 'xteink-x4',
    'x3': 'xteink-x3'
  };
  // 掛到 window 讓其他模組可用
  window._devicePresetMap = _devicePresetMap;
  window._devicePresetReverseMap = _devicePresetReverseMap;

  /**
   * 轉換裝置預設值（舊版 → 新版）
   */
  window.normalizeDevicePreset = function (val) {
    return _devicePresetMap[val] || val;
  };

  // === 1.16 DEVICES 物件補丁 ===
  // app.js 的 DEVICES 用 'xteink-x4' / 'xteink-x3' 作為 key，
  // 但新版 HTML 的 devicePreset select 值是 'x4' / 'x3'。
  // 補上短 key，讓 app.js 的 DEVICES[preset] 不會 undefined。
  if (typeof DEVICES !== 'undefined') {
    if (!DEVICES['x4']) DEVICES['x4'] = { width: 480, height: 800, name: 'Xteink X4' };
    if (!DEVICES['x3']) DEVICES['x3'] = { width: 528, height: 792, name: 'Xteink X3' };
  }

  // DEVICE_DPI 是 app.js 的區域變數（非全域），無法直接補丁，
  // 但 app.js 已有 `|| 220` 回退，不會崩潰。

  console.log('[app-bridge] 雙向同步橋接建立完成');


  // ============================================
  // === 二、字型系統整合 ===
  // ============================================
  // 用 font-config.js 的 FONT_CONFIG 取代 app.js 的 GOOGLE_FONTS

  /**
   * 覆寫 loadGoogleFont：
   * 從 FONT_CONFIG 取得 URL，下載後註冊到 CREngine
   */
  window.loadGoogleFont = async function (fontKey) {
    // 相容：fontKey 可能是顯示名稱（如 'Literata'）也可能是 config key（如 'NotoSerifTC'）
    if (typeof loadedFonts === 'undefined') window.loadedFonts = new Set();

    if (loadedFonts.has(fontKey)) {
      console.log('[app-bridge] 字型已載入：' + fontKey);
      return true;
    }

    // 先查 FONT_CONFIG（font-config.js）
    var config = null;
    if (typeof FONT_CONFIG !== 'undefined' && FONT_CONFIG[fontKey]) {
      config = FONT_CONFIG[fontKey];
    }

    // 如果 FONT_CONFIG 沒有，回退查舊版 GOOGLE_FONTS
    if (!config && typeof GOOGLE_FONTS !== 'undefined' && GOOGLE_FONTS[fontKey]) {
      // 用舊邏輯
      var oldConfig = GOOGLE_FONTS[fontKey];
      console.log('[app-bridge] 回退使用 GOOGLE_FONTS：' + fontKey);
      var success = false;
      for (var i = 0; i < oldConfig.length; i++) {
        try {
          var resp = await fetch(oldConfig[i].url);
          if (!resp.ok) continue;
          var data = new Uint8Array(await resp.arrayBuffer());
          if (Module && renderer) {
            var ptr = Module.allocateMemory(data.length);
            Module.HEAPU8.set(data, ptr);
            renderer.registerFontFromMemory(ptr, data.length, oldConfig[i].name);
            Module.freeMemory(ptr);
          }
          success = true;
        } catch (err) {
          console.warn('[app-bridge] 載入字型失敗：' + oldConfig[i].name, err);
        }
      }
      if (success) loadedFonts.add(fontKey);
      return success;
    }

    if (!config) {
      console.warn('[app-bridge] 未知字型：' + fontKey);
      return false;
    }

    console.log('[app-bridge] 載入字型：' + config.name + '（' + fontKey + '）');
    var success = false;
    var variants = config.variants;

    for (var v = 0; v < variants.length; v++) {
      var variant = variants[v];
      var fileName = fontKey + '-' + variant.weight + (variant.style === 'italic' ? '-italic' : '') + '.ttf';

      try {
        var resp = await fetch(variant.url);
        if (!resp.ok) {
          console.warn('[app-bridge] 下載失敗：' + variant.url + '（' + resp.status + '）');
          continue;
        }
        var data = new Uint8Array(await resp.arrayBuffer());

        if (Module && renderer) {
          var ptr = Module.allocateMemory(data.length);
          Module.HEAPU8.set(data, ptr);
          // 用 fontKey 註冊（跟 setFontFace 傳的一致）
          renderer.registerFontFromMemory(ptr, data.length, fontKey);
          Module.freeMemory(ptr);
        }

        console.log('[app-bridge] 字型檔載入成功：' + fileName);
        success = true;
      } catch (err) {
        console.warn('[app-bridge] 字型載入錯誤：' + fileName, err);
      }
    }

    if (success) {
      loadedFonts.add(fontKey);
    }
    return success;
  };

  /**
   * 覆寫 loadDefaultFonts：
   * 載入 NotoSerifTC 作為預設字型（取代原版的 Literata）
   */
  window.loadDefaultFonts = async function () {
    console.log('[app-bridge] 載入預設字型：NotoSerifTC');
    await window.loadGoogleFont('NotoSerifTC');
  };


  // ============================================
  // === 三、多格式檔案處理 ===
  // ============================================

  // 追蹤目前載入的引擎類型（crengine / pdfjs）
  window._currentEngine = null;
  window._currentPdfDoc = null;

  /**
   * 覆寫 handleFiles：
   * 使用 format-handlers.js 的 detectFormat 支援所有格式。
   * 若 detectFormat 不存在（format-handlers.js 沒載入），
   * 回退用副檔名判斷，預設全丟 CREngine。
   */
  window.handleFiles = function (files) {
    if (!files || files.length === 0) return;

    var fileArray = Array.from(files);

    var supported = [];
    var unsupported = [];

    for (var i = 0; i < fileArray.length; i++) {
      var f = fileArray[i];
      var detected = null;

      // 優先用 format-handlers.js 的 detectFormat
      if (typeof detectFormat === 'function') {
        detected = detectFormat(f);
      }

      // 回退：detectFormat 不存在或回傳 null 時，用副檔名硬判
      if (!detected) {
        detected = fallbackDetect(f);
      }

      if (detected) {
        supported.push({ file: f, detected: detected });
      } else {
        unsupported.push(f);
      }
    }

    // 報告不支援的檔案
    if (unsupported.length > 0) {
      var names = [];
      for (var u = 0; u < unsupported.length; u++) {
        names.push(unsupported[u].name);
      }
      bridgeAlert('以下檔案格式不支援：\n' + names.join('\n') + '\n\n支援的格式：EPUB、PDF、MOBI、TXT、Markdown、DOC/DOCX');
    }

    if (supported.length === 0) return;

    // 加入檔案清單
    for (var s = 0; s < supported.length; s++) {
      var file = supported[s].file;
      var exists = loadedFiles.some(function (lf) { return lf.name === file.name; });
      if (!exists) {
        loadedFiles.push({
          file: file,
          name: file.name,
          loaded: false,
          detected: supported[s].detected
        });
      }
    }

    updateFileList();

    // 自動載入第一個
    var anyLoaded = loadedFiles.some(function (lf) { return lf.loaded; });
    if (loadedFiles.length > 0 && !anyLoaded) {
      bridgeSwitchToFile(0);
    }

    // 多檔時顯示批次按鈕和提示
    var showBatch = loadedFiles.length > 1;
    var _batchExportBtn = document.getElementById('batchExportBtn');
    var _exportAllBtn = document.getElementById('exportAllBtn');
    var _exportOneByOne = document.getElementById('exportAllOneByOne');
    var _batchHint = document.getElementById('batchHint');
    if (_batchExportBtn) _batchExportBtn.style.display = showBatch ? 'inline-flex' : 'none';
    if (_exportAllBtn) _exportAllBtn.style.display = showBatch ? 'inline-block' : 'none';
    if (_exportOneByOne) _exportOneByOne.style.display = showBatch ? 'inline-block' : 'none';
    if (_batchHint) _batchHint.style.display = showBatch ? 'flex' : 'none';
  };

  /**
   * 回退格式偵測（當 format-handlers.js 沒載入時使用）
   * 用副檔名決定引擎，確保所有格式都能嘗試載入。
   */
  function fallbackDetect(file) {
    var name = (file.name || '').toLowerCase();
    var ext = name.substring(name.lastIndexOf('.'));
    var extEngineMap = {
      '.epub': 'crengine',
      '.mobi': 'crengine', '.azw': 'crengine', '.prc': 'crengine', '.pdb': 'crengine',
      '.txt': 'crengine',
      '.doc': 'crengine', '.docx': 'crengine', '.docm': 'crengine',
      '.md': 'markdown-to-crengine', '.markdown': 'markdown-to-crengine',
      '.pdf': 'pdfjs'
    };
    var engine = extEngineMap[ext];
    if (!engine) return null;
    return {
      format: ext.replace('.', ''),
      config: { engine: engine, accept: ext, mime: '', label: ext.toUpperCase() }
    };
  }

  /**
   * 覆寫 switchToFile：
   * 依據檔案格式決定走 CREngine 或 PDF.js 或 Markdown 管線
   */
  async function bridgeSwitchToFile(index) {
    if (index >= loadedFiles.length) return;

    currentFileIndex = index;
    updateFileList();

    var fileData = loadedFiles[index];
    var detected = fileData.detected;

    // 如果沒有 detected（舊的 loadedFiles 項目），重新偵測
    if (!detected && typeof detectFormat === 'function') {
      detected = detectFormat(fileData.file);
    }

    if (!detected) {
      bridgeAlert('無法辨識檔案格式：' + fileData.name);
      return;
    }

    var engineType = detected.config.engine;
    console.log('[app-bridge] 切換檔案：' + fileData.name + '（引擎：' + engineType + '）');

    // 顯示書籍資訊區塊
    showSection('bookInfoSection');

    try {
      switch (engineType) {
        case 'crengine':
          await loadWithCREngine(fileData);
          break;

        case 'markdown-to-crengine':
          await loadWithMarkdown(fileData);
          break;

        case 'pdfjs':
          await loadWithPdfJs(fileData);
          break;

        default:
          bridgeAlert('引擎「' + engineType + '」尚未支援');
          return;
      }

      fileData.loaded = true;

    } catch (err) {
      console.error('[app-bridge] 載入失敗：', err);
      bridgeAlert('載入失敗：' + fileData.name + '\n' + (err.message || String(err)));
    }
  }

  // 覆寫全域 switchToFile
  window.switchToFile = bridgeSwitchToFile;

  /**
   * CREngine 管線（EPUB、MOBI、TXT、DOC、DOCX）
   * 先嘗試 format-handlers.js 的 handleCREngineNative，
   * 失敗或不存在時回退為直接餵 raw bytes 給 CREngine。
   * CREngine WASM 原生支援 EPUB/MOBI/TXT/DOC/DOCX 等格式的 bytes。
   */
  async function loadWithCREngine(fileData) {
    if (!wasmReady || !renderer) {
      bridgeAlert('排版引擎尚未就緒，請稍候再試');
      return;
    }

    window._currentEngine = 'crengine';
    window._currentPdfDoc = null;

    var loaded = false;

    // 優先：format-handlers.js 的進階處理
    if (typeof handleCREngineNative === 'function') {
      try {
        var result = await handleCREngineNative(fileData.file, renderer, Module);
        if (result.success) {
          loaded = true;
        } else {
          console.warn('[app-bridge] handleCREngineNative 失敗，回退 raw bytes：' + result.message);
        }
      } catch (handlerErr) {
        console.warn('[app-bridge] handleCREngineNative 例外，回退 raw bytes：', handlerErr);
      }
    }

    // 回退：直接餵 raw bytes 給 CREngine
    // CREngine 內建格式偵測，EPUB/MOBI/TXT/DOC/DOCX 都能處理
    if (!loaded) {
      var rawBytes = await fileData.file.arrayBuffer();
      var data = new Uint8Array(rawBytes);

      // EPUB 檔案前處理：簡轉繁 + 標點台灣化（用 JSZip 解壓 → 修改 XHTML → 重新打包）
      var isEpub = /\.epub$/i.test(fileData.name);
      if (isEpub && typeof TextTools !== 'undefined' && typeof JSZip !== 'undefined') {
        var doS2TW = document.getElementById('enableS2TW')?.checked !== false;
        var doHalf = document.getElementById('enableHalfToFull')?.checked !== false;
        var doPunct = document.getElementById('enablePunctTW')?.checked !== false;
        var doClean = document.getElementById('enableCleanSpaces')?.checked !== false;
        var anyEnabled = doS2TW || doHalf || doPunct || doClean;

        if (anyEnabled) {
          try {
            console.log('[app-bridge] EPUB 文字處理開始...');
            var zip = await JSZip.loadAsync(rawBytes);
            var xhtmlFiles = [];
            zip.forEach(function(path, entry) {
              if (!entry.dir && /\.(xhtml|html|htm|xml)$/i.test(path) && !/META-INF/i.test(path)) {
                xhtmlFiles.push(path);
              }
            });

            var totalChanges = { s2tw: 0, halfToFull: 0, punctuation: 0, cleanSpaces: 0 };

            for (var ei = 0; ei < xhtmlFiles.length; ei++) {
              var xPath = xhtmlFiles[ei];
              var xContent = await zip.file(xPath).async('string');

              // 只處理文字節點的內容（避免破壞 HTML 標籤和屬性）
              var processedContent = await processHtmlTextNodes(xContent, {
                s2tw: doS2TW, halfToFull: doHalf,
                punctuation: doPunct, cleanSpaces: doClean
              }, totalChanges);

              zip.file(xPath, processedContent);
            }

            // 重新打包 EPUB
            var newEpubBlob = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
            data = newEpubBlob;

            var epubLog = [];
            if (totalChanges.s2tw > 0) epubLog.push('簡轉繁 ' + totalChanges.s2tw + ' 字');
            if (totalChanges.halfToFull > 0) epubLog.push('半全形 ' + totalChanges.halfToFull + ' 處');
            if (totalChanges.punctuation > 0) epubLog.push('標點 ' + totalChanges.punctuation + ' 處');
            if (totalChanges.cleanSpaces > 0) epubLog.push('空格 ' + totalChanges.cleanSpaces + ' 處');
            if (epubLog.length > 0) {
              console.log('[app-bridge] EPUB 文字處理完成：' + epubLog.join('、'));
            }
          } catch (epubTextErr) {
            console.warn('[app-bridge] EPUB 文字處理失敗，使用原始檔案：', epubTextErr);
            data = new Uint8Array(rawBytes);
          }
        }
      }

      // TXT 檔案前處理：跳過 metadata + 清理空格 + 簡轉繁
      var isTxt = /\.(txt|md|markdown)$/i.test(fileData.name);
      if (isTxt && typeof TextTools !== 'undefined') {
        try {
          var textContent = new TextDecoder('utf-8').decode(data);

          // 跳過開頭 metadata（書名、作者、標籤、簡介等）
          var parsed = TextTools.skipMetadata(textContent);
          if (parsed.metadata.title) {
            window._detectedTitle = parsed.metadata.title;
          }
          if (parsed.metadata.author) {
            window._detectedAuthor = parsed.metadata.author;
          }
          textContent = parsed.body;

          // 讀取 UI 勾選狀態
          var doS2TW = document.getElementById('enableS2TW')?.checked !== false;
          var doHalf = document.getElementById('enableHalfToFull')?.checked !== false;
          var doPunct = document.getElementById('enablePunctTW')?.checked !== false;
          var doClean = document.getElementById('enableCleanSpaces')?.checked !== false;

          // 執行文字處理
          var processed = await TextTools.processAll(textContent, {
            s2tw: doS2TW,
            halfToFull: doHalf,
            punctuation: doPunct,
            cleanSpaces: doClean,
          });
          textContent = processed.text;

          // 回報處理結果
          var changeLog = [];
          if (processed.changes.cleanSpaces > 0) changeLog.push('清理 ' + processed.changes.cleanSpaces + ' 個多餘空格');
          if (processed.changes.s2tw > 0) changeLog.push('簡轉繁 ' + processed.changes.s2tw + ' 字');
          if (processed.changes.halfToFull > 0) changeLog.push('半全形 ' + processed.changes.halfToFull + ' 處');
          if (processed.changes.punctuation > 0) changeLog.push('標點 ' + processed.changes.punctuation + ' 處');
          if (changeLog.length > 0) {
            console.log('[text-tools] 文字處理完成：' + changeLog.join('、'));
          }

          // 把處理過的文字轉回 bytes
          data = new TextEncoder().encode(textContent);

          // 存起來給目錄偵測用（避免重複讀檔）
          window._processedTextContent = textContent;

          // 自動填入封面的書名和作者
          if (window._detectedTitle) {
            var coverTitleInput = document.getElementById('coverTitleInput');
            if (coverTitleInput && !coverTitleInput.value) {
              coverTitleInput.value = window._detectedTitle;
            }
          }
          if (window._detectedAuthor) {
            var coverAuthorInput = document.getElementById('coverAuthorInput');
            if (coverAuthorInput && !coverAuthorInput.value) {
              coverAuthorInput.value = window._detectedAuthor;
            }
          }
          if (typeof generateAutoCover === 'function') generateAutoCover();

        } catch (textErr) {
          console.warn('[text-tools] 文字前處理失敗，使用原始檔案：', textErr);
          data = new Uint8Array(rawBytes);
        }
      }

      var ptr = Module.allocateMemory(data.length);
      Module.HEAPU8.set(data, ptr);
      try {
        renderer.loadEpubFromMemory(ptr, data.length);
      } finally {
        Module.freeMemory(ptr);
      }
    }

    // 停用 CREngine 內建狀態列（使用自訂的）
    if (renderer.configureStatusBar) {
      renderer.configureStatusBar(false, false, false, false, false, false, false, false, false);
    }

    applySettings();

    totalPages = renderer.getPageCount();
    currentPage = 0;

    // 取得文件資訊
    var info = renderer.getDocumentInfo() || {};
    updateBookInfo(info.title || fileData.name, info.author || info.authors || '未知作者', totalPages);

    // 取得目錄
    // 先嘗試 CREngine getToc
    var rawToc = null;
    try {
      rawToc = renderer.getToc();
      if (typeof rawToc === 'string') rawToc = JSON.parse(rawToc);
      if (!Array.isArray(rawToc)) rawToc = null;
    } catch (e) { rawToc = null; }

    var isTxtFile = /\.(txt|md|markdown)$/i.test(fileData.name);
    if (isTxtFile && typeof TextTools !== 'undefined') {
      // TXT 用我們的偵測器（比 CREngine 內建的準確）
      try {
        // 用前處理時已存好的文字（避免重複讀檔失敗）
        var rawText = window._processedTextContent || (await fileData.file.text());
        // 如果是已處理過的文字，不需要再 skipMetadata
        var parsed = window._processedTextContent ? { body: rawText } : TextTools.skipMetadata(rawText);
        var mode = document.getElementById('chapterDetectMode')?.value || 'auto';
        var opts = {};
        if (mode === 'separator') opts.separator = document.getElementById('chapterSeparator')?.value || '';
        if (mode === 'keyword') opts.keyword = document.getElementById('chapterKeyword')?.value || '';
        var detected = TextTools.detectChapters(parsed.body, mode, opts);

        // 轉換成 CREngine TOC 格式（需要頁碼，用估算）
        currentToc = [];
        if (detected.length > 0 && totalPages > 0) {
          var bodyLength = parsed.body.length;
          for (var d = 0; d < detected.length; d++) {
            var estimatedPage = Math.floor((detected[d].position / bodyLength) * totalPages);
            currentToc.push({
              title: detected[d].name,
              name: detected[d].name,
              page: estimatedPage,
              startPage: estimatedPage,
            });
          }
        }
        console.log('[app-bridge] TXT 目錄偵測：' + currentToc.length + ' 章');
      } catch (tocErr) {
        console.warn('[app-bridge] TXT 目錄偵測失敗，回退 CREngine：', tocErr);
        currentToc = renderer.getToc() || [];
      }
    } else {
      currentToc = rawToc || [];
    }

    console.log('[app-bridge] 目錄結果：' + currentToc.length + ' 章');
    updateChapterList();
    if (currentToc.length > 0) {
      showSection('chaptersSection');
      // 用我們的可編輯版本
      setTimeout(renderChapterListUI, 200);
    } else {
      showSection('chaptersSection'); // 即使空也顯示，讓使用者可以手動新增
    }

    // 啟用按鈕
    enableExportButtons();
    renderCurrentPage();
  }

  /**
   * Markdown 管線
   * 優先用 format-handlers.js 的 handleMarkdown，
   * 若不存在則嘗試 markdownToHtmlDocument() 轉 HTML 後餵 CREngine，
   * 再不行就把 raw text 當 TXT 餵 CREngine。
   */
  async function loadWithMarkdown(fileData) {
    if (!wasmReady || !renderer) {
      bridgeAlert('排版引擎尚未就緒，請稍候再試');
      return;
    }

    window._currentEngine = 'crengine';
    window._currentPdfDoc = null;

    var loaded = false;

    // 優先：format-handlers.js 的完整 handleMarkdown
    if (typeof handleMarkdown === 'function') {
      try {
        var result = await handleMarkdown(fileData.file, renderer, Module);
        if (result.success) {
          loaded = true;
        } else {
          console.warn('[app-bridge] handleMarkdown 失敗：' + result.message);
        }
      } catch (mdErr) {
        console.warn('[app-bridge] handleMarkdown 例外：', mdErr);
      }
    }

    // 回退 A：用 markdownToHtmlDocument() 轉 HTML 再餵 CREngine
    if (!loaded && typeof markdownToHtmlDocument === 'function') {
      try {
        var mdText = await fileData.file.text();
        var htmlDoc = markdownToHtmlDocument(mdText, fileData.name.replace(/\.(md|markdown)$/i, ''));
        var htmlBytes = new TextEncoder().encode(htmlDoc);
        var ptr = Module.allocateMemory(htmlBytes.length);
        Module.HEAPU8.set(htmlBytes, ptr);
        try {
          renderer.loadEpubFromMemory(ptr, htmlBytes.length);
        } finally {
          Module.freeMemory(ptr);
        }
        loaded = true;
        console.log('[app-bridge] Markdown → HTML → CREngine 成功');
      } catch (htmlErr) {
        console.warn('[app-bridge] markdownToHtmlDocument 失敗：', htmlErr);
      }
    }

    // 回退 B：把 raw text 直接當 TXT 餵 CREngine
    if (!loaded) {
      console.warn('[app-bridge] Markdown 回退為純文字模式');
      var rawData = new Uint8Array(await fileData.file.arrayBuffer());
      var ptr2 = Module.allocateMemory(rawData.length);
      Module.HEAPU8.set(rawData, ptr2);
      try {
        renderer.loadEpubFromMemory(ptr2, rawData.length);
      } finally {
        Module.freeMemory(ptr2);
      }
    }

    if (renderer.configureStatusBar) {
      renderer.configureStatusBar(false, false, false, false, false, false, false, false, false);
    }

    applySettings();

    totalPages = renderer.getPageCount();
    currentPage = 0;

    var titleFromFile = fileData.name.replace(/\.(md|markdown)$/i, '');
    updateBookInfo(titleFromFile, '', totalPages);

    currentToc = renderer.getToc() || [];
    updateChapterList();
    if (currentToc.length > 0) {
      showSection('chaptersSection');
    }

    enableExportButtons();
    renderCurrentPage();
  }

  /**
   * PDF.js 管線
   */
  async function loadWithPdfJs(fileData) {
    window._currentEngine = 'pdfjs';

    var result;
    if (typeof handlePdf === 'function') {
      result = await handlePdf(fileData.file);
    } else {
      throw new Error('缺少 PDF.js 支援，無法處理 PDF 檔案');
    }

    if (!result.success) {
      throw new Error(result.message);
    }

    window._currentPdfDoc = result.pdfDoc;
    totalPages = result.pdfDoc.numPages;
    currentPage = 0;

    var titleFromFile = fileData.name.replace(/\.pdf$/i, '');
    updateBookInfo(titleFromFile, '', totalPages);

    // PDF 沒有章節目錄（可未來擴充）
    currentToc = [];
    updateChapterList();

    enableExportButtons();
    renderPdfCurrentPage();
  }

  /**
   * PDF 頁面渲染
   */
  async function renderPdfCurrentPage() {
    if (!window._currentPdfDoc) return;

    var canvas = document.getElementById('previewCanvas');
    if (!canvas) return;

    try {
      if (typeof renderPdfPage === 'function') {
        await renderPdfPage(window._currentPdfDoc, currentPage + 1, canvas, SCREEN_WIDTH);
      }

      // 更新頁面資訊
      var pageInfoEl = document.getElementById('pageInfo');
      if (pageInfoEl) {
        pageInfoEl.textContent = '第 ' + (currentPage + 1) + ' 頁 / 共 ' + totalPages + ' 頁';
      }

      // 更新按鈕狀態
      updateNavButtons();

    } catch (err) {
      console.error('[app-bridge] PDF 渲染錯誤：', err);
    }
  }


  // ============================================
  // === 四、UI 狀態管理 ===
  // ============================================

  // --- 4.1 邊距同步 ---
  // 新版有四個獨立邊距輸入，app.js 期待一個 margin 值
  var _marginTop = document.getElementById('marginTop');
  var _marginRight = document.getElementById('marginRight');
  var _marginBottom = document.getElementById('marginBottom');
  var _marginLeft = document.getElementById('marginLeft');
  var _marginDummy = document.getElementById('margin');
  var _marginNumDummy = document.getElementById('marginNum');

  function syncMarginsToDummy() {
    // 取四邊的值，讓 app.js 的 applySettings 拿到一個代表值
    // 由於 CREngine setMargins 接受四個值，我們直接覆寫 applySettings
    var top = parseInt(_marginTop ? _marginTop.value : 16) || 16;
    var right = parseInt(_marginRight ? _marginRight.value : 16) || 16;
    var bottom = parseInt(_marginBottom ? _marginBottom.value : 16) || 16;
    var left = parseInt(_marginLeft ? _marginLeft.value : 16) || 16;
    // dummy 用平均值，讓舊程式碼不崩
    var avg = Math.round((top + right + bottom + left) / 4);
    if (_marginDummy) _marginDummy.value = avg;
    if (_marginNumDummy) _marginNumDummy.value = avg;
  }

  if (_marginTop) _marginTop.addEventListener('change', syncMarginsToDummy);
  if (_marginRight) _marginRight.addEventListener('change', syncMarginsToDummy);
  if (_marginBottom) _marginBottom.addEventListener('change', syncMarginsToDummy);
  if (_marginLeft) _marginLeft.addEventListener('change', syncMarginsToDummy);

  // --- 4.2 覆寫 applySettings 以支援四邊邊距 ---
  var _origApplySettings = window.applySettings;
  window.applySettings = function () {
    if (!renderer) return;

    try {
      // 四邊獨立邊距
      var mTop = parseInt(_marginTop ? _marginTop.value : 16) || 16;
      var mRight = parseInt(_marginRight ? _marginRight.value : 16) || 16;
      var mBottom = parseInt(_marginBottom ? _marginBottom.value : 16) || 16;
      var mLeft = parseInt(_marginLeft ? _marginLeft.value : 16) || 16;
      renderer.setMargins(mTop, mRight, mBottom, mLeft);

      var fontSizeEl = document.getElementById('fontSize');
      renderer.setFontSize(parseInt(fontSizeEl ? fontSizeEl.value : 34) || 34);

      var lineHeightEl = document.getElementById('lineHeight');
      renderer.setInterlineSpace(parseInt(lineHeightEl ? lineHeightEl.value : 120) || 120);

      var fontWeightEl = document.getElementById('fontWeight');
      renderer.setFontWeight(parseInt(fontWeightEl ? fontWeightEl.value : 400) || 400);

      // 字型：從 fontSelect 取值
      var selectedFont = _fontSelect ? _fontSelect.value : '';
      if (selectedFont && selectedFont !== 'custom') {
        renderer.setFontFace(selectedFont);
      }

      // 文字對齊：先從 UI 按鈕讀，再同步到 shim
      var activeAlignBtn = document.querySelector('.align-btn.active');
      var alignVal = activeAlignBtn ? activeAlignBtn.getAttribute('data-align') : 'left';
      var textAlignShim = document.getElementById('textAlign');
      if (textAlignShim) textAlignShim.value = alignVal;
      // CREngine: 0=left, 1=right, 2=center, 3=justify
      var alignMap = { left: 0, right: 1, center: 2, justify: 3 };
      renderer.setTextAlign(alignMap[alignVal] !== undefined ? alignMap[alignVal] : 0);

      // 首行縮排：透過 CSS stylesheet 注入
      var indentEl = document.getElementById('indent');
      var indentVal = indentEl ? indentEl.value : '1em';
      if (renderer.setStyleSheet) {
        var indentCss = indentVal === '0'
          ? 'p { text-indent: 0; }'
          : 'p { text-indent: ' + indentVal + '; }';
        renderer.setStyleSheet(indentCss);
      }

      // 斷字
      var hyphenationEl = document.getElementById('hyphenation');
      if (hyphenationEl) {
        var hyphenVal = hyphenationEl.value;
        // 新版 select 的值：none / algorithmic / dictionary
        var hyphenNum = 0;
        if (hyphenVal === 'algorithmic') hyphenNum = 1;
        else if (hyphenVal === 'dictionary') hyphenNum = 2;
        renderer.setHyphenation(hyphenNum);
      }

      // 斷字語言
      var hyphenLangEl = document.getElementById('hyphenationLang');
      if (hyphenLangEl && hyphenLangEl.value && hyphenLangEl.value !== 'auto' && renderer.setHyphenationLanguage) {
        renderer.setHyphenationLanguage(hyphenLangEl.value);
      }

      // 重新分頁
      var pageCount = renderer.getPageCount();
      if (pageCount > 0) {
        totalPages = pageCount;
      }
    } catch (err) {
      console.warn('[app-bridge] 套用設定錯誤：', err);
    }
  };

  // --- 4.3 品質模式同步 ---
  // 新版用 quality-btn 按鈕組，同步到隱藏的 qualityMode select
  var qualityBtns = document.querySelectorAll('.quality-btn');
  var qualityModeEl = document.getElementById('qualityMode');

  function setupQualityButtons() {
    for (var q = 0; q < qualityBtns.length; q++) {
      qualityBtns[q].addEventListener('click', function () {
        // 移除所有 active
        for (var j = 0; j < qualityBtns.length; j++) {
          qualityBtns[j].classList.remove('active');
        }
        this.classList.add('active');

        var quality = this.getAttribute('data-quality');
        if (qualityModeEl) {
          qualityModeEl.value = quality;
          qualityModeEl.dispatchEvent(new Event('change'));
        }
      });
    }
  }
  setupQualityButtons();

  // --- 4.4 文字對齊同步 ---
  // 新版用 align-btn 按鈕組，同步到隱藏的 textAlign select
  var alignBtns = document.querySelectorAll('.align-btn');
  var textAlignEl = document.getElementById('textAlign');

  function setupAlignButtons() {
    for (var a = 0; a < alignBtns.length; a++) {
      alignBtns[a].addEventListener('click', function () {
        for (var j = 0; j < alignBtns.length; j++) {
          alignBtns[j].classList.remove('active');
        }
        this.classList.add('active');

        var align = this.getAttribute('data-align');
        if (textAlignEl) {
          textAlignEl.value = align;
          textAlignEl.dispatchEvent(new Event('change'));
        }

        // 重新套用設定並渲染
        debouncedRender();
      });
    }
  }
  setupAlignButtons();

  // --- 4.5 抖動模式同步 ---
  // 新版 ditherMode select (none/image/full) → 舊版 enableDithering checkbox
  var ditherModeEl = document.getElementById('ditherMode');
  var enableDitheringEl = document.getElementById('enableDithering');
  var ditherStrengthGroupEl = document.getElementById('ditherStrengthGroup');

  if (ditherModeEl) {
    ditherModeEl.addEventListener('change', function () {
      var mode = ditherModeEl.value;
      if (enableDitheringEl) {
        enableDitheringEl.checked = (mode !== 'none');
      }
      // 顯示/隱藏抖動強度
      if (ditherStrengthGroupEl) {
        ditherStrengthGroupEl.style.display = (mode !== 'none') ? 'block' : 'none';
      }
    });
    // 初始同步
    if (enableDitheringEl) {
      enableDitheringEl.checked = (ditherModeEl.value !== 'none');
    }
  }

  // --- 4.6 裝置預設同步 ---
  // 新版的 devicePreset 值跟舊版不同（x4 vs xteink-x4）
  var _devicePreset = document.getElementById('devicePreset');
  if (_devicePreset) {
    // 攔截 change 事件，轉換值
    var origDeviceHandler = null;
    _devicePreset.addEventListener('change', function () {
      var val = _devicePreset.value;
      var customSizeEl = document.getElementById('customSize');

      if (val === 'x4') {
        SCREEN_WIDTH = 480;
        SCREEN_HEIGHT = 800;
        if (customSizeEl) customSizeEl.style.display = 'none';
      } else if (val === 'x3') {
        SCREEN_WIDTH = 528;
        SCREEN_HEIGHT = 792;
        if (customSizeEl) customSizeEl.style.display = 'none';
      } else if (val === 'custom') {
        if (customSizeEl) customSizeEl.style.display = 'block';
        var cw = document.getElementById('customWidth');
        var ch = document.getElementById('customHeight');
        SCREEN_WIDTH = parseInt(cw ? cw.value : 480);
        SCREEN_HEIGHT = parseInt(ch ? ch.value : 800);
      }

      if (typeof updateCanvasSize === 'function') updateCanvasSize();
      debouncedRender();
    });
  }

  // --- 4.7 自訂尺寸同步 ---
  var _customWidth = document.getElementById('customWidth');
  var _customHeight = document.getElementById('customHeight');
  if (_customWidth) {
    _customWidth.addEventListener('change', function () {
      if (_devicePreset && _devicePreset.value === 'custom') {
        SCREEN_WIDTH = parseInt(_customWidth.value) || 480;
        if (typeof updateCanvasSize === 'function') updateCanvasSize();
        debouncedRender();
      }
    });
  }
  if (_customHeight) {
    _customHeight.addEventListener('change', function () {
      if (_devicePreset && _devicePreset.value === 'custom') {
        SCREEN_HEIGHT = parseInt(_customHeight.value) || 800;
        if (typeof updateCanvasSize === 'function') updateCanvasSize();
        debouncedRender();
      }
    });
  }

  // --- 4.8 新版 slider 顯示值同步 ---
  // 新版的 range input 旁邊有 span 顯示值（fontSizeValue 等）
  function bindSliderDisplay(sliderId, displayId) {
    var slider = document.getElementById(sliderId);
    var display = document.getElementById(displayId);
    if (slider && display) {
      slider.addEventListener('input', function () {
        display.textContent = slider.value;
      });
    }
  }

  bindSliderDisplay('fontSize', 'fontSizeValue');
  bindSliderDisplay('fontWeight', 'fontWeightValue');
  bindSliderDisplay('lineHeight', 'lineHeightValue');
  bindSliderDisplay('ditherStrength', 'ditherStrengthValue');
  bindSliderDisplay('brightness', 'brightnessValue');
  bindSliderDisplay('contrast', 'contrastValue');

  // Slider change → applySettings + render
  function bindSliderApply(sliderId) {
    var slider = document.getElementById(sliderId);
    if (slider) {
      slider.addEventListener('change', function () {
        if (window._currentEngine === 'pdfjs') {
          renderPdfCurrentPage();
        } else {
          debouncedRender();
        }
      });
    }
  }

  bindSliderApply('fontSize');
  bindSliderApply('fontWeight');
  bindSliderApply('lineHeight');

  // 邊距 slider → applySettings + render
  ['marginTop', 'marginRight', 'marginBottom', 'marginLeft'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', function () {
        if (window._currentEngine !== 'pdfjs') {
          debouncedRender();
        }
      });
    }
  });

  // --- 4.9 進度條主題切換 → 觸發重繪 ---
  var _progressTheme = document.getElementById('progressTheme');
  if (_progressTheme) {
    _progressTheme.addEventListener('change', function () {
      if (typeof renderCurrentPage === 'function' && window._currentEngine !== 'pdfjs') renderCurrentPage();
    });
  }

  // --- 4.10 頁面背景切換 → 觸發重繪 ---
  var _pageBgStyle = document.getElementById('pageBgStyle');
  if (_pageBgStyle) {
    _pageBgStyle.addEventListener('change', function () {
      if (typeof renderCurrentPage === 'function' && window._currentEngine !== 'pdfjs') renderCurrentPage();
    });
  }
  var _bgOpacitySlider = document.getElementById('bgOpacity');
  if (_bgOpacitySlider) {
    _bgOpacitySlider.addEventListener('change', function () {
      if (typeof renderCurrentPage === 'function' && window._currentEngine !== 'pdfjs') renderCurrentPage();
    });
  }

  // --- 4.11 進度條 checkbox 同步 ---
  var _showProgressLine = document.getElementById('showProgressLine');
  var _showPageNumber = document.getElementById('showPageNumber');
  var _showPercentage = document.getElementById('showPercentage');
  var _showChapterMarks = document.getElementById('showChapterMarks');

  if (_showProgressLine) {
    _showProgressLine.addEventListener('change', function () {
      var enablePB = document.getElementById('enableProgressBar');
      var showBP = document.getElementById('showBookProgress');
      if (enablePB) enablePB.checked = _showProgressLine.checked;
      if (showBP) showBP.checked = _showProgressLine.checked;
      if (typeof renderCurrentPage === 'function' && window._currentEngine !== 'pdfjs') renderCurrentPage();
    });
  }

  if (_showPageNumber) {
    _showPageNumber.addEventListener('change', function () {
      var showXY = document.getElementById('showPageXY');
      if (showXY) showXY.checked = _showPageNumber.checked;
      if (typeof renderCurrentPage === 'function' && window._currentEngine !== 'pdfjs') renderCurrentPage();
    });
  }

  if (_showPercentage) {
    _showPercentage.addEventListener('change', function () {
      var showPct = document.getElementById('showBookPercent');
      if (showPct) showPct.checked = _showPercentage.checked;
      if (typeof renderCurrentPage === 'function' && window._currentEngine !== 'pdfjs') renderCurrentPage();
    });
  }

  if (_showChapterMarks) {
    _showChapterMarks.addEventListener('change', function () {
      if (typeof renderCurrentPage === 'function' && window._currentEngine !== 'pdfjs') renderCurrentPage();
    });
  }


  // ============================================
  // === 五、進度與錯誤訊息 ===
  // ============================================

  /**
   * 中文友善的 alert 替代
   */
  function bridgeAlert(message) {
    console.warn('[app-bridge] 提示：' + message);
    // 使用 alert（未來可替換為自訂 toast）
    alert(message);
  }

  /**
   * 覆寫全域 alert 呼叫中的英文訊息
   * 只攔截 app.js 中常見的英文訊息
   */
  var _origAlert = window.alert;
  window.alert = function (msg) {
    if (typeof msg !== 'string') {
      _origAlert.call(window, msg);
      return;
    }

    // 英→中翻譯對照表
    var translations = {
      'Please select EPUB files': '請選擇要轉換的檔案（支援 EPUB、PDF、MOBI、TXT、Markdown、DOC）',
      'Failed to load WASM module. Please refresh the page.': '排版引擎載入失敗，請重新整理頁面再試一次。',
      'Failed to load EPUB file': '電子書載入失敗，請確認檔案是否完整。',
      'Please load EPUB files first': '請先上傳檔案再操作。',
      'No file loaded': '尚未載入任何檔案。',
      'Export failed': '轉檔失敗，請再試一次。'
    };

    var translated = msg;
    var keys = Object.keys(translations);
    for (var t = 0; t < keys.length; t++) {
      if (msg.indexOf(keys[t]) !== -1) {
        translated = translations[keys[t]];
        break;
      }
    }

    _origAlert.call(window, translated);
  };

  /**
   * 進度顯示：橋接 exportProgress ↔ progressContainer
   */
  function showProgress(text, percent) {
    var exportProgressEl = document.getElementById('exportProgress');
    var progressContainerEl = document.getElementById('progressContainer');
    var fillEl = document.getElementById('progressFill');
    var textEl = document.getElementById('progressText');

    if (exportProgressEl) exportProgressEl.style.display = 'block';
    if (progressContainerEl) progressContainerEl.style.display = 'block';
    if (fillEl) fillEl.style.width = (percent || 0) + '%';
    if (textEl) textEl.textContent = text || '處理中...';
  }

  function hideProgress(delay) {
    setTimeout(function () {
      var exportProgressEl = document.getElementById('exportProgress');
      var progressContainerEl = document.getElementById('progressContainer');
      if (exportProgressEl) exportProgressEl.style.display = 'none';
      if (progressContainerEl) progressContainerEl.style.display = 'none';
    }, delay || 0);
  }

  // 覆寫 exportXTC，讓進度顯示也走 exportProgress
  var _origExportXTC = window.exportXTC;
  window.exportXTC = async function () {
    if (!renderer || totalPages === 0) {
      bridgeAlert('請先載入檔案再匯出。');
      return;
    }

    var qualityModeVal = qualityModeEl ? qualityModeEl.value : 'fast';
    var isHQ = qualityModeVal === 'hq';
    var extension = isHQ ? 'xtch' : 'xtc';
    var originalName = loadedFiles[currentFileIndex] ? loadedFiles[currentFileIndex].name : 'output';
    var filename = originalName.replace(/\.[^.]+$/, '.' + extension);

    showProgress('準備匯出...', 0);

    try {
      var xtcData = await generateXTC(function (progress, page) {
        showProgress('正在處理第 ' + page + ' 頁，共 ' + totalPages + ' 頁', progress);
      });

      downloadFile(xtcData, filename);
      showProgress('轉檔完成！', 100);
      hideProgress(2000);

    } catch (err) {
      console.error('[app-bridge] 匯出失敗：', err);
      showProgress('轉檔失敗：' + (err.message || String(err)), 0);
      hideProgress(3000);
    }
  };

  // 覆寫 exportCurrentPage 的進度訊息
  var _origExportCurrentPage = window.exportCurrentPage;
  window.exportCurrentPage = async function () {
    if (!renderer) {
      bridgeAlert('請先載入檔案再匯出。');
      return;
    }

    showProgress('正在處理頁面...', 50);
    try {
      var qualityModeVal = qualityModeEl ? qualityModeEl.value : 'fast';
      var isHQ = qualityModeVal === 'hq';
      var pageData = await renderPageForExport(currentPage);
      var filename = 'page_' + (currentPage + 1) + '.' + (isHQ ? 'xth' : 'xtg');
      downloadFile(pageData, filename);
      showProgress('頁面匯出完成！', 100);
      hideProgress(2000);
    } catch (err) {
      console.error('[app-bridge] 頁面匯出失敗：', err);
      showProgress('頁面匯出失敗：' + (err.message || String(err)), 0);
      hideProgress(3000);
    }
  };

  // 覆寫 renderCurrentPage 讓頁面資訊顯示中文
  var _origRenderCurrentPage = window.renderCurrentPage;
  window.renderCurrentPage = function () {
    // PDF 走獨立管線
    if (window._currentEngine === 'pdfjs') {
      renderPdfCurrentPage();
      return;
    }

    // 呼叫原版渲染
    if (_origRenderCurrentPage) {
      _origRenderCurrentPage.call(window);
    }

    // 覆寫頁面資訊為中文
    var pageInfoEl = document.getElementById('pageInfo');
    if (pageInfoEl && totalPages > 0) {
      pageInfoEl.textContent = '第 ' + (currentPage + 1) + ' 頁 / 共 ' + totalPages + ' 頁';
    }

    // 更新導航按鈕
    updateNavButtons();

    // 隱藏空狀態
    var emptyState = document.getElementById('emptyState');
    if (emptyState && totalPages > 0) {
      emptyState.style.display = 'none';
    }
  };

  // 覆寫 clearPreview 讓訊息顯示中文
  var _origClearPreview = window.clearPreview;
  window.clearPreview = function () {
    var canvas = document.getElementById('previewCanvas');
    if (canvas) {
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    }

    var bookTitleEl = document.getElementById('bookTitle');
    var bookAuthorEl = document.getElementById('bookAuthor');
    var bookPagesEl = document.getElementById('bookPages');
    var pageInfoEl = document.getElementById('pageInfo');

    if (bookTitleEl) bookTitleEl.textContent = '—';
    if (bookAuthorEl) bookAuthorEl.textContent = '—';
    if (bookPagesEl) bookPagesEl.textContent = '—';
    if (pageInfoEl) pageInfoEl.textContent = '尚未載入書籍';

    if (typeof showNoChaptersMessage === 'function') showNoChaptersMessage();

    // 停用匯出按鈕
    disableExportButtons();

    // 隱藏資訊區塊
    hideSection('bookInfoSection');
    hideSection('chaptersSection');

    // 顯示空狀態
    var emptyState = document.getElementById('emptyState');
    if (emptyState) emptyState.style.display = 'flex';

    window._currentEngine = null;
    window._currentPdfDoc = null;
  };


  // ============================================
  // === 六、初始化覆寫 ===
  // ============================================

  // --- 6.1 導航按鈕：橋接 prevPageBtn / nextPageBtn ---
  if (_prevPageBtn) {
    _prevPageBtn.addEventListener('click', function () {
      if (currentPage > 0) {
        currentPage--;
        if (window._currentEngine === 'pdfjs') {
          renderPdfCurrentPage();
        } else if (typeof renderCurrentPage === 'function') {
          renderCurrentPage();
        }
      }
    });
  }

  if (_nextPageBtn) {
    _nextPageBtn.addEventListener('click', function () {
      if (currentPage < totalPages - 1) {
        currentPage++;
        if (window._currentEngine === 'pdfjs') {
          renderPdfCurrentPage();
        } else if (typeof renderCurrentPage === 'function') {
          renderCurrentPage();
        }
      }
    });
  }

  // --- 6.2 匯出按鈕：橋接 exportXtcBtn ---
  if (_exportXtcBtn) {
    _exportXtcBtn.addEventListener('click', function () {
      if (typeof exportXTC === 'function') exportXTC();
    });
  }

  if (_exportPageBtn) {
    // 新版 exportPageBtn 已存在，確保事件正確
    _exportPageBtn.addEventListener('click', function () {
      if (typeof exportCurrentPage === 'function') exportCurrentPage();
    });
  }

  // --- 6.2b 批次轉換（多檔一鍵轉 → ZIP 下載）---
  var _batchExportBtnEl = document.getElementById('batchExportBtn');
  if (_batchExportBtnEl) {
    _batchExportBtnEl.addEventListener('click', async function () {
      if (!loadedFiles || loadedFiles.length < 2) return;

      var qualityModeVal = qualityModeEl ? qualityModeEl.value : 'fast';
      var isHQ = qualityModeVal === 'hq';
      var extension = isHQ ? 'xtch' : 'xtc';
      var zip = new JSZip();
      var totalFiles = loadedFiles.length;
      var successCount = 0;
      var failedFiles = [];

      // 停用按鈕避免重複點擊
      _batchExportBtnEl.disabled = true;
      _batchExportBtnEl.innerHTML = '<i data-lucide="loader"></i> 轉換中...';

      showProgress('批次轉換準備中...', 0);

      for (var fi = 0; fi < totalFiles; fi++) {
        var fileName = loadedFiles[fi].name;
        var fileLabel = fileName.length > 20 ? fileName.substring(0, 17) + '...' : fileName;

        showProgress('正在轉換 ' + (fi + 1) + '/' + totalFiles + '：' + fileLabel, (fi / totalFiles) * 100);

        try {
          // 載入這個檔案
          await bridgeSwitchToFile(fi);

          // 等一下讓 CREngine 完成分頁
          await new Promise(function (r) { setTimeout(r, 100); });

          if (!renderer || totalPages === 0) {
            failedFiles.push(fileName + '（載入失敗）');
            continue;
          }

          // 逐頁渲染
          var xtcData = await generateXTC(function (progress, page) {
            var fileProgress = fi / totalFiles;
            var pageProgress = (progress / 100) / totalFiles;
            var overall = (fileProgress + pageProgress) * 100;
            showProgress(
              '正在轉換 ' + (fi + 1) + '/' + totalFiles + '：' + fileLabel +
              '（第 ' + page + '/' + totalPages + ' 頁）',
              overall
            );
          });

          // 加入 ZIP
          var outName = fileName.replace(/\.[^.]+$/, '.' + extension);
          zip.file(outName, xtcData);
          successCount++;

        } catch (err) {
          console.error('[batch] 轉換失敗：' + fileName, err);
          failedFiles.push(fileName + '（' + (err.message || '未知錯誤') + '）');
        }
      }

      // 打包 ZIP 並下載
      if (successCount > 0) {
        showProgress('正在打包 ZIP...', 95);
        try {
          var zipBlob = await zip.generateAsync({ type: 'blob' });
          var zipName = 'xtc_batch_' + successCount + 'books.zip';
          triggerDownload(zipBlob, zipName);
          showProgress('批次轉換完成！' + successCount + ' 本成功' + (failedFiles.length > 0 ? '、' + failedFiles.length + ' 本失敗' : ''), 100);
        } catch (zipErr) {
          showProgress('ZIP 打包失敗：' + zipErr.message, 0);
        }
      } else {
        showProgress('全部轉換失敗', 0);
      }

      // 如果有失敗的，列出來
      if (failedFiles.length > 0) {
        console.warn('[batch] 失敗清單：', failedFiles);
      }

      // 恢復按鈕
      _batchExportBtnEl.disabled = false;
      _batchExportBtnEl.innerHTML = '<i data-lucide="archive"></i> 批次轉換全部';
      if (typeof lucide !== 'undefined') lucide.createIcons();

      hideProgress(3000);

      // 切回第一個檔案
      await bridgeSwitchToFile(0);
    });
  }

  // --- 6.2c 逐個下載按鈕 ---
  var _exportAllOneByOneEl = document.getElementById('exportAllOneByOne');
  if (_exportAllOneByOneEl) {
    _exportAllOneByOneEl.addEventListener('click', async function () {
      if (!loadedFiles || loadedFiles.length === 0) return;
      showProgress('逐個轉換中...', 0);
      for (var fi = 0; fi < loadedFiles.length; fi++) {
        showProgress('正在轉換 ' + (fi + 1) + '/' + loadedFiles.length + '：' + loadedFiles[fi].name, (fi / loadedFiles.length) * 100);
        await bridgeSwitchToFile(fi);
        await new Promise(function (r) { setTimeout(r, 100); });
        if (typeof exportXTC === 'function') {
          await new Promise(function (resolve) {
            var origDl = window.downloadFile;
            window.downloadFile = function (data, filename) {
              origDl(data, filename);
              window.downloadFile = origDl;
              resolve();
            };
            exportXTC();
          });
        }
      }
      showProgress('全部下載完成！', 100);
      hideProgress(2000);
      await bridgeSwitchToFile(0);
    });
  }

  // --- 6.2d 打包 ZIP 按鈕 ---
  var _exportAllBtnEl = document.getElementById('exportAllBtn');
  if (_exportAllBtnEl) {
    _exportAllBtnEl.addEventListener('click', function () {
      if (typeof exportAllFiles === 'function') exportAllFiles();
    });
  }

  // --- 6.3 字型選擇：fontSelect → loadGoogleFont ---
  if (_fontSelect) {
    _fontSelect.addEventListener('change', async function () {
      var fontKey = _fontSelect.value;

      if (fontKey === 'custom') {
        // 觸發自訂字型上傳
        if (_fontFileInput) _fontFileInput.click();
        return;
      }

      // 載入字型
      if (!loadedFonts.has(fontKey)) {
        showProgress('正在載入字型：' + (FONT_CONFIG[fontKey] ? FONT_CONFIG[fontKey].name : fontKey) + '...', 50);

        var success = await window.loadGoogleFont(fontKey);

        if (success) {
          showProgress('字型載入完成', 100);
          debouncedRender();
        } else {
          showProgress('字型載入失敗', 0);
        }

        hideProgress(1500);
      } else {
        debouncedRender();
      }
    });
  }

  // --- 6.4 自訂字型上傳：fontFileInput ---
  if (_fontFileInput) {
    _fontFileInput.addEventListener('change', async function (e) {
      var file = e.target.files[0];
      if (!file) return;

      if (!Module || !renderer) {
        bridgeAlert('排版引擎尚未就緒，請稍候再試');
        return;
      }

      showProgress('正在載入自訂字型：' + file.name + '...', 50);

      try {
        var data = new Uint8Array(await file.arrayBuffer());
        var ptr = Module.allocateMemory(data.length);
        Module.HEAPU8.set(data, ptr);
        // 註冊時用去掉副檔名的名字，跟 setFontFace 一致
        var fontName = file.name.replace(/\.(ttf|otf)$/i, '');
        renderer.registerFontFromMemory(ptr, data.length, fontName);
        Module.freeMemory(ptr);

        // 在 fontSelect 新增選項
        if (_fontSelect) {
          var option = document.createElement('option');
          option.value = fontName;
          option.textContent = file.name + '（自訂）';
          _fontSelect.appendChild(option);
          _fontSelect.value = option.value;
        }

        showProgress('自訂字型載入完成', 100);
        // 直接套用（不走 debounce，確保字型立刻生效）
        if (typeof applySettings === 'function') applySettings();
        if (typeof renderCurrentPage === 'function') renderCurrentPage();
        hideProgress(1500);

      } catch (err) {
        console.error('[app-bridge] 自訂字型載入失敗：', err);
        showProgress('自訂字型載入失敗', 0);
        hideProgress(2000);
      }
    });
  }

  // --- 6.5 上傳字型按鈕 ---
  var _uploadFontBtn = document.getElementById('uploadFontBtn');
  if (_uploadFontBtn && _fontFileInput) {
    _uploadFontBtn.addEventListener('click', function () {
      _fontFileInput.click();
    });
  }

  // --- 6.6 檔案接受範圍：更新 fileInput 的 accept ---
  var _fileInput = document.getElementById('fileInput');
  if (_fileInput && typeof getAllAcceptedExtensions === 'function') {
    _fileInput.setAttribute('accept', getAllAcceptedExtensions());
  }

  // --- 6.7 首行縮排 change ---
  var _indent = document.getElementById('indent');
  if (_indent) {
    _indent.addEventListener('change', function () {
      if (typeof applySettings === 'function') applySettings();
      if (typeof renderCurrentPage === 'function' && window._currentEngine !== 'pdfjs') renderCurrentPage();
    });
  }

  // --- 6.8 斷字 change ---
  var _hyphenation = document.getElementById('hyphenation');
  if (_hyphenation) {
    _hyphenation.addEventListener('change', function () {
      if (typeof applySettings === 'function') applySettings();
      if (typeof renderCurrentPage === 'function' && window._currentEngine !== 'pdfjs') renderCurrentPage();
    });
  }

  // --- 6.8 負片模式 change ---
  if (_negativeMode) {
    _negativeMode.addEventListener('change', function () {
      if (typeof renderCurrentPage === 'function') renderCurrentPage();
    });
  }

  // --- 6.9 快速預設 ---
  window.applyPreset = function (preset) {
    switch (preset) {
      case 'novel':
        // 小說模式：思源宋體、字大行鬆、不抖動、靠左對齊（避免中文兩端對齊空隙）
        setSelectValue('fontSelect', 'NotoSerifTC');
        setSliderValue('fontSize', 34, 'fontSizeValue');
        setSliderValue('lineHeight', 130, 'lineHeightValue');
        setSliderValue('fontWeight', 400, 'fontWeightValue');
        setAlignActive('left');
        setQualityActive('fast');
        setSelectValue('ditherMode', 'none');
        setSliderValue('ditherStrength', 0, 'ditherStrengthValue');
        setMargins(16, 16, 16, 16);
        setSelectValue('indent', '2em');
        setSelectValue('hyphenation', 'algorithmic');
        break;

      case 'comic':
        // 漫畫模式：灰階高清、全頁抖動 50%、圖片滿版零邊距
        setSelectValue('fontSelect', 'NotoSansTC');
        setSliderValue('fontSize', 28, 'fontSizeValue');
        setSliderValue('lineHeight', 120, 'lineHeightValue');
        setAlignActive('left');
        setQualityActive('hq');
        setSelectValue('ditherMode', 'full');
        setSliderValue('ditherStrength', 50, 'ditherStrengthValue');
        setMargins(0, 0, 0, 0);
        setSelectValue('indent', '0');
        break;

      case 'document':
        // 文件模式：思源黑體、字小行緊、僅圖片抖動、塞更多內容
        setSelectValue('fontSelect', 'NotoSansTC');
        setSliderValue('fontSize', 28, 'fontSizeValue');
        setSliderValue('lineHeight', 110, 'lineHeightValue');
        setSliderValue('fontWeight', 400, 'fontWeightValue');
        setAlignActive('justify');
        setQualityActive('fast');
        setSelectValue('ditherMode', 'image');
        setSliderValue('ditherStrength', 20, 'ditherStrengthValue');
        setMargins(12, 12, 12, 12);
        setSelectValue('indent', '0');
        setSelectValue('hyphenation', 'none');
        break;
    }

    // 觸發字型載入與重新渲染
    if (_fontSelect) _fontSelect.dispatchEvent(new Event('change'));
    syncMarginsToDummy();
    syncDitherMode();
    debouncedRender();
  };

  // --- 6.10 匯出/匯入設定 ---
  window.exportConfig = function () {
    var config = {
      device: _devicePreset ? _devicePreset.value : 'x4',
      font: _fontSelect ? _fontSelect.value : 'NotoSerifTC',
      fontSize: getElValue('fontSize', 34),
      fontWeight: getElValue('fontWeight', 400),
      lineHeight: getElValue('lineHeight', 120),
      margins: {
        top: getElValue('marginTop', 16),
        right: getElValue('marginRight', 16),
        bottom: getElValue('marginBottom', 16),
        left: getElValue('marginLeft', 16)
      },
      textAlign: textAlignEl ? textAlignEl.value : 'justify',
      indent: getElValue('indent', '1em'),
      hyphenation: _hyphenation ? _hyphenation.value : 'algorithmic',
      quality: qualityModeEl ? qualityModeEl.value : 'fast',
      ditherMode: ditherModeEl ? ditherModeEl.value : 'full',
      ditherStrength: getElValue('ditherStrength', 20),
      negative: _negativeMode ? _negativeMode.checked : false,
      showProgressLine: _showProgressLine ? _showProgressLine.checked : true,
      showChapterMarks: _showChapterMarks ? _showChapterMarks.checked : false,
      showPageNumber: _showPageNumber ? _showPageNumber.checked : true,
      showPercentage: _showPercentage ? _showPercentage.checked : false,
      progressPosition: getElValue('progressPosition', 'bottom')
    };

    var json = JSON.stringify(config, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    downloadFile(blob, 'xtc-config.json');
  };

  window.importConfig = function () {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;

      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var config = JSON.parse(ev.target.result);
          applyConfig(config);
          bridgeAlert('設定匯入完成');
        } catch (err) {
          bridgeAlert('設定檔格式錯誤：' + err.message);
        }
      };
      reader.readAsText(file);
    });
    input.click();
  };

  function applyConfig(config) {
    if (config.device) setSelectValue('devicePreset', config.device);
    if (config.font) setSelectValue('fontSelect', config.font);
    if (config.fontSize) setSliderValue('fontSize', config.fontSize, 'fontSizeValue');
    if (config.fontWeight) setSliderValue('fontWeight', config.fontWeight, 'fontWeightValue');
    if (config.lineHeight) setSliderValue('lineHeight', config.lineHeight, 'lineHeightValue');
    if (config.margins) {
      setMargins(config.margins.top, config.margins.right, config.margins.bottom, config.margins.left);
    }
    if (config.textAlign) setAlignActive(config.textAlign);
    if (config.indent) setSelectValue('indent', config.indent);
    if (config.hyphenation) setSelectValue('hyphenation', config.hyphenation);
    if (config.quality) setQualityActive(config.quality);
    if (config.ditherMode) {
      setSelectValue('ditherMode', config.ditherMode);
      syncDitherMode();
    }
    if (config.ditherStrength !== undefined) setSliderValue('ditherStrength', config.ditherStrength, 'ditherStrengthValue');
    if (config.negative !== undefined && _negativeMode) _negativeMode.checked = config.negative;
    if (config.showProgressLine !== undefined && _showProgressLine) _showProgressLine.checked = config.showProgressLine;
    if (config.showChapterMarks !== undefined && _showChapterMarks) _showChapterMarks.checked = config.showChapterMarks;
    if (config.showPageNumber !== undefined && _showPageNumber) _showPageNumber.checked = config.showPageNumber;
    if (config.showPercentage !== undefined && _showPercentage) _showPercentage.checked = config.showPercentage;
    if (config.progressPosition) setSelectValue('progressPosition', config.progressPosition);

    // 觸發裝置變更
    if (_devicePreset) _devicePreset.dispatchEvent(new Event('change'));
    // 觸發字型載入
    if (_fontSelect) _fontSelect.dispatchEvent(new Event('change'));

    syncMarginsToDummy();
  }


  // ============================================
  // === 輔助函式 ===
  // ============================================

  function updateBookInfo(title, author, pages) {
    var bookTitleEl = document.getElementById('bookTitle');
    var bookAuthorEl = document.getElementById('bookAuthor');
    var bookPagesEl = document.getElementById('bookPages');

    if (bookTitleEl) bookTitleEl.textContent = title || '—';
    if (bookAuthorEl) bookAuthorEl.textContent = author || '—';
    if (bookPagesEl) bookPagesEl.textContent = pages ? (pages + ' 頁') : '—';
  }

  function showSection(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'block';
  }

  function hideSection(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  function enableExportButtons() {
    if (_exportXtcBtn) _exportXtcBtn.disabled = false;
    if (_exportPageBtn) _exportPageBtn.disabled = false;
    var exportBtnEl = document.getElementById('exportBtn');
    if (exportBtnEl) exportBtnEl.disabled = false;
    var batchBtn = document.getElementById('batchExportBtn');
    if (batchBtn) batchBtn.disabled = false;
  }

  function disableExportButtons() {
    if (_exportXtcBtn) _exportXtcBtn.disabled = true;
    if (_exportPageBtn) _exportPageBtn.disabled = true;
    var exportBtnEl = document.getElementById('exportBtn');
    if (exportBtnEl) exportBtnEl.disabled = true;
    var batchBtn = document.getElementById('batchExportBtn');
    if (batchBtn) batchBtn.disabled = true;
  }

  function updateNavButtons() {
    if (_prevPageBtn) _prevPageBtn.disabled = (currentPage === 0);
    if (_nextPageBtn) _nextPageBtn.disabled = (currentPage >= totalPages - 1);

    var prevBtnEl = document.getElementById('prevBtn');
    var nextBtnEl = document.getElementById('nextBtn');
    if (prevBtnEl) prevBtnEl.disabled = (currentPage === 0);
    if (nextBtnEl) nextBtnEl.disabled = (currentPage >= totalPages - 1);
  }

  function setSelectValue(id, value) {
    var el = document.getElementById(id);
    if (el) el.value = value;
  }

  function setSliderValue(sliderId, value, displayId) {
    var slider = document.getElementById(sliderId);
    var display = displayId ? document.getElementById(displayId) : null;
    if (slider) slider.value = value;
    if (display) display.textContent = value;
  }

  function setAlignActive(align) {
    if (textAlignEl) textAlignEl.value = align;
    for (var i = 0; i < alignBtns.length; i++) {
      alignBtns[i].classList.remove('active');
      if (alignBtns[i].getAttribute('data-align') === align) {
        alignBtns[i].classList.add('active');
      }
    }
  }

  function setQualityActive(quality) {
    if (qualityModeEl) qualityModeEl.value = quality;
    for (var i = 0; i < qualityBtns.length; i++) {
      qualityBtns[i].classList.remove('active');
      if (qualityBtns[i].getAttribute('data-quality') === quality) {
        qualityBtns[i].classList.add('active');
      }
    }
  }

  function setMargins(top, right, bottom, left) {
    if (_marginTop) _marginTop.value = top;
    if (_marginRight) _marginRight.value = right;
    if (_marginBottom) _marginBottom.value = bottom;
    if (_marginLeft) _marginLeft.value = left;
    syncMarginsToDummy();
  }

  function syncDitherMode() {
    if (ditherModeEl && enableDitheringEl) {
      enableDitheringEl.checked = (ditherModeEl.value !== 'none');
    }
    if (ditherStrengthGroupEl && ditherModeEl) {
      ditherStrengthGroupEl.style.display = (ditherModeEl.value !== 'none') ? 'block' : 'none';
    }
  }

  function getElValue(id, defaultVal) {
    var el = document.getElementById(id);
    if (!el) return defaultVal;
    if (el.type === 'checkbox') return el.checked;
    return el.value || defaultVal;
  }

  // --- 螢幕方向按鈕修正 ---
  // 新版 HTML 用 data-orient，舊版用 data-orientation
  var orientBtns = document.querySelectorAll('.orient-btn');
  for (var ob = 0; ob < orientBtns.length; ob++) {
    orientBtns[ob].addEventListener('click', function () {
      for (var j = 0; j < orientBtns.length; j++) {
        orientBtns[j].classList.remove('active');
      }
      this.classList.add('active');

      var rotation = parseInt(this.getAttribute('data-orient') || this.getAttribute('data-orientation') || '0');
      if (typeof updateOrientation === 'function') {
        updateOrientation(rotation);
      }
    });
  }

  // ============================================
  // === 七、章節目錄編輯 ===
  // ============================================

  // HTML 實體解碼（章節名常含 &middot; 等實體）
  var _decodeEl = document.createElement('textarea');
  function decodeHtmlEntities(str) {
    if (!str || str.indexOf('&') === -1) return str;
    _decodeEl.innerHTML = str;
    return _decodeEl.value;
  }

  // 自訂章節清單（覆蓋 CREngine 的 TOC）
  window._customToc = null; // null = 用原始 TOC，陣列 = 用自訂的

  /**
   * 渲染章節清單 UI（支援編輯）
   */
  function renderChapterListUI() {
    var listEl = document.getElementById('chapterList');
    if (!listEl) return;

    var toc = window._customToc || currentToc || [];
    listEl.innerHTML = '';

    if (toc.length === 0) {
      listEl.innerHTML = '<p style="color:#888; font-size:13px; text-align:center; padding:8px;">尚未偵測到章節</p>';
      return;
    }

    for (var i = 0; i < toc.length; i++) {
      var ch = toc[i];
      var item = document.createElement('div');
      item.className = 'chapter-edit-item';
      item.setAttribute('data-index', i);
      item.style.cssText = 'display:flex; align-items:center; gap:6px; padding:6px 0; border-bottom:1px solid rgba(212,165,165,0.1);';

      // 章節名（可編輯）— 先解碼 HTML 實體
      var rawTitle = ch.title || ch.name || '(未命名)';
      var decodedTitle = decodeHtmlEntities(rawTitle);
      var nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = decodedTitle;
      nameInput.className = 'chapter-name-input';
      nameInput.style.cssText = 'flex:1; border:1px solid transparent; background:transparent; font-size:13px; font-family:inherit; padding:4px 6px; border-radius:6px; color:#4A4A4A;';
      nameInput.setAttribute('data-index', i);
      nameInput.addEventListener('focus', function() { this.style.borderColor = '#D4A5A5'; this.style.background = '#fff'; });
      nameInput.addEventListener('blur', function() {
        this.style.borderColor = 'transparent';
        this.style.background = 'transparent';
        var idx = parseInt(this.getAttribute('data-index'));
        updateChapterName(idx, this.value);
      });

      // 頁碼
      var pageSpan = document.createElement('span');
      pageSpan.style.cssText = 'font-size:11px; color:#AAA; min-width:30px; text-align:right;';
      pageSpan.textContent = 'p.' + ((ch.page || ch.startPage || 0) + 1);

      // 點擊跳轉
      pageSpan.style.cursor = 'pointer';
      pageSpan.setAttribute('data-page', ch.page || ch.startPage || 0);
      pageSpan.addEventListener('click', function() {
        var page = parseInt(this.getAttribute('data-page'));
        if (!isNaN(page)) {
          currentPage = page;
          if (typeof renderCurrentPage === 'function') renderCurrentPage();
        }
      });

      // 刪除按鈕
      var delBtn = document.createElement('button');
      delBtn.style.cssText = 'background:none; border:none; color:#C9929A; cursor:pointer; font-size:14px; padding:2px 4px; border-radius:4px;';
      delBtn.innerHTML = '&times;';
      delBtn.setAttribute('data-index', i);
      delBtn.addEventListener('click', function() {
        var idx = parseInt(this.getAttribute('data-index'));
        removeChapter(idx);
      });

      item.appendChild(nameInput);
      item.appendChild(pageSpan);
      item.appendChild(delBtn);
      listEl.appendChild(item);
    }
  }

  function updateChapterName(index, newName) {
    ensureCustomToc();
    if (window._customToc[index]) {
      window._customToc[index].title = newName;
      window._customToc[index].name = newName;
    }
  }

  function removeChapter(index) {
    ensureCustomToc();
    window._customToc.splice(index, 1);
    renderChapterListUI();
    // 同步到 currentToc
    if (typeof currentToc !== 'undefined') {
      currentToc.length = 0;
      for (var i = 0; i < window._customToc.length; i++) {
        currentToc.push(window._customToc[i]);
      }
    }
  }

  window.addChapter = function() {
    ensureCustomToc();
    var page = typeof currentPage !== 'undefined' ? currentPage : 0;
    var name = prompt('輸入章節名稱：', '新章節');
    if (!name) return;
    window._customToc.push({ title: name, name: name, page: page, startPage: page });
    // 按頁碼排序
    window._customToc.sort(function(a, b) { return (a.page || a.startPage || 0) - (b.page || b.startPage || 0); });
    renderChapterListUI();
    // 同步
    if (typeof currentToc !== 'undefined') {
      currentToc.length = 0;
      for (var i = 0; i < window._customToc.length; i++) {
        currentToc.push(window._customToc[i]);
      }
    }
  };

  window.redetectChapters = function() {
    window._customToc = null;
    // 重新從 CREngine 取 TOC
    if (typeof renderer !== 'undefined' && renderer && renderer.getToc) {
      try {
        var rawToc = renderer.getToc();
        if (rawToc && typeof rawToc === 'string') {
          rawToc = JSON.parse(rawToc);
        }
        if (Array.isArray(rawToc)) {
          currentToc = rawToc;
        }
      } catch (e) {}
    }
    renderChapterListUI();
  };

  function ensureCustomToc() {
    if (!window._customToc) {
      // 從 currentToc 複製一份
      window._customToc = [];
      var src = (typeof currentToc !== 'undefined' && currentToc) ? currentToc : [];
      for (var i = 0; i < src.length; i++) {
        window._customToc.push({
          title: src[i].title || src[i].name || '',
          name: src[i].title || src[i].name || '',
          page: src[i].page || src[i].startPage || 0,
          startPage: src[i].page || src[i].startPage || 0,
        });
      }
    }
  }

  // 覆寫原版的章節列表渲染（直接用可編輯版本，不走原版）
  window.updateChapterList = function() {
    renderChapterListUI();
  };
  window.showChapters = function() {
    renderChapterListUI();
  };

  // ============================================
  // === 八、進度條主題攔截 ===
  // ============================================
  // 避免原版 drawStatusBar 與自訂主題衝突（兩層疊在一起）
  // 選了自訂主題時，攔截原版呼叫，改用 drawCustomStatusBar

  // 取得目前選擇的主題
  function getSelectedTheme() {
    var el = document.getElementById('progressTheme');
    return el ? el.value : 'theme-1';
  }

  // 保存原版函式的參照
  var _originalDrawStatusBar = window.drawStatusBar;
  var _originalDrawProgressBar = window.drawProgressBar;

  // 取得頁面背景設定
  function getPageBgOptions() {
    var bgStyle = document.getElementById('pageBgStyle');
    var bgOpacity = document.getElementById('bgOpacity');
    return {
      bgId: bgStyle ? bgStyle.value : 'none',
      opacity: bgOpacity ? parseInt(bgOpacity.value) : 30,
    };
  }

  // 覆寫預覽用的 drawStatusBar（先畫背景，再畫進度條）
  window.drawStatusBar = function (imageData) {
    // 1. 畫頁面背景/邊框
    var bgOpts = getPageBgOptions();
    if (bgOpts.bgId !== 'none' && typeof drawPageBackground === 'function') {
      drawPageBackground(imageData, bgOpts.bgId, bgOpts);
    }

    // 2. 畫進度條
    var theme = getSelectedTheme();
    if (typeof drawCustomStatusBar === 'function' && drawCustomStatusBar(imageData, currentPage, totalPages, getCurrentChapterInfo(), theme)) {
      return;
    }
    if (typeof _originalDrawStatusBar === 'function') {
      _originalDrawStatusBar(imageData);
    }
  };

  // 覆寫匯出用的 drawProgressBar（先畫背景，再畫進度條）
  window.drawProgressBar = function (imageData, pageNum) {
    // 1. 畫頁面背景/邊框
    var bgOpts = getPageBgOptions();
    if (bgOpts.bgId !== 'none' && typeof drawPageBackground === 'function') {
      drawPageBackground(imageData, bgOpts.bgId, bgOpts);
    }

    // 2. 畫進度條
    var theme = getSelectedTheme();
    var chapterInfo = (typeof getChapterInfoForPage === 'function') ? getChapterInfoForPage(pageNum) : {};
    if (typeof drawCustomStatusBar === 'function' && drawCustomStatusBar(imageData, pageNum, totalPages, chapterInfo, theme)) {
      return;
    }
    if (typeof _originalDrawProgressBar === 'function') {
      _originalDrawProgressBar(imageData, pageNum);
    }
  };

  // ============================================
  // === 八、再次下載功能 ===
  // ============================================
  // 轉檔完成後暫存結果，讓使用者可以重新下載

  var _lastExportData = null;  // { blob: Blob, filename: string, timestamp: Date }
  var _exportHistory = [];     // 最近 5 筆匯出紀錄

  // 覆寫原版 downloadFile，攔截存一份
  var _originalDownloadFile = window.downloadFile;
  window.downloadFile = function (data, filename) {
    var blob = data instanceof Blob ? data : new Blob([data]);

    // 存到暫存
    _lastExportData = { blob: blob, filename: filename, timestamp: new Date() };

    // 存到歷史（最多 5 筆，舊的先丟）
    _exportHistory.unshift({ blob: blob, filename: filename, timestamp: new Date() });
    if (_exportHistory.length > 5) {
      // 釋放最舊的 blob 記憶體
      _exportHistory.pop();
    }

    // 顯示「再次下載」按鈕
    showRedownloadUI(filename);

    // 執行原版下載
    if (typeof _originalDownloadFile === 'function') {
      _originalDownloadFile(data, filename);
    } else {
      // fallback：自己做下載
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    }
  };

  /**
   * 顯示「再次下載」UI
   */
  function showRedownloadUI(filename) {
    // 找或建立再次下載區域
    var container = document.getElementById('redownloadArea');
    if (!container) {
      container = document.createElement('div');
      container.id = 'redownloadArea';
      container.style.cssText = 'margin-top:12px; padding:12px 16px; background:rgba(212,165,165,0.08); border-radius:12px; text-align:center;';

      // 插在匯出進度條下方
      var exportProgress = document.getElementById('exportProgress');
      if (exportProgress && exportProgress.parentNode) {
        exportProgress.parentNode.insertBefore(container, exportProgress.nextSibling);
      } else {
        // fallback：插在 preview area 底部
        var previewArea = document.querySelector('.preview-area');
        if (previewArea) previewArea.appendChild(container);
      }
    }

    container.innerHTML = '';
    container.style.display = 'block';

    // 完成提示
    var msg = document.createElement('p');
    msg.style.cssText = 'margin:0 0 8px 0; font-size:14px; color:#4A4A4A;';
    msg.textContent = '轉檔完成！如果沒收到檔案，按下面的按鈕再下載一次。';
    container.appendChild(msg);

    // 再次下載按鈕
    var btn = document.createElement('button');
    btn.style.cssText = 'background:linear-gradient(135deg,#D4A5A5,#B8A9C9); color:#fff; border:none; border-radius:24px; padding:10px 24px; font-size:14px; font-weight:500; cursor:pointer; font-family:inherit; min-height:44px;';
    btn.innerHTML = '<span style="margin-right:6px;">&#8681;</span> 再次下載 ' + filename;
    btn.addEventListener('click', function () {
      redownloadLast();
    });
    container.appendChild(btn);

    // 歷史紀錄（超過 1 筆才顯示）
    if (_exportHistory.length > 1) {
      var historyLabel = document.createElement('p');
      historyLabel.style.cssText = 'margin:12px 0 4px 0; font-size:12px; color:#888;';
      historyLabel.textContent = '最近的轉檔紀錄：';
      container.appendChild(historyLabel);

      for (var i = 0; i < _exportHistory.length && i < 5; i++) {
        var item = _exportHistory[i];
        var link = document.createElement('a');
        link.href = '#';
        link.style.cssText = 'display:block; font-size:13px; color:#6D5954; padding:4px 0; text-decoration:none;';
        link.textContent = item.filename + ' (' + formatFileSize(item.blob.size) + ')';
        link.setAttribute('data-index', i);
        link.addEventListener('click', function (e) {
          e.preventDefault();
          var idx = parseInt(this.getAttribute('data-index'));
          redownloadByIndex(idx);
        });
        container.appendChild(link);
      }
    }
  }

  /**
   * 再次下載最近一筆
   */
  function redownloadLast() {
    if (!_lastExportData) {
      bridgeAlert('沒有可下載的檔案，請重新轉檔。');
      return;
    }
    triggerDownload(_lastExportData.blob, _lastExportData.filename);
  }

  /**
   * 下載歷史紀錄中的某筆
   */
  function redownloadByIndex(index) {
    if (index < 0 || index >= _exportHistory.length) return;
    var item = _exportHistory[index];
    triggerDownload(item.blob, item.filename);
  }

  /**
   * 觸發瀏覽器下載（不經過攔截）
   */
  function triggerDownload(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // iOS Safari 需要延遲釋放
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  /**
   * 格式化檔案大小
   */
  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // 掛到全域讓外部也能用
  window.redownloadLast = redownloadLast;
  window.redownloadByIndex = redownloadByIndex;

  console.log('[app-bridge] 橋接完成。支援格式：' + (typeof getSupportedFormatsLabel === 'function' ? getSupportedFormatsLabel() : 'EPUB'));
})();
