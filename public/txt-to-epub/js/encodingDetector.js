/**
 * 文字編碼偵測與解碼工具
 */

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

function detectBig5(bytes) {
  var big5Pairs = 0, totalPairs = 0;
  var maxCheck = Math.min(bytes.length, 10000);
  for (var i = 0; i < maxCheck - 1; i++) {
    if (bytes[i] >= 0x81 && bytes[i] <= 0xFE) {
      totalPairs++;
      if ((bytes[i + 1] >= 0x40 && bytes[i + 1] <= 0x7E) || (bytes[i + 1] >= 0xA1 && bytes[i + 1] <= 0xFE)) { big5Pairs++; i++; }
    }
  }
  return totalPairs === 0 ? 0 : Math.round((big5Pairs / totalPairs) * 100);
}

var ENCODING_LABELS = {
  'utf-8': 'UTF-8', 'utf-16le': 'UTF-16 LE', 'utf-16be': 'UTF-16 BE',
  'gbk': 'GBK（簡體中文）', 'big5': 'Big5（繁體中文）'
};

// 跳過 BOM 後回傳真正要解碼的 buffer
function stripBOM(buffer) {
  var bytes = new Uint8Array(buffer);
  var offset = 0;
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) offset = 3;
  else if ((bytes[0] === 0xFF && bytes[1] === 0xFE) || (bytes[0] === 0xFE && bytes[1] === 0xFF)) offset = 2;
  return offset > 0 ? buffer.slice(offset) : buffer;
}

// 估算亂碼率：U+FFFD 替換字元 + 控制字元 + 罕用 CJK 區的比例
function calcGarbledRatio(text) {
  if (!text || text.length === 0) return 1;
  var sample = text.length > 2000 ? text.slice(0, 2000) : text;
  var bad = 0;
  for (var i = 0; i < sample.length; i++) {
    var c = sample.charCodeAt(i);
    // U+FFFD 替換字元（解碼失敗的標記）
    if (c === 0xFFFD) { bad++; continue; }
    // 不可印字元（排除常見換行、tab）
    if (c < 0x20 && c !== 0x09 && c !== 0x0A && c !== 0x0D) { bad++; continue; }
    // 私用區、未定義區
    if (c >= 0xE000 && c <= 0xF8FF) { bad++; continue; }
  }
  return bad / sample.length;
}

window.EncodingDetector = {
  ENCODING_LABELS: ENCODING_LABELS,

  detectEncoding: function (buffer) {
    var bytes = new Uint8Array(buffer);
    var bom = detectBOM(bytes);
    if (bom) {
      if (bom === 'utf-16le' || bom === 'utf-16be') {
        var skipLen = 2;
        var afterBom = bytes.subarray(skipLen);
        if (afterBom.length > 0 && isValidUTF8(afterBom)) return 'utf-8';
      }
      return bom;
    }
    if (isValidUTF8(bytes)) return 'utf-8';
    var gbkScore = detectGBK(bytes);
    var big5Score = detectBig5(bytes);
    // GBK / Big5 位元組分布很像，分數常常打平 → 看誰實際解出的亂碼少
    // （Big5 文字用 GBK 解會大量出現生僻字 / 私用區，亂碼率較高）
    if (gbkScore >= 70 || big5Score >= 70) {
      var gbkText = window.EncodingDetector.decodeWithEncoding(buffer, 'gbk');
      var big5Text = window.EncodingDetector.decodeWithEncoding(buffer, 'big5');
      var gbkRatio = calcGarbledRatio(gbkText);
      var big5Ratio = calcGarbledRatio(big5Text);
      // 差距 > 1% 就用亂碼率低的；幾乎相同時優先用分數高的
      if (Math.abs(gbkRatio - big5Ratio) > 0.01) {
        return gbkRatio < big5Ratio ? 'gbk' : 'big5';
      }
      return gbkScore > big5Score ? 'gbk' : 'big5';
    }
    return 'utf-8';
  },

  // 用指定編碼重解整個 buffer
  decodeWithEncoding: function (buffer, encoding) {
    var decodeBuffer = stripBOM(buffer);
    try {
      return new TextDecoder(encoding, { fatal: false }).decode(decodeBuffer);
    } catch (e) {
      return '';
    }
  },

  // 取候選編碼的前 N 字預覽（給並排比對用）
  getPreviewCandidates: function (buffer, sampleLen) {
    sampleLen = sampleLen || 200;
    var candidates = [
      { id: 'utf-8', label: 'UTF-8' },
      { id: 'big5', label: 'Big5（繁體）' },
      { id: 'gbk', label: 'GBK（簡體）' },
      { id: 'utf-16le', label: 'UTF-16 LE' }
    ];
    var results = [];
    for (var i = 0; i < candidates.length; i++) {
      var text = window.EncodingDetector.decodeWithEncoding(buffer, candidates[i].id);
      var preview = text.slice(0, sampleLen);
      var ratio = calcGarbledRatio(text);
      results.push({
        id: candidates[i].id,
        label: candidates[i].label,
        preview: preview,
        garbledRatio: ratio
      });
    }
    return results;
  },

  isLikelyGarbled: function (text) {
    return calcGarbledRatio(text) > 0.05;
  },

  readFileWithAutoEncoding: function (file) {
    return file.arrayBuffer().then(function (buffer) {
      var encoding = window.EncodingDetector.detectEncoding(buffer);
      var text = window.EncodingDetector.decodeWithEncoding(buffer, encoding);
      return {
        text: text,
        encoding: encoding,
        encodingLabel: ENCODING_LABELS[encoding] || encoding.toUpperCase(),
        buffer: buffer,
        garbledRatio: calcGarbledRatio(text)
      };
    });
  }
};
