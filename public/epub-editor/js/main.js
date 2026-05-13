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
  coverAction: 'keep',  // 'keep' | 'replace' | 'remove'
  newCoverBlob: null,   // 替換用的新圖片 File
  originalCover: null,  // { path, mimeType, dataUrl } 原書封面資訊
  customFontFile: null, // 使用者上傳的字體 File 物件
  customFontInfo: null, // { realName, embeddedFilename, mime, format } 子集化後的資訊
  previewSample: { title: '', text: '' },  // 即時預覽用的樣本文字

  // 設定
  settings: {
    convertToTraditional: true,
    convertPunctuation: true,
    writingMode: 'horizontal',
    fontFamily: 'noto-sans',
    fontSize: 'medium',
    lineHeight: 'normal',
    textIndent: 'two',
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

const INDENT_MAP = {
  none: '0',
  one: '1em',
  two: '2em',
};

const FONT_MAP = {
  'noto-sans': { family: '"Noto Sans TC", "Microsoft JhengHei", sans-serif', name: '思源黑體' },
  'noto-serif': { family: '"Noto Serif TC", "PMingLiU", serif', name: '思源宋體' },
  guankiap: { family: '"GuanKiapTsingKhai TW", "DFKai-SB", "BiauKai", serif', name: '原俠正楷' },
  huninn: { family: '"jf-openhuninn", "Microsoft JhengHei", sans-serif', name: 'jf 粉圓' },
  custom: { family: '"CustomUserFont", sans-serif', name: '自訂字體' },
  default: { family: 'serif', name: '閱讀器預設' },
};

// 副檔名對應 MIME / format
function getCustomFontMeta(file) {
  const name = (file.name || '').toLowerCase();
  if (name.endsWith('.woff2')) return { ext: 'woff2', mime: 'font/woff2', format: 'woff2' };
  if (name.endsWith('.woff')) return { ext: 'woff', mime: 'font/woff', format: 'woff' };
  if (name.endsWith('.otf')) return { ext: 'otf', mime: 'font/otf', format: 'opentype' };
  return { ext: 'ttf', mime: 'font/ttf', format: 'truetype' };
}

// HarfBuzz WASM 子集化 — 從 jsDelivr CDN 動態載入
let _hbExportsPromise = null;
function loadHbSubset() {
  if (_hbExportsPromise) return _hbExportsPromise;
  _hbExportsPromise = (async () => {
    const resp = await fetch('https://cdn.jsdelivr.net/npm/harfbuzzjs@0.4.11/hb-subset.wasm');
    if (!resp.ok) throw new Error('載入 hb-subset.wasm 失敗：' + resp.status);
    const bytes = await resp.arrayBuffer();
    const result = await WebAssembly.instantiate(bytes);
    return result.instance.exports;
  })();
  return _hbExportsPromise;
}

// 從 EPUB 內所有文字檔收集用到的 codepoint
async function collectCodepointsFromZip(zip) {
  const set = new Set();
  // 收 ASCII 確保英數能顯示
  for (let a = 0x20; a < 0x7F; a++) set.add(a);
  const textFiles = Object.keys(zip.files).filter(f => {
    if (zip.files[f].dir) return false;
    const ext = f.toLowerCase().slice(f.lastIndexOf('.'));
    return CONTENT_EXTENSIONS.includes(ext) || ext === '.ncx' || ext === '.opf';
  });
  for (const fn of textFiles) {
    const u8 = await zip.files[fn].async('uint8array');
    const text = decodeContent(u8);
    for (let i = 0; i < text.length; i++) {
      const cp = text.codePointAt(i);
      set.add(cp);
      if (cp > 0xFFFF) i++;
    }
  }
  return set;
}

// hb-subset 子集化
async function subsetFontWithHarfBuzz(fontArrayBuffer, codepointSet) {
  const exports = await loadHbSubset();
  const fontBytes = new Uint8Array(fontArrayBuffer);
  const fontPtr = exports.malloc(fontBytes.byteLength);
  // memory grow 後 buffer reference 失效，每次重抓
  new Uint8Array(exports.memory.buffer).set(fontBytes, fontPtr);

  const blob = exports.hb_blob_create(fontPtr, fontBytes.byteLength, 2 /* WRITABLE */, 0, 0);
  const face = exports.hb_face_create(blob, 0);
  exports.hb_blob_destroy(blob);

  const input = exports.hb_subset_input_create_or_fail();
  if (!input) {
    exports.hb_face_destroy(face);
    exports.free(fontPtr);
    throw new Error('hb_subset_input_create_or_fail 回傳 null');
  }
  const unicodeSet = exports.hb_subset_input_unicode_set(input);
  codepointSet.forEach(cp => exports.hb_set_add(unicodeSet, cp));

  const subsetFace = exports.hb_subset_or_fail(face, input);
  exports.hb_subset_input_destroy(input);
  if (!subsetFace) {
    exports.hb_face_destroy(face);
    exports.free(fontPtr);
    throw new Error('hb_subset_or_fail 失敗');
  }

  const resultBlob = exports.hb_face_reference_blob(subsetFace);
  const offset = exports.hb_blob_get_data(resultBlob, 0);
  const subsetLength = exports.hb_blob_get_length(resultBlob);
  if (subsetLength === 0) {
    exports.hb_blob_destroy(resultBlob);
    exports.hb_face_destroy(subsetFace);
    exports.hb_face_destroy(face);
    exports.free(fontPtr);
    throw new Error('子集化後字體大小為 0');
  }
  const resultView = new Uint8Array(exports.memory.buffer, offset, subsetLength);
  const subsetData = new Uint8Array(subsetLength);
  subsetData.set(resultView);

  exports.hb_blob_destroy(resultBlob);
  exports.hb_face_destroy(subsetFace);
  exports.hb_face_destroy(face);
  exports.free(fontPtr);
  return subsetData.buffer;
}

// 從 sfnt name table 讀字體真實 family name
function readFontFamilyName(arrayBuffer) {
  try {
    const view = new DataView(arrayBuffer);
    const sfnt = view.getUint32(0);
    if (sfnt !== 0x00010000 && sfnt !== 0x4F54544F && sfnt !== 0x74727565) return null;
    const numTables = view.getUint16(4);
    let nameOffset = null;
    for (let i = 0; i < numTables; i++) {
      const rec = 12 + i * 16;
      const tag = String.fromCharCode(view.getUint8(rec), view.getUint8(rec+1), view.getUint8(rec+2), view.getUint8(rec+3));
      if (tag === 'name') {
        nameOffset = view.getUint32(rec + 8);
        break;
      }
    }
    if (nameOffset === null) return null;
    const count = view.getUint16(nameOffset + 2);
    const stringOffset = view.getUint16(nameOffset + 4);
    const candidates = [];
    for (let r = 0; r < count; r++) {
      const rec = nameOffset + 6 + r * 12;
      const platformID = view.getUint16(rec);
      const encodingID = view.getUint16(rec + 2);
      const nameID = view.getUint16(rec + 6);
      const sLen = view.getUint16(rec + 8);
      const sOff = view.getUint16(rec + 10);
      if (nameID !== 1 && nameID !== 16) continue;
      const raw = new Uint8Array(arrayBuffer, nameOffset + stringOffset + sOff, sLen);
      let str;
      if (platformID === 3 || (platformID === 0 && encodingID >= 3)) {
        const chars = [];
        for (let k = 0; k < raw.length; k += 2) chars.push(String.fromCharCode((raw[k] << 8) | raw[k + 1]));
        str = chars.join('');
      } else {
        str = String.fromCharCode.apply(null, raw);
      }
      candidates.push({ priority: (nameID === 16 ? 0 : 1) + (platformID === 3 ? 0 : 10), name: str });
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.priority - b.priority);
    return candidates[0].name;
  } catch (e) {
    console.warn('讀取字體 family name 失敗：', e);
    return null;
  }
}

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

/* ========== 封面偵測 ========== */
async function detectCover(zip) {
  const allFiles = Object.keys(zip.files);
  const opfFile = allFiles.find(f => f.toLowerCase().endsWith('.opf'));
  if (!opfFile) return null;

  const opfContent = await zip.files[opfFile].async('string');
  const opfDir = opfFile.includes('/') ? opfFile.substring(0, opfFile.lastIndexOf('/') + 1) : '';

  // 方法 1：找 <meta name="cover" content="..."/> 指向的 manifest item
  const coverMeta = opfContent.match(/<meta[^>]*name=["']cover["'][^>]*content=["']([^"']+)["'][^>]*\/?>/i)
    || opfContent.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']cover["'][^>]*\/?>/i);
  if (coverMeta) {
    const coverId = coverMeta[1];
    const itemRegex = new RegExp('<item[^>]*id=["\']' + coverId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\'][^>]*>', 'i');
    const itemMatch = opfContent.match(itemRegex);
    if (itemMatch) {
      const hrefMatch = itemMatch[0].match(/href=["']([^"']+)["']/i);
      const typeMatch = itemMatch[0].match(/media-type=["']([^"']+)["']/i);
      if (hrefMatch) {
        const imgPath = opfDir + decodeURIComponent(hrefMatch[1]);
        if (zip.files[imgPath]) {
          const blob = await zip.files[imgPath].async('blob');
          const dataUrl = URL.createObjectURL(blob);
          return { path: imgPath, mimeType: typeMatch ? typeMatch[1] : 'image/jpeg', dataUrl };
        }
      }
    }
  }

  // 方法 2：找 manifest 裡 properties="cover-image" 的 item（EPUB 3）
  const coverPropMatch = opfContent.match(/<item[^>]*properties=["'][^"']*cover-image[^"']*["'][^>]*>/i);
  if (coverPropMatch) {
    const hrefMatch = coverPropMatch[0].match(/href=["']([^"']+)["']/i);
    const typeMatch = coverPropMatch[0].match(/media-type=["']([^"']+)["']/i);
    if (hrefMatch) {
      const imgPath = opfDir + decodeURIComponent(hrefMatch[1]);
      if (zip.files[imgPath]) {
        const blob = await zip.files[imgPath].async('blob');
        const dataUrl = URL.createObjectURL(blob);
        return { path: imgPath, mimeType: typeMatch ? typeMatch[1] : 'image/jpeg', dataUrl };
      }
    }
  }

  return null;
}

/* ========== 封面寫入 EPUB ========== */
async function injectCoverIntoEpub(zip) {
  if (state.coverAction === 'keep') return;

  const allFiles = Object.keys(zip.files);
  const opfFile = allFiles.find(f => f.toLowerCase().endsWith('.opf'));
  if (!opfFile) return;

  let opfContent = await zip.files[opfFile].async('string');
  const opfDir = opfFile.includes('/') ? opfFile.substring(0, opfFile.lastIndexOf('/') + 1) : '';

  if (state.coverAction === 'remove') {
    // 移除封面：刪掉圖片檔、移除 OPF 裡的 cover meta 和相關 manifest item
    if (state.originalCover && zip.files[state.originalCover.path]) {
      zip.remove(state.originalCover.path);
    }
    opfContent = opfContent.replace(/<meta[^>]*name=["']cover["'][^>]*\/?>\s*/gi, '');
    zip.file(opfFile, opfContent);
    return;
  }

  // coverAction === 'replace'
  if (!state.newCoverBlob) return;

  const coverFile = state.newCoverBlob;
  const ext = coverFile.type === 'image/png' ? '.png' : coverFile.type === 'image/webp' ? '.webp' : '.jpg';
  const mimeType = coverFile.type || 'image/jpeg';

  // 決定圖片存放路徑
  let imagesDir = opfDir + 'Images/';
  // 如果原書有 images 目錄（可能大小寫不同），沿用
  const existingImgDir = allFiles.find(f => f.toLowerCase().startsWith((opfDir + 'images/').toLowerCase()) && !zip.files[f].dir);
  if (existingImgDir) {
    imagesDir = existingImgDir.substring(0, existingImgDir.toLowerCase().indexOf('images/') + 7);
  }

  const coverPath = imagesDir + 'cover' + ext;
  const coverHref = coverPath.startsWith(opfDir) ? coverPath.substring(opfDir.length) : coverPath;

  // 寫入圖片
  const arrayBuffer = await coverFile.arrayBuffer();
  zip.file(coverPath, arrayBuffer);

  // 如果原書有封面圖且路徑不同，刪掉舊的
  if (state.originalCover && state.originalCover.path !== coverPath && zip.files[state.originalCover.path]) {
    zip.remove(state.originalCover.path);
  }

  // 更新 OPF manifest — 先移除舊的 cover item，再加新的
  // 移除舊的 cover-image item（如果有）
  opfContent = opfContent.replace(/<item[^>]*properties=["'][^"']*cover-image[^"']*["'][^>]*\/?>[\s]*/gi, '');

  // 檢查是否已有 id="cover-image" 的 item，移除
  opfContent = opfContent.replace(/<item[^>]*id=["']cover-image["'][^>]*\/?>[\s]*/gi, '');

  // 在 </manifest> 前加入新 item
  const newItem = `  <item id="cover-image" href="${coverHref}" media-type="${mimeType}" properties="cover-image"/>\n`;
  opfContent = opfContent.replace('</manifest>', newItem + '</manifest>');

  // 確保 metadata 有 <meta name="cover" content="cover-image"/>
  if (!opfContent.match(/<meta[^>]*name=["']cover["'][^>]*>/i)) {
    opfContent = opfContent.replace('</metadata>', '  <meta name="cover" content="cover-image"/>\n</metadata>');
  } else {
    opfContent = opfContent.replace(/<meta[^>]*name=["']cover["'][^>]*\/?>/i, '<meta name="cover" content="cover-image"/>');
  }

  zip.file(opfFile, opfContent);
}

/* ========== 即時排版預覽 ========== */
// 從 zip 抽出第一個內容章節的開頭當預覽樣本
async function extractPreviewSample(zip) {
  const fileNames = Object.keys(zip.files).filter(f => {
    if (zip.files[f].dir) return false;
    const ext = f.toLowerCase().slice(f.lastIndexOf('.'));
    return CONTENT_EXTENSIONS.includes(ext);
  }).sort();
  // 跳過 cover/nav/toc 開頭的檔案，找實際章節
  const skipPatterns = /(cover|nav|toc|colophon|copyright|titlepage|frontmatter)/i;
  const candidate = fileNames.find(f => !skipPatterns.test(f.split('/').pop())) || fileNames[0];
  if (!candidate) return { title: '預覽', text: '此 EPUB 找不到內容章節。' };

  const u8 = await zip.files[candidate].async('uint8array');
  let html = decodeContent(u8);
  // 抽 <h1>/<h2> 當標題，抽 <p> 內文文字
  const titleMatch = html.match(/<(?:h1|h2)[^>]*>([\s\S]*?)<\/(?:h1|h2)>/i);
  let title = titleMatch ? titleMatch[1] : '';
  title = title.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  // 抽 body 內所有 p
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyHtml = bodyMatch ? bodyMatch[1] : html;
  const pMatches = bodyHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
  const paragraphs = [];
  let totalChars = 0;
  for (const p of pMatches) {
    const text = p.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
    if (!text) continue;
    paragraphs.push(text);
    totalChars += text.length;
    if (totalChars > 600) break;
  }
  return { title: title || '預覽', text: paragraphs.join('\n') };
}

// 套上目前的設定渲染預覽
function renderPreview() {
  const pc = $('#previewContent');
  const pf = $('#previewFrame');
  if (!pc || !pf) return;

  const sample = state.previewSample || { title: '', text: '' };
  let title = sample.title || '預覽';
  let text = sample.text || '上傳 EPUB 後會在這裡看到實際排版。';

  // 簡轉繁 / 標點
  if (state.settings.convertToTraditional) {
    try {
      const conv = getConverter();
      title = conv(title);
      text = conv(text);
    } catch (e) {}
  }
  if (state.settings.convertPunctuation) {
    title = convertPunctuation(title);
    text = convertPunctuation(text);
  }

  // HTML 渲染
  const paragraphs = text.split(/\n+/).filter(p => p.trim());
  let html = `<h1>${escapeHtml(title)}</h1>`;
  for (const p of paragraphs) html += `<p>${escapeHtml(p.trim())}</p>`;
  pc.innerHTML = html;

  // 直/橫排
  pc.classList.toggle('vertical', state.settings.writingMode === 'vertical');

  // 字級 / 行距 / 縮排
  pc.style.fontSize = SIZE_MAP[state.settings.fontSize] || '1em';
  pc.style.lineHeight = LINE_HEIGHT_MAP[state.settings.lineHeight] || '1.8';
  const indent = INDENT_MAP[state.settings.textIndent] || '2em';
  pc.querySelectorAll('p').forEach(el => { el.style.textIndent = indent; });

  // 字型
  const previewFontMap = {
    'noto-sans': '"Noto Sans TC", "Microsoft JhengHei", sans-serif',
    'noto-serif': '"Noto Serif TC", "PMingLiU", serif',
    'guankiap': '"GuanKiapTsingKhai", "DFKai-SB", "BiauKai", serif',
    'huninn': '"jf-openhuninn", "Microsoft JhengHei", sans-serif',
    'default': 'inherit',
  };
  if (state.settings.fontFamily === 'custom' && state.customFontFile) {
    injectCustomFontForPreview();
    pc.style.fontFamily = '"EpubEditorPreviewCustom", sans-serif';
  } else if (state.settings.fontFamily === 'custom') {
    pc.style.fontFamily = 'sans-serif';
  } else {
    pc.style.fontFamily = previewFontMap[state.settings.fontFamily] || previewFontMap['noto-sans'];
  }
}

// helper：簡單 HTML escape（main.js 既有的 escapeHtml 沒 export，這裡寫一個）
function escapeHtml(s) {
  const el = document.createElement('span');
  el.textContent = s;
  return el.innerHTML;
}

// 自訂字體預覽：先子集化再注入 @font-face
let _customFontPreviewCache = { name: null, size: null, blobUrl: null };
let _customFontPreviewStyleEl = null;
let _previewHbExports = null;
async function _previewLoadHb() {
  if (_previewHbExports) return _previewHbExports;
  const resp = await fetch('https://cdn.jsdelivr.net/npm/harfbuzzjs@0.4.11/hb-subset.wasm');
  if (!resp.ok) throw new Error('hb-subset.wasm 載入失敗');
  const result = await WebAssembly.instantiate(await resp.arrayBuffer());
  _previewHbExports = result.instance.exports;
  return _previewHbExports;
}
async function _previewSubset(fontBuffer, cps) {
  const ex = await _previewLoadHb();
  const fontBytes = new Uint8Array(fontBuffer);
  const ptr = ex.malloc(fontBytes.byteLength);
  new Uint8Array(ex.memory.buffer).set(fontBytes, ptr);
  const blob = ex.hb_blob_create(ptr, fontBytes.byteLength, 2, 0, 0);
  const face = ex.hb_face_create(blob, 0);
  ex.hb_blob_destroy(blob);
  const input = ex.hb_subset_input_create_or_fail();
  const us = ex.hb_subset_input_unicode_set(input);
  cps.forEach(cp => ex.hb_set_add(us, cp));
  const sub = ex.hb_subset_or_fail(face, input);
  ex.hb_subset_input_destroy(input);
  if (!sub) {
    ex.hb_face_destroy(face);
    ex.free(ptr);
    throw new Error('hb_subset_or_fail');
  }
  const rb = ex.hb_face_reference_blob(sub);
  const off = ex.hb_blob_get_data(rb, 0);
  const len = ex.hb_blob_get_length(rb);
  const view = new Uint8Array(ex.memory.buffer, off, len);
  const data = new Uint8Array(len);
  data.set(view);
  ex.hb_blob_destroy(rb);
  ex.hb_face_destroy(sub);
  ex.hb_face_destroy(face);
  ex.free(ptr);
  return data.buffer;
}
async function injectCustomFontForPreview() {
  const f = state.customFontFile;
  if (!f) return;
  if (_customFontPreviewCache.name === f.name && _customFontPreviewCache.size === f.size && _customFontPreviewCache.blobUrl) return;
  if (_customFontPreviewCache.blobUrl) URL.revokeObjectURL(_customFontPreviewCache.blobUrl);
  if (!_customFontPreviewStyleEl) {
    _customFontPreviewStyleEl = document.createElement('style');
    document.head.appendChild(_customFontPreviewStyleEl);
  }
  try {
    // 收 codepoint：預覽樣本 + ASCII
    const sample = (state.previewSample.title || '') + '\n' + (state.previewSample.text || '');
    const cps = new Set();
    for (let i = 0; i < sample.length; i++) {
      const cp = sample.codePointAt(i);
      cps.add(cp);
      if (cp > 0xFFFF) i++;
    }
    for (let a = 0x20; a < 0x7F; a++) cps.add(a);
    const buf = await f.arrayBuffer();
    const sub = await _previewSubset(buf, cps);
    const url = URL.createObjectURL(new Blob([sub], { type: 'font/ttf' }));
    _customFontPreviewCache = { name: f.name, size: f.size, blobUrl: url };
    _customFontPreviewStyleEl.textContent =
      '@font-face { font-family: "EpubEditorPreviewCustom"; src: url("' + url + '") format("truetype"); font-display: swap; }';
    const pc = $('#previewContent');
    if (pc && state.settings.fontFamily === 'custom') {
      pc.style.fontFamily = '"EpubEditorPreviewCustom", sans-serif';
    }
  } catch (err) {
    console.warn('預覽字體子集化失敗，改用原始字體：', err);
    const url = URL.createObjectURL(f);
    _customFontPreviewCache = { name: f.name, size: f.size, blobUrl: url };
    _customFontPreviewStyleEl.textContent =
      '@font-face { font-family: "EpubEditorPreviewCustom"; src: url("' + url + '"); font-display: swap; }';
  }
}

/* ========== CSS 注入 ========== */
// 算 CSS 檔案到字體檔的相對路徑（給 url() 用）
function relativePathFromCss(cssFilePath, fontFilePath) {
  const cssParts = cssFilePath.split('/').slice(0, -1);  // 去掉檔名，剩目錄
  const fontParts = fontFilePath.split('/');
  // 找共同前綴
  let common = 0;
  while (common < cssParts.length && common < fontParts.length - 1 && cssParts[common] === fontParts[common]) {
    common++;
  }
  const upLevels = cssParts.length - common;
  const downPath = fontParts.slice(common).join('/');
  return ('../'.repeat(upLevels)) + downPath;
}

function generateStyleOverrides(cssFilePath) {
  const s = state.settings;
  const isVertical = s.writingMode === 'vertical';
  const font = FONT_MAP[s.fontFamily] || FONT_MAP.default;
  const fontSize = SIZE_MAP[s.fontSize] || SIZE_MAP.medium;
  const lineHeight = LINE_HEIGHT_MAP[s.lineHeight] || LINE_HEIGHT_MAP.normal;

  let css = '\n/* === HelloRuru EPUB Editor 樣式覆蓋 === */\n';

  // 自訂字體：@font-face + !important + 全域 * 強制覆蓋
  const useCustom = s.fontFamily === 'custom' && state.customFontInfo;
  if (useCustom) {
    const info = state.customFontInfo;
    const realFamily = info.realName || 'CustomUserFont';
    // 字體檔的絕對位置（在 EPUB 內）
    const fontAbsPath = info.embeddedPath;
    const fontUrl = cssFilePath ? relativePathFromCss(cssFilePath, fontAbsPath) : fontAbsPath;
    css += `@font-face {
  font-family: "${realFamily}";
  src: url("${fontUrl}") format("${info.format}");
  font-weight: normal;
  font-style: normal;
}
@font-face {
  font-family: "CustomUserFont";
  src: url("${fontUrl}") format("${info.format}");
  font-weight: normal;
  font-style: normal;
}
* { font-family: "${realFamily}", "CustomUserFont", sans-serif !important; }
body { font-family: "${realFamily}", "CustomUserFont", sans-serif !important; }
p { font-family: "${realFamily}", "CustomUserFont", sans-serif !important; }
h1, h2, h3, h4, h5, h6 { font-family: "${realFamily}", "CustomUserFont", sans-serif !important; }
`;
  } else if (s.fontFamily !== 'default') {
    css += `body { font-family: ${font.family}; }\n`;
  }
  css += `body { font-size: ${fontSize}; line-height: ${lineHeight}; }\n`;

  const indent = INDENT_MAP[s.textIndent] || INDENT_MAP.two;
  if (indent !== '0') {
    css += `p { text-indent: ${indent}; }\n`;
  } else {
    css += `p { text-indent: 0; }\n`;
  }

  if (isVertical) {
    css += `html, body {
  writing-mode: vertical-rl !important;
  -webkit-writing-mode: vertical-rl !important;
  -epub-writing-mode: vertical-rl !important;
  text-orientation: mixed !important;
}\n`;
  } else {
    // 橫排：強制覆蓋原 EPUB 可能存在的直排設定
    css += `html, body {
  writing-mode: horizontal-tb !important;
  -webkit-writing-mode: horizontal-tb !important;
  -epub-writing-mode: horizontal-tb !important;
  text-orientation: mixed !important;
}\n`;
  }

  return css;
}

// 清掉 EPUB 內原有字體（自訂字體模式才呼叫）+ 從 OPF/CSS 移除引用
async function removeOldFontsFromEpub(zip) {
  const FONT_EXTS = ['.ttf', '.otf', '.woff', '.woff2'];
  // 找所有字體檔
  const fontFiles = Object.keys(zip.files).filter(f => {
    if (zip.files[f].dir) return false;
    const lo = f.toLowerCase();
    return FONT_EXTS.some(ext => lo.endsWith(ext));
  });
  fontFiles.forEach(f => zip.remove(f));
  // 清掉 OPF manifest 裡的字體 item
  const opfFiles = Object.keys(zip.files).filter(f => f.toLowerCase().endsWith('.opf'));
  for (const opf of opfFiles) {
    let content = await zip.files[opf].async('string');
    // 移除 media-type 是 font/* 或 application/font-* 或 application/vnd.ms-opentype 的 item
    content = content.replace(
      /<item[^>]*media-type=["'](?:font\/[^"']*|application\/(?:font-[^"']*|vnd\.ms-opentype|x-font-[^"']*))["'][^>]*\/>\s*\n?/gi,
      ''
    );
    // 也以副檔名清理（保險）
    content = content.replace(
      /<item[^>]*href=["'][^"']*\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)["'][^>]*\/>\s*\n?/g,
      ''
    );
    zip.file(opf, content);
  }
  // 清掉現有 CSS 裡的 @font-face 區塊
  const cssFiles = Object.keys(zip.files).filter(f => f.toLowerCase().endsWith('.css'));
  for (const cf of cssFiles) {
    let content = await zip.files[cf].async('string');
    content = content.replace(/@font-face\s*\{[^}]*\}\s*/g, '');
    zip.file(cf, content);
  }
}

// 嵌入自訂字體：把字體檔放進 EPUB 內 fonts/，登錄到 OPF manifest，回傳實際絕對路徑
async function embedCustomFontIntoEpub(zip, fontDataBuffer, meta) {
  // 偵測 EPUB 結構：找一個 OPF 檔，把字體放在它附近的 fonts/ 子目錄
  const opfFiles = Object.keys(zip.files).filter(f => f.toLowerCase().endsWith('.opf'));
  let targetPath;
  if (opfFiles.length > 0) {
    const opfDir = opfFiles[0].substring(0, opfFiles[0].lastIndexOf('/') + 1);
    targetPath = opfDir + 'fonts/' + meta.embeddedFilename;
  } else {
    targetPath = 'fonts/' + meta.embeddedFilename;
  }
  zip.file(targetPath, fontDataBuffer);

  // 找 OPF 並加 manifest item
  for (const opf of opfFiles) {
    let content = await zip.files[opf].async('string');
    const opfDir = opf.substring(0, opf.lastIndexOf('/') + 1);
    let href;
    if (targetPath.startsWith(opfDir)) {
      href = targetPath.substring(opfDir.length);
    } else {
      const depth = opfDir.split('/').length - 1;
      href = '../'.repeat(depth) + targetPath;
    }
    const newItem = `    <item id="hr-custom-font" href="${href}" media-type="${meta.mime}"/>\n`;
    content = content.replace('</manifest>', newItem + '</manifest>');
    zip.file(opf, content);
  }
  return targetPath;
}

async function injectStyleIntoCSS(zip) {
  const cssFiles = Object.keys(zip.files).filter(f =>
    f.toLowerCase().endsWith('.css') && !zip.files[f].dir
  );

  // 1. 在每個 CSS 檔尾部附加覆蓋樣式（給有引用 CSS 的頁面用）
  for (const filename of cssFiles) {
    const overrides = generateStyleOverrides(filename);
    const content = await zip.files[filename].async('string');
    zip.file(filename, content + overrides);
  }

  // 2. 對所有章節 XHTML — 不管 EPUB 有沒有 CSS 檔 —
  // 都檢查它是否「實際引用了我們注入規則的 CSS」。
  // 沒引用的話，就在 XHTML 內直接注入 <style>，確保樣式一定生效。
  // （很多 EPUB 把 CSS 只給 nav.xhtml 用，章節頁面 head 是空的）
  const xhtmlFiles = Object.keys(zip.files).filter(f => {
    if (zip.files[f].dir) return false;
    const ext = f.toLowerCase().slice(f.lastIndexOf('.'));
    return CONTENT_EXTENSIONS.includes(ext);
  });

  // 把 CSS 檔名（去掉路徑）建成 set 方便比對
  const cssBasenames = new Set(cssFiles.map(f => f.split('/').pop().toLowerCase()));

  for (const filename of xhtmlFiles) {
    let content = await zip.files[filename].async('string');
    // 看 head 裡有沒有 <link rel="stylesheet"> 引用任何我們處理過的 CSS
    let referencesCss = false;
    if (cssBasenames.size > 0) {
      const linkMatches = content.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi) || [];
      for (const link of linkMatches) {
        const hrefMatch = link.match(/href=["']([^"']+)["']/i);
        if (hrefMatch) {
          const referenced = hrefMatch[1].split('/').pop().toLowerCase();
          if (cssBasenames.has(referenced)) {
            referencesCss = true;
            break;
          }
        }
      }
    }
    // 沒引用任何我們的 CSS → 注入 inline <style>
    if (!referencesCss) {
      const overrides = generateStyleOverrides(filename);
      const styleTag = `<style type="text/css">${overrides}</style>`;
      if (content.includes('</head>')) {
        content = content.replace('</head>', styleTag + '</head>');
      } else if (content.match(/<body[^>]*>/i)) {
        content = content.replace(/(<body[^>]*>)/i, styleTag + '$1');
      } else {
        // 沒 head 也沒 body（極少見）就直接前綴
        content = styleTag + content;
      }
      zip.file(filename, content);
    }
  }
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

    // 3.5. 自訂字體：清舊字體 + 子集化 + 嵌入新字體
    if (settings.fontFamily === 'custom' && state.customFontFile) {
      try {
        updateProgress(70, '清除原 EPUB 字體...');
        await removeOldFontsFromEpub(zip);

        updateProgress(72, '收集書中用到的字...');
        const codepoints = await collectCodepointsFromZip(zip);

        updateProgress(73, '載入子集化引擎...');
        const rawBuffer = await state.customFontFile.arrayBuffer();
        let fontBufferToEmbed = rawBuffer;
        try {
          fontBufferToEmbed = await subsetFontWithHarfBuzz(rawBuffer, codepoints);
          const origMB = (rawBuffer.byteLength / 1048576).toFixed(2);
          const subMB = (fontBufferToEmbed.byteLength / 1048576).toFixed(2);
          updateProgress(74, `字體精簡完成（${origMB} MB → ${subMB} MB）`);
        } catch (subErr) {
          console.warn('字體子集化失敗，改用原始字體：', subErr);
          updateProgress(74, '字體子集化失敗，改用原始字體');
        }

        const realName = readFontFamilyName(fontBufferToEmbed);
        // 子集化後副檔名統一 ttf；原始字體則沿用上傳的副檔名
        const originalMeta = getCustomFontMeta(state.customFontFile);
        const isSubsetSuccess = fontBufferToEmbed !== rawBuffer;
        const meta = {
          embeddedFilename: 'hr-custom-font.' + (isSubsetSuccess ? 'ttf' : originalMeta.ext),
          mime: isSubsetSuccess ? 'font/ttf' : originalMeta.mime,
          format: isSubsetSuccess ? 'truetype' : originalMeta.format,
        };
        const embeddedPath = await embedCustomFontIntoEpub(zip, fontBufferToEmbed, meta);
        state.customFontInfo = { ...meta, realName, embeddedPath };
      } catch (err) {
        console.error('自訂字體處理失敗：', err);
        showToast('自訂字體處理失敗：' + err.message, 'error');
        state.customFontInfo = null;
      }
    } else {
      state.customFontInfo = null;
    }

    // 4. 注入排版樣式
    updateProgress(75, '套用排版設定...');
    await injectStyleIntoCSS(zip);

    // 5. 更新 OPF spine direction
    updateProgress(78, '更新排版方向...');
    await updateSpineDirection(zip);

    // 5.5. 處理封面圖片
    if (state.coverAction !== 'keep') {
      updateProgress(82, '處理封面圖片...');
      await injectCoverIntoEpub(zip);
    }

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

    // 大檔案偵測提示
    const LARGE_FILE_SIZE = 20 * 1024 * 1024; // 20MB
    const LARGE_TEXT_FILES = 100;
    const splitNotice = $('#splitNotice');
    if (splitNotice) {
      const isLarge = file.size >= LARGE_FILE_SIZE || meta.textFileCount >= LARGE_TEXT_FILES;
      splitNotice.hidden = !isLarge;
      if (isLarge) {
        const reasons = [];
        if (file.size >= LARGE_FILE_SIZE) reasons.push('檔案大小 ' + formatFileSize(file.size));
        if (meta.textFileCount >= LARGE_TEXT_FILES) reasons.push('內容檔達 ' + meta.textFileCount + ' 個');
        $('#splitNoticeText').textContent = '此書' + reasons.join('、') + '，屬於大型 EPUB。';
      }
    }

    // 偵測原書封面
    const cover = await detectCover(zip);
    state.originalCover = cover;
    state.coverAction = 'keep';
    state.newCoverBlob = null;

    if (cover) {
      $('#cover-img').src = cover.dataUrl;
      $('#cover-label').textContent = '原書封面';
      $('#cover-upload-wrap').hidden = true;
      $('#cover-preview').hidden = false;
    } else {
      $('#cover-upload-wrap').hidden = false;
      $('#cover-preview').hidden = true;
    }

    // 抽預覽用樣本文字（第一個內容章節前 ~600 字）
    state.previewSample = await extractPreviewSample(zip);

    showStep('step-settings');
    // 切到設定頁就先 render 一次預覽
    renderPreview();
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
  state.coverAction = 'keep';
  state.newCoverBlob = null;
  if (state.originalCover && state.originalCover.dataUrl) {
    URL.revokeObjectURL(state.originalCover.dataUrl);
  }
  state.originalCover = null;

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
    renderPreview();
  });

  $('#toggle-punctuation').addEventListener('click', function() {
    this.classList.toggle('active');
    const isActive = this.classList.contains('active');
    this.setAttribute('aria-pressed', isActive);
    state.settings.convertPunctuation = isActive;
    renderPreview();
  });

  // 排版方向
  $$('[data-writing]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-writing]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.settings.writingMode = btn.dataset.writing;
      renderPreview();
    });
  });

  // 字型風格
  $$('[data-font]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-font]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.settings.fontFamily = btn.dataset.font;
      // 切換自訂字體上傳區顯示
      const wrap = $('#custom-font-wrap');
      if (wrap) wrap.hidden = btn.dataset.font !== 'custom';
      renderPreview();
    });
  });

  // 自訂字體上傳
  const customFontInput = $('#custom-font-input');
  if (customFontInput) {
    customFontInput.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const lo = (f.name || '').toLowerCase();
      if (!['.ttf', '.otf', '.woff', '.woff2'].some(ext => lo.endsWith(ext))) {
        showToast('請上傳 .ttf / .otf / .woff / .woff2 格式的字體檔', 'error');
        e.target.value = '';
        return;
      }
      state.customFontFile = f;
      const lbl = $('#custom-font-label');
      if (lbl) lbl.textContent = `${f.name}（${(f.size / 1048576).toFixed(1)} MB）`;
      e.target.value = '';
      if (state.settings.fontFamily === 'custom') renderPreview();
    });
  }

  // 字體大小
  $$('[data-size]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-size]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.settings.fontSize = btn.dataset.size;
      renderPreview();
    });
  });

  // 行距
  $$('[data-lineheight]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-lineheight]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.settings.lineHeight = btn.dataset.lineheight;
      renderPreview();
    });
  });

  // 首行縮排
  $$('[data-indent]').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('[data-indent]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.settings.textIndent = btn.dataset.indent;
      renderPreview();
    });
  });

  // 封面上傳 — 拖拉 + 點擊
  const coverZone = $('#cover-zone');
  const coverInput = $('#cover-input');

  coverZone.addEventListener('dragover', (e) => {
    e.preventDefault(); e.stopPropagation();
    coverZone.classList.add('dragging');
  });
  coverZone.addEventListener('dragleave', (e) => {
    e.preventDefault(); e.stopPropagation();
    coverZone.classList.remove('dragging');
  });
  coverZone.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    coverZone.classList.remove('dragging');
    if (e.dataTransfer.files[0]) handleCoverUpload(e.dataTransfer.files[0]);
  });
  coverInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleCoverUpload(e.target.files[0]);
    coverInput.value = '';
  });

  function handleCoverUpload(file) {
    if (!file.type.startsWith('image/')) {
      showToast('請上傳圖片格式的檔案（JPG、PNG 等）', 'error');
      return;
    }
    state.newCoverBlob = file;
    state.coverAction = 'replace';

    const reader = new FileReader();
    reader.onload = (e) => {
      $('#cover-img').src = e.target.result;
      $('#cover-label').textContent = '新封面（將替換原書封面）';
      $('#cover-upload-wrap').hidden = true;
      $('#cover-preview').hidden = false;
    };
    reader.readAsDataURL(file);
    showToast('已選取新封面', 'success');
  }

  // 替換封面
  $('#btn-replace-cover').addEventListener('click', () => {
    coverInput.click();
  });

  // 移除封面
  $('#btn-remove-cover').addEventListener('click', () => {
    state.coverAction = 'remove';
    state.newCoverBlob = null;
    $('#cover-upload-wrap').hidden = false;
    $('#cover-preview').hidden = true;
    showToast('封面已移除，處理時將不含封面', 'info');
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
