/**
 * TXT 轉 EPUB — 主程式
 */

(function () {
  'use strict';

  // ── OpenCC ──
  var converter = null;
  function getConverter() {
    if (!converter) converter = OpenCC.Converter({ from: 'cn', to: 'twp' });
    return converter;
  }
  function convertText(text) { return getConverter()(text); }

  // ── 台灣標點符號轉換 ──
  var CJK = '[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]';
  function convertPunctuation(text) {
    return text
      // 省略號統一（先處理，避免被後面的句號轉換影響）
      .replace(/\.{3,}/g, '……')
      .replace(/。{2,}/g, '……')
      // 中國引號 → 台灣直角引號
      .replace(/\u201c/g, '「').replace(/\u201d/g, '」')   // "" → 「」
      .replace(/\u2018/g, '『').replace(/\u2019/g, '』')   // '' → 『』
      // 半形標點 → 全形（僅在 CJK 文字旁）
      .replace(new RegExp('(' + CJK + '),', 'g'), '$1，')
      .replace(new RegExp(',(' + CJK + ')', 'g'), '，$1')
      .replace(new RegExp('(' + CJK + ')!', 'g'), '$1！')
      .replace(new RegExp('!(' + CJK + ')', 'g'), '！$1')
      .replace(new RegExp('(' + CJK + ')\\?', 'g'), '$1？')
      .replace(new RegExp('\\?(' + CJK + ')', 'g'), '？$1')
      .replace(new RegExp('(' + CJK + ');', 'g'), '$1；')
      .replace(new RegExp('(' + CJK + '):', 'g'), '$1：')
      .replace(new RegExp(':(' + CJK + ')', 'g'), '：$1')
      .replace(new RegExp('(' + CJK + ')\\(', 'g'), '$1（')
      .replace(new RegExp('\\)(' + CJK + ')', 'g'), '）$1');
  }

  // ── State ──
  var state = {
    step: 1,
    file: null,
    content: '',
    chapters: [],
    cover: null,
    coverBlob: null,
    customFontFile: null,
    lastBlob: null,
    lastFilename: '',
    settings: {
      title: '', author: '',
      convertToTraditional: true,
      convertPunctuation: true,
      writingMode: 'horizontal',
      fontFamily: 'noto-sans',
      fontSize: 'medium',
      lineHeight: 'normal',
      textIndent: 'two',
    },
    detectionMode: 'auto',
  };

  var FONT_CONFIG = window.EpubGenerator.FONT_CONFIG;
  var stepLabels = ['上傳檔案', '確認章節', '書籍設定', '輸出 EPUB'];

  // ── DOM ──
  var $ = function (id) { return document.getElementById(id); };

  // ── Step Navigation ──
  function renderStepIndicator() {
    var html = '';
    for (var s = 1; s <= 4; s++) {
      var cls = state.step >= s ? 'active' : 'inactive';
      html += '<div class="step-dot ' + cls + '">' + s + '</div>';
      if (s < 4) html += '<div class="step-line ' + (state.step > s ? 'active' : 'inactive') + '"></div>';
    }
    $('stepIndicator').innerHTML = html;
    $('stepLabel').textContent = stepLabels[state.step - 1];
  }

  function showStep(step) {
    state.step = step;
    for (var i = 1; i <= 4; i++) {
      $('step' + i).classList.toggle('hidden', i !== step);
    }
    $('instructionCard').classList.toggle('hidden', step !== 1);
    $('navButtons').classList.toggle('hidden', step === 4);

    $('btnPrev').style.visibility = step === 1 ? 'hidden' : 'visible';
    $('btnNext').style.display = step >= 4 ? 'none' : '';
    $('btnNext').disabled = step === 1 && !state.file;

    renderStepIndicator();

    if (step === 2) renderChapters();
    if (step === 3) renderSettings();
    if (step === 4) renderExport();
  }

  // ── Step 1: File Upload ──
  var dropZone = $('dropZone');
  var fileInput = $('fileInput');

  dropZone.addEventListener('dragover', function (e) { e.preventDefault(); e.stopPropagation(); dropZone.classList.add('dragging'); });
  dropZone.addEventListener('dragleave', function (e) { e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('dragging'); });
  dropZone.addEventListener('drop', function (e) {
    e.preventDefault(); e.stopPropagation(); dropZone.classList.remove('dragging');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', function () {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
    fileInput.value = '';
  });

  async function handleFile(file) {
    if (!file.name.toLowerCase().endsWith('.txt')) {
      alert('請上傳 .txt 格式的檔案');
      return;
    }

    dropZone.classList.add('loading');
    $('dropText').textContent = '正在讀取檔案...';

    try {
      var result = await window.EncodingDetector.readFileWithAutoEncoding(file);
      state.file = file;
      state.content = result.text;

      $('encodingInfo').classList.remove('hidden');
      $('encodingLabel').textContent = result.encodingLabel;

      // Detect chapters
      state.chapters = window.ChapterDetector.detectChapters(result.text);

      // Detect metadata
      var fileName = file.name.replace(/\.txt$/i, '');
      var meta = window.ChapterDetector.detectBookMetadata(result.text, fileName);
      state.settings.title = meta.title || fileName;
      state.settings.author = meta.author || '';

      $('btnNext').disabled = false;

      // Auto-advance to step 2
      showStep(2);
    } catch (err) {
      console.error('檔案讀取失敗:', err);
      alert('檔案讀取失敗，請確認檔案格式');
    } finally {
      dropZone.classList.remove('loading');
      $('dropText').textContent = '拖放檔案到這裡';
    }
  }

  // ── Step 2: Chapter Preview ──
  var chapterShowAll = false;

  function renderChapters() {
    $('chapterCount').textContent = '偵測到 ' + state.chapters.length + ' 個章節';

    var html = '';
    var showCount = (chapterShowAll || state.chapters.length <= 100) ? state.chapters.length : 100;
    for (var i = 0; i < showCount; i++) {
      html += '<div class="chapter-item">' +
        '<span class="chapter-num">' + (i + 1) + '</span>' +
        '<span class="chapter-title">' + escapeHtml(state.chapters[i].title) + '</span>' +
        '<button class="chapter-delete-btn" data-index="' + i + '" title="移除此章節（內容併入上一章）">✕</button>' +
        '</div>';
    }
    if (!chapterShowAll && state.chapters.length > 100) {
      html += '<div class="chapter-item chapter-expand" style="justify-content:center;cursor:pointer;color:var(--rose);font-size:14px;font-weight:500" id="btnExpandChapters">顯示全部 ' + state.chapters.length + ' 個章節</div>';
    }
    $('chapterList').innerHTML = html;

    // 展開按鈕
    var expandBtn = document.getElementById('btnExpandChapters');
    if (expandBtn) {
      expandBtn.addEventListener('click', function () {
        chapterShowAll = true;
        renderChapters();
      });
    }

    // 綁定刪除按鈕
    var deleteBtns = document.querySelectorAll('.chapter-delete-btn');
    deleteBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.index);
        removeChapter(idx);
      });
    });
  }

  function removeChapter(index) {
    if (state.chapters.length <= 1) return;
    // 將被刪除章節的內容併入前一章（若是第一章則併入下一章）
    if (index > 0) {
      state.chapters[index - 1].content += '\n\n' + state.chapters[index].content;
    } else {
      state.chapters[1].content = state.chapters[0].content + '\n\n' + state.chapters[1].content;
    }
    state.chapters.splice(index, 1);
    renderChapters();
  }

  // Mode selector
  var modeButtons = document.querySelectorAll('.mode-btn');
  modeButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      modeButtons.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');

      var mode = btn.dataset.mode;
      state.detectionMode = mode;
      $('separatorWrap').classList.toggle('hidden', mode !== 'separator');
      $('keywordWrap').classList.toggle('hidden', mode !== 'keyword');

      if (mode !== 'separator' && mode !== 'keyword') {
        chapterShowAll = false;
        state.chapters = window.ChapterDetector.detectChapters(state.content, mode);
        renderChapters();
      }
    });
  });

  $('btnApplySeparator').addEventListener('click', function () {
    var sep = $('separatorInput').value.trim();
    if (!sep) return;
    chapterShowAll = false;
    state.chapters = window.ChapterDetector.detectChapters(state.content, 'separator', { separator: sep });
    renderChapters();
  });

  $('btnApplyKeyword').addEventListener('click', function () {
    var kw = $('keywordInput').value.trim();
    if (!kw) return;
    chapterShowAll = false;
    state.chapters = window.ChapterDetector.detectChapters(state.content, 'keyword', { keyword: kw });
    renderChapters();
  });

  // ── Step 3: Settings ──
  function renderSettings() {
    $('inputTitle').value = state.settings.title;
    $('inputAuthor').value = state.settings.author;

    // Convert toggles
    var toggleBtn = $('toggleConvert');
    toggleBtn.className = 'toggle-switch ' + (state.settings.convertToTraditional ? 'on' : 'off');
    var punctBtn = $('togglePunctuation');
    punctBtn.className = 'toggle-switch ' + (state.settings.convertPunctuation ? 'on' : 'off');

    // Writing mode
    $('modeHorizontal').classList.toggle('active', state.settings.writingMode === 'horizontal');
    $('modeVertical').classList.toggle('active', state.settings.writingMode === 'vertical');

    // Fonts
    var fontHtml = '';
    for (var id in FONT_CONFIG) {
      var f = FONT_CONFIG[id];
      var active = state.settings.fontFamily === id ? ' active' : '';
      fontHtml += '<button class="option-btn' + active + '" data-font="' + id + '">' +
        '<div class="option-btn-title">' + f.name + '</div>' +
        '<div class="option-btn-desc">' + f.description + '</div>' +
        '</button>';
    }
    $('fontGrid').innerHTML = fontHtml;
    $('fontGrid').querySelectorAll('.option-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.settings.fontFamily = btn.dataset.font;
        renderSettings();
      });
    });

    // 自訂字體區塊顯示／隱藏
    $('customFontWrap').classList.toggle('hidden', state.settings.fontFamily !== 'custom');
    if (state.customFontFile) {
      $('customFontLabel').textContent = state.customFontFile.name;
    } else {
      $('customFontLabel').textContent = '點擊選擇字體檔（.ttf / .otf / .woff / .woff2）';
    }

    // Font size
    renderSmallBtns('fontSizeGrid', [
      { id: 'small', label: '小' }, { id: 'medium', label: '中' },
      { id: 'large', label: '大' }, { id: 'xlarge', label: '特大' }
    ], state.settings.fontSize, function (v) { state.settings.fontSize = v; renderSettings(); });

    // Line height
    renderSmallBtns('lineHeightGrid', [
      { id: 'compact', label: '緊湊' }, { id: 'normal', label: '適中' },
      { id: 'relaxed', label: '寬鬆' }, { id: 'loose', label: '特寬' }
    ], state.settings.lineHeight, function (v) { state.settings.lineHeight = v; renderSettings(); });

    // Text indent
    renderSmallBtns('textIndentGrid', [
      { id: 'none', label: '無' }, { id: 'one', label: '1字' }, { id: 'two', label: '2字' }
    ], state.settings.textIndent, function (v) { state.settings.textIndent = v; renderSettings(); });

    // 即時預覽
    renderPreview();
  }

  // ── 即時排版預覽 ──
  // 把當前設定（字體/字級/行距/縮排/直橫排/簡轉繁/標點/自訂字體）套到一段範例文字上
  var _customFontStyleEl = null;  // 動態 inject 的 @font-face style 元素
  var _customFontObjectURL = null;
  function renderPreview() {
    var pc = $('previewContent');
    var pf = $('previewFrame');
    if (!pc || !pf) return;

    // 1. 抽預覽內容：第一章前 ~500 字
    var firstChapter = state.chapters && state.chapters[0];
    var rawTitle, rawText;
    if (firstChapter) {
      rawTitle = firstChapter.title || '第一章';
      rawText = (firstChapter.content || '').slice(0, 600);
    } else {
      rawTitle = '預覽';
      rawText = '上傳檔案後會在這裡看到實際排版。';
    }
    // 套用簡轉繁 / 標點
    if (state.settings.convertToTraditional) {
      try {
        rawTitle = convertText(rawTitle);
        rawText = convertText(rawText);
      } catch (e) {}
    }
    if (state.settings.convertPunctuation) {
      rawTitle = convertPunctuation(rawTitle);
      rawText = convertPunctuation(rawText);
    }
    // 切段落
    var paragraphs = rawText.split(/\n+/).filter(function (p) { return p.trim(); });
    var html = '<h1>' + escapeHtml(rawTitle) + '</h1>';
    for (var i = 0; i < paragraphs.length; i++) {
      html += '<p>' + escapeHtml(paragraphs[i].trim()) + '</p>';
    }
    pc.innerHTML = html;

    // 2. 直/橫排
    pc.classList.toggle('vertical', state.settings.writingMode === 'vertical');

    // 3. 字級 / 行距 / 縮排
    var sizeMap = { 'small': '0.9em', 'medium': '1em', 'large': '1.15em', 'xlarge': '1.3em' };
    var lineMap = { 'compact': '1.5', 'normal': '1.8', 'relaxed': '2.0', 'loose': '2.3' };
    var indentMap = { 'none': '0', 'one': '1em', 'two': '2em' };
    pc.style.fontSize = sizeMap[state.settings.fontSize] || '1em';
    pc.style.lineHeight = lineMap[state.settings.lineHeight] || '1.8';
    var indentVal = indentMap[state.settings.textIndent] || '2em';
    var paras = pc.querySelectorAll('p');
    for (var j = 0; j < paras.length; j++) paras[j].style.textIndent = indentVal;

    // 4. 字型：內建從 CDN 載；自訂字體先子集化再 @font-face inject
    // CDN 字體名稱對齊：
    //   Google Fonts 提供 "Noto Sans TC" / "Noto Serif TC"（自動子集）
    //   jsdelivr 提供 "jf-openhuninn-2.0"（jf 粉圓）
    //   ZeoSeven 提供 "GuanKiapTsingKhai"（原俠正楷，自動切片）
    var fontMap = {
      'noto-sans': '"Noto Sans TC", "Microsoft JhengHei", sans-serif',
      'noto-serif': '"Noto Serif TC", "PMingLiU", serif',
      'guankiap': '"GuanKiapTsingKhai", "DFKai-SB", "BiauKai", serif',
      'huninn': '"jf-openhuninn-2.0", "Microsoft JhengHei", sans-serif',
      'custom': null,  // 動態決定
    };
    if (state.settings.fontFamily === 'custom' && state.customFontFile) {
      injectCustomFontForPreview();  // 非同步，會自己刷新 fontFamily
      pc.style.fontFamily = '"TxtEpubPreviewCustom", sans-serif';
    } else if (state.settings.fontFamily === 'custom') {
      pc.style.fontFamily = 'sans-serif';
    } else {
      pc.style.fontFamily = fontMap[state.settings.fontFamily] || fontMap['noto-sans'];
    }
  }

  // 自訂字體預覽：先子集化再注入 @font-face（避免 5MB+ 字體卡載入）
  // 子集化內容 = 預覽用的 600 字（第一章前段）+ 常用 ASCII
  var _customFontSubsetCache = { fileName: null, fileSize: null, blobUrl: null };
  async function injectCustomFontForPreview() {
    if (!state.customFontFile) return;
    var f = state.customFontFile;
    // 同一個檔案不重複子集化
    if (_customFontSubsetCache.fileName === f.name && _customFontSubsetCache.fileSize === f.size && _customFontSubsetCache.blobUrl) {
      return;
    }
    // 先把舊的 ObjectURL 釋放
    if (_customFontSubsetCache.blobUrl) {
      URL.revokeObjectURL(_customFontSubsetCache.blobUrl);
      _customFontSubsetCache.blobUrl = null;
    }
    if (!_customFontStyleEl) {
      _customFontStyleEl = document.createElement('style');
      document.head.appendChild(_customFontStyleEl);
    }
    try {
      // 收集預覽會用到的 codepoint
      var firstChapter = state.chapters && state.chapters[0];
      var sampleText = (firstChapter ? (firstChapter.title + '\n' + firstChapter.content) : '').slice(0, 800);
      // 加上書名/作者讓標題也能顯示
      sampleText += '\n' + (state.settings.title || '') + '\n' + (state.settings.author || '');
      var cps = new Set();
      for (var i = 0; i < sampleText.length; i++) {
        var cp = sampleText.codePointAt(i);
        cps.add(cp);
        if (cp > 0xFFFF) i++;
      }
      // ASCII 補齊
      for (var a = 0x20; a < 0x7F; a++) cps.add(a);
      var rawBuf = await f.arrayBuffer();
      // 用 epubGenerator 內已寫好的 hb-subset wrapper（同一支 wasm，瀏覽器會快取）
      // 找個不會破壞既有流程的方式：複製 generateEpub 用的子集化邏輯。
      // 這裡簡化：直接 fetch wasm + subset
      var subsetBuf = await _previewSubset(rawBuf, cps);
      var blob = new Blob([subsetBuf], { type: 'font/ttf' });
      var url = URL.createObjectURL(blob);
      _customFontSubsetCache = { fileName: f.name, fileSize: f.size, blobUrl: url };
      _customFontStyleEl.textContent =
        '@font-face { font-family: "TxtEpubPreviewCustom"; src: url("' + url + '") format("truetype"); font-display: swap; }';
      // 子集化完成後刷一下預覽（讓字體真的套上去）
      var pc2 = $('previewContent');
      if (pc2 && state.settings.fontFamily === 'custom') {
        pc2.style.fontFamily = '"TxtEpubPreviewCustom", sans-serif';
      }
    } catch (err) {
      console.warn('預覽字體子集化失敗，改用原始字體：', err);
      // fallback：直接用原始檔
      var fallbackUrl = URL.createObjectURL(f);
      _customFontSubsetCache = { fileName: f.name, fileSize: f.size, blobUrl: fallbackUrl };
      _customFontStyleEl.textContent =
        '@font-face { font-family: "TxtEpubPreviewCustom"; src: url("' + fallbackUrl + '"); font-display: swap; }';
    }
  }

  // 簡化版的 hb-subset 呼叫（與 epubGenerator.js 共用同一支 wasm，瀏覽器會快取）
  var _previewHbExports = null;
  async function _previewLoadHb() {
    if (_previewHbExports) return _previewHbExports;
    var resp = await fetch('https://cdn.jsdelivr.net/npm/harfbuzzjs@0.4.11/hb-subset.wasm');
    if (!resp.ok) throw new Error('hb-subset.wasm 載入失敗');
    var bytes = await resp.arrayBuffer();
    var result = await WebAssembly.instantiate(bytes);
    _previewHbExports = result.instance.exports;
    return _previewHbExports;
  }
  async function _previewSubset(fontBuffer, cps) {
    var ex = await _previewLoadHb();
    var fontBytes = new Uint8Array(fontBuffer);
    var ptr = ex.malloc(fontBytes.byteLength);
    new Uint8Array(ex.memory.buffer).set(fontBytes, ptr);
    var blob = ex.hb_blob_create(ptr, fontBytes.byteLength, 2, 0, 0);
    var face = ex.hb_face_create(blob, 0);
    ex.hb_blob_destroy(blob);
    var input = ex.hb_subset_input_create_or_fail();
    var us = ex.hb_subset_input_unicode_set(input);
    cps.forEach(function (cp) { ex.hb_set_add(us, cp); });
    var sub = ex.hb_subset_or_fail(face, input);
    ex.hb_subset_input_destroy(input);
    if (!sub) {
      ex.hb_face_destroy(face);
      ex.free(ptr);
      throw new Error('hb_subset_or_fail');
    }
    var rb = ex.hb_face_reference_blob(sub);
    var off = ex.hb_blob_get_data(rb, 0);
    var len = ex.hb_blob_get_length(rb);
    var view = new Uint8Array(ex.memory.buffer, off, len);
    var data = new Uint8Array(len);
    data.set(view);
    ex.hb_blob_destroy(rb);
    ex.hb_face_destroy(sub);
    ex.hb_face_destroy(face);
    ex.free(ptr);
    return data.buffer;
  }

  function renderSmallBtns(containerId, options, activeId, onSelect) {
    var html = '';
    for (var i = 0; i < options.length; i++) {
      var active = options[i].id === activeId ? ' active' : '';
      html += '<button class="small-btn' + active + '" data-value="' + options[i].id + '">' + options[i].label + '</button>';
    }
    $(containerId).innerHTML = html;
    $(containerId).querySelectorAll('.small-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { onSelect(btn.dataset.value); });
    });
  }

  // Settings event listeners
  $('inputTitle').addEventListener('input', function () { state.settings.title = this.value; });
  $('inputAuthor').addEventListener('input', function () { state.settings.author = this.value; });

  $('toggleConvert').addEventListener('click', function () {
    state.settings.convertToTraditional = !state.settings.convertToTraditional;
    this.className = 'toggle-switch ' + (state.settings.convertToTraditional ? 'on' : 'off');
    renderPreview();
  });

  $('togglePunctuation').addEventListener('click', function () {
    state.settings.convertPunctuation = !state.settings.convertPunctuation;
    this.className = 'toggle-switch ' + (state.settings.convertPunctuation ? 'on' : 'off');
    renderPreview();
  });

  $('modeHorizontal').addEventListener('click', function () {
    state.settings.writingMode = 'horizontal';
    $('modeHorizontal').classList.add('active');
    $('modeVertical').classList.remove('active');
    renderPreview();
  });
  $('modeVertical').addEventListener('click', function () {
    state.settings.writingMode = 'vertical';
    $('modeVertical').classList.add('active');
    $('modeHorizontal').classList.remove('active');
    renderPreview();
  });

  // Advanced toggle
  $('advancedToggle').addEventListener('click', function () {
    var panel = $('advancedPanel');
    var isHidden = panel.classList.toggle('hidden');
    $('advancedText').textContent = isHidden ? '展開進階排版選項' : '收起進階排版選項';
    $('advancedArrow').style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
  });

  // Cover upload — 拖拉 + 點擊
  var coverZone = $('coverZone');
  coverZone.addEventListener('dragover', function (e) { e.preventDefault(); e.stopPropagation(); coverZone.classList.add('dragging'); });
  coverZone.addEventListener('dragleave', function (e) { e.preventDefault(); e.stopPropagation(); coverZone.classList.remove('dragging'); });
  coverZone.addEventListener('drop', function (e) {
    e.preventDefault(); e.stopPropagation(); coverZone.classList.remove('dragging');
    if (e.dataTransfer.files[0]) handleCover(e.dataTransfer.files[0]);
  });
  $('coverInput').addEventListener('change', function () {
    if (this.files[0]) handleCover(this.files[0]);
    this.value = '';
  });

  function handleCover(file) {
    if (!file.type.startsWith('image/')) {
      alert('請上傳圖片格式的檔案（JPG、PNG 等）');
      return;
    }
    state.coverBlob = file;

    var reader = new FileReader();
    reader.onload = function (e) {
      $('coverImg').src = e.target.result;
      $('coverZoneWrap').classList.add('hidden');
      $('coverPreview').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }

  $('btnRemoveCover').addEventListener('click', function () {
    state.coverBlob = null;
    $('coverZoneWrap').classList.remove('hidden');
    $('coverPreview').classList.add('hidden');
  });

  // 自訂字體上傳
  $('customFontInput').addEventListener('change', function () {
    if (this.files && this.files[0]) {
      var f = this.files[0];
      var name = (f.name || '').toLowerCase();
      var okExt = name.endsWith('.ttf') || name.endsWith('.otf') || name.endsWith('.woff') || name.endsWith('.woff2');
      if (!okExt) {
        alert('請上傳 .ttf / .otf / .woff / .woff2 格式的字體檔');
        this.value = '';
        return;
      }
      state.customFontFile = f;
      $('customFontLabel').textContent = f.name + '（' + (f.size / 1048576).toFixed(1) + ' MB）';
      // 立刻刷新預覽（如果使用者已選自訂字體）
      if (state.settings.fontFamily === 'custom') renderPreview();
    }
    this.value = '';
  });

  // ── 大檔案偵測門檻 ──
  var SPLIT_CHAR_THRESHOLD = 300000;  // 30 萬字
  var SPLIT_CHAPTER_THRESHOLD = 150;  // 150 章

  function getTotalCharCount() {
    var total = 0;
    for (var i = 0; i < state.chapters.length; i++) {
      total += state.chapters[i].content.length;
    }
    return total;
  }

  // ── Step 4: Export ──
  function renderExport() {
    $('exportReady').classList.remove('hidden');
    $('exportComplete').classList.add('hidden');
    $('exportProgress').classList.add('hidden');
    $('btnExport').disabled = false;
    $('btnExport').classList.remove('processing');

    var fontName = (FONT_CONFIG[state.settings.fontFamily] || {}).name || '預設';
    if (state.settings.fontFamily === 'custom') {
      fontName = state.customFontFile ? ('自訂：' + state.customFontFile.name) : '自訂（未選擇，將使用預設）';
    }
    var totalChars = getTotalCharCount();
    var totalCharsDisplay = totalChars >= 10000
      ? Math.round(totalChars / 10000) + ' 萬字'
      : totalChars.toLocaleString() + ' 字';
    var items = [
      ['書名', state.settings.title || '未命名'],
      ['作者', state.settings.author || '未填寫'],
      ['章節數', state.chapters.length + ' 章'],
      ['總字數', totalCharsDisplay],
      ['封面', state.coverBlob ? '已設定' : '無'],
      ['簡轉繁', state.settings.convertToTraditional ? '是' : '否'],
      ['台灣標點', state.settings.convertPunctuation ? '是' : '否'],
      ['排版', state.settings.writingMode === 'vertical' ? '直排' : '橫排'],
      ['字型', fontName],
    ];
    var html = '';
    for (var i = 0; i < items.length; i++) {
      html += '<div class="summary-row"><span class="summary-label">' + items[i][0] + '</span><span class="summary-value">' + escapeHtml(items[i][1]) + '</span></div>';
    }
    $('summaryCard').innerHTML = html;

    // 大檔案拆冊提示
    var needSplit = totalChars >= SPLIT_CHAR_THRESHOLD || state.chapters.length >= SPLIT_CHAPTER_THRESHOLD;
    $('splitNotice').classList.toggle('hidden', !needSplit);
    if (needSplit) {
      var reasons = [];
      if (totalChars >= SPLIT_CHAR_THRESHOLD) reasons.push('字數達 ' + totalCharsDisplay);
      if (state.chapters.length >= SPLIT_CHAPTER_THRESHOLD) reasons.push('章節達 ' + state.chapters.length + ' 章');
      $('splitNoticeText').textContent = '此書' + reasons.join('、') + '，檔案較大。';
    }
  }

  $('btnExport').addEventListener('click', async function () {
    $('btnExport').disabled = true;
    $('btnExport').classList.add('processing');
    $('btnExport').textContent = '生成中...';
    $('exportProgress').classList.remove('hidden');

    try {
      var processedChapters = state.chapters;
      var processedTitle = state.settings.title;
      var processedAuthor = state.settings.author;

      if (state.settings.convertToTraditional) {
        $('exportProgressText').textContent = '正在轉換簡體為繁體...';
        processedChapters = [];
        for (var i = 0; i < state.chapters.length; i++) {
          processedChapters.push({
            title: convertText(state.chapters[i].title),
            content: convertText(state.chapters[i].content),
          });
        }
        processedTitle = convertText(state.settings.title);
        if (processedAuthor) processedAuthor = convertText(processedAuthor);
      }

      if (state.settings.convertPunctuation) {
        $('exportProgressText').textContent = '正在轉換標點符號...';
        var src = processedChapters === state.chapters ? state.chapters : processedChapters;
        processedChapters = [];
        for (var j = 0; j < src.length; j++) {
          processedChapters.push({
            title: convertPunctuation(src[j].title),
            content: convertPunctuation(src[j].content),
          });
        }
        processedTitle = convertPunctuation(processedTitle);
        if (processedAuthor) processedAuthor = convertPunctuation(processedAuthor);
      }

      // Generate filename
      var outputFilename = processedAuthor
        ? '《' + processedTitle + '》' + processedAuthor
        : '《' + processedTitle + '》';
      outputFilename = outputFilename.replace(/[<>:"/\\|?*]/g, '');

      var blob = await window.EpubGenerator.generateEpub({
        title: processedTitle,
        author: processedAuthor,
        chapters: processedChapters,
        cover: state.coverBlob,
        writingMode: state.settings.writingMode,
        fontFamily: state.settings.fontFamily,
        fontSize: state.settings.fontSize,
        lineHeight: state.settings.lineHeight,
        textIndent: state.settings.textIndent,
        customFont: state.customFontFile,
        onProgress: function (p) {
          $('exportProgressText').textContent = p.message || '處理中...';
        },
      });

      state.lastBlob = blob;
      state.lastFilename = outputFilename;
      saveAs(blob, outputFilename + '.epub');

      $('exportReady').classList.add('hidden');
      $('exportComplete').classList.remove('hidden');
    } catch (error) {
      console.error('生成失敗:', error);
      alert('生成失敗：' + error.message);
      $('btnExport').disabled = false;
      $('btnExport').classList.remove('processing');
      $('btnExport').innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> 下載 EPUB';
    }
  });

  // ── 下冊封面選項 ──
  state.vol2CoverBlob = null;
  var vol2Radios = document.querySelectorAll('input[name="vol2Cover"]');
  for (var r = 0; r < vol2Radios.length; r++) {
    vol2Radios[r].addEventListener('change', function () {
      $('vol2CoverUpload').classList.toggle('hidden', this.value !== 'upload');
    });
  }
  $('vol2CoverInput').addEventListener('change', function () {
    if (this.files[0]) {
      if (!this.files[0].type.startsWith('image/')) {
        alert('請上傳圖片格式的檔案（JPG、PNG 等）');
        this.value = '';
        return;
      }
      state.vol2CoverBlob = this.files[0];
      $('vol2CoverName').textContent = this.files[0].name;
    }
    this.value = '';
  });

  // ── 一鍵拆冊 ──
  $('btnAutoSplit').addEventListener('click', async function () {
    var half = Math.ceil(state.chapters.length / 2);
    var vol1Chapters = state.chapters.slice(0, half);
    var vol2Chapters = state.chapters.slice(half);

    $('btnAutoSplit').disabled = true;
    $('btnAutoSplit').textContent = '拆冊生成中...';
    $('exportProgress').classList.remove('hidden');

    try {
      var processedTitle = state.settings.title;
      var processedAuthor = state.settings.author;

      // 前處理：簡轉繁 + 標點
      function processChapters(chapters) {
        var result = chapters;
        if (state.settings.convertToTraditional) {
          var converted = [];
          for (var i = 0; i < result.length; i++) {
            converted.push({ title: convertText(result[i].title), content: convertText(result[i].content) });
          }
          result = converted;
        }
        if (state.settings.convertPunctuation) {
          var punched = [];
          for (var j = 0; j < result.length; j++) {
            punched.push({ title: convertPunctuation(result[j].title), content: convertPunctuation(result[j].content) });
          }
          result = punched;
        }
        return result;
      }

      if (state.settings.convertToTraditional) {
        processedTitle = convertText(processedTitle);
        if (processedAuthor) processedAuthor = convertText(processedAuthor);
      }
      if (state.settings.convertPunctuation) {
        processedTitle = convertPunctuation(processedTitle);
        if (processedAuthor) processedAuthor = convertPunctuation(processedAuthor);
      }

      var baseFilename = processedAuthor
        ? '《' + processedTitle + '》' + processedAuthor
        : '《' + processedTitle + '》';
      baseFilename = baseFilename.replace(/[<>:"/\\|?*]/g, '');

      // 生成上冊
      $('exportProgressText').textContent = '正在生成上冊...';
      var blob1 = await window.EpubGenerator.generateEpub({
        title: processedTitle + '（上冊）',
        author: processedAuthor,
        chapters: processChapters(vol1Chapters),
        cover: state.coverBlob,
        writingMode: state.settings.writingMode,
        fontFamily: state.settings.fontFamily,
        fontSize: state.settings.fontSize,
        lineHeight: state.settings.lineHeight,
        textIndent: state.settings.textIndent,
        customFont: state.customFontFile,
        onProgress: function (p) { $('exportProgressText').textContent = '上冊：' + (p.message || '處理中...'); },
      });

      // 生成下冊（封面依使用者選擇：沿用上冊 or 自訂）
      var vol2CoverChoice = document.querySelector('input[name="vol2Cover"]:checked');
      var vol2Cover = (vol2CoverChoice && vol2CoverChoice.value === 'upload' && state.vol2CoverBlob)
        ? state.vol2CoverBlob
        : (vol2CoverChoice && vol2CoverChoice.value === 'same') ? state.coverBlob : null;
      $('exportProgressText').textContent = '正在生成下冊...';
      var blob2 = await window.EpubGenerator.generateEpub({
        title: processedTitle + '（下冊）',
        author: processedAuthor,
        chapters: processChapters(vol2Chapters),
        cover: vol2Cover,
        writingMode: state.settings.writingMode,
        fontFamily: state.settings.fontFamily,
        fontSize: state.settings.fontSize,
        lineHeight: state.settings.lineHeight,
        textIndent: state.settings.textIndent,
        customFont: state.customFontFile,
        onProgress: function (p) { $('exportProgressText').textContent = '下冊：' + (p.message || '處理中...'); },
      });

      saveAs(blob1, baseFilename + '（上冊）.epub');
      setTimeout(function () { saveAs(blob2, baseFilename + '（下冊）.epub'); }, 500);

      $('exportReady').classList.add('hidden');
      $('exportComplete').classList.remove('hidden');
    } catch (error) {
      console.error('拆冊生成失敗:', error);
      alert('拆冊生成失敗：' + error.message);
    } finally {
      $('btnAutoSplit').disabled = false;
      $('btnAutoSplit').innerHTML =
        '<svg viewBox="0 0 24 24" width="14" height="14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor" style="margin-right:4px"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/></svg>' +
        '自動拆成上下冊';
    }
  });

  $('btnRedownload').addEventListener('click', function () {
    if (state.lastBlob && state.lastFilename) {
      saveAs(state.lastBlob, state.lastFilename + '.epub');
    }
  });

  $('btnNewFile').addEventListener('click', function () {
    state.file = null;
    state.content = '';
    state.chapters = [];
    state.cover = null;
    state.coverBlob = null;
    state.vol2CoverBlob = null;
    state.customFontFile = null;
    state.lastBlob = null;
    state.settings.title = '';
    state.settings.author = '';
    state.settings.convertToTraditional = true;
    state.settings.convertPunctuation = true;
    state.settings.writingMode = 'horizontal';
    state.settings.fontFamily = 'noto-sans';
    state.settings.fontSize = 'medium';
    state.settings.lineHeight = 'normal';
    state.settings.textIndent = 'two';
    $('encodingInfo').classList.add('hidden');
    $('coverZoneWrap').classList.remove('hidden');
    $('coverPreview').classList.add('hidden');
    showStep(1);
  });

  // ── Nav Buttons ──
  $('btnPrev').addEventListener('click', function () {
    if (state.step > 1) showStep(state.step - 1);
  });

  $('btnNext').addEventListener('click', function () {
    if (state.step < 4) showStep(state.step + 1);
  });

  // ── Theme Toggle ──
  $('themeToggle').addEventListener('click', function () {
    var isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });

  // ── Footer Year ──
  var startYear = 2026;
  var currentYear = new Date().getFullYear();
  $('footer-year').textContent = currentYear > startYear ? startYear + '\u2013' + currentYear : '' + startYear;

  // ── Helpers ──
  function escapeHtml(text) {
    var el = document.createElement('span');
    el.textContent = text;
    return el.innerHTML;
  }

  // ── Init ──
  showStep(1);
})();
