/**
 * EPUB 編輯器 — 主程式
 * 三步驟：上傳 → 設定 → 輸出
 */

(function () {
  'use strict';

  // ── OpenCC ──
  var converter = null;
  function getConverter() {
    if (!converter) converter = OpenCC.Converter({ from: 'cn', to: 'twp' });
    return converter;
  }
  function convertToTraditional(text) { return getConverter()(text); }

  // ── 台灣標點符號轉換 ──
  var CJK = '[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]';
  function convertPunctuation(text) {
    return text
      .replace(/\.{3,}/g, '\u2026\u2026')
      .replace(/\u3002{2,}/g, '\u2026\u2026')
      .replace(/\u201c/g, '\u300c').replace(/\u201d/g, '\u300d')
      .replace(/\u2018/g, '\u300e').replace(/\u2019/g, '\u300f')
      .replace(new RegExp('(' + CJK + '),', 'g'), '$1\uff0c')
      .replace(new RegExp(',(' + CJK + ')', 'g'), '\uff0c$1')
      .replace(new RegExp('(' + CJK + ')!', 'g'), '$1\uff01')
      .replace(new RegExp('!(' + CJK + ')', 'g'), '\uff01$1')
      .replace(new RegExp('(' + CJK + ')\\?', 'g'), '$1\uff1f')
      .replace(new RegExp('\\?(' + CJK + ')', 'g'), '\uff1f$1')
      .replace(new RegExp('(' + CJK + ');', 'g'), '$1\uff1b')
      .replace(new RegExp('(' + CJK + '):', 'g'), '$1\uff1a')
      .replace(new RegExp(':(' + CJK + ')', 'g'), '\uff1a$1')
      .replace(new RegExp('(' + CJK + ')\\(', 'g'), '$1\uff08')
      .replace(new RegExp('\\)(' + CJK + ')', 'g'), '\uff09$1');
  }

  // ── Encoding Detection ──
  function detectEncoding(buffer) {
    var bytes = new Uint8Array(buffer);
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return 'utf-8';
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) return 'utf-16le';
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) return 'utf-16be';
    var i = 0, invalid = 0, max = Math.min(bytes.length, 10000);
    while (i < max) {
      var b = bytes[i];
      if (b <= 0x7F) { i++; }
      else if ((b & 0xE0) === 0xC0) { if (i+1 >= max || (bytes[i+1] & 0xC0) !== 0x80) { invalid++; i++; continue; } i += 2; }
      else if ((b & 0xF0) === 0xE0) { if (i+2 >= max || (bytes[i+1] & 0xC0) !== 0x80 || (bytes[i+2] & 0xC0) !== 0x80) { invalid++; i++; continue; } i += 3; }
      else if ((b & 0xF8) === 0xF0) { if (i+3 >= max || (bytes[i+1] & 0xC0) !== 0x80 || (bytes[i+2] & 0xC0) !== 0x80 || (bytes[i+3] & 0xC0) !== 0x80) { invalid++; i++; continue; } i += 4; }
      else { invalid++; i++; }
    }
    if (invalid < max * 0.01) return 'utf-8';
    var gbk = 0, total = 0;
    for (var j = 0; j < max - 1; j++) {
      if (bytes[j] >= 0x81 && bytes[j] <= 0xFE) {
        total++;
        if (bytes[j+1] >= 0x40 && bytes[j+1] <= 0xFE && bytes[j+1] !== 0x7F) { gbk++; j++; }
      }
    }
    return (total > 0 && (gbk / total) >= 0.7) ? 'gbk' : 'utf-8';
  }

  // ── CSS 注入邏輯 ──
  var FONT_MAP = {
    none: '',
    sans: 'font-family: "Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif !important;',
    serif: 'font-family: "Noto Serif TC", "Source Han Serif TC", serif !important;',
  };
  var SIZE_MAP = {
    none: '', small: 'font-size: 14px !important;', medium: 'font-size: 16px !important;',
    large: 'font-size: 18px !important;', xlarge: 'font-size: 22px !important;',
  };
  var LH_MAP = {
    none: '', compact: 'line-height: 1.4 !important;', normal: 'line-height: 1.8 !important;',
    relaxed: 'line-height: 2.0 !important;', loose: 'line-height: 2.4 !important;',
  };

  function buildInjectedCSS(settings) {
    var rules = [];
    if (settings.fontFamily !== 'none') rules.push(FONT_MAP[settings.fontFamily]);
    if (settings.fontSize !== 'none') rules.push(SIZE_MAP[settings.fontSize]);
    if (settings.lineHeight !== 'none') rules.push(LH_MAP[settings.lineHeight]);
    if (rules.length === 0) return '';
    return '\n/* HelloRuru EPUB Editor */\nbody, p, div, span, li, td, th, h1, h2, h3, h4, h5, h6 { ' + rules.join(' ') + ' }\n';
  }

  // ── State ──
  var state = {
    step: 1,
    file: null,
    settings: {
      convertToTraditional: true,
      convertPunctuation: true,
      fontFamily: 'sans',
      fontSize: 'medium',
      lineHeight: 'normal',
    },
  };

  var stepLabels = ['\u4e0a\u50b3\u6a94\u6848', '\u8abf\u6574\u8a2d\u5b9a', '\u8f38\u51fa EPUB'];
  var $ = function (id) { return document.getElementById(id); };

  // ── Step Navigation ──
  function renderStepIndicator() {
    var html = '';
    for (var s = 1; s <= 3; s++) {
      var cls = state.step >= s ? 'active' : 'inactive';
      html += '<div class="step-dot ' + cls + '">' + s + '</div>';
      if (s < 3) html += '<div class="step-line ' + (state.step > s ? 'active' : 'inactive') + '"></div>';
    }
    $('stepIndicator').innerHTML = html;
    $('stepLabel').textContent = stepLabels[state.step - 1];
  }

  function showStep(n) {
    state.step = n;
    for (var s = 1; s <= 3; s++) {
      $('step' + s).classList.toggle('hidden', s !== n);
    }
    $('btnPrev').style.visibility = n > 1 ? 'visible' : 'hidden';
    $('btnNext').style.display = n < 3 ? '' : 'none';
    $('btnNext').disabled = (n === 1 && !state.file);
    $('navButtons').style.display = n <= 2 ? '' : 'none';
    $('instructionCard').style.display = n === 1 ? '' : 'none';
    if (n === 3) renderSummary();
    renderStepIndicator();
  }

  $('btnNext').addEventListener('click', function () { if (state.step < 3) showStep(state.step + 1); });
  $('btnPrev').addEventListener('click', function () { if (state.step > 1) showStep(state.step - 1); });

  // ── Step 1: Upload ──
  var dropZone = $('dropZone');
  var fileInput = $('fileInput');
  dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('dragging'); });
  dropZone.addEventListener('dragleave', function (e) { e.preventDefault(); dropZone.classList.remove('dragging'); });
  dropZone.addEventListener('drop', function (e) {
    e.preventDefault(); dropZone.classList.remove('dragging');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', function () {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
    fileInput.value = '';
  });

  function handleFile(file) {
    if (!file.name.toLowerCase().endsWith('.epub')) { alert('\u8acb\u4e0a\u50b3 .epub \u683c\u5f0f\u7684\u6a94\u6848'); return; }
    state.file = file;
    $('fileName').textContent = file.name;
    $('fileSize').textContent = (file.size / 1024 / 1024).toFixed(2) + ' MB';
    $('fileInfo').classList.remove('hidden');
    $('btnNext').disabled = false;
    showStep(2);
  }

  // ── Step 2: Settings ──
  function bindOptionGrid(containerId, settingKey) {
    var container = $(containerId);
    container.querySelectorAll('.option-btn, .small-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        container.querySelectorAll('.option-btn, .small-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        state.settings[settingKey] = btn.dataset.font || btn.dataset.value;
      });
    });
  }
  bindOptionGrid('fontGrid', 'fontFamily');
  bindOptionGrid('fontSizeGrid', 'fontSize');
  bindOptionGrid('lineHeightGrid', 'lineHeight');

  $('toggleConvert').addEventListener('click', function () {
    state.settings.convertToTraditional = !state.settings.convertToTraditional;
    this.className = 'toggle-switch ' + (state.settings.convertToTraditional ? 'on' : 'off');
  });
  $('togglePunctuation').addEventListener('click', function () {
    state.settings.convertPunctuation = !state.settings.convertPunctuation;
    this.className = 'toggle-switch ' + (state.settings.convertPunctuation ? 'on' : 'off');
  });

  // ── Step 3: Summary & Export ──
  function renderSummary() {
    var fontLabels = { none: '\u4e0d\u8b8a\u66f4', sans: '\u9ed1\u9ad4', serif: '\u660e\u9ad4' };
    var sizeLabels = { none: '\u4e0d\u8b8a\u66f4', small: '\u5c0f', medium: '\u4e2d', large: '\u5927', xlarge: '\u7279\u5927' };
    var lhLabels = { none: '\u4e0d\u8b8a\u66f4', compact: '\u7dca\u6e4a', normal: '\u9069\u4e2d', relaxed: '\u5bec\u9b06', loose: '\u7279\u5bec' };
    var items = [
      ['\u6a94\u6848', state.file ? state.file.name : ''],
      ['\u7c21\u8f49\u7e41', state.settings.convertToTraditional ? '\u662f' : '\u5426'],
      ['\u53f0\u7063\u6a19\u9ede', state.settings.convertPunctuation ? '\u662f' : '\u5426'],
      ['\u5b57\u578b', fontLabels[state.settings.fontFamily]],
      ['\u5b57\u7d1a', sizeLabels[state.settings.fontSize]],
      ['\u884c\u8ddd', lhLabels[state.settings.lineHeight]],
    ];
    var html = '';
    for (var i = 0; i < items.length; i++) {
      html += '<div class="summary-row"><span class="summary-label">' + items[i][0] + '</span><span class="summary-value">' + items[i][1] + '</span></div>';
    }
    $('summaryCard').innerHTML = html;
  }

  function setProgress(percent, text) {
    $('progressFill').style.width = percent + '%';
    $('progressText').textContent = text;
  }

  $('btnExport').addEventListener('click', async function () {
    if (!state.file) return;
    $('btnExport').disabled = true;
    $('btnExport').textContent = '\u8655\u7406\u4e2d...';
    $('exportProgress').classList.remove('hidden');
    $('navButtons').style.display = 'none';
    setProgress(5, '\u8b80\u53d6 EPUB...');

    try {
      var zip = await JSZip.loadAsync(state.file);
      var totalFiles = Object.keys(zip.files).length;
      var processedFiles = 0, totalChars = 0, convertedCount = 0;
      var textExts = ['.xhtml', '.html', '.htm', '.xml', '.ncx', '.opf'];
      var cssExts = ['.css'];
      var injectedCSS = buildInjectedCSS(state.settings);

      for (var filename in zip.files) {
        var zipEntry = zip.files[filename];
        if (zipEntry.dir) { processedFiles++; continue; }
        var ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));

        if (textExts.indexOf(ext) !== -1) {
          setProgress(10 + Math.floor((processedFiles / totalFiles) * 75), '\u8655\u7406\uff1a' + filename.split('/').pop());
          var uint8 = await zipEntry.async('uint8array');
          var enc = detectEncoding(uint8.buffer);
          var content;
          try { content = new TextDecoder(enc).decode(uint8); }
          catch (e) { content = new TextDecoder('utf-8').decode(uint8); }

          var result = content;
          if (state.settings.convertToTraditional) result = convertToTraditional(result);
          if (state.settings.convertPunctuation) result = convertPunctuation(result);

          if (injectedCSS && (ext === '.xhtml' || ext === '.html' || ext === '.htm')) {
            var styleTag = '<style type="text/css">' + injectedCSS + '</style>';
            if (result.indexOf('</head>') !== -1) {
              result = result.replace('</head>', styleTag + '\n</head>');
            }
          }
          if (result !== content) { convertedCount++; totalChars += content.length; }
          zip.file(filename, result);
        }

        if (cssExts.indexOf(ext) !== -1 && injectedCSS) {
          var cssContent = await zipEntry.async('string');
          zip.file(filename, cssContent + injectedCSS);
        }
        processedFiles++;
      }

      setProgress(90, '\u6253\u5305 EPUB...');
      var newEpub = await zip.generateAsync({
        type: 'blob', mimeType: 'application/epub+zip',
        compression: 'DEFLATE', compressionOptions: { level: 9 }
      });

      var outName = state.file.name.replace(/\.epub$/i, '');
      if (state.settings.convertToTraditional) outName = convertToTraditional(outName);
      saveAs(newEpub, outName + '.epub');

      $('completeStats').textContent = '\u5171\u8655\u7406 ' + convertedCount + ' \u500b\u6a94\u6848\uff0c\u7d04 ' + (totalChars / 10000).toFixed(1) + ' \u842c\u5b57';
      setProgress(100, '\u5b8c\u6210\uff01');
      $('exportReady').classList.add('hidden');
      $('exportComplete').classList.remove('hidden');
    } catch (error) {
      console.error('\u8655\u7406\u5931\u6557:', error);
      alert('\u8655\u7406\u5931\u6557\uff1a' + error.message);
      $('btnExport').disabled = false;
      $('btnExport').textContent = '\u4e0b\u8f09 EPUB';
      $('exportProgress').classList.add('hidden');
    }
  });

  $('btnReset').addEventListener('click', function () {
    state.file = null;
    state.settings.convertToTraditional = true;
    state.settings.convertPunctuation = true;
    state.settings.fontFamily = 'sans';
    state.settings.fontSize = 'medium';
    state.settings.lineHeight = 'normal';
    $('fileInfo').classList.add('hidden');
    $('exportReady').classList.remove('hidden');
    $('exportComplete').classList.add('hidden');
    $('exportProgress').classList.add('hidden');
    $('btnExport').disabled = false;
    $('btnExport').innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> \u4e0b\u8f09 EPUB';
    showStep(1);
  });

  // ── Theme Toggle ──
  $('themeToggle').addEventListener('click', function () {
    var isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });

  // ── Footer Year ──
  var sy = 2026, cy = new Date().getFullYear();
  $('footer-year').textContent = cy > sy ? sy + '\u2013' + cy : '' + sy;

  // ── Init ──
  showStep(1);
})();
