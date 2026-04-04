import { lazy } from 'react'

// 懶載入頁面元件
const Home = lazy(() => import('./pages/Home'))
const EpubTool = lazy(() => import('./pages/EpubTool'))
const EpubConvert = lazy(() => import('./pages/EpubConvert'))
const BgRemoval = lazy(() => import('./pages/BgRemoval'))
const PostWriter = lazy(() => import('./pages/PostWriter'))

const BASE = 'https://tools.helloruru.com'

/**
 * 路由設定
 * 新增頁面時只需在此處新增路由 + seo 欄位
 */
export const routes = [
  {
    path: '/',
    element: Home,
    title: '首頁',
    seo: {
      title: 'Ruru 工具箱 — 免費線上工具，全程本機處理｜HelloRuru',
      description: '免費線上工具箱：TXT 轉 EPUB 電子書、EPUB 簡轉繁、AI 批次去背、社群貼文排版、PDF 編輯簽名。全程瀏覽器本機處理，不上傳任何資料，保護個人隱私。',
      keywords: '線上工具,免費工具,TXT轉EPUB,EPUB簡轉繁,AI去背,社群貼文排版,PDF編輯,PDF簽名,本機處理,隱私保護,HelloRuru',
      canonical: `${BASE}/`,
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'HelloRuru Tools',
          alternateName: ['Ruru 工具箱', 'HelloRuru 線上工具'],
          url: BASE,
          description: '免費線上工具箱，全程瀏覽器本機處理，不上傳任何資料，保護個人隱私。',
          publisher: {
            '@type': 'Organization',
            name: 'HelloRuru',
            url: 'https://helloruru.com',
          },
        },
        {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'HelloRuru 線上工具列表',
          itemListElement: [
            {
              '@type': 'ListItem',
              position: 1,
              name: 'TXT 轉 EPUB',
              description: '上傳 TXT 小說檔案，自動偵測章節結構、支援簡轉繁，一鍵生成標準 EPUB 電子書格式。',
              url: `${BASE}/txt-to-epub`,
            },
            {
              '@type': 'ListItem',
              position: 2,
              name: 'EPUB 簡轉繁',
              description: '將簡體中文 EPUB 電子書轉換為繁體中文，使用 OpenCC 引擎做詞彙級轉換，保留原有格式與排版。',
              url: `${BASE}/epub-convert`,
            },
            {
              '@type': 'ListItem',
              position: 3,
              name: '批次去背',
              description: '上傳多張圖片，AI 自動去除背景。支援 4 種去背模式，不限解析度，全程本機處理完全免費。',
              url: `${BASE}/bg-removal`,
            },
            {
              '@type': 'ListItem',
              position: 4,
              name: '社群貼文排版',
              description: '解決 Facebook、Instagram、Threads 貼文換行消失問題，即時預覽、雜誌感設計排版、Broetry 文體模式。',
              url: `${BASE}/post-writer`,
            },
            {
              '@type': 'ListItem',
              position: 5,
              name: 'Card Maker 卡片製造機',
              description: '免費社群貼文圖片產生器，4 款質感模板，支援 IG 貼文、IG 限動、FB 貼文等多種尺寸，一鍵下載 PNG。',
              url: `${BASE}/card-maker/`,
            },
            {
              '@type': 'ListItem',
              position: 6,
              name: 'PDF 編輯工具',
              description: '免費線上 PDF 編輯工具：手寫簽名、打字簽名、圖片簽名、文字覆蓋。支援多頁 PDF 瀏覽與編輯，全程瀏覽器本機處理，不上傳任何檔案。',
              url: `${BASE}/pdf-editor/`,
            },
            {
              '@type': 'ListItem',
              position: 7,
              name: 'Lyric Player 歌詞播放器',
              description: '免費線上歌詞播放器，上傳 MP3 即可 AI 自動辨識歌詞並同步播放。支援 LRC 上傳、歌詞編輯、時間微調、匯出下載，中英日韓多語言辨識。',
              url: `${BASE}/lyric-player/`,
            },
          ],
        },
      ],
    },
  },
  {
    path: '/txt-to-epub',
    element: EpubTool,
    title: 'TXT 轉 EPUB',
    seo: {
      title: 'TXT 轉 EPUB — 免費線上 TXT 小說轉電子書工具｜HelloRuru',
      description: '免費線上 TXT 轉 EPUB 工具，自動偵測章節結構、支援簡體轉繁體、直排橫排切換、自訂封面與字型。全程瀏覽器本機處理，不上傳檔案。',
      keywords: 'TXT轉EPUB,小說轉電子書,免費EPUB製作,簡轉繁,電子書工具,線上轉檔,本機處理',
      canonical: `${BASE}/txt-to-epub`,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'TXT 轉 EPUB — HelloRuru',
        alternateName: ['TXT to EPUB Converter', 'TXT 小說轉電子書'],
        description: '免費線上 TXT 轉 EPUB 工具，自動偵測章節結構、支援簡體轉繁體、直排橫排切換、自訂封面與字型。全程瀏覽器本機處理，不上傳檔案。',
        url: `${BASE}/txt-to-epub`,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'All',
        browserRequirements: 'Requires JavaScript',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'TWD' },
        featureList: [
          '自動偵測章節結構',
          '簡體轉繁體（OpenCC）',
          '直排與橫排切換',
          '自訂封面圖片',
          '多種字型選擇（明體、黑體、圓體等）',
          '字級與行距調整',
          '全程瀏覽器本機處理',
        ],
      },
    },
  },
  {
    path: '/epub-convert',
    element: EpubConvert,
    title: 'EPUB 簡轉繁',
    seo: {
      title: 'EPUB 簡轉繁 — 免費線上 EPUB 簡體轉繁體工具｜HelloRuru',
      description: '免費線上 EPUB 簡體轉繁體工具，使用 OpenCC（繁化姬）引擎做詞彙級轉換，保留原書格式與排版。全程瀏覽器本機處理，不上傳檔案。',
      keywords: 'EPUB簡轉繁,簡體轉繁體,電子書轉換,OpenCC,繁化姬,免費轉換,本機處理',
      canonical: `${BASE}/epub-convert`,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'EPUB 簡轉繁 — HelloRuru',
        alternateName: ['EPUB Simplified to Traditional Chinese Converter'],
        description: '免費線上 EPUB 簡體轉繁體工具，使用 OpenCC 引擎做詞彙級轉換（如「軟件」→「軟體」），保留原書格式與排版。',
        url: `${BASE}/epub-convert`,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'All',
        browserRequirements: 'Requires JavaScript',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'TWD' },
        featureList: [
          '使用 OpenCC（繁化姬）引擎',
          '詞彙級轉換（軟件→軟體、信息→資訊）',
          '保留原書格式與排版',
          '拖放上傳 EPUB 檔案',
          '即時轉換進度顯示',
          '全程瀏覽器本機處理',
        ],
      },
    },
  },
  {
    path: '/bg-remove',
    element: BgRemoval,
    title: '批次去背',
    seo: {
      title: '批次去背 — 免費 AI 線上去背工具，不限解析度｜HelloRuru',
      description: '免費 AI 線上去背工具，支援批次上傳 PNG、JPG、WebP 圖片，提供 4 種去背模式（純色、一般、智慧、深度），不限解析度，全程本機處理不上傳。',
      keywords: 'AI去背,線上去背,免費去背,批次去背,圖片去背景,背景移除,本機處理,不限解析度',
      canonical: `${BASE}/bg-removal`,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: '批次去背 — HelloRuru',
        alternateName: ['AI Background Removal', 'AI 批次去背工具'],
        description: '免費 AI 線上去背工具，支援批次上傳、4 種去背模式、不限解析度，全程本機處理不上傳。',
        url: `${BASE}/bg-removal`,
        applicationCategory: 'DesignApplication',
        operatingSystem: 'All',
        browserRequirements: 'Requires JavaScript',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'TWD' },
        featureList: [
          '4 種去背模式：純色、一般、智慧 AI、深度去背',
          '批次上傳多張圖片',
          '支援 PNG、JPG、WebP 格式',
          '不限圖片解析度',
          '前後對比滑桿預覽',
          '批次 ZIP 下載',
          '全程瀏覽器本機處理，圖片不上傳',
        ],
      },
    },
  },
  {
    path: '/post-writer',
    element: PostWriter,
    title: '社群貼文排版',
    seo: {
      title: '社群貼文排版 — 解決 FB、IG、Threads 換行消失問題｜HelloRuru',
      description: '免費社群貼文排版工具，解決 Facebook、Instagram、Threads 貼文換行消失問題。提供即時預覽、雜誌感設計排版、Broetry 文體模式，一鍵複製直接貼上。',
      keywords: 'FB貼文排版,IG換行,Threads排版,社群貼文,換行消失,零寬空格,貼文工具,即時預覽',
      canonical: `${BASE}/post-writer`,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: '社群貼文排版 — HelloRuru',
        alternateName: ['Social Post Formatter', 'FB 貼文排版工具'],
        description: '解決 Facebook、Instagram、Threads 貼文換行消失問題，提供即時預覽、雜誌感設計排版、Broetry 文體模式。',
        url: `${BASE}/post-writer`,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'All',
        browserRequirements: 'Requires JavaScript',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'TWD' },
        featureList: [
          '解決 FB / IG / Threads 換行消失問題',
          '即時平台模擬預覽',
          '雜誌感設計排版模式（Emoji 轉幾何符號、標題飾條）',
          'Broetry 文體排版模式（自動分段、留白節奏）',
          '自動 / 手動標題偵測',
          'Emoji 分類選擇器',
          '一鍵複製轉換結果',
          '全程本機處理',
        ],
      },
    },
  },
]

export default routes
