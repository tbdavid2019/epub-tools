// i18n-zh-TW.js — 閱星曈轉檔工具繁體中文語系
var zhTW = {
  // App
  appTitle: '閱星曈轉檔工具',
  appSubtitle: 'EPUB · PDF · MOBI · TXT · Markdown · DOC → XTC',

  // Mode
  modeSimple: '簡潔模式',
  modeExpert: '專家模式',

  // File upload
  dropZoneText: '點擊或拖放檔案到這裡',
  dropZoneHint: '支援 EPUB、PDF、MOBI、TXT、Markdown、DOC/DOCX',
  batchConvert: '批次轉換',

  // Device presets
  devicePreset: '裝置預設',
  deviceX4: 'XTEink X4 (480×800)',
  deviceX3: 'XTEink X3 (528×792)',
  deviceCustom: '自訂尺寸',
  width: '寬度',
  height: '高度',
  orientation: '螢幕方向',

  // Font settings
  fontFamily: '字型',
  fontSize: '字級',
  fontWeight: '字重',
  lineHeight: '行高',
  customFont: '上傳自訂字型',
  customFontHint: '支援 TTF / OTF 格式',

  // Font names with recommendations
  fontGuanKiap: '原俠正楷（楷體・建議 30-36px）',
  fontHuninn: 'jf open 粉圓（圓體・建議 32-38px）',
  fontNotoSerifTC: '思源宋體（明體・建議 28-34px）',
  fontNotoSansTC: '思源黑體（黑體・建議 28-34px）',
  fontJasonHandwriting: '清松手寫體（手寫・建議 32px 以上）',
  fontCubic11: '俐方體 11 號（點陣・建議 33px）',

  // Font size hints
  fontHintGuanKiap: '原俠正楷適合文學類閱讀，建議字級 30-36px',
  fontHintHuninn: '粉圓體筆畫飽滿好讀，建議字級 32-38px',
  fontHintNotoSerifTC: '思源宋體適合長時間閱讀，建議字級 28-34px',
  fontHintNotoSansTC: '思源黑體清晰俐落，建議字級 28-34px',
  fontHintJasonHandwriting: '手寫體建議大一點才清楚，建議字級 32px 以上',
  fontHintCubic11: '點陣體建議用 33px（11 的整數倍最清晰）',

  // Text settings
  textSettings: '文字設定',
  margins: '邊距',
  marginTop: '上',
  marginRight: '右',
  marginBottom: '下',
  marginLeft: '左',
  textAlign: '對齊方式',
  alignLeft: '靠左',
  alignCenter: '置中',
  alignRight: '靠右',
  alignJustify: '兩端對齊',
  indent: '首行縮排',
  paragraphSpacing: '段距',

  // Hyphenation
  hyphenation: '斷字',
  hyphenNone: '關閉',
  hyphenAlgorithmic: '演算法',
  hyphenDictionary: '字典',
  hyphenLanguage: '斷字語言',
  hyphenAuto: '自動偵測',

  // Quality
  qualityMode: '匯出品質',
  qualityFast: '快刷模式（1-bit 黑白）',
  qualityHQ: '高清模式（2-bit 灰階）',
  qualityFastDesc: '刷新快、檔案小，適合純文字',
  qualityHQDesc: '畫質好、有灰階，適合含圖書籍',

  // Dithering
  dithering: '抖動處理',
  ditherEnabled: '啟用抖動',
  ditherStrength: '抖動強度',
  ditherNone: '關閉',
  ditherImageOnly: '僅圖片區域',
  ditherFull: '全頁抖動',
  ditherSensitivity: '偵測靈敏度',

  // Image settings
  imageSettings: '圖片設定',
  brightness: '亮度',
  contrast: '對比度',
  imageZoom: '圖片縮放',
  negative: '負片模式',
  imagePresetBalance: '均衡',
  imagePresetPhoto: '照片感',
  imagePresetComic: '漫畫感',

  // Progress bar
  progressBar: '進度條設定',
  progressPosition: '位置',
  progressBottom: '底部',
  progressTop: '頂部',
  progressTheme: '主題',
  showProgressLine: '顯示進度線',
  showChapterMarks: '顯示章節標記',
  showPageNumber: '顯示頁碼',
  showPercentage: '顯示百分比',
  showChapterProgress: '顯示章節進度',
  progressFontSize: '進度條字級',

  // Export
  exportFormat: '匯出格式',
  exportXTC: '匯出 XTC',
  exportXTCH: '匯出 XTCH（高清）',
  exportXTCZ: '匯出 XTCZ（LZ4 壓縮）',
  exportPage: '匯出當前頁',
  exportAll: '全部匯出',
  exportPrefix: '檔名前綴',

  // Preview
  previewTitle: '即時預覽',
  prevPage: '上一頁',
  nextPage: '下一頁',
  refresh: '重新整理',
  pageOf: '第 {current} 頁，共 {total} 頁',

  // Book info
  bookInfo: '書籍資訊',
  bookTitle: '書名',
  bookAuthor: '作者',
  bookPages: '總頁數',
  chapters: '章節目錄',

  // Background
  background: '背景圖設定',
  bgStretch: '伸展',
  bgTile: '平鋪',
  bgClear: '清除',
  bgBrightness: '背景亮度',
  bgContrast: '背景對比度',
  bgDither: '背景抖動',

  // Underline
  underline: '底線設定',
  underlineEnabled: '啟用底線',
  underlineStyle: '底線樣式',
  underlineOffset: '位置偏移',

  // Config
  configExport: '匯出設定',
  configImport: '匯入設定',

  // Status messages
  loading: '載入中...',
  loadingBook: '正在載入書籍...',
  converting: '轉換中...',
  convertingPage: '正在處理第 {current} 頁，共 {total} 頁',
  convertingEstimate: '預估剩餘 {time}',
  exportComplete: '轉檔完成！',
  exportFailed: '轉檔失敗，請再試一次',

  // Errors (friendly tone)
  errorFileType: '這個檔案格式目前不支援，試試 EPUB、PDF 或 MOBI？',
  errorFileTooLarge: '這本書比較大（{size} MB），轉檔可能需要幾分鐘',
  errorMemory: '記憶體不太夠用了，建議用電腦轉這本比較大的書',
  errorGeneric: '出了點狀況，要不要試試重新上傳？',
  errorPdfRender: 'PDF 渲染遇到問題，確認一下檔案是不是完整的？',

  // Onboarding
  onboardStep1Title: '選擇裝置',
  onboardStep1Desc: '先選你的閱星曈型號（X4 或 X3）',
  onboardStep2Title: '上傳書籍',
  onboardStep2Desc: '拖放或點擊上傳你的電子書',
  onboardStep3Title: '匯出 XTC',
  onboardStep3Desc: '調整喜歡的設定，按下匯出就完成了',
  onboardSkip: '跳過引導',
  onboardNext: '下一步',
  onboardDone: '開始使用',

  // Quick presets
  presetNovel: '小說模式',
  presetNovelDesc: '適合純文字書籍，字體舒適好讀',
  presetComic: '漫畫模式',
  presetComicDesc: '適合圖片為主的書，全頁抖動最佳化',
  presetDocument: '文件模式',
  presetDocumentDesc: '適合 PDF/DOC 文件，保留原始排版',
  presetOneClick: '一鍵最佳配置',

  // Tutorial
  tutorialTitle: '轉好的檔案怎麼放到閱星曈？',
  tutorialMethod1Title: 'MicroSD 卡（最穩定）',
  tutorialMethod1Desc: '用退卡針取出記憶卡 → 插入讀卡器 → 把 XTC 檔案拖進去 → 插回閱星曈',
  tutorialMethod2Title: 'WiFi 無線傳書',
  tutorialMethod2Desc: '閱星曈開啟 WiFi 熱點（E-Paper / 密碼 12345678）→ 手機連上 → 瀏覽器開 192.168.3.3 → 上傳檔案',
  tutorialMethod3Title: '官方 App / CrossPoint Sync',
  tutorialMethod3Desc: '下載 XTEink App 或 CrossPoint Sync → 同一個 WiFi 下自動連線 → 一鍵傳書',

  // Mobile
  mobileWarningLarge: '這本書有 {pages} 頁，手機轉檔約需 {time} 分鐘',
  mobileRecommendPC: '建議用電腦轉這本含大量圖片的書',
  mobilePrivacy: '轉檔全程在你的手機上完成，不會上傳到任何伺服器',

  // Footer
  footerCopyright: '(C) {year} Kaoru Tsai. All Rights Reserved.',
  footerContact: 'Contact: hello@helloruru.com',
  footerCredits: '基於 epub-to-xtc-converter 開源專案',
  footerPrivacy: '所有轉檔在瀏覽器本地完成，不上傳任何檔案',

  // Credits
  creditsTitle: '致謝',
  creditsOpenSource: '開源專案',
  creditsFonts: '繁體中文字型',
  creditsSpecialThanks: '特別感謝',

  // Dark mode
  darkMode: '深色模式',
  lightMode: '亮色模式',

  // Legal
  legalNotice: '請僅處理你已合法取得的電子書內容。',
};

// 掛到全域供其他模組使用
window.zhTW = zhTW;
