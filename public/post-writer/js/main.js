/**
 * 社群貼文排版 — 進入點 + 狀態管理 + 事件處理
 *
 * 流程：init → loadData → render → bindEvents
 * 更新：textarea input → refreshPreview（部分更新，保留游標）
 *       其他操作 → render（全量重繪）
 */

import { renderApp, updateStatsBar, updatePreviewContent, updateProgressBar, updatePicker } from './render.js'
import { computeStats, applyTemplate, validateTemplate, DEFAULT_PLATFORM } from './platforms.js'
// converter.js 由 render.js 和 clipboard.js 內部引用
import { copyResult, showToast } from './clipboard.js'
import { icons } from './icons.js'

// 版本號 — 改 data/*.json 時要 bump，瀏覽器才會抓新版
const ASSET_VERSION = '20260428a'

// ─── 全域狀態 ───────────────────────────────────────────

const state = {
  text: '',
  platform: DEFAULT_PLATFORM,
  viewMode: 'editor',
  mode: 'original',
  titleStyle: 'checkerboard',
  fullWidthPunctuation: false,
  sentenceCase: false,
  fullWidthDigit: false,
  titleDetect: 'auto',
  manualTitle: '',
  previewTab: 'platform',
  previewDevice: 'ios',
  previewExpanded: false,
  pickerTab: 'emoji',
  pickerCategory: 'smileys',
  copyState: 'idle',
  isDark: false,
  // Computed（由 recalculate 填入）
  transformed: '',
  stats: null,
  validation: { valid: true, warnings: [] },
}

// ─── 資料容器 ───────────────────────────────────────────

let data = { emoji: null, symbols: null, kaomoji: null }

// ─── 載入工具 ───────────────────────────────────────────

async function loadJSON(path) {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${path}${sep}v=${ASSET_VERSION}`)
  if (!res.ok) throw new Error(`載入 ${path} 失敗（${res.status}）`)
  try {
    return await res.json()
  } catch {
    throw new Error(`${path} 格式錯誤`)
  }
}

async function loadData() {
  const [emoji, symbols, kaomoji] = await Promise.all([
    loadJSON('data/emoji.json'),
    loadJSON('data/symbols.json'),
    loadJSON('data/kaomoji.json'),
  ])
  return { emoji, symbols, kaomoji }
}

// ─── 核心計算 ───────────────────────────────────────────

function recalculate() {
  const templateOptions = {
    titleStyle: state.titleStyle,
    titleDetect: state.titleDetect,
    manualTitle: state.manualTitle,
    fullWidthPunctuation: state.fullWidthPunctuation,
    sentenceCase: state.sentenceCase,
    fullWidthDigit: state.fullWidthDigit,
  }
  state.transformed = applyTemplate(state.text, state.mode, templateOptions)
  state.stats = computeStats(state.text, state.platform)
  state.validation = validateTemplate(state.text, state.mode)
}

// ─── 渲染 ───────────────────────────────────────────────

/**
 * 全量重繪（innerHTML 替換 #app，重新綁定事件）
 */
function render() {
  recalculate()
  const scrollY = window.scrollY
  const app = document.getElementById('app')
  app.innerHTML = renderApp(state, data)
  bindEvents()
  requestAnimationFrame(() => window.scrollTo(0, scrollY))
}

/**
 * 部分更新（不觸發 innerHTML，保留 textarea 游標位置）
 */
function refreshPreview() {
  recalculate()
  updateStatsBar(state)
  updatePreviewContent(state)
  updateProgressBar(state)
}

// ─── Click 委派（只綁定一次） ────────────────────────────

function handleAppClick(e) {
  const btn = e.target.closest('[data-action]')
  if (!btn) return

  const action = btn.dataset.action

  switch (action) {
    case 'set-platform':
      state.platform = btn.dataset.platform
      render()
      break

    case 'set-view':
      state.viewMode = btn.dataset.view
      render()
      break

    case 'set-mode':
      state.mode = btn.dataset.mode
      render()
      break

    case 'set-title-detect':
      state.titleDetect = btn.dataset.detect
      render()
      break

    case 'toggle-option': {
      const opt = btn.dataset.option
      state[opt] = !state[opt]
      render()
      break
    }

    case 'set-picker-tab': {
      state.pickerTab = btn.dataset.pickerTab
      const defaults = { emoji: 'smileys', symbols: 'bullets', kaomoji: 'happy' }
      state.pickerCategory = defaults[state.pickerTab] || state.pickerCategory
      updatePicker(state, data)
      break
    }

    case 'set-picker-category':
      state.pickerCategory = btn.dataset.pickerCategory
      updatePicker(state, data)
      break

    case 'insert-item':
      insertAtCursor(btn.dataset.item)
      break

    case 'insert-separator': {
      const sep = btn.dataset.sep
      const textarea = document.getElementById('post-textarea')
      const atStart = !textarea || textarea.selectionStart === 0
      insertAtCursor(atStart ? sep + '\n' : '\n' + sep + '\n')
      break
    }

    case 'set-device':
      state.previewDevice = btn.dataset.device
      render()
      break

    case 'set-preview-tab':
      state.previewTab = btn.dataset.tab
      render()
      break

    case 'toggle-expand':
      state.previewExpanded = !state.previewExpanded
      render()
      break

    case 'paste-text':
      handlePaste()
      break

    case 'clear-text':
      if (state.text || state.manualTitle) {
        state.text = ''
        state.manualTitle = ''
        state.previewExpanded = false
        render()
        showToast('已清空')
        const ta = document.getElementById('post-textarea')
        if (ta) ta.focus()
      } else {
        showToast('已經是空的')
      }
      break

    case 'copy-result':
      handleCopy()
      break

    case 'toggle-theme':
      state.isDark = !state.isDark
      document.body.classList.toggle('dark', state.isDark)
      localStorage.setItem('post-writer-theme', state.isDark ? 'dark' : 'light')
      render()
      break
  }
}

// ─── 事件綁定 ───────────────────────────────────────────

function bindEvents() {
  const app = document.getElementById('app')

  // Click 委派只綁定一次（app 元素不會被 innerHTML 替換）
  if (!app._clickBound) {
    app.addEventListener('click', handleAppClick)
    // Cmd/Ctrl + Enter 快捷鍵複製
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        handleCopy()
      }
    })
    app._clickBound = true
  }

  // 以下元素每次 render 都會被 innerHTML 重建，安全重新綁定
  const textarea = document.getElementById('post-textarea')
  if (textarea) {
    textarea.addEventListener('input', (e) => {
      state.text = e.target.value
      refreshPreview()
    })
    // 攔截貼上事件：強制純文字，防止 Notion/Google Docs RTF 污染
    textarea.addEventListener('paste', (e) => {
      e.preventDefault()
      const plain = (e.clipboardData || window.clipboardData).getData('text/plain')
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      state.text = state.text.slice(0, start) + plain + state.text.slice(end)
      textarea.value = state.text
      const pos = start + plain.length
      textarea.selectionStart = pos
      textarea.selectionEnd = pos
      refreshPreview()
    })
    // 全量重繪後恢復文字內容
    textarea.value = state.text
  }

  // 手動標題輸入
  const titleInput = document.getElementById('manual-title-input')
  if (titleInput) {
    titleInput.addEventListener('input', (e) => {
      state.manualTitle = e.target.value
      refreshPreview()
    })
    titleInput.value = state.manualTitle
  }

  // 標題樣式下拉選單
  const styleSelect = document.getElementById('title-style-select')
  if (styleSelect) {
    styleSelect.addEventListener('change', (e) => {
      state.titleStyle = e.target.value
      refreshPreview()
    })
  }
}

// ─── 插入工具 ───────────────────────────────────────────

function insertAtCursor(text) {
  const textarea = document.getElementById('post-textarea')
  if (!textarea) return

  const start = textarea.selectionStart
  const end = textarea.selectionEnd

  state.text = state.text.slice(0, start) + text + state.text.slice(end)
  textarea.value = state.text

  requestAnimationFrame(() => {
    const pos = start + text.length
    textarea.selectionStart = pos
    textarea.selectionEnd = pos
    // 觸控裝置不 focus，避免鍵盤彈出遮住 picker
    if (!('ontouchstart' in window)) {
      textarea.focus()
    }
  })

  refreshPreview()
}

// ─── 貼上 ───────────────────────────────────────────────

async function handlePaste() {
  try {
    const text = await navigator.clipboard.readText()
    if (text) {
      state.text = text
      render()
    } else {
      showToast('剪貼簿是空的')
    }
  } catch {
    // iOS 等不支援 readText 的環境：聚焦 textarea 提示手動貼上
    const textarea = document.getElementById('post-textarea')
    if (textarea) textarea.focus()
    showToast('請長按貼上')
  }
}

// ─── 複製 ───────────────────────────────────────────────

let copying = false

async function handleCopy() {
  if (copying) return
  if (!state.text && !(state.titleDetect === 'manual' && state.manualTitle.trim())) {
    showToast('請先輸入貼文內容')
    return
  }

  copying = true
  try {
    const templateOptions = {
      titleStyle: state.titleStyle,
      titleDetect: state.titleDetect,
      manualTitle: state.manualTitle,
      fullWidthPunctuation: state.fullWidthPunctuation,
      sentenceCase: state.sentenceCase,
      fullWidthDigit: state.fullWidthDigit,
    }

    const result = await copyResult(state.text, state.platform, state.mode, templateOptions)

    if (result.success) {
      state.copyState = 'success'
      render()
      setTimeout(() => {
        state.copyState = 'idle'
        const btn = document.querySelector('.copy-btn')
        if (btn) {
          btn.classList.remove('copy-btn--success')
          btn.innerHTML = icons.copy + ' 複製並套用格式'
        }
      }, 2000)
    }
  } finally {
    copying = false
  }
}

// ─── 主題 ───────────────────────────────────────────────

function initTheme() {
  const saved = localStorage.getItem('post-writer-theme')
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    state.isDark = true
    document.body.classList.add('dark')
  }
}

// ─── 初始化 ─────────────────────────────────────────────

async function init() {
  initTheme()
  try {
    data = await loadData()
    render()
  } catch (err) {
    const safeMsg = (err.message || '未知錯誤').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#039;'}[c]))
    document.getElementById('app').innerHTML =
      `<div class="error-msg"><p>載入失敗：${safeMsg}</p></div>`
  }
}

// ─── iOS 鍵盤收合防跳 ──────────────────────────────────

function initViewportStability() {
  if (!window.visualViewport) return
  let lastHeight = window.visualViewport.height

  window.visualViewport.addEventListener('resize', () => {
    const newHeight = window.visualViewport.height
    // 鍵盤收合（高度增加）時鎖定滾動位置
    if (newHeight > lastHeight) {
      const scrollY = window.scrollY
      requestAnimationFrame(() => window.scrollTo(0, scrollY))
    }
    lastHeight = newHeight
  })
}

document.addEventListener('DOMContentLoaded', () => {
  initViewportStability()
  init()
})
