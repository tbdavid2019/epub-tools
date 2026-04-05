/**
 * 文字編碼偵測與解碼工具
 * 支援 UTF-8、GBK、GB2312、Big5 等常見中文編碼
 */

/**
 * 偵測 BOM (Byte Order Mark)
 * @param {Uint8Array} bytes - 檔案的位元組陣列
 * @returns {string|null} - 偵測到的編碼，或 null
 */
function detectBOM(bytes) {
  // UTF-8 BOM: EF BB BF
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return 'utf-8'
  }
  // UTF-16 LE BOM: FF FE
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return 'utf-16le'
  }
  // UTF-16 BE BOM: FE FF
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return 'utf-16be'
  }
  return null
}

/**
 * 檢查是否為有效的 UTF-8 序列
 * @param {Uint8Array} bytes - 檔案的位元組陣列
 * @returns {boolean}
 */
function isValidUTF8(bytes) {
  let i = 0
  let invalidCount = 0
  const maxCheck = Math.min(bytes.length, 10000) // 只檢查前 10KB
  
  while (i < maxCheck) {
    const byte = bytes[i]
    
    if (byte <= 0x7F) {
      // ASCII
      i++
    } else if ((byte & 0xE0) === 0xC0) {
      // 2-byte sequence
      if (i + 1 >= maxCheck || (bytes[i + 1] & 0xC0) !== 0x80) {
        invalidCount++
        i++
        continue
      }
      i += 2
    } else if ((byte & 0xF0) === 0xE0) {
      // 3-byte sequence (常見中文)
      if (i + 2 >= maxCheck || 
          (bytes[i + 1] & 0xC0) !== 0x80 || 
          (bytes[i + 2] & 0xC0) !== 0x80) {
        invalidCount++
        i++
        continue
      }
      i += 3
    } else if ((byte & 0xF8) === 0xF0) {
      // 4-byte sequence
      if (i + 3 >= maxCheck || 
          (bytes[i + 1] & 0xC0) !== 0x80 || 
          (bytes[i + 2] & 0xC0) !== 0x80 ||
          (bytes[i + 3] & 0xC0) !== 0x80) {
        invalidCount++
        i++
        continue
      }
      i += 4
    } else {
      // 無效的 UTF-8 起始位元組
      invalidCount++
      i++
    }
  }
  
  // 如果無效序列太多，可能不是 UTF-8
  return invalidCount < maxCheck * 0.01 // 容許 1% 錯誤率
}

/**
 * 檢測是否可能是 GBK/GB2312 編碼
 * @param {Uint8Array} bytes - 檔案的位元組陣列
 * @returns {number} - 信心分數 (0-100)
 */
function detectGBK(bytes) {
  let gbkPairs = 0
  let totalPairs = 0
  const maxCheck = Math.min(bytes.length, 10000)
  
  for (let i = 0; i < maxCheck - 1; i++) {
    const b1 = bytes[i]
    const b2 = bytes[i + 1]
    
    // GBK 雙位元組範圍: 第一位元組 0x81-0xFE, 第二位元組 0x40-0xFE
    if (b1 >= 0x81 && b1 <= 0xFE) {
      totalPairs++
      if (b2 >= 0x40 && b2 <= 0xFE && b2 !== 0x7F) {
        gbkPairs++
        i++ // 跳過已配對的位元組
      }
    }
  }
  
  if (totalPairs === 0) return 0
  return Math.round((gbkPairs / totalPairs) * 100)
}

/**
 * 檢測是否可能是 Big5 編碼
 * @param {Uint8Array} bytes - 檔案的位元組陣列
 * @returns {number} - 信心分數 (0-100)
 */
function detectBig5(bytes) {
  let big5Pairs = 0
  let totalPairs = 0
  const maxCheck = Math.min(bytes.length, 10000)
  
  for (let i = 0; i < maxCheck - 1; i++) {
    const b1 = bytes[i]
    const b2 = bytes[i + 1]
    
    // Big5 雙位元組範圍: 第一位元組 0x81-0xFE, 第二位元組 0x40-0x7E 或 0xA1-0xFE
    if (b1 >= 0x81 && b1 <= 0xFE) {
      totalPairs++
      if ((b2 >= 0x40 && b2 <= 0x7E) || (b2 >= 0xA1 && b2 <= 0xFE)) {
        big5Pairs++
        i++ // 跳過已配對的位元組
      }
    }
  }
  
  if (totalPairs === 0) return 0
  return Math.round((big5Pairs / totalPairs) * 100)
}

/**
 * 偵測檔案編碼
 * @param {ArrayBuffer} buffer - 檔案的 ArrayBuffer
 * @returns {string} - 偵測到的編碼名稱
 */
export function detectEncoding(buffer) {
  const bytes = new Uint8Array(buffer)
  
  // 1. 先檢查 BOM
  const bomEncoding = detectBOM(bytes)
  if (bomEncoding) {
    return bomEncoding
  }
  
  // 2. 檢查是否為有效 UTF-8
  if (isValidUTF8(bytes)) {
    return 'utf-8'
  }
  
  // 3. 比較 GBK 和 Big5 的信心分數
  const gbkScore = detectGBK(bytes)
  const big5Score = detectBig5(bytes)
  
  // 如果分數差不多，優先選 GBK（簡體中文網路小說更常見）
  if (gbkScore >= 70 && gbkScore >= big5Score) {
    return 'gbk'
  }
  
  if (big5Score >= 70) {
    return 'big5'
  }
  
  // 4. 預設使用 UTF-8
  return 'utf-8'
}

/**
 * 使用偵測到的編碼解碼檔案
 * @param {ArrayBuffer} buffer - 檔案的 ArrayBuffer
 * @param {string} encoding - 編碼名稱
 * @returns {string} - 解碼後的文字
 */
export function decodeWithEncoding(buffer, encoding) {
  const decoder = new TextDecoder(encoding, { fatal: false })
  return decoder.decode(buffer)
}

/**
 * 自動偵測編碼並解碼檔案
 * @param {File} file - 檔案物件
 * @param {function} onProgress - 讀取進度回呼 (已讀取位元組數)
 * @returns {Promise<{text: string, encoding: string}>}
 */
export async function readFileWithAutoEncoding(file, onProgress) {
  let buffer

  // 大檔案使用串流讀取，回報進度
  if (onProgress && file.size > 1024 * 1024) {
    buffer = await readFileWithProgress(file, onProgress)
  } else {
    buffer = await file.arrayBuffer()
  }

  const encoding = detectEncoding(buffer)
  const text = decodeWithEncoding(buffer, encoding)

  return {
    text,
    encoding,
    encodingLabel: getEncodingLabel(encoding)
  }
}

/**
 * 使用串流方式讀取檔案，回報進度
 * @param {File} file
 * @param {function} onProgress - (bytesRead) => void
 * @returns {Promise<ArrayBuffer>}
 */
async function readFileWithProgress(file, onProgress) {
  const reader = file.stream().getReader()
  const chunks = []
  let bytesRead = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    bytesRead += value.byteLength
    onProgress(bytesRead)
  }

  // 合併所有 chunks
  const result = new Uint8Array(bytesRead)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result.buffer
}

/**
 * 取得編碼的中文標籤
 * @param {string} encoding - 編碼名稱
 * @returns {string} - 中文標籤
 */
export function getEncodingLabel(encoding) {
  const labels = {
    'utf-8': 'UTF-8',
    'utf-16le': 'UTF-16 LE',
    'utf-16be': 'UTF-16 BE',
    'gbk': 'GBK（簡體中文）',
    'gb2312': 'GB2312（簡體中文）',
    'gb18030': 'GB18030（簡體中文）',
    'big5': 'Big5（繁體中文）',
  }
  return labels[encoding.toLowerCase()] || encoding.toUpperCase()
}
