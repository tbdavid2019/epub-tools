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
      { regex: /^[　\s]*(第[零一二三四五六七八九十百千\d]+[章節回卷篇集部])/gm, name: '中文章節' },
      { regex: /^[　\s]*(Chapter\s+\d+)/gim, name: 'Chapter' },
      { regex: /^[　\s]*(\d+[\.、]\s*.+?)$/gm, name: '數字編號' },
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
      /^[　\s]*(第[零一二三四五六七八九十百千\d]+[章節回卷篇集部].*?)$/gm,
      /^[　\s]*(Chapter\s+\d+.*?)$/gim,
      /^[　\s]*(CHAPTER\s+\d+.*?)$/gm,
      /^[　\s]*(\d+[\.、]\s*.+?)$/gm,
      /^[　\s]*([①②③④⑤⑥⑦⑧⑨⑩].+?)$/gm,
      /^[　\s]*(卷[零一二三四五六七八九十百千\d]+.*?)$/gm,
    ];

    var matches = [];
    for (var p = 0; p < patterns.length; p++) {
      var found = Array.from(text.matchAll(patterns[p]));
      for (var f = 0; f < found.length; f++) {
        matches.push({ title: found[f][1].trim(), index: found[f].index });
      }
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
      chapters.push({ title: matches[i].title, content: text.slice(start, end).trim() });
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
      var title = (firstLine.length <= 50 && firstLine.length > 0) ? firstLine : '章節 ' + (index + 1);
      return { title: title, content: block };
    });
  },

  _detectBySeparator: function (text, separator) {
    var escaped = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var regex = new RegExp('^[\\s]*' + escaped + '+[\\s]*$', 'gm');
    var blocks = text.split(regex).map(function (b) { return b.trim(); }).filter(function (b) { return b.length > 0; });

    if (blocks.length <= 1) return [{ title: '全文', content: text }];

    return blocks.map(function (block, index) {
      var firstLine = block.split('\n')[0].trim();
      var title = (firstLine.length <= 50 && firstLine.length > 0) ? firstLine : '章節 ' + (index + 1);
      return { title: title, content: block };
    });
  }
};
