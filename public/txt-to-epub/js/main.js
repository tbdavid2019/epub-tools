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
  function renderChapters() {
    $('chapterCount').textContent = '偵測到 ' + state.chapters.length + ' 個章節';

    var html = '';
    var max = Math.min(state.chapters.length, 100);
    for (var i = 0; i < max; i++) {
      html += '<div class="chapter-item">' +
        '<span class="chapter-num">' + (i + 1) + '</span>' +
        '<span class="chapter-title">' + escapeHtml(state.chapters[i].title) + '</span>' +
        '<button class="chapter-delete-btn" data-index="' + i + '" title="移除此章節（內容併入上一章）">✕</button>' +
        '</div>';
    }
    if (state.chapters.length > 100) {
      html += '<div class="chapter-item" style="justify-content:center;color:var(--text-muted);font-size:14px">...還有 ' + (state.chapters.length - 100) + ' 個章節</div>';
    }
    $('chapterList').innerHTML = html;

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

      if (mode !== 'separator') {
        state.chapters = window.ChapterDetector.detectChapters(state.content, mode);
        renderChapters();
      }
    });
  });

  $('btnApplySeparator').addEventListener('click', function () {
    var sep = $('separatorInput').value.trim();
    if (!sep) return;
    state.chapters = window.ChapterDetector.detectChapters(state.content, 'separator', { separator: sep });
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
  });

  $('togglePunctuation').addEventListener('click', function () {
    state.settings.convertPunctuation = !state.settings.convertPunctuation;
    this.className = 'toggle-switch ' + (state.settings.convertPunctuation ? 'on' : 'off');
  });

  $('modeHorizontal').addEventListener('click', function () {
    state.settings.writingMode = 'horizontal';
    $('modeHorizontal').classList.add('active');
    $('modeVertical').classList.remove('active');
  });
  $('modeVertical').addEventListener('click', function () {
    state.settings.writingMode = 'vertical';
    $('modeVertical').classList.add('active');
    $('modeHorizontal').classList.remove('active');
  });

  // Advanced toggle
  $('advancedToggle').addEventListener('click', function () {
    var panel = $('advancedPanel');
    var isHidden = panel.classList.toggle('hidden');
    $('advancedText').textContent = isHidden ? '展開進階排版選項' : '收起進階排版選項';
    $('advancedArrow').style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
  });

  // Cover upload
  $('coverInput').addEventListener('change', function () {
    if (this.files[0]) handleCover(this.files[0]);
    this.value = '';
  });

  function handleCover(file) {
    if (!file.type.startsWith('image/')) return;
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

  // ── Step 4: Export ──
  function renderExport() {
    $('exportReady').classList.remove('hidden');
    $('exportComplete').classList.add('hidden');
    $('exportProgress').classList.add('hidden');
    $('btnExport').disabled = false;
    $('btnExport').classList.remove('processing');

    var fontName = (FONT_CONFIG[state.settings.fontFamily] || {}).name || '預設';
    var items = [
      ['書名', state.settings.title || '未命名'],
      ['作者', state.settings.author || '未填寫'],
      ['章節數', state.chapters.length + ' 章'],
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
