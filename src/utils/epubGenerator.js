import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { subsetFont, FONT_CONFIG, DEFAULT_FONT } from './fontSubset'

// 樣式對應表
const SIZE_MAP = {
  'small': '0.9em',
  'medium': '1em',
  'large': '1.15em',
  'xlarge': '1.3em',
}

const LINE_HEIGHT_MAP = {
  'compact': '1.5',
  'normal': '1.8',
  'relaxed': '2.0',
  'loose': '2.3',
}

const INDENT_MAP = {
  'none': '0',
  'one': '1em',
  'two': '2em',
}

export async function generateEpub({ 
  title, 
  author, 
  chapters, 
  cover, 
  writingMode,
  fontFamily = DEFAULT_FONT,
  embedFont = false,
  fontSize = 'medium',
  lineHeight = 'normal',
  textIndent = 'two',
  filename = null,
  onProgress = () => {},
  returnBlob = false,
}) {
  const zip = new JSZip()
  const bookId = `urn:uuid:${crypto.randomUUID()}`
  const isVertical = writingMode === 'vertical'

  // 取得字型設定
  const fontConfig = FONT_CONFIG[fontFamily] || FONT_CONFIG[DEFAULT_FONT]
  const fontFamilyCSS = `"${fontConfig.family}", "Noto Sans TC", sans-serif`

  // 取得樣式值
  const fontSizeValue = SIZE_MAP[fontSize] || SIZE_MAP['medium']
  const lineHeightValue = LINE_HEIGHT_MAP[lineHeight] || LINE_HEIGHT_MAP['normal']
  const textIndentValue = INDENT_MAP[textIndent] || INDENT_MAP['two']

  // 字型相關變數
  let fontManifest = ''
  let fontFaceCSS = ''
  let embeddedFontFilename = ''

  // 如果要嵌入字型，進行子集化
  if (embedFont) {
    onProgress({ stage: 'font', message: '正在處理字型...' })

    // 合併所有章節內容
    const allText = chapters.map(ch => ch.title + '\n' + ch.content).join('\n')
    
    try {
      // 子集化字型
      const subsetResult = await subsetFont(fontFamily, allText, (p) => {
        onProgress({ stage: 'font', message: p.message })
      })

      // 產生檔名
      embeddedFontFilename = `${fontFamily}-subset.ttf`

      // 加入字型檔案到 EPUB
      zip.file(`OEBPS/fonts/${embeddedFontFilename}`, subsetResult.buffer)

      // 產生 @font-face CSS
      fontFaceCSS = `
@font-face {
  font-family: "${fontConfig.family}";
  src: url("../fonts/${embeddedFontFilename}") format("truetype");
  font-weight: normal;
  font-style: normal;
}
`

      // manifest 項目
      fontManifest = `<item id="font-main" href="fonts/${embeddedFontFilename}" media-type="font/ttf"/>`

      onProgress({ stage: 'font', message: '字型嵌入完成！' })
    } catch (error) {
      console.error('字型嵌入失敗:', error)
      onProgress({ stage: 'font', message: '字型嵌入失敗，改用預設模式' })
      // 失敗時不嵌入字型，繼續產生 EPUB
    }
  }

  onProgress({ stage: 'structure', message: '正在建立 EPUB 結構...' })

  // mimetype（必須第一個，且不壓縮）
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })

  // META-INF/container.xml
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`)

  // 封面處理
  let coverManifest = ''
  let coverSpine = ''
  if (cover) {
    const coverData = await cover.arrayBuffer()
    zip.file('OEBPS/images/cover.jpg', coverData)
    coverManifest = '<item id="cover-image" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>'
    coverSpine = '<itemref idref="cover"/>'
    
    // 封面頁
    zip.file('OEBPS/cover.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>封面</title></head>
<body style="margin:0;padding:0;text-align:center;">
<img src="images/cover.jpg" alt="封面" style="max-width:100%;max-height:100vh;"/>
</body>
</html>`)
    coverManifest += '\n    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>'
  }

  onProgress({ stage: 'css', message: '正在產生樣式表...' })

  // 樣式表
  const css = `${fontFaceCSS}
/* 
 * 字型設定：${fontConfig.name}
 * ${embedFont ? '已嵌入子集化字型' : '建議使用上述字型閱讀'}
 */

body {
  font-family: ${fontFamilyCSS};
  font-size: ${fontSizeValue};
  line-height: ${lineHeightValue};
  padding: 1em;
  margin: 0;
  text-align: justify;
  ${isVertical ? `
  writing-mode: vertical-rl;
  -webkit-writing-mode: vertical-rl;
  -epub-writing-mode: vertical-rl;
  text-orientation: mixed;
  ` : ''}
}

h1 {
  font-size: 1.5em;
  font-weight: bold;
  margin: 1.5em 0 1em 0;
  line-height: 1.3;
  text-align: ${isVertical ? 'center' : 'left'};
}

p {
  text-indent: ${textIndentValue};
  margin: 0.5em 0;
}

/* 避免標點符號在行首 */
p {
  hanging-punctuation: allow-end;
}
`
  zip.file('OEBPS/styles/main.css', css)

  // 章節檔案
  const chapterManifest = []
  const chapterSpine = []
  const totalChapters = chapters.length

  for (let index = 0; index < totalChapters; index++) {
    const chapter = chapters[index]
    if (index % 50 === 0 || index === totalChapters - 1) {
      onProgress({ stage: 'chapters', message: `正在處理第 ${index + 1} / ${totalChapters} 章...` })
      // 讓 UI 有機會更新
      await new Promise(r => setTimeout(r, 0))
    }
    const id = `chapter${index + 1}`
    const chFilename = `${id}.xhtml`

    // 處理段落
    const paragraphs = chapter.content
      .split(/\n+/)
      .filter(p => p.trim())
      .map(p => `<p>${escapeHtml(p.trim())}</p>`)
      .join('\n')

    const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeHtml(chapter.title)}</title>
  <link rel="stylesheet" type="text/css" href="styles/main.css"/>
</head>
<body>
  <h1>${escapeHtml(chapter.title)}</h1>
  ${paragraphs}
</body>
</html>`

    zip.file(`OEBPS/${chFilename}`, xhtml)
    chapterManifest.push(`<item id="${id}" href="${chFilename}" media-type="application/xhtml+xml"/>`)
    chapterSpine.push(`<itemref idref="${id}"/>`)
  }

  onProgress({ stage: 'toc', message: '正在建立目錄...' })

  // 目錄 (toc.ncx)
  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookId}"/>
  </head>
  <docTitle><text>${escapeHtml(title)}</text></docTitle>
  <navMap>
    ${chapters.map((ch, i) => `
    <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeHtml(ch.title)}</text></navLabel>
      <content src="chapter${i + 1}.xhtml"/>
    </navPoint>`).join('')}
  </navMap>
</ncx>`
  zip.file('OEBPS/toc.ncx', tocNcx)

  // 目錄 (nav.xhtml - EPUB3)
  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="UTF-8"/>
  <title>目錄</title>
  <link rel="stylesheet" type="text/css" href="styles/main.css"/>
</head>
<body>
  <nav epub:type="toc">
    <h1>目錄</h1>
    <ol>
      ${chapters.map((ch, i) => `<li><a href="chapter${i + 1}.xhtml">${escapeHtml(ch.title)}</a></li>`).join('\n      ')}
    </ol>
  </nav>
</body>
</html>`
  zip.file('OEBPS/nav.xhtml', navXhtml)

  onProgress({ stage: 'opf', message: '正在產生套件描述...' })

  // content.opf
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${bookId}</dc:identifier>
    <dc:title>${escapeHtml(title)}</dc:title>
    <dc:creator>${escapeHtml(author || '未知')}</dc:creator>
    <dc:language>zh-TW</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().split('.')[0]}Z</meta>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="styles/main.css" media-type="text/css"/>
    ${fontManifest}
    ${coverManifest}
    ${chapterManifest.join('\n    ')}
  </manifest>
  <spine toc="ncx"${isVertical ? ' page-progression-direction="rtl"' : ''}>
    ${coverSpine}
    ${chapterSpine.join('\n    ')}
  </spine>
</package>`
  zip.file('OEBPS/content.opf', opf)

  onProgress({ stage: 'compress', message: '正在壓縮檔案...' })

  // 生成並下載
  const blob = await zip.generateAsync({ 
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  })

  onProgress({ stage: 'done', message: '完成！' })
  
  // 使用自訂檔名或預設用書名
  const outputFilename = filename || title || '未命名'
  saveAs(blob, `${outputFilename}.epub`)

  // 回傳 blob 供再次下載使用
  if (returnBlob) {
    return blob
  }
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
