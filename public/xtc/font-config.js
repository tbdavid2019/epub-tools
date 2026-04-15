/**
 * font-config.js — 繁體中文字型載入設定
 * 閱星曈轉檔工具 | HelloRuru Tools
 *
 * 字型載入策略：
 * - CDN 字型（Google Fonts / jsDelivr）：懶載入，選到才下載
 * - 自架字型（lab.helloruru.com）：懶載入，選到才下載
 * - 自訂上傳字型：使用者手動上傳 TTF/OTF
 */

var FONT_CONFIG = {
  // === 繁體中文字型 ===

  GuanKiapTsingKhai: {
    name: '原俠正楷',
    category: 'zh-TW',
    style: '楷體',
    license: 'SIL OFL',
    author: 'tonyhuan',
    recommendedSize: { min: 30, max: 36, default: 34 },
    hint: '原俠正楷適合文學類閱讀，建議字級 30-36px',
    variants: [
      { weight: 400, style: 'normal', url: 'https://lab.helloruru.com/fonts/xtc/GuanKiapTsingKhai.ttf' },
    ],
  },

  Huninn: {
    name: 'jf open 粉圓',
    category: 'zh-TW',
    style: '圓體',
    license: 'SIL OFL',
    author: 'justfont',
    recommendedSize: { min: 32, max: 38, default: 34 },
    hint: '粉圓體筆畫飽滿好讀，建議字級 32-38px',
    variants: [
      { weight: 400, style: 'normal', url: 'https://fonts.gstatic.com/s/huninn/v1/2sDPZGBVm0R_gVFuZG3M.ttf' },
    ],
  },

  NotoSerifTC: {
    name: '思源宋體',
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
    category: 'zh-TW',
    style: '手寫體',
    license: 'SIL OFL',
    author: '游清松',
    recommendedSize: { min: 32, max: 40, default: 34 },
    hint: '手寫體建議大一點才清楚，建議字級 32px 以上',
    variants: [
      { weight: 400, style: 'normal', url: 'https://cdn.jsdelivr.net/gh/max32002/JasonHandWritingFonts@20240409/webfont/JasonHandwriting1.ttf' },
    ],
  },

  Cubic11: {
    name: '俐方體 11 號',
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

  // === 英文字型（保留 bigbag 原版） ===

  Literata: {
    name: 'Literata',
    category: 'en',
    style: 'Serif',
    license: 'OFL',
    recommendedSize: { min: 28, max: 34, default: 30 },
    hint: 'Literata 經典英文襯線體，建議字級 28-34px',
    variants: [
      { weight: 400, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/literata/Literata%5Bopsz%2Cwght%5D.ttf' },
      { weight: 700, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/literata/Literata%5Bopsz%2Cwght%5D.ttf' },
      { weight: 400, style: 'italic', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/literata/Literata-Italic%5Bopsz%2Cwght%5D.ttf' },
    ],
  },

  Lora: {
    name: 'Lora',
    category: 'en',
    style: 'Serif',
    license: 'OFL',
    recommendedSize: { min: 28, max: 34, default: 30 },
    hint: 'Lora 優雅英文襯線體，建議字級 28-34px',
    variants: [
      { weight: 400, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/lora/Lora%5Bwght%5D.ttf' },
      { weight: 700, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/lora/Lora%5Bwght%5D.ttf' },
      { weight: 400, style: 'italic', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/lora/Lora-Italic%5Bwght%5D.ttf' },
    ],
  },

  Merriweather: {
    name: 'Merriweather',
    category: 'en',
    style: 'Serif',
    license: 'OFL',
    recommendedSize: { min: 28, max: 34, default: 30 },
    hint: 'Merriweather 適合長文閱讀，建議字級 28-34px',
    variants: [
      { weight: 400, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/merriweather/Merriweather%5Bwght%5D.ttf' },
      { weight: 700, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/merriweather/Merriweather%5Bwght%5D.ttf' },
      { weight: 400, style: 'italic', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/merriweather/Merriweather-Italic%5Bwght%5D.ttf' },
    ],
  },

  SourceSerif4: {
    name: 'Source Serif 4',
    category: 'en',
    style: 'Serif',
    license: 'OFL',
    recommendedSize: { min: 28, max: 34, default: 30 },
    hint: 'Source Serif 4 專為螢幕設計，建議字級 28-34px',
    variants: [
      { weight: 400, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/sourceserif4/SourceSerif4%5Bopsz%2Cwght%5D.ttf' },
      { weight: 700, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/sourceserif4/SourceSerif4%5Bopsz%2Cwght%5D.ttf' },
    ],
  },

  NotoSerif: {
    name: 'Noto Serif',
    category: 'en',
    style: 'Serif',
    license: 'OFL',
    recommendedSize: { min: 28, max: 34, default: 30 },
    hint: 'Noto Serif 萬國字元支援最完整，建議字級 28-34px',
    variants: [
      { weight: 400, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notoserif/NotoSerif%5Bwdth%2Cwght%5D.ttf' },
      { weight: 700, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notoserif/NotoSerif%5Bwdth%2Cwght%5D.ttf' },
    ],
  },

  NotoSans: {
    name: 'Noto Sans',
    category: 'en',
    style: 'Sans-serif',
    license: 'OFL',
    recommendedSize: { min: 28, max: 34, default: 30 },
    hint: 'Noto Sans 乾淨無襯線體，建議字級 28-34px',
    variants: [
      { weight: 400, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf' },
      { weight: 700, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans%5Bwdth%2Cwght%5D.ttf' },
    ],
  },

  Roboto: {
    name: 'Roboto',
    category: 'en',
    style: 'Sans-serif',
    license: 'Apache 2.0',
    recommendedSize: { min: 28, max: 34, default: 30 },
    hint: 'Roboto 通用無襯線體，建議字級 28-34px',
    variants: [
      { weight: 400, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/Roboto%5Bwdth%2Cwght%5D.ttf' },
      { weight: 700, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/roboto/Roboto%5Bwdth%2Cwght%5D.ttf' },
    ],
  },

  EBGaramond: {
    name: 'EB Garamond',
    category: 'en',
    style: 'Serif',
    license: 'OFL',
    recommendedSize: { min: 30, max: 36, default: 32 },
    hint: 'EB Garamond 經典印刷襯線，建議字級 30-36px',
    variants: [
      { weight: 400, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/ebgaramond/EBGaramond%5Bwght%5D.ttf' },
      { weight: 700, style: 'normal', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/ebgaramond/EBGaramond%5Bwght%5D.ttf' },
      { weight: 400, style: 'italic', url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/ebgaramond/EBGaramond-Italic%5Bwght%5D.ttf' },
    ],
  },
};

/**
 * 取得字型建議字級
 * @param {string} fontKey - 字型 key（如 'NotoSerifTC'）
 * @returns {{ min: number, max: number, default: number, hint: string }}
 */
function getFontRecommendation(fontKey) {
  var font = FONT_CONFIG[fontKey];
  if (!font) return { min: 28, max: 34, default: 30, hint: '建議字級 28-34px' };
  return {
    min: font.recommendedSize.min,
    max: font.recommendedSize.max,
    default: font.recommendedSize.default,
    hint: font.hint,
  };
}

/**
 * 取得字型的 TTF URL（指定字重和樣式）
 * @param {string} fontKey
 * @param {number} weight
 * @param {string} style
 * @returns {string|null}
 */
function getFontUrl(fontKey, weight, style) {
  if (typeof weight === 'undefined') weight = 400;
  if (typeof style === 'undefined') style = 'normal';
  var font = FONT_CONFIG[fontKey];
  if (!font) return null;
  var variants = font.variants;
  var variant = null;
  // 精確比對
  for (var i = 0; i < variants.length; i++) {
    if (variants[i].weight === weight && variants[i].style === style) {
      variant = variants[i];
      break;
    }
  }
  // 同樣式不同字重
  if (!variant) {
    for (var j = 0; j < variants.length; j++) {
      if (variants[j].style === style) {
        variant = variants[j];
        break;
      }
    }
  }
  // fallback 第一個
  if (!variant) {
    variant = variants[0];
  }
  return variant ? variant.url : null;
}

/**
 * 取得所有繁體中文字型 key
 * @returns {string[]}
 */
function getChineseFontKeys() {
  var keys = Object.keys(FONT_CONFIG);
  var result = [];
  for (var i = 0; i < keys.length; i++) {
    if (FONT_CONFIG[keys[i]].category === 'zh-TW') {
      result.push(keys[i]);
    }
  }
  return result;
}

/**
 * 取得所有英文字型 key
 * @returns {string[]}
 */
function getEnglishFontKeys() {
  var keys = Object.keys(FONT_CONFIG);
  var result = [];
  for (var i = 0; i < keys.length; i++) {
    if (FONT_CONFIG[keys[i]].category === 'en') {
      result.push(keys[i]);
    }
  }
  return result;
}

// ==================== 匯出 ====================

if (typeof window !== 'undefined') {
  window.FONT_CONFIG = FONT_CONFIG;
  window.getFontRecommendation = getFontRecommendation;
  window.getFontUrl = getFontUrl;
  window.getChineseFontKeys = getChineseFontKeys;
  window.getEnglishFontKeys = getEnglishFontKeys;
}
