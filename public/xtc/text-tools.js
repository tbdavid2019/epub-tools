// ============================================
// text-tools.js — 文字前處理工具
// 閱星瞳轉檔工具 | HelloRuru Tools
//
// 功能：
//   1. 簡轉繁（台灣用語，使用 OpenCC）
//   2. 半形轉全形
//   3. 標點符號台灣化
//   4. 自動偵測/編輯目錄
//
// 全部在瀏覽器端處理，不上傳任何資料
// ============================================

(function () {
  'use strict';

  // === OpenCC 載入狀態 ===
  var openccLoaded = false;
  var openccConverter = null;
  var openccLoading = false;

  /**
   * 載入 OpenCC（按需，第一次用到才下載）
   * opencc-js 約 800KB（含 s2twp 字典）
   */
  async function loadOpenCC() {
    if (openccLoaded && openccConverter) return openccConverter;
    if (openccLoading) {
      // 等待載入完成
      return new Promise(function (resolve) {
        var check = setInterval(function () {
          if (openccLoaded) {
            clearInterval(check);
            resolve(openccConverter);
          }
        }, 100);
      });
    }

    openccLoading = true;
    try {
      // 動態載入 opencc-js CDN
      await loadScript('https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/full.js');

      if (typeof OpenCC !== 'undefined') {
        // s2twp = Simplified to Traditional (Taiwan) with Phrases
        openccConverter = OpenCC.Converter({ from: 'cn', to: 'twp' });
        openccLoaded = true;
        console.log('[text-tools] OpenCC 載入完成（簡轉繁台灣用語）');
      } else {
        throw new Error('OpenCC 載入失敗');
      }
    } catch (err) {
      console.error('[text-tools] OpenCC 載入錯誤:', err);
      openccLoading = false;
      throw err;
    }
    return openccConverter;
  }

  /**
   * 動態載入外部 script
   */
  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = url;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('無法載入: ' + url)); };
      document.head.appendChild(script);
    });
  }

  // ============================================
  // 1. 簡轉繁（台灣用語）
  // ============================================

  /**
   * 簡體中文轉繁體中文（台灣用語）
   * 使用 OpenCC s2twp 模式：
   * - 字形轉換（体→體、国→國）
   * - 用語轉換（軟件→軟體、網絡→網路、內存→記憶體）
   *
   * @param {string} text - 簡體中文文字
   * @returns {Promise<string>} 繁體中文（台灣用語）
   */
  async function simplifiedToTraditional(text) {
    if (!text) return text;
    var converter = await loadOpenCC();
    return converter(text);
  }

  // ============================================
  // 2. 半形轉全形
  // ============================================

  // 半形 → 全形對照表
  var HALF_TO_FULL = {
    '!': '\uFF01', '"': '\uFF02', '#': '\uFF03', '$': '\uFF04',
    '%': '\uFF05', '&': '\uFF06', "'": '\uFF07', '(': '\uFF08',
    ')': '\uFF09', '*': '\uFF0A', '+': '\uFF0B', ',': '\uFF0C',
    '-': '\uFF0D', '.': '\uFF0E', '/': '\uFF0F', ':': '\uFF1A',
    ';': '\uFF1B', '<': '\uFF1C', '=': '\uFF1D', '>': '\uFF1E',
    '?': '\uFF1F', '@': '\uFF20', '[': '\uFF3B', '\\': '\uFF3C',
    ']': '\uFF3D', '^': '\uFF3E', '_': '\uFF3F', '`': '\uFF40',
    '{': '\uFF5B', '|': '\uFF5C', '}': '\uFF5D', '~': '\uFF5E',
  };

  // 半形數字 → 全形數字
  var HALF_DIGITS = '0123456789';
  var FULL_DIGITS = '\uFF10\uFF11\uFF12\uFF13\uFF14\uFF15\uFF16\uFF17\uFF18\uFF19';

  // 半形英文 → 全形英文
  // A-Z: 0xFF21-0xFF3A, a-z: 0xFF41-0xFF5A

  /**
   * 半形轉全形
   * @param {string} text
   * @param {object} options
   * @param {boolean} options.punctuation - 轉換標點符號（預設 true）
   * @param {boolean} options.digits - 轉換數字（預設 false，數字通常保持半形）
   * @param {boolean} options.letters - 轉換英文字母（預設 false，英文通常保持半形）
   * @returns {string}
   */
  function halfToFull(text, options) {
    if (!text) return text;
    var opt = options || {};
    var doPunct = opt.punctuation !== false;  // 預設轉
    var doDigits = opt.digits === true;       // 預設不轉
    var doLetters = opt.letters === true;     // 預設不轉

    var result = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      var code = ch.charCodeAt(0);

      // 標點符號
      if (doPunct && HALF_TO_FULL[ch]) {
        result += HALF_TO_FULL[ch];
        continue;
      }

      // 數字
      if (doDigits && code >= 0x30 && code <= 0x39) {
        result += FULL_DIGITS[code - 0x30];
        continue;
      }

      // 大寫英文
      if (doLetters && code >= 0x41 && code <= 0x5A) {
        result += String.fromCharCode(code + 0xFF21 - 0x41);
        continue;
      }

      // 小寫英文
      if (doLetters && code >= 0x61 && code <= 0x7A) {
        result += String.fromCharCode(code + 0xFF41 - 0x61);
        continue;
      }

      // 空格 → 全形空格（可選）
      if (doPunct && ch === ' ') {
        // 保留半形空格（中文排版通常不用全形空格）
        result += ch;
        continue;
      }

      result += ch;
    }
    return result;
  }

  // ============================================
  // 3. 標點符號台灣化
  // ============================================

  /**
   * 標點符號轉換對照表
   * 大陸 → 台灣
   */
  var PUNCT_MAP = [
    // 引號（最重要）
    [/\u201C/g, '\u300C'],   // " → 「
    [/\u201D/g, '\u300D'],   // " → 」
    [/\u2018/g, '\u300E'],   // ' → 『
    [/\u2019/g, '\u300F'],   // ' → 』
    [/"/g, '\u300C'],        // 半形 " 開頭 → 「
    // 注意：半形 " 不做全轉，因為可能在英文中

    // 書名號
    [/\u300A/g, '\u300A'],   // 《 保持（台灣也用）
    [/\u300B/g, '\u300B'],   // 》 保持

    // 破折號：大陸用兩個 EM DASH，台灣也用兩個
    // 不轉換

    // 省略號：大陸 …… 台灣也是 ……
    // 不轉換

    // 頓號：大陸和台灣都用 、
    // 不轉換

    // 間隔號
    [/\u00B7/g, '\uFF0E'],   // · → ．（台灣用全形句點當間隔號）
  ];

  /**
   * 智慧引號配對轉換
   * 偵測引號配對，正確轉換開關引號
   */
  function convertQuotesPaired(text) {
    // 處理直引號 "..." → 「...」
    var result = '';
    var inDoubleQuote = false;
    var inSingleQuote = false;

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];

      if (ch === '"') {
        if (!inDoubleQuote) {
          result += '\u300C'; // 「
          inDoubleQuote = true;
        } else {
          result += '\u300D'; // 」
          inDoubleQuote = false;
        }
      } else if (ch === "'") {
        // 只在前後都是中文時才轉（避免英文 apostrophe）
        var prev = i > 0 ? text.charCodeAt(i - 1) : 0;
        var next = i < text.length - 1 ? text.charCodeAt(i + 1) : 0;
        var prevIsCJK = prev > 0x2E80;
        var nextIsCJK = next > 0x2E80;

        if (prevIsCJK || nextIsCJK) {
          if (!inSingleQuote) {
            result += '\u300E'; // 『
            inSingleQuote = true;
          } else {
            result += '\u300F'; // 』
            inSingleQuote = false;
          }
        } else {
          result += ch;
        }
      } else {
        result += ch;
      }
    }
    return result;
  }

  /**
   * 標點符號台灣化
   * @param {string} text
   * @returns {string}
   */
  function convertPunctuation(text) {
    if (!text) return text;

    // 先處理引號配對
    var result = convertQuotesPaired(text);

    // 再處理其他標點
    for (var i = 0; i < PUNCT_MAP.length; i++) {
      result = result.replace(PUNCT_MAP[i][0], PUNCT_MAP[i][1]);
    }

    return result;
  }

  // ============================================
  // 4. 目錄偵測與編輯
  // ============================================

  /**
   * 章節偵測（移植自 txt-to-epub/chapterDetector.js）
   * 支援 20+ 種格式：中文章回、符號標記、英文 Chapter、
   * 括號編號、大寫數字、影集格式、空行分段、自訂分隔符等
   *
   * 偵測模式：
   *   auto — 自動用 pattern 比對，選命中數最多的那組
   *   emptyLines — 用連續空行分章
   *   separator — 用自訂分隔符（如 ===、---）
   *   keyword — 用自訂關鍵字
   *   single — 不分章，整本當一章
   */

  var CHAPTER_DETECT_PATTERNS = [
    { regex: /^[　\s]*(\[\d+\].*?)$/gm, name: '[數字]' },
    { regex: /^[　\s]*([☆★✦✧❖◆◇●○■□▲△▼▽♦♠♣♥♡※＊✿❀❁✾✽❃❋✯✰⊙◎►◀▶◁☉✠✡✢✣✤✥✩✪✫✬✭✮][、，,.\s]*[^\r\n]+?)$/gm, name: '符號標記' },
    { regex: /^[　\s]*(第[零一二三四五六七八九十百千\d]+[章節回卷篇集部話].*?)$/gm, name: '中文章節' },
    { regex: /^[　\s]*[^\w\s\u4e00-\u9fff]+\s*(\d+\s*章.*?)$/gm, name: '符號章節' },
    { regex: /^[　\s]*(Chapter\s+\d+.*?)$/gim, name: 'Chapter' },
    { regex: /^[　\s]*(CHAPTER\s+\d+.*?)$/gm, name: 'CHAPTER' },
    { regex: /^[　\s]*(\d+[\.、話]\s*.+?)$/gm, name: '數字編號' },
    { regex: /^[　\s]*([①②③④⑤⑥⑦⑧⑨⑩].+?)$/gm, name: '圈號' },
    { regex: /^[　\s]*(卷[零一二三四五六七八九十百千\d]+.*?)$/gm, name: '卷' },
    { regex: /^[　\s]*((?:序章|序幕|楔子|引子|前言|前記|終章|終幕|尾聲|後記|番外|番外[一二三四五六七八九十\d]*|番外篇).*?)$/gm, name: '特殊章節' },
    { regex: /^[　\s]*((?:Prologue|Epilogue|Interlude|Foreword|Afterword|Preface).*?)$/gim, name: 'Prologue' },
    { regex: /^[　\s]*((?:Ep\.?\s*\d+|EP\s*\d+).*?)$/gim, name: 'Ep' },
    { regex: /^[　\s]*((?:Act|ACT|Scene|SCENE|PART|Part|Book|BOOK)\s+[\dIVXivx]+.*?)$/gm, name: 'Act/Part' },
    { regex: /^[　\s]*((?:Vol\.?\s*\d+|Volume\s+\d+).*?)$/gim, name: 'Vol' },
    { regex: /^[　\s]*(【.+?】.*?)$/gm, name: '【】' },
    { regex: /^[　\s]*((?:[（(][零一二三四五六七八九十百\d]+[）)]).*?)$/gm, name: '括號編號' },
    { regex: /^[　\s]*([壹貳參肆伍陸柒捌玖拾][、，.\s].+?)$/gm, name: '大寫數字' },
    { regex: /^[　\s]*([一二三四五六七八九十]+[、].+?)$/gm, name: '中文數字' },
    { regex: /^[　\s]*(S\d+E\d+.*?)$/gim, name: '影集格式' },
    { regex: /^[　\s]*((?:Day|LOG|Page|PAGE)\s+\d+.*?)$/gim, name: 'Day/LOG' },
  ];

  /**
   * 從純文字中偵測章節（自動模式）
   * @param {string} text - 全文
   * @param {string} mode - 'auto'|'emptyLines'|'separator'|'keyword'|'single'
   * @param {object} options - { separator: '===', keyword: '第' }
   * @returns {Array<{name: string, position: number}>}
   */
  function detectChapters(text, mode, options) {
    if (!text) return [];
    mode = mode || 'auto';
    options = options || {};

    if (mode === 'single') return [{ name: '全文', position: 0 }];
    if (mode === 'emptyLines') return detectByEmptyLines(text);
    if (mode === 'separator' && options.separator) return detectBySeparator(text, options.separator);
    if (mode === 'keyword' && options.keyword) return detectByKeyword(text, options.keyword);
    return detectByPatterns(text);
  }

  function detectByPatterns(text) {
    // 各 pattern 分開收集，選命中數最多的那組
    var groups = [];
    for (var p = 0; p < CHAPTER_DETECT_PATTERNS.length; p++) {
      var re = new RegExp(CHAPTER_DETECT_PATTERNS[p].regex.source, CHAPTER_DETECT_PATTERNS[p].regex.flags);
      var found = [];
      var m;
      while ((m = re.exec(text)) !== null) {
        var lineStart = text.lastIndexOf('\n', m.index) + 1;
        var lineEnd = text.indexOf('\n', m.index);
        var fullLine = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).trim();
        if (fullLine.length > 40) continue; // 太長的不是標題
        found.push({ name: m[1].trim().substring(0, 40), position: m.index });
      }
      if (found.length >= 2) groups.push(found);
    }

    if (groups.length === 0) return [];

    // 選命中最多的
    groups.sort(function (a, b) { return b.length - a.length; });
    var matches = groups[0];

    // 去重（距離太近的合併）
    matches = matches.filter(function (m, i, arr) {
      if (i === 0) return true;
      return Math.abs(m.position - arr[i - 1].position) > 5;
    });

    // 如果第一個章節前有大段文字，加一個「序」
    if (matches.length > 0 && matches[0].position > 100) {
      matches.unshift({ name: '序', position: 0 });
    }

    return matches;
  }

  function detectByEmptyLines(text) {
    var blocks = text.split(/\n\s*\n\s*\n+/);
    var chapters = [];
    var pos = 0;
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i].trim();
      if (block.length === 0) { pos += blocks[i].length + 3; continue; }
      var firstLine = block.split('\n')[0].trim();
      var name = (firstLine.length <= 50 && firstLine.length > 0) ? firstLine : '章節 ' + (chapters.length + 1);
      chapters.push({ name: name, position: pos });
      pos += blocks[i].length + 3;
    }
    return chapters;
  }

  function detectBySeparator(text, separator) {
    var escaped = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var regex = new RegExp('^[\\s]*' + escaped + '+[\\s]*$', 'gm');
    var parts = text.split(regex);
    var chapters = [];
    var pos = 0;
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim();
      if (part.length === 0) { pos += parts[i].length + separator.length; continue; }
      var firstLine = part.split('\n')[0].trim();
      var name = (firstLine.length <= 50) ? firstLine : '章節 ' + (chapters.length + 1);
      chapters.push({ name: name, position: pos });
      pos += parts[i].length + separator.length;
    }
    return chapters;
  }

  function detectByKeyword(text, keyword) {
    var escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var regex = new RegExp('^[　\\s]*([^\\r\\n]*' + escaped + '[^\\r\\n]*?)$', 'gm');
    var matches = [];
    var m;
    while ((m = regex.exec(text)) !== null) {
      var line = m[1].trim();
      if (line.length > 40) continue;
      matches.push({ name: line, position: m.index });
    }
    matches = matches.filter(function (item, i, arr) {
      if (i === 0) return true;
      return Math.abs(item.position - arr[i - 1].position) > 5;
    });
    if (matches.length > 0 && matches[0].position > 100) {
      matches.unshift({ name: '序', position: 0 });
    }
    return matches;
  }

  /**
   * 分析文字，建議最佳偵測模式
   */
  function analyzeText(text) {
    var hasPatterns = false;
    var patternCount = 0;
    var detectedTypes = [];

    for (var p = 0; p < CHAPTER_DETECT_PATTERNS.length; p++) {
      var re = new RegExp(CHAPTER_DETECT_PATTERNS[p].regex.source, CHAPTER_DETECT_PATTERNS[p].regex.flags);
      var count = 0;
      while (re.exec(text) !== null) count++;
      if (count >= 2) {
        hasPatterns = true;
        patternCount += count;
        detectedTypes.push(CHAPTER_DETECT_PATTERNS[p].name + '(' + count + ')');
      }
    }

    var emptyLineBlocks = text.split(/\n\s*\n\s*\n/).length;

    var recommendation = 'auto';
    if (hasPatterns) recommendation = 'auto';
    else if (emptyLineBlocks >= 3 && emptyLineBlocks <= 200) recommendation = 'emptyLines';
    else recommendation = 'single';

    return {
      hasPatterns: hasPatterns,
      patternCount: patternCount,
      detectedTypes: detectedTypes,
      emptyLineBlocks: emptyLineBlocks,
      recommendation: recommendation,
    };
  }

  /**
   * 從 EPUB 的 TOC 提取章節
   * 如果 CREngine 已經解析了 TOC，直接用
   * @returns {Array<{name: string, page: number}>}
   */
  function getExistingTOC() {
    if (typeof currentToc !== 'undefined' && currentToc && currentToc.length > 0) {
      return currentToc.map(function (ch) {
        return {
          name: ch.title || ch.name || '(未命名)',
          page: ch.page || ch.startPage || 0,
        };
      });
    }
    return [];
  }

  // ============================================
  // 5. 整合：一鍵全部處理
  // ============================================

  /**
   * 一鍵處理所有文字轉換
   * @param {string} text - 原始文字
   * @param {object} options
   * @param {boolean} options.s2tw - 簡轉繁（預設 true）
   * @param {boolean} options.halfToFull - 半形轉全形標點（預設 true）
   * @param {boolean} options.punctuation - 標點台灣化（預設 true）
   * @returns {Promise<{text: string, chapters: Array, changes: object}>}
   */
  /**
   * 清理中文文字中的多餘空格
   * 簡體電子書常見問題：中文字之間被插入全形或多個半形空格
   * @param {string} text
   * @returns {string}
   */
  function cleanSpaces(text) {
    if (!text) return text;
    var result = text;
    // 中文字之間的全形空格（　）移除
    result = result.replace(/([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff，。！？；：、「」『』（）《》])\u3000([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff，。！？；：、「」『』（）《》])/g, '$1$2');
    // 中文字之間的多個半形空格壓成零（保留單個空格給中英混排）
    result = result.replace(/([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff，。！？；：、「」『』（）《》])\s{2,}([\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff，。！？；：、「」『』（）《》])/g, '$1$2');
    // 標點符號前後的多餘空格
    result = result.replace(/\s+([，。！？；：、」』）》])/g, '$1');
    result = result.replace(/([「『（《])\s+/g, '$1');
    return result;
  }

  async function processAll(text, options) {
    var opt = options || {};
    var doS2TW = opt.s2tw !== false;
    var doHalf = opt.halfToFull !== false;
    var doPunct = opt.punctuation !== false;
    var doClean = opt.cleanSpaces !== false;  // 預設開啟

    var result = text;
    var changes = { s2tw: 0, halfToFull: 0, punctuation: 0, cleanSpaces: 0 };

    // 0. 清理多餘空格（最先做）
    if (doClean) {
      var beforeClean = result;
      result = cleanSpaces(result);
      changes.cleanSpaces = beforeClean.length - result.length;
    }

    // 1. 簡轉繁
    if (doS2TW) {
      var before = result;
      result = await simplifiedToTraditional(result);
      // 計算變更字數
      for (var i = 0; i < Math.min(before.length, result.length); i++) {
        if (before[i] !== result[i]) changes.s2tw++;
      }
    }

    // 2. 半形轉全形（只轉標點，不轉英數）
    if (doHalf) {
      var before2 = result;
      result = halfToFull(result, { punctuation: true, digits: false, letters: false });
      for (var j = 0; j < Math.min(before2.length, result.length); j++) {
        if (before2[j] !== result[j]) changes.halfToFull++;
      }
    }

    // 3. 標點台灣化
    if (doPunct) {
      var before3 = result;
      result = convertPunctuation(result);
      for (var k = 0; k < Math.min(before3.length, result.length); k++) {
        if (before3[k] !== result[k]) changes.punctuation++;
      }
    }

    // 4. 偵測目錄
    var chapters = detectChapters(result);

    return {
      text: result,
      chapters: chapters,
      changes: changes,
    };
  }

  // ============================================
  // 掛到全域
  // ============================================
  window.TextTools = {
    // 個別功能
    simplifiedToTraditional: simplifiedToTraditional,
    halfToFull: halfToFull,
    convertPunctuation: convertPunctuation,
    cleanSpaces: cleanSpaces,
    detectChapters: detectChapters,
    analyzeText: analyzeText,
    getExistingTOC: getExistingTOC,

    // 一鍵全處理
    processAll: processAll,

    // 工具
    loadOpenCC: loadOpenCC,

    // 狀態
    isOpenCCLoaded: function () { return openccLoaded; },
  };

  console.log('[text-tools] 文字處理工具載入完成（簡轉繁、半全形、標點、目錄）');
})();
