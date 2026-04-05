import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import FileUploader from '../components/FileUploader'
import ChapterPreview from '../components/ChapterPreview'
import CoverUploader from '../components/CoverUploader'
import SettingsPanel from '../components/SettingsPanel'
import ExportButton from '../components/ExportButton'
import ThemeToggle from '../components/ThemeToggle'
import Footer from '../components/Footer'
import { useTheme } from '../contexts/ThemeContext'
import { detectChapters, detectBookMetadata } from '../utils/chapterDetector'

// SVG Icons
const ArrowLeftIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor">
    <path d="M19 12H5M12 19l-7-7 7-7"/>
  </svg>
)

const BookIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    <path d="M8 7h8M8 11h8M8 15h5"/>
  </svg>
)

const BookOpenIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
)

export default function EpubTool() {
  const { isDark } = useTheme()
  const [file, setFile] = useState(null)
  const [content, setContent] = useState('')
  const [chapters, setChapters] = useState([])
  const [cover, setCover] = useState(null)
  const [settings, setSettings] = useState({
    title: '',
    author: '',
    convertToTraditional: true,
    writingMode: 'horizontal',
    fontFamily: 'noto-sans',
    embedFont: false,
    fontSize: 'medium',
    lineHeight: 'normal',
    textIndent: 'two',
  })
  const [step, setStep] = useState(1)
  const [splitMode, setSplitMode] = useState('single') // 'single' | 'split'
  const [splitSuggested, setSplitSuggested] = useState(false)

  const handleFileUpload = useCallback(async (uploadedFile, text) => {
    setFile(uploadedFile)
    setContent(text)
    const detectedChapters = detectChapters(text)
    setChapters(detectedChapters)
    
    // 自動偵測書名與作者
    const fileName = uploadedFile.name.replace(/\.txt$/i, '')
    const metadata = detectBookMetadata(text, fileName)
    
    setSettings(prev => ({ 
      ...prev, 
      title: metadata.title || fileName,
      author: metadata.author || '',
    }))
    setStep(2)
  }, [])

  const handleBack = () => {
    if (step > 1) setStep(step - 1)
  }

  const handleNext = () => {
    if (step === 3) {
      // 進入 Step 4 時，偵測是否建議拆冊
      const totalChars = chapters.reduce((sum, ch) => sum + ch.content.length, 0)
      const shouldSuggest = chapters.length > 500 || totalChars > 500000
      setSplitSuggested(shouldSuggest)
      if (!shouldSuggest) {
        setSplitMode('single')
      }
    }
    if (step < 4) setStep(step + 1)
  }

  const handleReset = () => {
    setFile(null)
    setContent('')
    setChapters([])
    setCover(null)
    setSettings({
      title: '',
      author: '',
      convertToTraditional: true,
      writingMode: 'horizontal',
      fontFamily: 'noto-sans',
      embedFont: false,
      fontSize: 'medium',
      lineHeight: 'normal',
      textIndent: 'two',
    })
    setSplitMode('single')
    setSplitSuggested(false)
    setStep(1)
  }

  const stepLabels = ['上傳檔案', '確認章節', '書籍設定', '輸出 EPUB']
  const instructionSteps = [
    { title: '上傳 TXT 檔案', desc: '支援任意大小，全程本機處理' },
    { title: '確認章節與設定', desc: '自動偵測章節，可開啟簡轉繁' },
    { title: '下載 EPUB', desc: '可加入封面，支援直排/橫排' },
  ]

  return (
    <div 
      className="min-h-screen transition-colors duration-300"
      style={{ background: 'var(--bg-primary)' }}
    >
      {/* 頂部導航 */}
      <nav 
        className="border-b sticky top-0 z-10 backdrop-blur-sm transition-colors"
        style={{ 
          borderColor: 'var(--border)',
          background: isDark ? 'rgba(30, 26, 29, 0.8)' : 'rgba(255, 252, 250, 0.8)'
        }}
      >
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link 
            to="/" 
            className="flex items-center gap-2 transition-colors hover:opacity-70"
            style={{ color: 'var(--accent-primary)' }}
          >
            <ArrowLeftIcon />
            <span>返回工具箱</span>
          </Link>
          
          <h1 
            className="flex items-center gap-2 text-xl font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            <span style={{ color: 'var(--accent-secondary)' }}>
              <BookIcon />
            </span>
            TXT 轉 EPUB
          </h1>
          
          <ThemeToggle />
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* 使用說明 */}
        {step === 1 && (
          <div 
            className="mb-8 p-6 rounded-3xl border transition-colors"
            style={{ 
              background: 'var(--bg-card)',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow)'
            }}
          >
            <h2 
              className="text-xl mb-2 flex items-center gap-3"
              style={{ color: 'var(--text-primary)' }}
            >
              <span 
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ 
                  background: 'linear-gradient(135deg, rgba(184, 169, 201, 0.2), rgba(212, 165, 165, 0.2))'
                }}
              >
                <BookOpenIcon style={{ color: 'var(--accent-secondary)' }} />
              </span>
              使用說明
            </h2>
            <div 
              className="h-px my-4"
              style={{ background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary), transparent)' }}
            />
            
            <div className="grid md:grid-cols-3 gap-6 text-sm">
              {instructionSteps.map((item, i) => (
                <div key={i} className="flex gap-3">
                  <span 
                    className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-semibold flex-shrink-0"
                    style={{ 
                      borderColor: 'var(--accent-primary)',
                      color: 'var(--accent-primary)'
                    }}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p 
                      className="font-medium mb-1"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {item.title}
                    </p>
                    <p style={{ color: 'var(--text-muted)' }}>
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 進度指示 */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all"
                style={{ 
                  background: step >= s 
                    ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' 
                    : 'var(--bg-secondary)',
                  color: step >= s ? 'white' : 'var(--text-muted)',
                  boxShadow: step >= s ? 'var(--shadow)' : 'none'
                }}
              >
                {s}
              </div>
              {s < 4 && (
                <div 
                  className="w-12 h-0.5 mx-1 transition-colors"
                  style={{ 
                    background: step > s 
                      ? 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))' 
                      : 'var(--border)'
                  }}
                />
              )}
            </div>
          ))}
        </div>
        
        <div 
          className="text-center text-sm mb-8"
          style={{ color: 'var(--text-secondary)' }}
        >
          {stepLabels[step - 1]}
        </div>

        {/* 步驟內容 */}
        <div 
          className="rounded-3xl border p-6 md:p-8 transition-colors"
          style={{ 
            background: 'var(--bg-card)',
            borderColor: 'var(--border)',
            boxShadow: 'var(--shadow)'
          }}
        >
          {step === 1 && <FileUploader onUpload={handleFileUpload} />}
          {step === 2 && (
            <ChapterPreview 
              chapters={chapters} 
              setChapters={setChapters}
              fileName={file?.name}
              content={content}
            />
          )}
          {step === 3 && (
            <div className="space-y-8">
              <SettingsPanel settings={settings} setSettings={setSettings} />
              <CoverUploader cover={cover} setCover={setCover} />
            </div>
          )}
          {step === 4 && (
            <ExportButton
              content={content}
              chapters={chapters}
              cover={cover}
              settings={settings}
              onReset={handleReset}
              splitMode={splitMode}
              setSplitMode={setSplitMode}
              splitSuggested={splitSuggested}
            />
          )}
        </div>

        {/* 底部按鈕 */}
        <div className="flex justify-between mt-6">
          <button
            onClick={step === 1 ? undefined : handleBack}
            disabled={step === 1}
            className="px-6 py-2.5 rounded-full transition-all flex items-center gap-2"
            style={{ 
              opacity: step === 1 ? 0 : 1,
              cursor: step === 1 ? 'default' : 'pointer',
              background: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)'
            }}
          >
            <ArrowLeftIcon className="w-4 h-4" />
            上一步
          </button>
          
          {step < 4 && (
            <button
              onClick={handleNext}
              disabled={step === 1 && !file}
              className="px-6 py-2.5 rounded-full transition-all flex items-center gap-2"
              style={{ 
                background: (step === 1 && !file) 
                  ? 'var(--bg-secondary)' 
                  : 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                color: (step === 1 && !file) ? 'var(--text-muted)' : 'white',
                cursor: (step === 1 && !file) ? 'not-allowed' : 'pointer',
                boxShadow: (step === 1 && !file) ? 'none' : 'var(--shadow)'
              }}
            >
              下一步
              <svg viewBox="0 0 24 24" className="w-4 h-4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" stroke="currentColor">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
          )}
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  )
}
