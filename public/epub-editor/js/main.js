/**
 * EPUB 編輯器 — main.js
 * 功能：上傳 EPUB → 簡轉繁 / 標點轉換 / 排版設定 → 下載
 * 相依：JSZip (CDN), OpenCC (CDN)
 */

/* ========== 全域狀態 ========== */
const state = {
  file: null,           // 原始 File 物件
  zip: null,            // JSZip 實例（解壓後）
  converter: null,      // OpenCC converter
  resultBlob: null,     // 處理完成的 blob
  resultFilename: '',   // 輸出檔名
  epubMeta: {},         // 解析到的 metadata

  // 設定
  settings: {
    convertToTraditional: true,
    convertPunctuation: true,
    writingMode: 'horizontal',
    fontFamily: 'sans',
    fontSize: 'medium',
    lineHeight: 'normal',
  }
};

/* ========== 常數 ========== */
const TEXT_EXTENSIONS = ['.xhtml', '.html', '.htm', '.xml', '.ncx', '.opf', '.css'];
const CONTENT_EXTENSIONS = ['.xhtml', '.html', '.htm'];

const SIZE_MAP = {
  small: '0.9em',
  medium: '1em',
  large: '1.15em',
  xlarge: '1.3em',
};

const LINE_HEIGHT_MAP = {
  compact: '1.5',
  normal: '1.8',
  relaxed: '2.0',
  loose: '2.3',
};

const FONT_MAP = {
  sans: { family: '"Noto Sans TC", "Microsoft JhengHei", sans-serif', name: '黑體' },
  serif: { family: '"Noto Serif TC", "PMingLiU", serif', name: '明體' },
  kai: { family: '"LXGW WenKai TC", "DFKai-SB", "BiauKai", serif', name: '楷體' },
  default: { family: 'serif', name: '閱讀器預設' },
};

// 簡體標點 → 繁體標點
const PUNCTUATION_MAP = {
  '\u201C': '\u300C',  // " → 「
  '\u201D': '\u300D',  // " → 」
  '\u2018': '\u300E',  // ' → 『
  '\u2019': '\u300F',  // ' → 』
  '\u3001': '\u3001',  // 、（相同，保留）
  '\u3002': '\u3002',  // 。（相同，保留）
};

// 最大建議檔案大小（50MB）
const MAX_RECOMMENDED_SIZE = 50 * 1024 * 1024;

/* ========== DOM 元素 ========== */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

/* ========== 工具函數 ========== */
function showToast(message, type = 'info') {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function showStep(stepId) {
  ['step-upload', 'step-settings', 'step-processing', 'step-complete'].forEach(id => {
    const el = $(`#${id}`);
    if (el) el.hidden = (id !== stepId);
  });
}

function updateProgress(percent, text) {
  const fill = $('#progress-fill');
  const textEl = $('#progress-text');
  if (fill) fill.style.width = `${percent}%`;
  if (textEl) textEl.textContent = text;
}

/* ========== 編碼偵測 ========== */
function detectBOM(bytes) {
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return 'utf-8';
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return 'utf-16le';
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return 'utf-16be';
  return null;
}

function isValidUTF8(bytes) {
  let i = 0;
  let invalidCount = 0;
  const maxCheck = Math.min(bytes.length, 10000);
  while (i < maxCheck) {
    const b = bytes[i];
    if (b <= 0x7F) { i++; }
    else if ((b & 0xE0) === 0xC0) {
      if (i + 1 >= maxCheck || (bytes[i+1] & 0xC0) !== 0x80) { invalidCount++; i++; continue; }
      i += 2;
    } else if ((b & 0xF0) === 0xE0) {
      if (i + 2 >= maxCheck || (bytes[i+1] & 0xC0) !== 0x80 || (bytes[i+2] & 0xC0) !== 0x80) { invalidCount++; i++; continue; }
      i += 3;
    } else if ((b & 0xF8) === 0xF0) {
      if (i + 3 >= maxCheck || (bytes[i+1] & 0xC0) !== 0x80 || (bytes[i+2] & 0xC0) !== 0x80 || (bytes[i+3] & 0xC0) !== 0x80) { invalidCount++; i++; continue; }
      i += 4;
    } else { invalidCount++; i++; }
  }
  return invalidCount < maxCheck * 0.01;
}

function detectGBKScore(bytes) {
  let pairs = 0, total = 0;
  const maxCheck = Math.min(bytes.length, 10000);
  for (let i = 0; i < maxCheck - 1; i++) {
    if (bytes[i] >= 0x81 && bytes[i] <= 0xFE) {
      total++;
      if (bytes[i+1] >= 0x40 && bytes[i+1] <= 0xFE && bytes[i+1] !== 0x7F) { pairs++; i++; }
    }
  }
  return total === 0 ? 0 : Math.round((pairs / total) * 100);
}

function detectEncoding(uint8Array) {
  const bom = detectBOM(uint8Array);
  if (bom) return bom;
  if (isValidUTF8(uint8Array)) return 'utf-8';
  if (detectGBKScore(uint8Array) >= 70) return 'gbk';
  return 'utf-8';
}

function decodeContent(uint8Array) {
  const encoding = detectEncoding(uint8Array);
  try {
    return new TextDecoder(encoding, { fatal: false }).decode(uint8Array);
  } catch {
    return new TextDecoder('utf-8', { fatal: false }).decode(uint8Array);
  }
}

/* ========== OpenCC 初始化 ========== */
function getConverter() {
  if (state.converter) return state.converter;
  if (typeof OpenCC === 'undefined') {
    throw new Error('OpenCC 載入失敗，請檢查網路連線後重新整理頁面');
  }
  // opencc-js UMD: OpenCC.Converter
  state.converter = OpenCC.Converter({ from: 'cn', to: 'twp' });
  return state.converter;
}

/* ========== 標點符號轉換 ========== */
function convertPunctuation(text) {
  let result = text;
  for (const [from, to] of Object.entries(PUNCTUATION_MAP)) {
    if (from !== to) {
      result = result.split(from).join(to);
    }
  }
  return result;
}

/* ========== EPUB Metadata 解析 ========== */
function parseEpubMetadata(zip) {
  const meta = { title: '', author: '', language: '', fileCount: 0, textFileCount: 0 };
  const allFiles = Object.keys(zip.files);
  meta.fileCount = allFiles.filter(f => !zip.files[f].dir).length;
  meta.textFileCount = allFiles.filter(f => {
    const ext = f.toLowerCase().slice(f.lastIndexOf('.'));
    return CONTENT_EXTENSIONS.includes(ext);
  }).length;

  // 找 content.opf
  const opfFile = allFiles.find(f => f.toLowerCase().endsWith('.opf'));
  if (opfFile) {
    return zip.files[opfFile].async('string').then(content => {
      const titleMatch = content.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
      const authorMatch = content.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
      const langMatch = content.match(/<dc:language[^>]*>([^<]+)<\/dc:language>/i);
      if (titleMatch) meta.title = titleMatch[1].trim();
      if (authorMatch) meta.author = authorMatch[1].trim();
      if (langMatch) meta.language = langMatch[1].trim();
      return meta;
    });
  }
  return Promise.resolve(meta);
}

/* ========== CSS 注入 ========== */
function generateStyleOverrides() {
  const s = state.settings;
  const isVertical = s.writingMode === 'vertical';
  const font = FONT_MAP[s.fontFamily] || FONT_MAP.default;
  const fontSize = SIZE_MAP[s.fontSize] || SIZE_MAP.medium;
  const lineHeight = LINE_HEIGHT_MAP[s.lineHeight] || LINE_HEIGHT_MAP.normal;

  let css = '\n/* === HelloRuru EPUB Editor 樣式覆蓋 === */\n';

  if (s.fontFamily !== 'default') {
    css += `body { font-family: ${font.family}; }\n`;
  }
  css += `body { font-size: ${fontSize}; line-height: ${lineHeight}; }\n`;

  if (isVertical) {
    css += `body {
  writing-mode: vertical-rl;
  -webkit-writing-mode: vertical-rl;
  -epub-writing-mode: vertical-rl;
  text-orientation: mixed;
}\n`;
  }

  return css;
}

function injectStyleIntoCSS(zip) {
  const overrides = generateStyleOverrides();
  const cssFiles = Object.keys(zip.files).filter(f =>
    f.toLowerCase().endsWith('.css') && !zip.files[f].dir
  );

  const promises = cssFiles.map(async (filename) => {
    const content = await zip.files[filename].async('string');
    // 在 CSS 末尾附加覆蓋樣式
    zip.file(filename, content + overrides);
  });

  // 如果沒有 CSS 檔案，找 XHTML 注入 <style>
  if (cssFiles.length === 0) {
    const xhtmlFiles = Object.keys(zip.files).filter(f => {
      const ext = f.toLowerCase().slice(f.lastIndexOf('.'));
      return CONTENT_EXTENSIONS.includes(ext) && !zip.files[f].dir;
    });

    xhtmlFiles.forEach(filename => {
      promises.push(
        zip.files[filename].async('string').then(content => {
          const styleTag = `<style>${overrides}</style>`;
          if (content.includes('</head>')) {
            content = content.replace('</head>', styleTag + '</head>');
          } else if (content.includes('<body')) {
            content = content.replace('<body', styleTag + '<body');
          }
          zip.file(filename, content);
        })
      );
    });
  }

  return Promise.all(promises);
}

/* ========== OPF spine 方向修改 ========== */
function updateSpineDirection(zip) {
  const isVertical = state.settings.writingMode === 'vertical';
  const opfFile = Object.keys(zip.files).find(f => f.toLowerCase().endsWith('.opf'));
  if (!opfFile) return Promise.resolve();

  return zip.files[opfFile].async('string').then(content => {
    // 更新 spine 的 page-progression-direction
    if (isVertical) {
      if (content.includes('page-progression-direction')) {
        content = content.replace(/page-progression-direction="[^"]*"/, 'page-progression-direction="rtl"');
      } else {
        content = content.replace(/<spine([^>]*)>/, '<spine$1 page-progression-direction="rtl">');
      }
    } else {
      // 橫排：移除 rtl 或改成 ltr
      content = content.replace(/\s*page-progression-direction="rtl"/, '');
    }
    zip.file(opfFile, content);
  });
}

/* ========== 核心處理流程 ========== */
async function processEpub() {
  const { file, settings } = state;
  if (!file) return;

  showStep('step-processing');
  updateProgress(0, '讀取 EPUB...');

  try {
    // 1. 解壓
    updateProgress(5, '解壓 EPUB 檔案...');
    const zip = await JSZip.loadAsync(file);
    state.zip = zip;

    const allFiles = Object.keys(zip.files).filter(f => !zip.files[f].dir);
    const textFiles = allFiles.filter(f => {
      const ext = f.toLowerCase().slice(f.lastIndexOf('.'));
      return TEXT_EXTENSIONS.includes(ext);
    });

    let totalProcessed = 0;
    let totalCharsConverted = 0;
    let converter = null;

    // 2. 初始化 OpenCC（如果需要）
    if (settings.convertToTraditional) {
      updateProgress(8, '載入繁化姬引擎...');
      try {
        converter = getConverter();
      } catch (err) {
        showToast('OpenCC 載入失敗：' + err.message, 'error');
        showStep('step-settings');
        return;
      }
    }

    // 3. 逐檔處理文字
    for (let i = 0; i < textFiles.length; i++) {
      const filename = textFiles[i];
      const shortName = filename.split('/').pop();
      const progress = 10 + Math.floor((i / textFiles.length) * 60);
      updateProgress(progress, `處理中：${shortName}`);

      const uint8Array = await zip.files[filename].async('uint8array');
      let content = decodeContent(uint8Array);
      let modified = false;

      // 簡轉繁
      if (settings.convertToTraditional && converter) {
        const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
        if (CONTENT_EXTENSIONS.includes(ext) || ext === '.ncx' || ext === '.opf') {
          const converted = converter(content);
          if (converted !== content) {
            totalCharsConverted += content.length;
            content = converted;
            modified = true;
          }
        }
      }

      // 標點符號轉換（只對內容檔案做）
      if (settings.convertPunctuation) {
        const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
        if (CONTENT_EXTENSIONS.includes(ext)) {
          const punctuated = convertPunctuation(content);
          if (punctuated !== content) {
            content = punctuated;
            modified = true;
          }
        }
      }

      if (modified) {
        zip.file(filename, content);
        totalProcessed++;
      }

      // 讓 UI 有機會更新（每 10 個檔案 yield 一次）
      if (i % 10 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    // 4. 注入排版樣式
    updateProgress(75, '套用排版設定...');
    await injectStyleIntoCSS(zip);

    // 5. 更新 OPF spine direction
    updateProgress(80, '更新排版方向...');
    await updateSpineDirection(zip);

    // 6. 壓縮輸出
    updateProgress(85, '重新打包 EPUB...');

    // EPUB 規格：mimetype 必須是第一個檔案且不壓縮
    // JSZip 沒有保證順序的好方法，但大多數閱讀器能容忍
    // 確保 mimetype 存在
    if (!zip.files['mimetype']) {
      zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
    }

    const blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/epub+zip',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    }, (metadata) => {
      const p = 85 + Math.floor(metadata.percent * 0.15);
      updateProgress(p, '打包中... ' + Math.floor(metadata.percent) + '%');
    });

    // 7. 生成檔名
    const originalName = file.name.replace(/\.epub$/i, '');
    let outputName = originalName;
    if (settings.convertToTraditional && converter) {
      try { outputName = converter(originalName); } catch { /* 用原名 */ }
    }

    const suffixes = [];
    if (settings.convertToTraditional) suffixes.push('繁');
    if (settings.writingMode === 'vertical') suffixes.push('直排');
    if (suffixes.length > 0) {
      outputName += '（' + suffixes.join('・') + '）';
    }

    state.resultBlob = blob;
    state.resultFilename = outputName + '.epub';

    // 8. 自動下載
    downloadBlob(state.resultBlob, state.resultFilename);

    // 9. 顯示完成
    updateProgress(100, '完成！');
    const statsText = [];
    if (totalProcessed > 0) statsText.push(`轉換了 ${totalProcessed} 個檔案`);
    if (totalCharsConverted > 0) statsText.push(`約 ${(totalCharsConverted / 10000).toFixed(1)} 萬字`);
    if (statsText.length === 0) statsText.push('已套用排版設定');

    $('#complete-stats').textContent = statsText.join('，');
    showStep('step-complete');
    showToast('處理完成，檔案已下載！', 'success');

  } catch (err) {
    console.error('處理失敗:', err);
    showToast('處理失敗：' + (err.message || '未知錯誤'), 'error');
    showStep('step-settings');
  }
}

/* ========== 下載 ========== */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 延遲釋放，避免下載中斷
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* ========== 檔案處理 ========== */
async function handleFile(file) {
  if (!file) return;

  if (!file.name.toLowerCase().endsWith('.epub')) {
    showToast('請上傳 .epub 格式的檔案', 'error');
    return;
  }

  if (file.size > MAX_RECOMMENDED_SIZE) {
    showToast(`檔案較大（${formatFileSize(file.size)}），處理時間可能較長`, 'info');
  }

  state.file = file;

  // 顯示檔案資訊
  $('#file-name').textContent = file.name;
  $('#file-size').textContent = formatFileSize(file.size);
  $('#file-info').hidden = false;
  $('#drop-zone').style.display = 'none';

  // 預先解析 metadata
  try {
    const zip = await JSZip.loadAsync(file);
    const meta = await parseEpubMetadata(zip);
    state.epubMeta = meta;

    const infoLines = [];
    if (meta.title) infoLines.push(`書名：${meta.title}`);
    if (meta.author) infoLines.push(`作者：${meta.author}`);
    if (meta.language) infoLines.push(`語言：${meta.language}`);
    infoLines.push(`檔案數：${meta.fileCount} 個（${meta.textFileCount} 個內容檔）`);

    $('#epub-info').innerHTML = infoLines.join('<br>');
    showStep('step-settings');
  } catch (err) {
    console.error('EPUB 解析失敗:', err);
    showToast('無法解析此 EPUB 檔案，請確認檔案是否損壞', 'error');
    resetFile();
  }
}

function resetFile() {
  state.file = null;
  state.zip = null;
  state.resultBlob = null;
  state.resultFilename = '';
  state.epubMeta = {};

  $('#file-info').hidden = true;
  $('#drop-zone').style.display = '';
  $('#epub-info').innerHTML = '';
  const fileInput = $('#file-input');
  if (fileInput) fileInput.value = '';
  showStep('step-upload');
}

/* ========== 事件綁定 ========== */
function initEvents() {
  // 檔案上傳
  const fileInput = $('#file-input');
  const dropZone = $('#drop-zone');

  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('dragging');
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('dragging');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('dragging');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  // 移除檔案
  $('#btn-remove-file').addEventListener('click', resetFile);

  // Toggle 開關
  $('#toggle-convert').addEventListener('click', function() {
    this.classList.toggle('active');
    const isActive = this.classList.contains('active');
    this.setAttribute('aria-pressed', isActive);
    state.settings.convertToTraditional = isActive;
  });

  $('#toggle-punctuation').addEventListener('click', function() {
    this.classList.toggle('active');
    const isActive = this.classList.contains('active');
    this.setAttribute('aria-pressed', isActive);
    state.settings.convertPunctuation = isActive;
  });

  // 排版方向
  $$('[data-writing]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-writing]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.settings.writingMode = btn.dataset.writing;
    });
  });

  // 字型風格
  $$('[data-font]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-font]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.settings.fontFamily = btn.dataset.font;
    });
  });

  // 字體大小
  $$('[data-size]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-size]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.settings.fontSize = btn.dataset.size;
    });
  });

  // 行距
  $$('[data-lineheight]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-lineheight]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.settings.lineHeight = btn.dataset.lineheight;
    });
  });

  // 動作按鈕
  $('#btn-reset').addEventListener('click', resetFile);

  $('#btn-process').addEventListener('click', () => {
    processEpub();
  });

  // 完成畫面按鈕
  $('#btn-download-again').addEventListener('click', () => {
    if (state.resultBlob) {
      downloadBlob(state.resultBlob, state.resultFilename);
      showToast('再次下載中...', 'success');
    }
  });

  $('#btn-new-file').addEventListener('click', resetFile);
}

/* ========== 初始化 ========== */
function init() {
  // 檢查必要依賴
  if (typeof JSZip === 'undefined') {
    showToast('JSZip 載入失敗，請檢查網路連線', 'error');
    return;
  }

  // OpenCC 可能延遲載入，在使用時再檢查
  initEvents();
  showStep('step-upload');
}

// DOM Ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
