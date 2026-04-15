// ============================================
// compat-shim.js — DOM 相容層
// 閱星瞳轉檔工具 | HelloRuru Tools
//
// 載入順序：compat-shim.js → app.js → app-bridge.js
// 本檔負責：
//   在 app.js 之前建立所有它期望但新版 HTML 沒有的 DOM 元素，
//   避免 app.js 頂部的 const 宣告拿到 null 而崩潰。
//   app-bridge.js 之後負責把真實 UI 元素與這些 shim 雙向同步。
// ============================================

(function () {
  'use strict';

  // 建立隱藏的 shim 容器（所有 shim 元素都放這裡）
  var shimContainer = document.createElement('div');
  shimContainer.id = 'compat-shim-container';
  shimContainer.style.cssText = 'display:none !important; position:absolute; left:-9999px;';
  document.body.appendChild(shimContainer);

  var shimCount = 0;

  /**
   * 只在元素不存在時才建立 shim
   * @param {string} id - 元素 ID
   * @param {string} tag - HTML 標籤名，預設 'input'
   * @param {Object} attrs - 屬性字典，特殊 key: options（給 select 用）、checked
   * @returns {HTMLElement|null} 建立的元素，或 null（已存在時）
   */
  function shim(id, tag, attrs) {
    if (document.getElementById(id)) return null;
    var el = document.createElement(tag || 'input');
    el.id = id;
    if (attrs) {
      for (var key in attrs) {
        if (!attrs.hasOwnProperty(key)) continue;
        if (key === 'options') {
          // 為 select 加入 option 子元素
          attrs[key].forEach(function (opt) {
            var o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.text;
            if (opt.selected) o.selected = true;
            el.appendChild(o);
          });
        } else if (key === 'checked') {
          el.checked = !!attrs[key];
        } else {
          el.setAttribute(key, attrs[key]);
        }
      }
    }
    shimContainer.appendChild(el);
    shimCount++;
    return el;
  }

  // ==========================================================
  // === Buttons（app.js 39-45 行的 addEventListener 目標）===
  // ==========================================================
  shim('prevBtn', 'button');
  shim('nextBtn', 'button');
  shim('exportBtn', 'button');
  shim('exportAllBtn', 'button', { style: 'display:none' });
  shim('optimizeBtn', 'button');
  // refreshBtn 已存在於 HTML（id="refreshBtn"），不需要 shim
  // exportPageBtn 已存在於 HTML（id="exportPageBtn"），不需要 shim

  // ==========================================================
  // === Canvas（app.js 第 31 行呼叫 getContext('2d')）===
  // ==========================================================
  // previewCanvas 已存在於 HTML（id="previewCanvas"），不需要 shim

  // ==========================================================
  // === 頁面 / 書籍資訊 ===
  // ==========================================================
  // bookTitle, bookAuthor, pageInfo, chapterList 已存在於 HTML

  // ==========================================================
  // === 進度容器（app.js 用 progressContainer）===
  // ==========================================================
  // HTML 有 exportProgress 但沒有 progressContainer
  shim('progressContainer', 'div');
  // progressFill, progressText 已存在於 HTML

  // ==========================================================
  // === 檔案處理 ===
  // ==========================================================
  // dropZone, fileInput, fileList 已存在於 HTML

  // ==========================================================
  // === 裝置設定 ===
  // ==========================================================
  // devicePreset 已存在於 HTML（但值是 x4/x3 而非 xteink-x4/xteink-x3）
  // app-bridge.js 負責值轉換，此處不動

  // customDimensions（HTML 有 customSize，但 app.js 找 customDimensions）
  shim('customDimensions', 'div');
  // customWidth, customHeight 已存在於 HTML

  // ==========================================================
  // === 字型設定 ===
  // ==========================================================
  // HTML 有 fontSelect，但 app.js 找 fontFamily
  shim('fontFamily', 'select', {
    options: [
      { value: 'Literata', text: 'Literata', selected: true },
      { value: 'NotoSerifTC', text: '思源宋體' },
      { value: 'NotoSansTC', text: '思源黑體' },
      { value: 'GuanKiapTsingKhai', text: '原俠正楷' },
      { value: 'Huninn', text: 'jf open 粉圓' },
      { value: 'JasonHandwriting1', text: '清松手寫體' },
      { value: 'Cubic11', text: '俐方體 11 號' },
      { value: 'custom', text: '自訂字型...' }
    ]
  });

  // fontSize, fontWeight, lineHeight 已存在於 HTML
  // 但 app.js 另外需要 fontSizeNum, fontWeightNum, lineHeightNum
  shim('fontSizeNum', 'input', { type: 'number', value: '34' });
  shim('fontWeightNum', 'input', { type: 'number', value: '400' });
  shim('lineHeightNum', 'input', { type: 'number', value: '120' });

  // customFontInput（HTML 有 fontFileInput，app.js 找 customFontInput）
  shim('customFontInput', 'input', { type: 'file', accept: '.ttf,.otf' });

  // ==========================================================
  // === 邊距（app.js 期待單一 margin，HTML 有四個獨立輸入）===
  // ==========================================================
  shim('margin', 'input', { type: 'range', min: '0', max: '60', value: '16' });
  shim('marginNum', 'input', { type: 'number', value: '16' });

  // ==========================================================
  // === 排版設定 ===
  // ==========================================================
  // textAlign（HTML 用 align-btn 按鈕組，app.js 找 select）
  // 預設值需和 HTML 中 align-btn 的 active 一致（HTML 預設 left）
  shim('textAlign', 'select', {
    options: [
      { value: 'left', text: 'Left', selected: true },
      { value: 'center', text: 'Center' },
      { value: 'right', text: 'Right' },
      { value: 'justify', text: 'Justify' }
    ]
  });

  // hyphenation 已存在於 HTML
  // hyphenationLang（HTML 沒有）
  shim('hyphenationLang', 'select', {
    options: [
      { value: 'auto', text: 'Auto', selected: true }
    ]
  });
  // hyphenationLangGroup（app.js 控制顯示/隱藏）
  shim('hyphenationLangGroup', 'div');

  // ==========================================================
  // === 品質 / 抖動 ===
  // ==========================================================
  // qualityMode（HTML 用 quality-btn 按鈕組，app.js 找 select）
  shim('qualityMode', 'select', {
    options: [
      { value: 'fast', text: 'Fast (1-bit)', selected: true },
      { value: 'hq', text: 'HQ (2-bit)' }
    ]
  });

  // enableDithering（HTML 用 ditherMode select，app.js 找 checkbox）
  shim('enableDithering', 'input', { type: 'checkbox', checked: true });

  // ditherStrength 已存在於 HTML
  shim('ditherStrengthNum', 'input', { type: 'number', value: '20' });

  // enableNegative（HTML 有 negativeMode，app.js 找 enableNegative）
  shim('enableNegative', 'input', { type: 'checkbox' });

  // ==========================================================
  // === 進度條設定 ===
  // ==========================================================
  // enableProgressBar（HTML 有 showProgressLine）
  shim('enableProgressBar', 'input', { type: 'checkbox', checked: true });

  // progressPosition 已存在於 HTML
  // showBookProgress（HTML 沒有，app.js 用的）
  shim('showBookProgress', 'input', { type: 'checkbox', checked: true });
  // showChapterMarks 已存在於 HTML

  shim('showChapterProgress', 'input', { type: 'checkbox' });
  shim('progressFullWidth', 'input', { type: 'checkbox' });

  // showPageXY（HTML 有 showPageNumber）
  shim('showPageXY', 'input', { type: 'checkbox', checked: true });
  // showBookPercent（HTML 有 showPercentage）
  shim('showBookPercent', 'input', { type: 'checkbox' });

  shim('showChapterXY', 'input', { type: 'checkbox' });
  shim('showChapterPercent', 'input', { type: 'checkbox' });

  // 狀態列字型大小
  shim('statusFontSize', 'input', { type: 'range', min: '8', max: '20', value: '14' });
  shim('statusFontSizeNum', 'input', { type: 'number', value: '14' });

  // 狀態列邊距
  shim('statusEdgeMargin', 'input', { type: 'range', min: '0', max: '20', value: '0' });
  shim('statusEdgeMarginNum', 'input', { type: 'number', value: '0' });
  shim('statusSideMargin', 'input', { type: 'range', min: '0', max: '40', value: '0' });
  shim('statusSideMarginNum', 'input', { type: 'number', value: '0' });

  // progressSettings 容器（app.js 控制顯示/隱藏）
  shim('progressSettings', 'div');

  // ==========================================================
  // === Monitor DPI / Preview scale ===
  // ==========================================================
  shim('monitorDpi', 'input', { type: 'range', min: '72', max: '300', value: '96' });
  shim('monitorDpiNum', 'input', { type: 'number', value: '96' });
  shim('monitorDpiValue', 'span');
  shim('previewScaleValue', 'span');

  // ==========================================================
  // === EPUB Optimizer 設定 ===
  // ==========================================================
  shim('optRemoveCss', 'input', { type: 'checkbox', checked: true });
  shim('optStripFonts', 'input', { type: 'checkbox', checked: true });
  shim('optProcessImages', 'input', { type: 'checkbox', checked: true });
  shim('optGrayscale', 'input', { type: 'checkbox', checked: true });
  shim('optRemoveUnsupported', 'input', { type: 'checkbox', checked: true });
  shim('optInjectCss', 'input', { type: 'checkbox', checked: true });
  shim('maxImageWidth', 'input', { type: 'range', min: '200', max: '2048', value: '480' });
  shim('maxImageWidthNum', 'input', { type: 'number', value: '480' });

  // ==========================================================
  // === Tab / Panel（app.js querySelectorAll('.tabs button')）===
  // ==========================================================
  // app.js 用 class 選擇器找 tab，不用特定 ID
  // 但如果有其他程式碼用到這些 ID，保險起見建一下
  shim('converterTab', 'button');
  shim('optimizerTab', 'button');
  // converterPanel 已存在於 HTML
  shim('optimizerPanel', 'div');

  // ==========================================================
  // === ditherStrengthGroup（HTML 已有，app.js 也會找）===
  // ==========================================================
  // ditherStrengthGroup 已存在於 HTML（id="ditherStrengthGroup"）

  // ==========================================================
  // === 方向按鈕 data-orientation 補丁 ===
  // ==========================================================
  // HTML 用 data-orient，app.js 期待 data-orientation
  // 補上 data-orientation 屬性讓 app.js 也能正確讀取
  var orientBtns = document.querySelectorAll('.orient-btn[data-orient]');
  for (var ob = 0; ob < orientBtns.length; ob++) {
    if (!orientBtns[ob].hasAttribute('data-orientation')) {
      orientBtns[ob].setAttribute('data-orientation', orientBtns[ob].getAttribute('data-orient'));
    }
  }

  console.log('[compat-shim] 建立了 ' + shimCount + ' 個相容元素');
})();
