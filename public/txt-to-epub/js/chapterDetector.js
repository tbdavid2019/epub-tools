/**
 * 章節偵測工具
 */

window.ChapterDetector = {
  MODES: {
    AUTO: 'auto',
    BY_EMPTY_LINES: 'emptyLines',
    BY_SEPARATOR: 'separator',
    SINGLE_CHAPTER: 'single',
  },

  detectChapters: function (text, mode, options) {
    mode = mode || 'auto';
    options = options || {};

    if (mode === 'emptyLines') return this._detectByEmptyLines(text);
    if (mode === 'separator' && options.separator) return this._detectBySeparator(text, options.separator);
    if (mode === 'keyword' && options.keyword) return this._detectByKeyword(text, options.keyword);
    if (mode === 'single') return [{ title: '全文', content: text }];
    return this._detectByPatterns(text);
  },

  analyzeText: function (text) {
    var analysis = {
      hasPatternChapters: false,
      patternChapterCount: 0,
      emptyLineBlocks: 0,
      detectedPatterns: [],
      recommendation: 'auto',
    };

    var patterns = [
      { regex: /^[　\s]*([☆★✦✧❖◆◇●○■□▲△▼▽♦♠♣♥♡※＊✿❀❁✾✽❃❋✯✰⊙◎►◀▶◁☉✠✡✢✣✤✥✩✪✫✬✭✮][、，,.\s]*[^\r\n]+?)$/gm, name: '符號標記' },
      { regex: /^[　\s]*(第[零一二三四五六七八九十百千\d]+[章節回卷篇集部話])/gm, name: '中文章節' },
      { regex: /^[　\s]*[^\w\s\u4e00-\u9fff]+\s*(\d+\s*章)/gm, name: '符號章節' },
      { regex: /^[　\s]*(Chapter\s+\d+)/gim, name: 'Chapter' },
      { regex: /^[　\s]*(\d+[\.、話]\s*.+?)$/gm, name: '數字編號' },
      { regex: /^[　\s]*((?:序章|序幕|楔子|引子|前言|前記|終章|終幕|尾聲|後記|番外|番外[一二三四五六七八九十\d]*|番外篇))/gm, name: '特殊章節' },
      { regex: /^[　\s]*((?:Prologue|Epilogue|Interlude|Foreword|Afterword|Preface))/gim, name: 'Prologue/Epilogue' },
      { regex: /^[　\s]*((?:Ep\.?\s*\d+|EP\s*\d+))/gim, name: 'Ep格式' },
      { regex: /^[　\s]*((?:Act|ACT|Scene|SCENE|PART|Part|Book|BOOK)\s+[\dIVXivx]+)/gm, name: 'Act/Part/Book' },
      { regex: /^[　\s]*((?:Vol\.?\s*\d+|Volume\s+\d+))/gim, name: 'Vol格式' },
      { regex: /^[　\s]*(【.+?】)/gm, name: '【】標題' },
      { regex: /^[　\s]*((?:[（(][零一二三四五六七八九十百\d]+[）)]))/gm, name: '括號編號' },
      { regex: /^[　\s]*([壹貳參肆伍陸柒捌玖拾][、，.\s])/gm, name: '大寫數字' },
      { regex: /^[　\s]*([一二三四五六七八九十]+[、])/gm, name: '中文數字' },
      { regex: /^[　\s]*(S\d+E\d+)/gim, name: '影集格式' },
      { regex: /^[　\s]*((?:Day|LOG|Page|PAGE)\s+\d+)/gim, name: 'Day/LOG/Page' },
    ];

    for (var p = 0; p < patterns.length; p++) {
      var matches = Array.from(text.matchAll(patterns[p].regex));
      if (matches.length >= 2) {
        analysis.hasPatternChapters = true;
        analysis.patternChapterCount += matches.length;
        analysis.detectedPatterns.push(patterns[p].name + '（' + matches.length + ' 處）');
      }
    }

    var bracketMatches = Array.from(text.matchAll(/^\s*\[(\d+)\]/gm));
    if (bracketMatches.length >= 2) {
      analysis.hasPatternChapters = true;
      analysis.patternChapterCount += bracketMatches.length;
      analysis.detectedPatterns.push('[數字] 格式（' + bracketMatches.length + ' 處）');
    }

    analysis.emptyLineBlocks = text.split(/\n\s*\n\s*\n/).length;

    if (analysis.hasPatternChapters) {
      analysis.recommendation = 'auto';
    } else if (analysis.emptyLineBlocks >= 3 && analysis.emptyLineBlocks <= 200) {
      analysis.recommendation = 'emptyLines';
    } else {
      analysis.recommendation = 'single';
    }

    return analysis;
  },

  detectBookMetadata: function (text, fileName) {
    fileName = fileName || '';
    var result = { title: fileName, author: '' };

    if (fileName) {
      var fileNamePatterns = [
        { regex: /^《(.+?)》\s*[-_—]?\s*(.+?)$/, titleIdx: 1, authorIdx: 2 },
        { regex: /^(.+?)\s*[-_—]?\s*《(.+?)》$/, titleIdx: 2, authorIdx: 1 },
        { regex: /^[\[【](.+?)[\]】]\s*[-_—]?\s*(.+?)$/, titleIdx: 2, authorIdx: 1 },
        { regex: /^(.+?)\s+[Bb][Yy]\s+(.+?)$/, titleIdx: 1, authorIdx: 2 },
        { regex: /^(.+?)\s*[（(](.+?)[）)]$/, titleIdx: 1, authorIdx: 2 },
        { regex: /^(.+?)\s*[-_—]\s*(.+?)$/, titleIdx: null, authorIdx: null },
      ];

      for (var i = 0; i < fileNamePatterns.length; i++) {
        var match = fileName.match(fileNamePatterns[i].regex);
        if (match) {
          if (fileNamePatterns[i].titleIdx !== null) {
            result.title = match[fileNamePatterns[i].titleIdx].trim();
            result.author = match[fileNamePatterns[i].authorIdx].trim();
          } else {
            // author-title heuristic
            if (match[1].length > match[2].length * 2 && match[2].length <= 10) {
              result.title = match[1].trim();
              result.author = match[2].trim();
            } else {
              result.author = match[1].trim();
              result.title = match[2].trim();
            }
          }
          break;
        }
      }
    }

    // Detect from text content
    var lines = text.split('\n').slice(0, 30);
    for (var j = 0; j < lines.length; j++) {
      var line = lines[j].trim();
      if (!line || line.length > 60) continue;

      var authorPatterns = [
        /^(?:作者|著者|原著|作|文|撰)[\s]*[：:︰]\s*(.+?)$/i,
        /^(.{2,15})\s*[著作撰文]$/,
      ];
      for (var a = 0; a < authorPatterns.length; a++) {
        var am = line.match(authorPatterns[a]);
        if (am && am[1].trim().length >= 2 && am[1].trim().length <= 20) {
          result.author = am[1].trim();
          break;
        }
      }
    }

    return result;
  },

  _detectByPatterns: function (text) {
    var patterns = [
      /^[　\s]*(\[\d+\].*?)$/gm,
      // 符號標記（☆★✿◆■ 等網路小說格式）
      /^[　\s]*([☆★✦✧❖◆◇●○■□▲△▼▽♦♠♣♥♡※＊✿❀❁✾✽❃❋✯✰⊙◎►◀▶◁☉✠✡✢✣✤✥✩✪✫✬✭✮][、，,.\s]*[^\r\n]+?)$/gm,
      /^[　\s]*(第[零一二三四五六七八九十百千\d]+[章節回卷篇集部話].*?)$/gm,
      /^[　\s]*[^\w\s\u4e00-\u9fff]+\s*(\d+\s*章.*?)$/gm,
      /^[　\s]*(Chapter\s+\d+.*?)$/gim,
      /^[　\s]*(CHAPTER\s+\d+.*?)$/gm,
      /^[　\s]*(\d+[\.、話]\s*.+?)$/gm,
      /^[　\s]*([①②③④⑤⑥⑦⑧⑨⑩].+?)$/gm,
      /^[　\s]*(卷[零一二三四五六七八九十百千\d]+.*?)$/gm,
      // 特殊章節詞（序章/楔子/番外/終章/尾聲/後記等）
      /^[　\s]*((?:序章|序幕|楔子|引子|前言|前記|終章|終幕|尾聲|後記|番外|番外[一二三四五六七八九十\d]*|番外篇).*?)$/gm,
      // Prologue / Epilogue 等
      /^[　\s]*((?:Prologue|Epilogue|Interlude|Foreword|Afterword|Preface).*?)$/gim,
      // Ep / EP 格式
      /^[　\s]*((?:Ep\.?\s*\d+|EP\s*\d+).*?)$/gim,
      // Act / Scene / PART / Book
      /^[　\s]*((?:Act|ACT|Scene|SCENE|PART|Part|Book|BOOK)\s+[\dIVXivx]+.*?)$/gm,
      // Vol / Volume
      /^[　\s]*((?:Vol\.?\s*\d+|Volume\s+\d+).*?)$/gim,
      // 【】括號標題
      /^[　\s]*(【.+?】.*?)$/gm,
      // （一）(1) 括號編號
      /^[　\s]*((?:[（(][零一二三四五六七八九十百\d]+[）)]).*?)$/gm,
      // 壹、貳、參... 大寫數字
      /^[　\s]*([壹貳參肆伍陸柒捌玖拾][、，.\s].+?)$/gm,
      // 一、二、三... 中文數字
      /^[　\s]*([一二三四五六七八九十]+[、].+?)$/gm,
      // S01E01 影集格式
      /^[　\s]*(S\d+E\d+.*?)$/gim,
      // Day / LOG / Page
      /^[　\s]*((?:Day|LOG|Page|PAGE)\s+\d+.*?)$/gim,
    ];

    // 各 pattern 分開收集，選命中數最多的那組
    var groups = [];
    for (var p = 0; p < patterns.length; p++) {
      var found = Array.from(text.matchAll(patterns[p]));
      var group = [];
      for (var f = 0; f < found.length; f++) {
        var lineStart = text.lastIndexOf('\n', found[f].index) + 1;
        var lineEnd = text.indexOf('\n', found[f].index);
        var fullLine = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).trim();
        if (fullLine.length > 30) continue;
        var rawTitle = found[f][1].trim();
        // 清理符號前綴和多餘編號（如 ☆、1第 1 章 → 第 1 章、★ 番外 → 番外）
        rawTitle = rawTitle.replace(/^[☆★✦✧❖◆◇●○■□▲△▼▽♦♠♣♥♡※＊✿❀❁✾✽❃❋✯✰⊙◎►◀▶◁☉✠✡✢✣✤✥✩✪✫✬✭✮][、，,.\s]*\d*[、，,.\s]*/, '');
        if (!rawTitle) rawTitle = found[f][1].trim(); // fallback
        group.push({ title: rawTitle, index: found[f].index });
      }
      if (group.length >= 2) groups.push(group);
    }

    // 選命中數最多的 pattern 組
    var matches = [];
    if (groups.length > 0) {
      groups.sort(function (a, b) { return b.length - a.length; });
      matches = groups[0];
    }

    matches.sort(function (a, b) { return a.index - b.index; });
    matches = matches.filter(function (m, i, arr) {
      if (i === 0) return true;
      return Math.abs(m.index - arr[i - 1].index) > 5;
    });

    if (matches.length === 0) return [{ title: '全文', content: text }];

    var chapters = [];
    for (var i = 0; i < matches.length; i++) {
      var start = matches[i].index;
      var end = i < matches.length - 1 ? matches[i + 1].index : text.length;
      // 剝掉章節標題那一行（避免內文重複出現標題行）
      // epubGenerator 會自己印 <h1>{title}</h1>，content 不需要再含標題
      var rawSlice = text.slice(start, end);
      var firstNewline = rawSlice.indexOf('\n');
      var bodyOnly = firstNewline === -1 ? '' : rawSlice.slice(firstNewline + 1);
      chapters.push({ title: matches[i].title, content: bodyOnly.trim() });
    }

    if (matches.length > 0 && matches[0].index > 100) {
      var preface = text.slice(0, matches[0].index).trim();
      if (preface.length > 50) {
        chapters.unshift({ title: '序', content: preface });
      }
    }

    return chapters;
  },

  _detectByEmptyLines: function (text) {
    var blocks = text.split(/\n\s*\n\s*\n+/).map(function (b) { return b.trim(); }).filter(function (b) { return b.length > 0; });
    if (blocks.length <= 1) return [{ title: '全文', content: text }];

    return blocks.map(function (block, index) {
      var firstLine = block.split('\n')[0].trim();
      var titleFromLine = firstLine.length <= 50 && firstLine.length > 0;
      var title = titleFromLine ? firstLine : '章節 ' + (index + 1);
      // 只有「第一行被當成標題」時才把那行從 content 剝掉，避免 <h1> 跟 <p> 重複
      var content = titleFromLine ? block.slice(block.indexOf('\n') + 1).trim() : block;
      return { title: title, content: content };
    });
  },

  _detectBySeparator: function (text, separator) {
    var escaped = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var regex = new RegExp('^[\\s]*' + escaped + '+[\\s]*$', 'gm');
    var blocks = text.split(regex).map(function (b) { return b.trim(); }).filter(function (b) { return b.length > 0; });

    if (blocks.length <= 1) return [{ title: '全文', content: text }];

    return blocks.map(function (block, index) {
      var firstLine = block.split('\n')[0].trim();
      var titleFromLine = firstLine.length <= 50 && firstLine.length > 0;
      var title = titleFromLine ? firstLine : '章節 ' + (index + 1);
      var content = titleFromLine ? block.slice(block.indexOf('\n') + 1).trim() : block;
      return { title: title, content: content };
    });
  },

  /**
   * 依自訂關鍵字偵測章節
   * 找出包含關鍵字的短行（<=40字）作為章節標題
   */
  _detectByKeyword: function (text, keyword) {
    if (!keyword || !keyword.trim()) return [{ title: '全文', content: text }];

    var escaped = keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var regex = new RegExp('^[　\\s]*([^\\r\\n]*' + escaped + '[^\\r\\n]*?)$', 'gm');
    var found = Array.from(text.matchAll(regex));
    var matches = [];
    for (var i = 0; i < found.length; i++) {
      var lineStart = text.lastIndexOf('\n', found[i].index) + 1;
      var lineEnd = text.indexOf('\n', found[i].index);
      var fullLine = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).trim();
      if (fullLine.length > 40) continue;
      matches.push({ title: found[i][1].trim(), index: found[i].index });
    }

    // 去重
    matches = matches.filter(function (m, idx, arr) {
      if (idx === 0) return true;
      return Math.abs(m.index - arr[idx - 1].index) > 5;
    });

    if (matches.length === 0) return [{ title: '全文', content: text }];

    var chapters = [];
    for (var j = 0; j < matches.length; j++) {
      var start = matches[j].index;
      var end = j < matches.length - 1 ? matches[j + 1].index : text.length;
      // 剝掉章節標題那一行（避免 <h1> 跟 <p> 內文第一段重複）
      var rawSlice = text.slice(start, end);
      var firstNewline = rawSlice.indexOf('\n');
      var bodyOnly = firstNewline === -1 ? '' : rawSlice.slice(firstNewline + 1);
      chapters.push({ title: matches[j].title, content: bodyOnly.trim() });
    }

    // 序言
    if (matches.length > 0 && matches[0].index > 100) {
      var preface = text.slice(0, matches[0].index).trim();
      if (preface.length > 50) {
        chapters.unshift({ title: '序', content: preface });
      }
    }

    return chapters;
  }
};
