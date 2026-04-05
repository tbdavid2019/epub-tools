import { useState, useRef } from 'react'
import { generateEpub } from '../utils/epubGenerator'
import { convertToTraditional } from '../utils/converter'
import { FONT_CONFIG } from '../utils/fontSubset'
import { generateFilename } from '../utils/filenameFormat'
import { saveAs } from 'file-saver'

// SVG Icons
const CheckCircleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-16 h-16" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
)

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
)

const LoaderIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 animate-spin" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor">
    <line x1="12" y1="2" x2="12" y2="6"/>
    <line x1="12" y1="18" x2="12" y2="22"/>
    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>
    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
    <line x1="2" y1="12" x2="6" y2="12"/>
    <line x1="18" y1="12" x2="22" y2="12"/>
    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
  </svg>
)

const ZapIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </svg>
)

const RefreshIcon = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
)

const BookIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </svg>
)

const SplitIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor">
    <rect x="2" y="3" width="8" height="18" rx="2"/>
    <rect x="14" y="3" width="8" height="18" rx="2"/>
  </svg>
)

// 根據階段估算整體進度百分比
function getProgressPercent(stage) {
  const stageMap = {
    convert: 20,
    font: 35,
    structure: 40,
    css: 45,
    chapters: 70,
    toc: 80,
    opf: 85,
    compress: 95,
    done: 100,
  }
  return stageMap[stage] || 10
}

export default function ExportButton({ content, chapters, cover, settings, onReset, splitMode, setSplitMode, splitSuggested }) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [progress, setProgress] = useState({ stage: '', message: '' })
  const blobsRef = useRef([]) // [{blob, filename}]

  // 簡轉繁處理
  const processConversion = async (chaptersToConvert) => {
    const totalCh = chaptersToConvert.length
    const result = []
    for (let i = 0; i < totalCh; i++) {
      if (i % 20 === 0 || i === totalCh - 1) {
        setProgress({ stage: 'convert', message: `正在轉換第 ${i + 1} / ${totalCh} 章（簡轉繁）...` })
      }
      result.push({
        ...chaptersToConvert[i],
        title: await convertToTraditional(chaptersToConvert[i].title),
        content: await convertToTraditional(chaptersToConvert[i].content),
      })
      if (i % 20 === 0) await new Promise(r => setTimeout(r, 0))
    }
    return result
  }

  // 生成單本 EPUB
  const generateSingleEpub = async (epubChapters, epubTitle, epubAuthor, outputFilename) => {
    return await generateEpub({
      title: epubTitle,
      author: epubAuthor,
      chapters: epubChapters,
      cover,
      writingMode: settings.writingMode,
      fontFamily: settings.fontFamily,
      embedFont: settings.embedFont,
      fontSize: settings.fontSize,
      lineHeight: settings.lineHeight,
      textIndent: settings.textIndent,
      filename: outputFilename,
      onProgress: setProgress,
      returnBlob: true,
    })
  }

  const handleExport = async () => {
    setIsGenerating(true)
    setProgress({ stage: 'convert', message: '準備中...' })
    blobsRef.current = []

    try {
      let processedChapters = chapters
      let processedTitle = settings.title

      if (settings.convertToTraditional) {
        processedChapters = await processConversion(chapters)
        processedTitle = await convertToTraditional(settings.title)
      }

      let processedAuthor = settings.author
      if (settings.convertToTraditional && settings.author) {
        processedAuthor = await convertToTraditional(settings.author)
      }

      const baseFilename = generateFilename({
        title: processedTitle,
        author: processedAuthor,
        format: settings.filenameFormat || 'title-author',
        includeDate: settings.filenameIncludeDate || false,
        customTemplate: settings.filenameCustomTemplate || '',
      })

      if (splitMode === 'split') {
        // 拆成上下冊
        const midpoint = Math.ceil(processedChapters.length / 2)
        const vol1Chapters = processedChapters.slice(0, midpoint)
        const vol2Chapters = processedChapters.slice(midpoint)

        setProgress({ stage: 'structure', message: '正在生成上冊...' })
        const blob1 = await generateSingleEpub(
          vol1Chapters,
          `${processedTitle} 上冊`,
          processedAuthor,
          `${baseFilename} 上冊`
        )

        setProgress({ stage: 'structure', message: '正在生成下冊...' })
        const blob2 = await generateSingleEpub(
          vol2Chapters,
          `${processedTitle} 下冊`,
          processedAuthor,
          `${baseFilename} 下冊`
        )

        blobsRef.current = [
          { blob: blob1, filename: `${baseFilename} 上冊.epub` },
          { blob: blob2, filename: `${baseFilename} 下冊.epub` },
        ]

        // 自動下載兩個檔案（間隔 500ms 避免瀏覽器攔截）
        if (blob1) saveAs(blob1, `${baseFilename} 上冊.epub`)
        await new Promise(r => setTimeout(r, 500))
        if (blob2) saveAs(blob2, `${baseFilename} 下冊.epub`)
      } else {
        // 整本輸出
        const blob = await generateSingleEpub(
          processedChapters,
          processedTitle,
          processedAuthor,
          baseFilename
        )

        if (blob) {
          blobsRef.current = [{ blob, filename: `${baseFilename}.epub` }]
        }
      }

      setIsComplete(true)
    } catch (error) {
      console.error('生成失敗:', error)
      alert(`生成失敗：${error.message}`)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleRedownload = (index) => {
    const item = blobsRef.current[index]
    if (item) {
      saveAs(item.blob, item.filename)
    }
  }

  const fontConfig = FONT_CONFIG[settings.fontFamily]

  if (isComplete) {
    const isSplit = blobsRef.current.length > 1
    return (
      <div className="text-center py-12">
        <div
          className="inline-flex mb-6"
          style={{ color: 'var(--accent-primary)' }}
        >
          <CheckCircleIcon />
        </div>
        <h2
          className="font-serif text-2xl font-semibold mb-4"
          style={{ color: 'var(--text-primary)' }}
        >
          EPUB 生成完成！
        </h2>
        <p
          className="mb-8"
          style={{ color: 'var(--text-secondary)' }}
        >
          {isSplit ? '上下冊已自動下載到你的裝置' : '檔案已自動下載到你的裝置'}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center flex-wrap">
          {blobsRef.current.map((item, i) => (
            <button
              key={i}
              onClick={() => handleRedownload(i)}
              className="px-6 py-3 rounded-full text-sm font-medium transition-all flex items-center gap-2"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-primary)'
                e.currentTarget.style.color = 'var(--accent-primary)'
                e.currentTarget.style.transform = 'scale(1.05)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.color = 'var(--text-secondary)'
                e.currentTarget.style.transform = 'scale(1)'
              }}
            >
              <DownloadIcon />
              {isSplit ? `再次下載${i === 0 ? '上冊' : '下冊'}` : '再次下載'}
            </button>
          ))}
          <button
            onClick={onReset}
            className="px-6 py-3 rounded-full text-sm font-medium transition-all flex items-center gap-2"
            style={{
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              color: 'white',
              boxShadow: '0 4px 16px rgba(212, 165, 165, 0.3)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <RefreshIcon />
            轉換另一個檔案
          </button>
        </div>
      </div>
    )
  }

  const totalChars = chapters.reduce((sum, ch) => sum + ch.content.length, 0)
  const summaryItems = [
    { label: '書名', value: settings.title || '未命名' },
    { label: '作者', value: settings.author || '未填寫' },
    { label: '章節數', value: `${chapters.length} 章` },
    { label: '總字數', value: `約 ${Math.round(totalChars / 10000)} 萬字` },
    { label: '封面', value: cover ? '已設定' : '無' },
    { label: '簡轉繁', value: settings.convertToTraditional ? '是' : '否' },
    { label: '排版', value: settings.writingMode === 'vertical' ? '直排' : '橫排' },
    { label: '字型', value: fontConfig?.name || '預設' },
    { label: '嵌入字型', value: settings.embedFont ? '是（子集化）' : '否' },
  ]

  return (
    <div className="text-center py-8">
      <h2
        className="font-serif text-2xl font-semibold mb-6"
        style={{ color: 'var(--text-primary)' }}
      >
        確認並輸出
      </h2>

      {/* Summary */}
      <div
        className="max-w-md mx-auto mb-8 p-6 rounded-2xl text-left space-y-3"
        style={{ background: 'var(--bg-secondary)' }}
      >
        {summaryItems.map((item, i) => (
          <div key={i} className="flex justify-between">
            <span style={{ color: 'var(--text-muted)' }}>
              {item.label}
            </span>
            <span style={{ color: 'var(--text-primary)' }}>
              {item.value}
            </span>
          </div>
        ))}
      </div>

      {/* 拆冊選擇 — 只在系統建議拆冊時顯示 */}
      {splitSuggested && (
        <div
          className="max-w-md mx-auto mb-8 p-5 rounded-2xl text-left space-y-4"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)'
          }}
        >
          <div>
            <p
              className="font-serif font-medium mb-1"
              style={{ color: 'var(--text-primary)' }}
            >
              這本書篇幅很大
            </p>
            <p
              className="text-sm"
              style={{ color: 'var(--text-muted)' }}
            >
              共 {chapters.length} 章、約 {Math.round(totalChars / 10000)} 萬字。建議拆成上下冊，部分閱讀器對超大 EPUB 翻頁會比較慢。
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setSplitMode('single')}
              className="flex-1 p-3 rounded-2xl border text-sm transition-all flex items-center justify-center gap-2"
              style={{
                borderColor: splitMode === 'single' ? 'var(--accent-primary)' : 'var(--border)',
                background: splitMode === 'single' ? 'rgba(212, 165, 165, 0.1)' : 'transparent',
                color: splitMode === 'single' ? 'var(--text-primary)' : 'var(--text-secondary)'
              }}
            >
              <BookIcon />
              整本輸出
            </button>
            <button
              onClick={() => setSplitMode('split')}
              className="flex-1 p-3 rounded-2xl border text-sm transition-all flex items-center justify-center gap-2"
              style={{
                borderColor: splitMode === 'split' ? 'var(--accent-primary)' : 'var(--border)',
                background: splitMode === 'split' ? 'rgba(212, 165, 165, 0.1)' : 'transparent',
                color: splitMode === 'split' ? 'var(--text-primary)' : 'var(--text-secondary)'
              }}
            >
              <SplitIcon />
              拆成上下冊
            </button>
          </div>
          {splitMode === 'split' && (
            <p
              className="text-xs"
              style={{ color: 'var(--text-muted)' }}
            >
              上冊：第 1 ~ {Math.ceil(chapters.length / 2)} 章 / 下冊：第 {Math.ceil(chapters.length / 2) + 1} ~ {chapters.length} 章
            </p>
          )}
        </div>
      )}

      {/* Progress */}
      {isGenerating && (
        <div
          className="max-w-md mx-auto mb-6 p-4 rounded-2xl text-left space-y-3"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)'
          }}
        >
          <div className="flex items-center gap-3">
            <LoaderIcon style={{ color: 'var(--accent-primary)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>
              {progress.message || '處理中...'}
            </span>
          </div>
          {/* 進度條 */}
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: 'var(--border)' }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${getProgressPercent(progress.stage)}%`,
                background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))'
              }}
            />
          </div>
        </div>
      )}

      <button
        onClick={handleExport}
        disabled={isGenerating}
        className="px-12 py-4 rounded-full text-lg font-medium transition-all flex items-center gap-3 mx-auto"
        style={{
          background: isGenerating
            ? 'var(--bg-secondary)'
            : 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
          color: isGenerating ? 'var(--text-muted)' : 'white',
          cursor: isGenerating ? 'wait' : 'pointer',
          boxShadow: isGenerating ? 'none' : '0 4px 16px rgba(212, 165, 165, 0.3)'
        }}
        onMouseEnter={(e) => {
          if (!isGenerating) e.currentTarget.style.transform = 'scale(1.05)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)'
        }}
      >
        {isGenerating ? (
          <>
            <LoaderIcon />
            生成中...
          </>
        ) : (
          <>
            <DownloadIcon />
            {splitMode === 'split' ? '下載上下冊 EPUB' : '下載 EPUB'}
          </>
        )}
      </button>

      <p
        className="text-sm mt-4"
        style={{ color: 'var(--text-muted)' }}
      >
        {splitMode === 'split'
          ? `輸出檔名：${settings.title || '未命名'} 上冊.epub、${settings.title || '未命名'} 下冊.epub`
          : `輸出檔名：${settings.title || '未命名'}.epub`
        }
      </p>

      {settings.embedFont && (
        <p
          className="text-xs mt-3 flex items-center justify-center gap-2"
          style={{ color: 'var(--text-muted)' }}
        >
          <ZapIcon style={{ color: 'var(--accent-secondary)' }} />
          首次嵌入字型需下載完整字型檔，之後會快取加速
        </p>
      )}
    </div>
  )
}
