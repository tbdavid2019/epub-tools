/**
 * 偵測章節
 * 支援格式：
 * - 第X章、第X節、第X回
 * - Chapter X、CHAPTER X
 * - 數字編號（1.、1、①）
 * - 卷X、篇X
 * - [數字] 格式（如 [1]、[01]、[001]）
 * - 自訂分隔符號
 */

// 偵測模式類型
export const DETECTION_MODES = {
  AUTO: 'auto',                  // 自動偵測（系統判斷）
  BY_EMPTY_LINES: 'emptyLines',  // 依空行分章
  BY_SEPARATOR: 'separator',     // 依分隔符號
  SINGLE_CHAPTER: 'single',      // 單一章節
}

/**
 * 分析文字內容，回傳偵測結果與建議
 */
export function analyzeText(text) {
  const analysis = {
    hasPatternChapters: false,
    patternChapterCount: 0,
    hasBracketNumbers: false,
    bracketNumberCount: 0,
    emptyLineBlocks: 0,
    commonSeparators: [],
    totalLength: text.length,
    recommendation: DETECTION_MODES.AUTO,
    detectedPatterns: [],
  }

  // 偵測 [數字] 格式
  const bracketPattern = /^\s*\[(\d+)\]/gm
  const bracketMatches = [...text.matchAll(bracketPattern)]
  if (bracketMatches.length >= 2) {
    analysis.hasBracketNumbers = true
    analysis.bracketNumberCount = bracketMatches.length
    analysis.detectedPatterns.push(`[數字] 格式（${bracketMatches.length} 處）`)
  }

  // 偵測傳統章節格式
  const patterns = [
    { regex: /^[　\s]*(第[零一二三四五六七八九十百千\d]+[章節回卷篇集部])/gm, name: '中文章節' },
    { regex: /^[　\s]*[■□●▶▷►☆★○◆◇▪▸※＊]\s*(\d+\s*章)/gm, name: '符號章節' },
    { regex: /^[　\s]*(Chapter\s+\d+)/gim, name: 'Chapter' },
    { regex: /^[　\s]*(\d+[\.、]\s*.+?)$/gm, name: '數字編號' },
    { regex: /^[　\s]*([①②③④⑤⑥⑦⑧⑨⑩])/gm, name: '圈號' },
  ]

  for (const p of patterns) {
    const matches = [...text.matchAll(p.regex)]
    if (matches.length >= 2) {
      analysis.hasPatternChapters = true
      analysis.patternChapterCount += matches.length
      analysis.detectedPatterns.push(`${p.name}（${matches.length} 處）`)
    }
  }

  // 計算空行區塊數量（連續 2+ 空行視為分隔）
  const emptyLineBlocks = text.split(/\n\s*\n\s*\n/).length
  analysis.emptyLineBlocks = emptyLineBlocks

  // 偵測常見分隔符號
  const separatorPatterns = [
    { pattern: /^[=]{3,}$/gm, name: '===' },
    { pattern: /^[-]{3,}$/gm, name: '---' },
    { pattern: /^[*]{3,}$/gm, name: '***' },
    { pattern: /^[#]{3,}$/gm, name: '###' },
    { pattern: /^[~]{3,}$/gm, name: '~~~' },
    { pattern: /^[─]{3,}$/gm, name: '───' },
    { pattern: /^[＊]{3,}$/gm, name: '＊＊＊' },
  ]
  
  for (const sep of separatorPatterns) {
    const matches = [...text.matchAll(sep.pattern)]
    if (matches.length >= 2) {
      analysis.commonSeparators.push({ name: sep.name, count: matches.length })
    }
  }

  // 判斷推薦模式
  if (analysis.hasPatternChapters || analysis.hasBracketNumbers) {
    analysis.recommendation = DETECTION_MODES.AUTO
  } else if (emptyLineBlocks >= 3 && emptyLineBlocks <= 200) {
    // 若無明確章節格式，但有合理數量的空行分隔，推薦空行分章
    analysis.recommendation = DETECTION_MODES.BY_EMPTY_LINES
  } else {
    analysis.recommendation = DETECTION_MODES.SINGLE_CHAPTER
  }

  return analysis
}

/**
 * 主要偵測函數
 * @param {string} text - 文字內容
 * @param {string} mode - 偵測模式
 * @param {object} options - 額外選項（如 separator）
 */
export function detectChapters(text, mode = DETECTION_MODES.AUTO, options = {}) {
  if (mode === DETECTION_MODES.BY_EMPTY_LINES) {
    return detectByEmptyLines(text)
  }
  
  if (mode === DETECTION_MODES.BY_SEPARATOR && options.separator) {
    return detectBySeparator(text, options.separator)
  }
  
  if (mode === DETECTION_MODES.SINGLE_CHAPTER) {
    return [{
      title: '全文',
      content: text,
    }]
  }

  // AUTO 模式：使用規則偵測
  return detectByPatterns(text)
}

/**
 * 依規則偵測章節
 */
function detectByPatterns(text) {
  const patterns = [
    // [數字] 格式 - 新增支援
    /^[　\s]*(\[\d+\].*?)$/gm,
    // 中文章節
    /^[　\s]*(第[零一二三四五六七八九十百千\d]+[章節回卷篇集部].*?)$/gm,
    // 符號 + 數字章（如 ■ 1章 □、● 2章 等）
    /^[　\s]*[■□●▶▷►☆★○◆◇▪▸※＊]\s*(\d+\s*章.*?)$/gm,
    // 英文章節
    /^[　\s]*(Chapter\s+\d+.*?)$/gim,
    /^[　\s]*(CHAPTER\s+\d+.*?)$/gm,
    // 數字編號
    /^[　\s]*(\d+[\.、]\s*.+?)$/gm,
    // 特殊符號編號
    /^[　\s]*([①②③④⑤⑥⑦⑧⑨⑩].+?)$/gm,
    // 卷/篇 標題
    /^[　\s]*(卷[零一二三四五六七八九十百千\d]+.*?)$/gm,
  ]

  // 合併所有匹配
  let matches = []
  for (const pattern of patterns) {
    const found = [...text.matchAll(pattern)]
    for (const match of found) {
      matches.push({
        title: match[1].trim(),
        index: match.index,
      })
    }
  }

  // 按位置排序
  matches.sort((a, b) => a.index - b.index)

  // 去除重複（同一位置可能被多個 pattern 匹配）
  matches = matches.filter((m, i, arr) => {
    if (i === 0) return true
    return Math.abs(m.index - arr[i - 1].index) > 5
  })

  // 如果沒有找到章節，整份作為一章
  if (matches.length === 0) {
    return [{
      title: '全文',
      content: text,
    }]
  }

  // 切分內容
  const chapters = []
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index
    const end = i < matches.length - 1 ? matches[i + 1].index : text.length
    const content = text.slice(start, end).trim()

    chapters.push({
      title: matches[i].title,
      content,
    })
  }

  // 處理章節前的內容（序言等）
  if (matches.length > 0 && matches[0].index > 100) {
    const preface = text.slice(0, matches[0].index).trim()
    if (preface.length > 50) {
      chapters.unshift({
        title: '序',
        content: preface,
      })
    }
  }

  return chapters
}

/**
 * 依空行分章
 * 連續 2 個以上空行視為章節分隔
 */
function detectByEmptyLines(text) {
  // 以連續空行（2行以上）分割
  const blocks = text.split(/\n\s*\n\s*\n+/)
    .map(block => block.trim())
    .filter(block => block.length > 0)

  if (blocks.length === 0) {
    return [{
      title: '全文',
      content: text,
    }]
  }

  if (blocks.length === 1) {
    return [{
      title: '全文',
      content: blocks[0],
    }]
  }

  // 為每個區塊生成章節
  return blocks.map((block, index) => {
    // 嘗試從區塊第一行提取標題
    const lines = block.split('\n')
    const firstLine = lines[0].trim()
    
    // 如果第一行較短（可能是標題），使用它作為章節名
    let title
    if (firstLine.length <= 50 && firstLine.length > 0) {
      title = firstLine
    } else {
      title = `章節 ${index + 1}`
    }

    return {
      title,
      content: block,
    }
  })
}

/**
 * 依分隔符號分章
 * @param {string} text - 文字內容
 * @param {string} separator - 分隔符號（如 ===、---、***）
 */
function detectBySeparator(text, separator) {
  // 將分隔符號轉為正則表達式，處理特殊字元
  const escapedSeparator = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // 匹配該分隔符號（連續出現 3 次以上，或完全匹配）
  const regex = new RegExp(`^[\\s]*${escapedSeparator}+[\\s]*$`, 'gm')
  
  // 用分隔符號切分文字
  const blocks = text.split(regex)
    .map(block => block.trim())
    .filter(block => block.length > 0)

  if (blocks.length === 0) {
    return [{
      title: '全文',
      content: text,
    }]
  }

  if (blocks.length === 1) {
    return [{
      title: '全文',
      content: blocks[0],
    }]
  }

  // 為每個區塊生成章節
  return blocks.map((block, index) => {
    // 嘗試從區塊第一行提取標題
    const lines = block.split('\n')
    const firstLine = lines[0].trim()
    
    // 如果第一行較短（可能是標題），使用它作為章節名
    let title
    if (firstLine.length <= 50 && firstLine.length > 0) {
      title = firstLine
    } else {
      title = `章節 ${index + 1}`
    }

    return {
      title,
      content: block,
    }
  })
}


/**
 * 自動偵測書籍元資料（書名、作者）
 * 從檔名和文字內容前幾行嘗試提取
 * @param {string} text - 文字內容
 * @param {string} fileName - 檔案名稱（不含副檔名）
 * @returns {{ title: string, author: string }}
 */
export function detectBookMetadata(text, fileName = '') {
  const result = {
    title: fileName || '',
    author: '',
    confidence: { title: 'low', author: 'none' },
  }

  // ===== 1. 從檔名偵測 =====
  if (fileName) {
    // 常見檔名格式：
    // 《書名》作者
    // 作者 - 書名
    // 作者_書名
    // [作者] 書名
    // 書名 by 作者
    // 書名（作者）
    // 書名(作者)
    
    const fileNamePatterns = [
      // 《書名》作者
      /^《(.+?)》\s*[-_—]?\s*(.+?)$/,
      // 作者《書名》
      /^(.+?)\s*[-_—]?\s*《(.+?)》$/,
      // [作者] 書名 或 【作者】書名
      /^[\[【](.+?)[\]】]\s*[-_—]?\s*(.+?)$/,
      // 書名 [作者] 或 書名【作者】
      /^(.+?)\s*[-_—]?\s*[\[【](.+?)[\]】]$/,
      // 書名 by 作者 / 書名 By 作者
      /^(.+?)\s+[Bb][Yy]\s+(.+?)$/,
      // 書名（作者）或 書名(作者)
      /^(.+?)\s*[（(](.+?)[）)]$/,
      // 作者 - 書名 / 作者 — 書名 / 作者_書名
      /^(.+?)\s*[-_—]\s*(.+?)$/,
    ]

    for (const pattern of fileNamePatterns) {
      const match = fileName.match(pattern)
      if (match) {
        const [, part1, part2] = match
        
        // 判斷哪個是書名、哪個是作者
        // 通常書名較長，或包含特定關鍵字
        if (pattern.source.includes('《')) {
          // 《書名》作者 格式
          if (pattern.source.startsWith('^《')) {
            result.title = part1.trim()
            result.author = part2.trim()
          } else {
            result.author = part1.trim()
            result.title = part2.trim()
          }
        } else if (pattern.source.includes('[Bb][Yy]')) {
          // 書名 by 作者 格式
          result.title = part1.trim()
          result.author = part2.trim()
        } else if (pattern.source.includes('[（(]')) {
          // 書名（作者）格式
          result.title = part1.trim()
          result.author = part2.trim()
        } else if (pattern.source.startsWith('^[\\[【]')) {
          // [作者] 書名 格式
          result.author = part1.trim()
          result.title = part2.trim()
        } else if (pattern.source.includes('[\\[【]$')) {
          // 書名 [作者] 格式
          result.title = part1.trim()
          result.author = part2.trim()
        } else {
          // 作者 - 書名 格式（預設第一部分為作者）
          // 但若第一部分明顯較長，可能是書名
          if (part1.length > part2.length * 2 && part2.length <= 10) {
            result.title = part1.trim()
            result.author = part2.trim()
          } else {
            result.author = part1.trim()
            result.title = part2.trim()
          }
        }
        
        result.confidence.title = 'high'
        result.confidence.author = 'high'
        break
      }
    }
  }

  // ===== 2. 從文字內容前幾行偵測（補充或覆寫） =====
  const lines = text.split('\n').slice(0, 30) // 只檢查前 30 行
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    
    // 跳過太長的行（超過 60 字元可能不是元資料）
    if (line.length > 60) continue
    
    // 偵測作者行
    // 常見格式：作者：XXX / 作者:XXX / Author: XXX / by XXX / 著：XXX / 文：XXX
    const authorPatterns = [
      /^(?:作者|著者|原著|作|文|撰)[\s]*[：:︰]\s*(.+?)$/i,
      /^(?:Author|Written\s+by|By)[\s]*[：:]?\s*(.+?)$/i,
      /^[——\-─]+\s*(.{2,15})\s*[著作撰文]$/,  // ——作者名 著
      /^(.{2,15})\s*[著作撰文]$/,  // 作者名 著
    ]
    
    for (const pattern of authorPatterns) {
      const match = line.match(pattern)
      if (match) {
        const authorCandidate = match[1].trim()
        // 驗證作者名合理性（2-20 字元，不含特殊章節詞）
        if (authorCandidate.length >= 2 && 
            authorCandidate.length <= 20 &&
            !authorCandidate.match(/第[零一二三四五六七八九十百千\d]+[章節回卷篇集部]/)) {
          result.author = authorCandidate
          result.confidence.author = 'high'
          break
        }
      }
    }
    
    // 偵測書名行（如果檔名沒有可靠的書名）
    if (result.confidence.title !== 'high') {
      // 常見格式：書名：XXX / 《XXX》 / Title: XXX
      const titlePatterns = [
        /^(?:書名|篇名|名稱|Title)[\s]*[：:︰]\s*(.+?)$/i,
        /^《(.+?)》$/,
        /^【(.+?)】$/,
      ]
      
      for (const pattern of titlePatterns) {
        const match = line.match(pattern)
        if (match) {
          const titleCandidate = match[1].trim()
          if (titleCandidate.length >= 1 && titleCandidate.length <= 50) {
            result.title = titleCandidate
            result.confidence.title = 'high'
            break
          }
        }
      }
    }
    
    // 如果前幾行有明確的標題格式（第一行非空且較短）
    if (i === 0 && result.confidence.title !== 'high' && line.length <= 30) {
      // 第一行可能是書名
      const possibleTitle = line.replace(/^[《【\[]|[》】\]]$/g, '')
      if (!possibleTitle.match(/作者|著者|Author/i)) {
        result.title = possibleTitle
        result.confidence.title = 'medium'
      }
    }
  }

  // 清理結果
  result.title = result.title.trim()
  result.author = result.author.trim()
  
  return result
}
