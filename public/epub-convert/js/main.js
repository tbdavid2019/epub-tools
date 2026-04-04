/**
 * EPUB 簡轉繁 — 主程式
 * 使用 OpenCC + JSZip + FileSaver
 */

(function () {
  'use strict';

  // ── OpenCC Converter ──
  var converter = null;
  function getConverter() {
    if (!converter) {
      converter = OpenCC.Converter({ from: 'cn', to: 'twp' });
    }
    return converter;
  }

  function convertToTraditional(text) {
    return getConverter()(text);
  }

  // ── 台灣標點符號轉換 ──
  var CJK = '[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]';
  var convertPunctuationEnabled = true;
  function convertPunctuation(text) {
    return text
      .replace(/\.{3,}/g, '……')
      .replace(/。{2,}/g, '……')
      .replace(/\u201c/g, '「').replace(/\u201d/g, '」')
      .replace(/\u2018/g, '『').replace(/\u2019/g, '』')
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

  // ── Encoding Detection ──
  function detectBOM(bytes) {
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return 'utf-8';
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) return 'utf-16le';
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) return 'utf-16be';
    return null;
  }

  function isValidUTF8(bytes) {
    var i = 0, invalidCount = 0;
    var maxCheck = Math.min(bytes.length, 10000);
    while (i < maxCheck) {
      var b = bytes[i];
      if (b <= 0x7F) { i++; }
      else if ((b & 0xE0) === 0xC0) {
        if (i + 1 >= maxCheck || (bytes[i + 1] & 0xC0) !== 0x80) { invalidCount++; i++; continue; }
        i += 2;
      } else if ((b & 0xF0) === 0xE0) {
        if (i + 2 >= maxCheck || (bytes[i + 1] & 0xC0) !== 0x80 || (bytes[i + 2] & 0xC0) !== 0x80) { invalidCount++; i++; continue; }
        i += 3;
      } else if ((b & 0xF8) === 0xF0) {
        if (i + 3 >= maxCheck || (bytes[i + 1] & 0xC0) !== 0x80 || (bytes[i + 2] & 0xC0) !== 0x80 || (bytes[i + 3] & 0xC0) !== 0x80) { invalidCount++; i++; continue; }
        i += 4;
      } else { invalidCount++; i++; }
    }
    return invalidCount < maxCheck * 0.01;
  }

  function detectGBK(bytes) {
    var gbkPairs = 0, totalPairs = 0;
    var maxCheck = Math.min(bytes.length, 10000);
    for (var i = 0; i < maxCheck - 1; i++) {
      if (bytes[i] >= 0x81 && bytes[i] <= 0xFE) {
        totalPairs++;
        if (bytes[i + 1] >= 0x40 && bytes[i + 1] <= 0xFE && bytes[i + 1] !== 0x7F) { gbkPairs++; i++; }
      }
    }
    return totalPairs === 0 ? 0 : Math.round((gbkPairs / totalPairs) * 100);
  }

  function detectEncoding(buffer) {
    var bytes = new Uint8Array(buffer);
    var bom = detectBOM(bytes);
    if (bom) return bom;
    if (isValidUTF8(bytes)) return 'utf-8';
    var gbkScore = detectGBK(bytes);
    if (gbkScore >= 70) return 'gbk';
    return 'utf-8';
  }

  // ── State ──
  var currentFile = null;
  var isProcessing = false;

  // ── DOM Elements ──
  var stateUpload = document.getElementById('stateUpload');
  var stateConfirm = document.getElementById('stateConfirm');
  var stateComplete = document.getElementById('stateComplete');

  var dropZone = document.getElementById('dropZone');
  var fileInput = document.getElementById('fileInput');
  var fileName = document.getElementById('fileName');
  var fileSize = document.getElementById('fileSize');
  var progressWrap = document.getElementById('progressWrap');
  var progressFill = document.getElementById('progressFill');
  var progressText = document.getElementById('progressText');
  var completeStats = document.getElementById('completeStats');

  var btnRemoveFile = document.getElementById('btnRemoveFile');
  var btnCancel = document.getElementById('btnCancel');
  var btnConvert = document.getElementById('btnConvert');
  var btnReset = document.getElementById('btnReset');

  // ── State Management ──
  function showState(state) {
    stateUpload.classList.toggle('hidden', state !== 'upload');
    stateConfirm.classList.toggle('hidden', state !== 'confirm');
    stateComplete.classList.toggle('hidden', state !== 'complete');
  }

  function setProgress(percent, text) {
    progressFill.style.width = percent + '%';
    progressText.textContent = text;
  }

  function reset() {
    currentFile = null;
    isProcessing = false;
    progressWrap.classList.add('hidden');
    setProgress(0, '');
    btnConvert.disabled = false;
    btnConvert.classList.remove('processing');
    btnConvert.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"><path d="M12 3v18"/><path d="M5 8l7-5 7 5"/><path d="M8 14l4 4 4-4"/><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg> 開始轉換';
    btnCancel.disabled = false;
    showState('upload');
  }

  // ── File Handling ──
  function handleFile(file) {
    if (!file.name.toLowerCase().endsWith('.epub')) {
      alert('請上傳 .epub 格式的檔案');
      return;
    }
    currentFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = (file.size / 1024 / 1024).toFixed(2) + ' MB';
    progressWrap.classList.add('hidden');
    showState('confirm');
  }

  // ── Drag & Drop ──
  dropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    dropZone.classList.add('dragging');
  });
  dropZone.addEventListener('dragleave', function (e) {
    e.preventDefault();
    dropZone.classList.remove('dragging');
  });
  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropZone.classList.remove('dragging');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', function () {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
    fileInput.value = '';
  });

  // ── Button Events ──
  // Punctuation toggle
  document.getElementById('togglePunctuation').addEventListener('click', function () {
    convertPunctuationEnabled = !convertPunctuationEnabled;
    this.className = 'toggle-switch ' + (convertPunctuationEnabled ? 'on' : 'off');
  });

  btnRemoveFile.addEventListener('click', function () { if (!isProcessing) reset(); });
  btnCancel.addEventListener('click', function () { if (!isProcessing) reset(); });
  btnReset.addEventListener('click', reset);

  // ── Convert ──
  btnConvert.addEventListener('click', async function () {
    if (!currentFile || isProcessing) return;

    isProcessing = true;
    btnConvert.disabled = true;
    btnConvert.classList.add('processing');
    btnConvert.textContent = '轉換中...';
    btnCancel.disabled = true;
    progressWrap.classList.remove('hidden');
    setProgress(5, '讀取 EPUB...');

    try {
      var zip = await JSZip.loadAsync(currentFile);
      var totalFiles = Object.keys(zip.files).length;
      var processedFiles = 0;
      var totalChars = 0;
      var convertedCount = 0;

      var textExtensions = ['.xhtml', '.html', '.htm', '.xml', '.ncx', '.opf'];

      for (var filename in zip.files) {
        var zipEntry = zip.files[filename];
        if (zipEntry.dir) { processedFiles++; continue; }

        var ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));

        if (textExtensions.indexOf(ext) !== -1) {
          setProgress(
            10 + Math.floor((processedFiles / totalFiles) * 80),
            '轉換中：' + filename.split('/').pop()
          );

          var uint8Array = await zipEntry.async('uint8array');
          var encoding = detectEncoding(uint8Array);

          var content;
          try {
            content = new TextDecoder(encoding).decode(uint8Array);
          } catch (e) {
            content = new TextDecoder('utf-8').decode(uint8Array);
          }

          var converted = convertToTraditional(content);
          if (convertPunctuationEnabled) converted = convertPunctuation(converted);

          if (converted !== content) {
            convertedCount++;
            totalChars += content.length;
          }

          zip.file(filename, converted);
        }

        processedFiles++;
      }

      setProgress(95, '打包 EPUB...');

      var newEpub = await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/epub+zip',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 }
      });

      var originalName = currentFile.name.replace(/\.epub$/i, '');
      var convertedName = convertToTraditional(originalName);
      saveAs(newEpub, convertedName + '.epub');

      completeStats.textContent = '共轉換 ' + convertedCount + ' 個檔案，約 ' + (totalChars / 10000).toFixed(1) + ' 萬字';
      setProgress(100, '完成！');
      showState('complete');
    } catch (error) {
      console.error('轉換失敗:', error);
      alert('轉換失敗：' + error.message);
      isProcessing = false;
      btnConvert.disabled = false;
      btnConvert.classList.remove('processing');
      btnConvert.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" stroke="currentColor"><path d="M12 3v18"/><path d="M5 8l7-5 7 5"/><path d="M8 14l4 4 4-4"/><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg> 開始轉換';
      btnCancel.disabled = false;
    }
  });

  // ── Theme Toggle ──
  var toggle = document.getElementById('themeToggle');
  toggle.addEventListener('click', function () {
    var isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });

  // ── Footer Year ──
  var startYear = 2026;
  var currentYear = new Date().getFullYear();
  document.getElementById('footer-year').textContent =
    currentYear > startYear ? startYear + '\u2013' + currentYear : '' + startYear;
})();
