/**
 * font-config.js — 繁體中文字型載入設定
 * 閱星曈轉檔工具 | HelloRuru Tools
 *
 * 字型載入策略：
 * - 自架字型（lab.helloruru.com）：懶載入，選到才下載
 * - CDN 字型（GitHub raw）：懶載入，選到才下載
 * - 自訂上傳字型：使用者手動上傳 TTF/OTF
 *
 * creName = CREngine WASM 內部認的 font family name
 * 必須跟字型檔 name table 裡的 family name 一致，
 * setFontFace() 要傳這個名字才會生效。
 */

var FONT_CONFIG = {
  // === 繁體中文字型 ===

  GuanKiapTsingKhai: {
    name: '原俠正楷',
    creName: 'GuanKiapTsingKhai-TW',
    category: 'zh-TW',
    style: '楷體',
    license: 'SIL OFL',
    author: 'tonyhuan',
    recommendedSize: { min: 30, max: 36, default: 34 },
    hint: '原俠正楷適合文學類閱讀，建議字級 30-36px',
    variants: [
      { weight: 400, style: 'normal', url: 'https://lab.helloruru.com/fonts/xtc/GuanKiapTsingKhai-TW.ttf' },
    ],
  },

  Huninn: {
    name: 'jf open 粉圓',
    creName: 'jf-openhuninn-2.0',
    category: 'zh-TW',
    style: '圓體',
    license: 'SIL OFL',
    author: 'justfont',
    recommendedSize: { min: 32, max: 38, default: 34 },
    hint: '粉圓體筆畫飽滿好讀，建議字級 32-38px',
    variants: [
      { weight: 400, style: 'normal', url: 'https://raw.githubusercontent.com/justfont/open-huninn-font/master/font/jf-openhuninn-2.0.ttf' },
    ],
  },

  NotoSerifTC: {
    name: '思源宋體',
    creName: 'Noto Serif TC',
    category: 'zh-TW',
    style: '明體',
    license: 'SIL OFL',
    author: 'Google & Adobe',
    recommendedSize: { min: 28, max: 34, default: 30 },
    hint: '思源宋體適合長時間閱讀，建議字級 28-34px',
    variants: [
      { weight: 400, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notoseriftc/NotoSerifTC%5Bwght%5D.ttf' },
      { weight: 700, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notoseriftc/NotoSerifTC%5Bwght%5D.ttf' },
    ],
  },

  NotoSansTC: {
    name: '思源黑體',
    creName: 'Noto Sans TC',
    category: 'zh-TW',
    style: '黑體',
    license: 'SIL OFL',
    author: 'Google & Adobe',
    recommendedSize: { min: 28, max: 34, default: 30 },
    hint: '思源黑體清晰俐落，建議字級 28-34px',
    variants: [
      { weight: 400, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf' },
      { weight: 700, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf' },
    ],
  },

  JasonHandwriting1: {
    name: '清松手寫體',
    creName: 'JasonHandwriting1',
    category: 'zh-TW',
    style: '手寫體',
    license: 'SIL OFL',
    author: '游清松',
    recommendedSize: { min: 32, max: 40, default: 34 },
    hint: '手寫體建議大一點才清楚，建議字級 32px 以上（約 19MB，首次載入較慢）',
    variants: [
      { weight: 400, style: 'normal', url: 'https://lab.helloruru.com/fonts/xtc/JasonHandwriting1-Regular.ttf' },
    ],
  },

  Cubic11: {
    name: '俐方體 11 號',
    creName: 'Cubic 11',
    category: 'zh-TW',
    style: '點陣體',
    license: 'SIL OFL 1.1',
    author: 'ACh-K',
    recommendedSize: { min: 22, max: 44, default: 33 },
    hint: '點陣體建議用 33px（11 的整數倍最清晰）',
    variants: [
      { weight: 400, style: 'normal', url: 'https://lab.helloruru.com/fonts/xtc/Cubic11-Regular.ttf' },
    ],
  },

  LINESeedTW: {
    name: 'LINE Seed',
    creName: 'LINE Seed TW_TTF',
    category: 'zh-TW',
    style: '現代無襯線',
    license: 'SIL OFL 1.1',
    author: 'LINE Corp.',
    recommendedSize: { min: 28, max: 36, default: 32 },
    hint: 'LINE Seed 現代感無襯線體，建議字級 28-36px',
    variants: [
      { weight: 400, style: 'normal', url: 'https://lab.helloruru.com/fonts/xtc/LINESeedTW-Regular.ttf' },
      { weight: 700, style: 'normal', url: 'https://lab.helloruru.com/fonts/xtc/LINESeedTW-Bold.ttf' },
    ],
  },

  GenWanMin2TW: {
    name: '源雲明朝',
    creName: 'GenWanMin2 TW',
    category: 'zh-TW',
    style: '古典明體',
    license: 'SIL OFL',
    author: 'ButTaiwan',
    recommendedSize: { min: 28, max: 36, default: 32 },
    hint: '源雲明朝古典雅緻，適合文學作品，建議字級 28-36px（約 22MB，首次載入較慢）',
    variants: [
      { weight: 400, style: 'normal', url: 'https://lab.helloruru.com/fonts/xtc/GenWanMin2TW-Regular.otf' },
    ],
  },

  // === 英文字型 ===

  Literata: {
    name: 'Literata',
    creName: 'Literata',
    category: 'en',
    style: 'Serif',
    license: 'SIL OFL',
    author: 'TypeTogether',
    recommendedSize: { min: 24, max: 34, default: 28 },
    hint: 'Literata 經典英文襯線體，建議字級 24-34px',
    variants: [
      { weight: 400, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/literata/Literata%5Bopsz%2Cwght%5D.ttf' },
    ],
  },

  Lora: {
    name: 'Lora',
    creName: 'Lora',
    category: 'en',
    style: 'Serif',
    license: 'SIL OFL',
    author: 'Cyreal',
    recommendedSize: { min: 24, max: 34, default: 28 },
    hint: 'Lora 優雅英文襯線體，建議字級 24-34px',
    variants: [
      { weight: 400, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/lora/Lora%5Bwght%5D.ttf' },
    ],
  },

  Merriweather: {
    name: 'Merriweather',
    creName: 'Merriweather',
    category: 'en',
    style: 'Serif',
    license: 'SIL OFL',
    author: 'Sorkin Type',
    recommendedSize: { min: 24, max: 34, default: 28 },
    hint: 'Merriweather 粗筆畫英文襯線體，e-ink 上清晰',
    variants: [
      { weight: 400, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/merriweather/Merriweather%5Bwght%5D.ttf' },
    ],
  },

  SourceSerif4: {
    name: 'Source Serif 4',
    creName: 'Source Serif 4',
    category: 'en',
    style: 'Serif',
    license: 'SIL OFL',
    author: 'Adobe',
    recommendedSize: { min: 24, max: 34, default: 28 },
    hint: 'Source Serif 4 專業英文襯線體',
    variants: [
      { weight: 400, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/sourceserif4/SourceSerif4%5Bopsz%2Cwght%5D.ttf' },
    ],
  },

  NotoSerif: {
    name: 'Noto Serif',
    creName: 'Noto Serif',
    category: 'en',
    style: 'Serif',
    license: 'SIL OFL',
    author: 'Google',
    recommendedSize: { min: 24, max: 34, default: 28 },
    variants: [
      { weight: 400, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notoserif/NotoSerif%5Bwdth%2Cwght%5D.ttf' },
    ],
  },

  NotoSans: {
    name: 'Noto Sans',
    creName: 'Noto Sans',
    category: 'en',
    style: 'Sans-serif',
    license: 'SIL OFL',
    author: 'Google',
    recommendedSize: { min: 24, max: 34, default: 28 },
    variants: [
      { weight: 400, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf' },
    ],
  },

  Roboto: {
    name: 'Roboto',
    creName: 'Roboto',
    category: 'en',
    style: 'Sans-serif',
    license: 'Apache 2.0',
    author: 'Google',
    recommendedSize: { min: 24, max: 34, default: 28 },
    variants: [
      { weight: 400, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/Roboto%5Bwdth%2Cwght%5D.ttf' },
    ],
  },

  EBGaramond: {
    name: 'EB Garamond',
    creName: 'EB Garamond',
    category: 'en',
    style: 'Serif',
    license: 'SIL OFL',
    author: 'Georg Duffner',
    recommendedSize: { min: 24, max: 34, default: 28 },
    variants: [
      { weight: 400, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/ebgaramond/EBGaramond%5Bwght%5D.ttf' },
    ],
  },
};

// === 工具函式 ===

function getFontRecommendation(fontKey) {
  var config = FONT_CONFIG[fontKey];
  if (!config) return null;
  return config.recommendedSize || null;
}

function getFontUrl(fontKey, weight) {
  var config = FONT_CONFIG[fontKey];
  if (!config || !config.variants) return null;
  weight = weight || 400;
  for (var i = 0; i < config.variants.length; i++) {
    if (config.variants[i].weight === weight) {
      return config.variants[i].url;
    }
  }
  return config.variants[0] ? config.variants[0].url : null;
}

function getFontCReName(fontKey) {
  var config = FONT_CONFIG[fontKey];
  return config ? (config.creName || fontKey) : fontKey;
}

function getChineseFontKeys() {
  var keys = [];
  for (var key in FONT_CONFIG) {
    if (FONT_CONFIG[key].category === 'zh-TW') keys.push(key);
  }
  return keys;
}

function getEnglishFontKeys() {
  var keys = [];
  for (var key in FONT_CONFIG) {
    if (FONT_CONFIG[key].category === 'en') keys.push(key);
  }
  return keys;
}

// 掛到全域
window.FONT_CONFIG = FONT_CONFIG;
window.getFontRecommendation = getFontRecommendation;
window.getFontUrl = getFontUrl;
window.getFontCReName = getFontCReName;
window.getChineseFontKeys = getChineseFontKeys;
window.getEnglishFontKeys = getEnglishFontKeys;
