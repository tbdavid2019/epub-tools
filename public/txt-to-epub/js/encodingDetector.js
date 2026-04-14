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

window.EncodingDetector = {
  detectEncoding: function (buffer) {
    var bytes = new Uint8Array(buffer);
    var bom = detectBOM(bytes);
    if (bom) {
      // FF FE 可能是假 BOM（實際是 UTF-8 檔案開頭碰巧有 FF FE）
      // 跳過 BOM 後驗證：如果後面的資料是有效 UTF-8，優先用 UTF-8
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
    if (gbkScore >= 70 && gbkScore >= big5Score) return 'gbk';
    if (big5Score >= 70) return 'big5';
    return 'utf-8';
  },

  readFileWithAutoEncoding: function (file) {
    return file.arrayBuffer().then(function (buffer) {
      var encoding = window.EncodingDetector.detectEncoding(buffer);
      var bytes = new Uint8Array(buffer);
      // 跳過 BOM bytes
      var offset = 0;
      if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) offset = 3; // UTF-8 BOM
      else if ((bytes[0] === 0xFF && bytes[1] === 0xFE) || (bytes[0] === 0xFE && bytes[1] === 0xFF)) offset = 2;
      var decodeBuffer = offset > 0 ? buffer.slice(offset) : buffer;
      var text = new TextDecoder(encoding, { fatal: false }).decode(decodeBuffer);
      var labels = {
        'utf-8': 'UTF-8', 'utf-16le': 'UTF-16 LE', 'utf-16be': 'UTF-16 BE',
        'gbk': 'GBK（簡體中文）', 'big5': 'Big5（繁體中文）'
      };
      return { text: text, encoding: encoding, encodingLabel: labels[encoding] || encoding.toUpperCase() };
    });
  }
};
