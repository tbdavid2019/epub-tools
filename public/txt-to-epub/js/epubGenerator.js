/**
 * EPUB 生成器
 */

var SIZE_MAP = { 'small': '0.9em', 'medium': '1em', 'large': '1.15em', 'xlarge': '1.3em' };
var LINE_HEIGHT_MAP = { 'compact': '1.5', 'normal': '1.8', 'relaxed': '2.0', 'loose': '2.3' };
var INDENT_MAP = { 'none': '0', 'one': '1em', 'two': '2em' };

var FONT_CONFIG = {
  'noto-sans': { id: 'noto-sans', name: '思源黑體', family: 'Noto Sans TC', description: '清晰俐落，適合螢幕閱讀' },
  'noto-serif': { id: 'noto-serif', name: '思源宋體', family: 'Noto Serif TC', description: '典雅正式，適合長篇小說' },
  'guankiap': { id: 'guankiap', name: '原俠正楷', family: 'GuanKiapTsingKhai TW', description: '手寫楷書，溫暖文青感' },
  'huninn': { id: 'huninn', name: 'jf 粉圓', family: 'jf-openhuninn', description: '可愛圓體，活潑輕鬆' },
  'custom': { id: 'custom', name: '自訂字體', family: 'CustomUserFont', description: '上傳你自己的字體檔（請確認授權）' },
};

// 副檔名對應的 MIME type 與 EPUB 內檔名
function getCustomFontMeta(file) {
  var name = (file.name || '').toLowerCase();
  if (name.endsWith('.woff2')) return { ext: 'woff2', mime: 'font/woff2', format: 'woff2' };
  if (name.endsWith('.woff')) return { ext: 'woff', mime: 'font/woff', format: 'woff' };
  if (name.endsWith('.otf')) return { ext: 'otf', mime: 'font/otf', format: 'opentype' };
  return { ext: 'ttf', mime: 'font/ttf', format: 'truetype' };
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── HarfBuzz WASM 子集化 ──
// 從 jsDelivr CDN 載入 hb-subset.wasm，把字體只保留書中用到的字元
var _hbExportsPromise = null;
function loadHbSubset() {
  if (_hbExportsPromise) return _hbExportsPromise;
  _hbExportsPromise = (async function () {
    var resp = await fetch('https://cdn.jsdelivr.net/npm/harfbuzzjs@0.4.11/hb-subset.wasm');
    if (!resp.ok) throw new Error('載入 hb-subset.wasm 失敗：' + resp.status);
    var bytes = await resp.arrayBuffer();
    var result = await WebAssembly.instantiate(bytes);
    return result.instance.exports;
  })();
  return _hbExportsPromise;
}

// 從 sfnt（TTF/OTF）的 name table 讀出字體實際 family name
// 這很重要 — 很多 EPUB 閱讀器會比對字體檔內部的 name 而不是 CSS 給的名字，
// 所以 CSS 必須用字體的真實 family name，否則 @font-face 會被忽略。
function readFontFamilyName(arrayBuffer) {
  try {
    var view = new DataView(arrayBuffer);
    var sfntVersion = view.getUint32(0);
    // 必須是合法 sfnt（TrueType 0x00010000、OpenType 'OTTO' 0x4F54544F）
    if (sfntVersion !== 0x00010000 && sfntVersion !== 0x4F54544F && sfntVersion !== 0x74727565) {
      return null;  // 可能是 woff/woff2，跳過自動偵測
    }
    var numTables = view.getUint16(4);
    var nameOffset = null, nameLength = null;
    for (var i = 0; i < numTables; i++) {
      var recOffset = 12 + i * 16;
      var tag = String.fromCharCode(
        view.getUint8(recOffset),
        view.getUint8(recOffset + 1),
        view.getUint8(recOffset + 2),
        view.getUint8(recOffset + 3)
      );
      if (tag === 'name') {
        nameOffset = view.getUint32(recOffset + 8);
        nameLength = view.getUint32(recOffset + 12);
        break;
      }
    }
    if (nameOffset === null) return null;
    var count = view.getUint16(nameOffset + 2);
    var stringOffset = view.getUint16(nameOffset + 4);
    // 偏好順序：Win Unicode (3,1) Family (1)，再退到 Mac Roman (1,0) Family (1)
    var candidates = [];
    for (var r = 0; r < count; r++) {
      var rec = nameOffset + 6 + r * 12;
      var platformID = view.getUint16(rec);
      var encodingID = view.getUint16(rec + 2);
      var nameID = view.getUint16(rec + 6);
      var sLen = view.getUint16(rec + 8);
      var sOff = view.getUint16(rec + 10);
      // 只收 nameID 1 (Family Name) 或 16 (Typographic Family Name，較新規範)
      if (nameID !== 1 && nameID !== 16) continue;
      var raw = new Uint8Array(arrayBuffer, nameOffset + stringOffset + sOff, sLen);
      var str;
      if (platformID === 3 || (platformID === 0 && encodingID >= 3)) {
        // UTF-16 BE
        var chars = [];
        for (var k = 0; k < raw.length; k += 2) {
          chars.push(String.fromCharCode((raw[k] << 8) | raw[k + 1]));
        }
        str = chars.join('');
      } else {
        // 假設 ASCII / Mac Roman
        str = String.fromCharCode.apply(null, raw);
      }
      candidates.push({ priority: (nameID === 16 ? 0 : 1) + (platformID === 3 ? 0 : 10), name: str });
    }
    if (candidates.length === 0) return null;
    candidates.sort(function (a, b) { return a.priority - b.priority; });
    return candidates[0].name;
  } catch (e) {
    console.warn('讀取字體 family name 失敗：', e);
    return null;
  }
}

// 從章節文字中收集所有用到的 unicode codepoint
function collectCodepoints(chapters, title, author) {
  var set = new Set();
  // 把書名/作者也加進去
  function addText(t) {
    if (!t) return;
    for (var i = 0; i < t.length; i++) {
      var cp = t.codePointAt(i);
      set.add(cp);
      // surrogate pair：跳過第二個 code unit
      if (cp > 0xFFFF) i++;
    }
  }
  addText(title);
  addText(author);
  for (var c = 0; c < chapters.length; c++) {
    addText(chapters[c].title);
    addText(chapters[c].content);
  }
  // 加上常用 ASCII（標點、數字、英字）— 確保介面上的數字章節編號等能顯示
  for (var ascii = 0x20; ascii < 0x7F; ascii++) set.add(ascii);
  return set;
}

// 用 hb-subset 對字體做子集化
async function subsetFontWithHarfBuzz(fontArrayBuffer, codepointSet, onProgress) {
  onProgress && onProgress({ stage: 'font', message: '正在載入子集化引擎...' });
  var exports = await loadHbSubset();

  onProgress && onProgress({ stage: 'font', message: '正在分析字體（' + codepointSet.size + ' 個字元）...' });
  var heapu8 = new Uint8Array(exports.memory.buffer);
  var fontBytes = new Uint8Array(fontArrayBuffer);

  // 配記憶體放原始字體
  var fontPtr = exports.malloc(fontBytes.byteLength);
  // memory grow 後 buffer reference 會失效，所以每次都重新拿 view
  new Uint8Array(exports.memory.buffer).set(fontBytes, fontPtr);

  var blob = exports.hb_blob_create(fontPtr, fontBytes.byteLength, 2 /* HB_MEMORY_MODE_WRITABLE */, 0, 0);
  var face = exports.hb_face_create(blob, 0);
  exports.hb_blob_destroy(blob);

  var input = exports.hb_subset_input_create_or_fail();
  if (!input) {
    exports.hb_face_destroy(face);
    exports.free(fontPtr);
    throw new Error('hb_subset_input_create_or_fail 回傳 null');
  }
  var unicodeSet = exports.hb_subset_input_unicode_set(input);
  codepointSet.forEach(function (cp) {
    exports.hb_set_add(unicodeSet, cp);
  });

  onProgress && onProgress({ stage: 'font', message: '正在精簡字體（保留 ' + codepointSet.size + ' 個字元）...' });
  var subsetFace = exports.hb_subset_or_fail(face, input);
  exports.hb_subset_input_destroy(input);
  if (!subsetFace) {
    exports.hb_face_destroy(face);
    exports.free(fontPtr);
    throw new Error('hb_subset_or_fail 失敗');
  }

  var resultBlob = exports.hb_face_reference_blob(subsetFace);
  var offset = exports.hb_blob_get_data(resultBlob, 0);
  var subsetLength = exports.hb_blob_get_length(resultBlob);
  if (subsetLength === 0) {
    exports.hb_blob_destroy(resultBlob);
    exports.hb_face_destroy(subsetFace);
    exports.hb_face_destroy(face);
    exports.free(fontPtr);
    throw new Error('子集化後字體大小為 0');
  }

  // 拷貝出來（grow 後的 buffer 才安全）
  var resultView = new Uint8Array(exports.memory.buffer, offset, subsetLength);
  var subsetData = new Uint8Array(subsetLength);
  subsetData.set(resultView);

  // 清理
  exports.hb_blob_destroy(resultBlob);
  exports.hb_face_destroy(subsetFace);
  exports.hb_face_destroy(face);
  exports.free(fontPtr);

  return subsetData.buffer;
}

window.EpubGenerator = {
  FONT_CONFIG: FONT_CONFIG,

  generateEpub: async function (opts) {
    var title = opts.title || '未命名';
    var author = opts.author || '';
    var chapters = opts.chapters || [];
    var cover = opts.cover || null;
    var writingMode = opts.writingMode || 'horizontal';
    var fontFamily = opts.fontFamily || 'noto-sans';
    var fontSize = opts.fontSize || 'medium';
    var lineHeight = opts.lineHeight || 'normal';
    var textIndent = opts.textIndent || 'two';
    var customFont = opts.customFont || null;  // File 物件（使用者上傳的字體）
    var onProgress = opts.onProgress || function () {};

    var zip = new JSZip();
    var bookId = 'urn:uuid:' + crypto.randomUUID();
    var isVertical = writingMode === 'vertical';

    var useCustom = fontFamily === 'custom' && customFont;
    var fontConfig = useCustom ? FONT_CONFIG['custom'] : (FONT_CONFIG[fontFamily] || FONT_CONFIG['noto-sans']);
    // 自訂字體拿不到時退回思源黑體
    if (fontFamily === 'custom' && !customFont) fontConfig = FONT_CONFIG['noto-sans'];
    var fontImportant = useCustom ? ' !important' : '';
    // fontFamilyCSS 自訂字體分支會等讀完字體真實 family name 再決定（在下方字體處理區塊）
    var fontFamilyCSS = useCustom
      ? null
      : '"' + fontConfig.family + '", "Noto Sans TC", sans-serif';
    var fontSizeValue = SIZE_MAP[fontSize] || SIZE_MAP['medium'];
    var lineHeightValue = LINE_HEIGHT_MAP[lineHeight] || LINE_HEIGHT_MAP['normal'];
    var textIndentValue = INDENT_MAP[textIndent] || INDENT_MAP['two'];

    onProgress({ stage: 'structure', message: '正在建立 EPUB 結構...' });

    // mimetype
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    // container.xml
    zip.file('META-INF/container.xml',
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n' +
      '  <rootfiles>\n' +
      '    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>\n' +
      '  </rootfiles>\n' +
      '</container>'
    );

    // Cover
    var coverManifest = '';
    var coverSpine = '';
    if (cover) {
      var coverData = await cover.arrayBuffer();
      zip.file('OEBPS/images/cover.jpg', coverData);
      coverManifest = '<item id="cover-image" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>';
      coverSpine = '<itemref idref="cover"/>';
      zip.file('OEBPS/cover.xhtml',
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<!DOCTYPE html>\n' +
        '<html xmlns="http://www.w3.org/1999/xhtml">\n' +
        '<head><title>封面</title></head>\n' +
        '<body style="margin:0;padding:0;text-align:center;">\n' +
        '<img src="images/cover.jpg" alt="封面" style="max-width:100%;max-height:100vh;"/>\n' +
        '</body>\n</html>'
      );
      coverManifest += '\n    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>';
    }

    onProgress({ stage: 'css', message: '正在產生樣式表...' });

    // 自訂字體：子集化（只保留書中用到的字）後嵌入 EPUB
    var fontFaceCSS = '';
    var fontManifest = '';
    var actualFontFamily = 'CustomUserFont';  // 預設名稱，之後若能讀到字體真實 family name 就會被覆蓋
    if (useCustom) {
      var fontMeta = getCustomFontMeta(customFont);
      var rawFontData = await customFont.arrayBuffer();
      var fontDataToEmbed = rawFontData;
      var subsetExt = fontMeta.ext;
      var subsetMime = fontMeta.mime;
      var subsetFormat = fontMeta.format;
      // hb-subset 輸出統一是 sfnt（TTF/OTF），把 woff/woff2 子集化後也改用 ttf 副檔名
      try {
        var codepoints = collectCodepoints(chapters, title, author);
        var subsetBuffer = await subsetFontWithHarfBuzz(rawFontData, codepoints, onProgress);
        fontDataToEmbed = subsetBuffer;
        // 子集化輸出是 sfnt，直接用 ttf
        subsetExt = 'ttf';
        subsetMime = 'font/ttf';
        subsetFormat = 'truetype';
        var origMB = (rawFontData.byteLength / 1048576).toFixed(2);
        var subMB = (subsetBuffer.byteLength / 1048576).toFixed(2);
        onProgress({ stage: 'font', message: '字體精簡完成（' + origMB + ' MB → ' + subMB + ' MB）' });
      } catch (subErr) {
        console.warn('字體子集化失敗，改用原始字體：', subErr);
        onProgress({ stage: 'font', message: '字體子集化失敗，改用原始字體（' + (rawFontData.byteLength / 1048576).toFixed(1) + ' MB）' });
      }
      // 讀字體實際 family name（從子集化後的字體讀，因為閱讀器看到的是這個檔案）
      var realName = readFontFamilyName(fontDataToEmbed);
      if (realName) {
        actualFontFamily = realName;
        onProgress({ stage: 'font', message: '字體名稱：' + realName });
      }
      var fontFilename = 'user-font.' + subsetExt;
      zip.file('OEBPS/fonts/' + fontFilename, fontDataToEmbed);
      // CSS 用字體真實名稱（避免閱讀器比對 family name 失敗而忽略 @font-face）
      // 同時宣告 CustomUserFont 別名，雙保險
      fontFaceCSS =
        '@font-face {\n' +
        '  font-family: "' + actualFontFamily + '";\n' +
        '  src: url("fonts/' + fontFilename + '") format("' + subsetFormat + '");\n' +
        '  font-weight: normal;\n' +
        '  font-style: normal;\n' +
        '}\n' +
        '@font-face {\n' +
        '  font-family: "CustomUserFont";\n' +
        '  src: url("fonts/' + fontFilename + '") format("' + subsetFormat + '");\n' +
        '  font-weight: normal;\n' +
        '  font-style: normal;\n' +
        '}\n\n';
      fontManifest = '<item id="user-font" href="fonts/' + fontFilename + '" media-type="' + subsetMime + '"/>';
      // 設定 fontFamilyCSS — 真實名稱優先，CustomUserFont 為 alias，再 fallback 通用族
      fontFamilyCSS = '"' + actualFontFamily + '", "CustomUserFont", sans-serif';
    }

    // CSS
    var verticalCSS = isVertical ? '\n  writing-mode: vertical-rl;\n  -webkit-writing-mode: vertical-rl;\n  -epub-writing-mode: vertical-rl;\n  text-orientation: mixed;' : '';
    // 自訂字體用 !important + 全域 * 選擇器強制覆蓋，避免被閱讀器系統字體吃掉
    var globalFontRule = useCustom
      ? '* {\n  font-family: ' + fontFamilyCSS + fontImportant + ';\n}\n\n'
      : '';
    var css = fontFaceCSS + globalFontRule +
      'body {\n' +
      '  font-family: ' + fontFamilyCSS + fontImportant + ';\n' +
      '  font-size: ' + fontSizeValue + ';\n' +
      '  line-height: ' + lineHeightValue + ';\n' +
      '  padding: 1em;\n' +
      '  margin: 0;\n' +
      '  text-align: justify;' + verticalCSS + '\n' +
      '}\n\n' +
      'h1 {\n' +
      '  font-family: ' + fontFamilyCSS + fontImportant + ';\n' +
      '  font-size: 1.5em;\n' +
      '  font-weight: bold;\n' +
      '  margin: 1.5em 0 1em 0;\n' +
      '  line-height: 1.3;\n' +
      '  text-align: ' + (isVertical ? 'center' : 'left') + ';\n' +
      '}\n\n' +
      'p {\n' +
      '  font-family: ' + fontFamilyCSS + fontImportant + ';\n' +
      '  text-indent: ' + textIndentValue + ';\n' +
      '  margin: 0.5em 0;\n' +
      '  hanging-punctuation: allow-end;\n' +
      '}\n';
    zip.file('OEBPS/styles/main.css', css);

    onProgress({ stage: 'chapters', message: '正在處理章節...' });

    // Chapters
    var chapterManifest = [];
    var chapterSpine = [];

    for (var i = 0; i < chapters.length; i++) {
      var id = 'chapter' + (i + 1);
      var fname = id + '.xhtml';

      var paragraphs = chapters[i].content
        .split(/\n+/)
        .filter(function (p) { return p.trim(); })
        .map(function (p) { return '<p>' + escapeHtml(p.trim()) + '</p>'; })
        .join('\n');

      var xhtml =
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<!DOCTYPE html>\n' +
        '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">\n' +
        '<head>\n  <meta charset="UTF-8"/>\n  <title>' + escapeHtml(chapters[i].title) + '</title>\n' +
        '  <link rel="stylesheet" type="text/css" href="styles/main.css"/>\n</head>\n' +
        '<body>\n  <h1>' + escapeHtml(chapters[i].title) + '</h1>\n  ' + paragraphs + '\n</body>\n</html>';

      zip.file('OEBPS/' + fname, xhtml);
      chapterManifest.push('<item id="' + id + '" href="' + fname + '" media-type="application/xhtml+xml"/>');
      chapterSpine.push('<itemref idref="' + id + '"/>');
    }

    onProgress({ stage: 'toc', message: '正在建立目錄...' });

    // toc.ncx
    var navPoints = chapters.map(function (ch, i) {
      return '    <navPoint id="navpoint-' + (i + 1) + '" playOrder="' + (i + 1) + '">\n' +
        '      <navLabel><text>' + escapeHtml(ch.title) + '</text></navLabel>\n' +
        '      <content src="chapter' + (i + 1) + '.xhtml"/>\n    </navPoint>';
    }).join('\n');

    zip.file('OEBPS/toc.ncx',
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n' +
      '  <head><meta name="dtb:uid" content="' + bookId + '"/></head>\n' +
      '  <docTitle><text>' + escapeHtml(title) + '</text></docTitle>\n' +
      '  <navMap>\n' + navPoints + '\n  </navMap>\n</ncx>'
    );

    // nav.xhtml
    var navItems = chapters.map(function (ch, i) {
      return '      <li><a href="chapter' + (i + 1) + '.xhtml">' + escapeHtml(ch.title) + '</a></li>';
    }).join('\n');

    zip.file('OEBPS/nav.xhtml',
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<!DOCTYPE html>\n' +
      '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">\n' +
      '<head><meta charset="UTF-8"/><title>目錄</title>\n' +
      '  <link rel="stylesheet" type="text/css" href="styles/main.css"/>\n</head>\n' +
      '<body>\n  <nav epub:type="toc">\n    <h1>目錄</h1>\n    <ol>\n' +
      navItems + '\n    </ol>\n  </nav>\n</body>\n</html>'
    );

    onProgress({ stage: 'opf', message: '正在產生套件描述...' });

    // content.opf
    var opf =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">\n' +
      '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
      '    <dc:identifier id="bookid">' + bookId + '</dc:identifier>\n' +
      '    <dc:title>' + escapeHtml(title) + '</dc:title>\n' +
      '    <dc:creator>' + escapeHtml(author || '未知') + '</dc:creator>\n' +
      '    <dc:language>zh-TW</dc:language>\n' +
      '    <meta property="dcterms:modified">' + new Date().toISOString().split('.')[0] + 'Z</meta>\n' +
      '  </metadata>\n' +
      '  <manifest>\n' +
      '    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>\n' +
      '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n' +
      '    <item id="css" href="styles/main.css" media-type="text/css"/>\n' +
      (fontManifest ? '    ' + fontManifest + '\n' : '') +
      '    ' + coverManifest + '\n' +
      '    ' + chapterManifest.join('\n    ') + '\n' +
      '  </manifest>\n' +
      '  <spine toc="ncx"' + (isVertical ? ' page-progression-direction="rtl"' : '') + '>\n' +
      '    ' + coverSpine + '\n' +
      '    ' + chapterSpine.join('\n    ') + '\n' +
      '  </spine>\n' +
      '</package>';
    zip.file('OEBPS/content.opf', opf);

    onProgress({ stage: 'compress', message: '正在壓縮檔案...' });

    var blob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/epub+zip',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }
    });

    onProgress({ stage: 'done', message: '完成！' });
    return blob;
  }
};
