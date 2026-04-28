/**
 * main.js - SD 咒語產生器入口
 */

import { renderGenerator, updatePreview } from './render.js';
import { composePositive, composeNegative, composeAll, formatSettings } from './prompt-engine.js';
import { copyToClipboard } from './clipboard.js';

// === 設定 ===
const DATA_PATH = './data';
// 版本號 — 改 data/*.json 時要 bump，瀏覽器才會抓新版
const ASSET_VERSION = '20260428a';

// === 狀態 ===
const state = {
  models: [],
  tags: null,
  negatives: null,
  selectedModel: null,
  selectedTags: {},       // { categoryId: [{ tag, weight }] }
  customTags: [],
  additionalNegatives: [],
  positiveText: '',
  negativeText: ''
};

// === 資料載入 ===
async function loadJSON(path) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${path}${sep}v=${ASSET_VERSION}`);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json();
}

async function loadData() {
  const [models, tags, negatives] = await Promise.all([
    loadJSON(`${DATA_PATH}/models.json`),
    loadJSON(`${DATA_PATH}/tags.json`),
    loadJSON(`${DATA_PATH}/negatives.json`)
  ]);
  return { models, tags, negatives };
}

// === 提詞更新 ===
function recalculate() {
  const model = state.models.find(m => m.id === state.selectedModel);

  state.positiveText = composePositive(state.selectedTags, state.customTags);

  if (model && state.negatives) {
    state.negativeText = composeNegative(
      state.negatives,
      model.negativePreset,
      state.additionalNegatives
    );
  } else {
    state.negativeText = '';
  }
}

// === 渲染 ===
function render() {
  recalculate();
  const app = document.getElementById('app');
  app.innerHTML = renderGenerator(state);
  bindEvents();
}

function refreshPreview() {
  recalculate();
  updatePreview(state);
  bindPreviewEvents();
}

// === 事件綁定 ===
function bindEvents() {
  const app = document.getElementById('app');

  app.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;

    switch (action) {
      case 'select-model':
        handleSelectModel(btn.dataset.modelId);
        break;
      case 'toggle-category':
        handleToggleCategory(btn.dataset.catId);
        break;
      case 'toggle-tag':
        handleToggleTag(btn.dataset.catId, btn.dataset.tag);
        break;
      case 'remove-custom':
        handleRemoveCustom(parseInt(btn.dataset.index));
        break;
      case 'toggle-negative-group':
        handleToggleNegativeGroup(btn.dataset.groupKey);
        break;
      case 'copy':
        handleCopy(btn.dataset.target);
        break;
      case 'clear-all':
        handleClearAll();
        break;
    }
  });

  // 自訂標籤輸入
  const input = document.getElementById('custom-tag-input');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = input.value.trim();
        if (val) {
          // 支援逗號分隔
          const newTags = val.split(',').map(t => t.trim()).filter(t => t);
          state.customTags.push(...newTags);
          input.value = '';
          render();
        }
      }
    });
  }

  bindPreviewEvents();
}

function bindPreviewEvents() {
  // 預覽區文字編輯
  const posEl = document.getElementById('preview-positive');
  const negEl = document.getElementById('preview-negative');

  if (posEl) {
    posEl.addEventListener('input', () => {
      state.positiveText = posEl.value;
    });
  }
  if (negEl) {
    negEl.addEventListener('input', () => {
      state.negativeText = negEl.value;
    });
  }
}

// === 操作處理 ===
function handleSelectModel(modelId) {
  if (state.selectedModel === modelId) return;

  const prevModel = state.models.find(m => m.id === state.selectedModel);
  const newModel = state.models.find(m => m.id === modelId);

  state.selectedModel = modelId;

  // 如果品質標籤系統不同，清除品質標籤並載入預設
  if (!prevModel || prevModel.qualityPreset !== newModel.qualityPreset) {
    loadDefaultQualityTags(newModel);
  }

  render();
}

function loadDefaultQualityTags(model) {
  const qualityCat = state.tags.categories.find(c => c.id === 'quality');
  if (!qualityCat || !qualityCat.presets) return;

  const presetTags = qualityCat.presets[model.qualityPreset] || [];
  state.selectedTags.quality = presetTags
    .filter(t => t.default)
    .map(t => ({ tag: t.tag, weight: 1.0 }));
}

function handleToggleCategory(catId) {
  const cat = document.querySelector(`.category[data-action="toggle-category"][data-cat-id="${catId}"]`)
    ?.closest('.category');
  // 用 CSS 切換即可
  const el = document.querySelector(`[data-action="toggle-category"][data-cat-id="${catId}"]`)
    ?.closest('.category');
  if (el) el.classList.toggle('category--open');
}

function handleToggleTag(catId, tag) {
  if (!state.selectedTags[catId]) {
    state.selectedTags[catId] = [];
  }

  const arr = state.selectedTags[catId];
  const idx = arr.findIndex(t => t.tag === tag);

  if (idx === -1) {
    // 新增
    arr.push({ tag, weight: 1.0 });
  } else if (arr[idx].weight === 1.0) {
    // 循環權重：1.0 → 1.2
    arr[idx].weight = 1.2;
  } else if (arr[idx].weight === 1.2) {
    // 1.2 → 1.4
    arr[idx].weight = 1.4;
  } else {
    // 1.4 → 移除
    arr.splice(idx, 1);
  }

  render();
}

function handleRemoveCustom(index) {
  state.customTags.splice(index, 1);
  render();
}

function handleToggleNegativeGroup(groupKey) {
  const idx = state.additionalNegatives.indexOf(groupKey);
  if (idx === -1) {
    state.additionalNegatives.push(groupKey);
  } else {
    state.additionalNegatives.splice(idx, 1);
  }
  render();
}

function handleCopy(target) {
  const model = state.models.find(m => m.id === state.selectedModel);

  switch (target) {
    case 'positive':
      copyToClipboard(state.positiveText);
      break;
    case 'negative':
      copyToClipboard(state.negativeText);
      break;
    case 'settings':
      if (model) copyToClipboard(formatSettings(model.recommendedSettings));
      break;
    case 'all':
      copyToClipboard(composeAll(
        state.positiveText,
        state.negativeText,
        model ? model.recommendedSettings : null
      ));
      break;
  }
}

function handleClearAll() {
  state.selectedTags = {};
  state.customTags = [];
  state.additionalNegatives = [];

  // 重新載入品質預設
  const model = state.models.find(m => m.id === state.selectedModel);
  if (model) loadDefaultQualityTags(model);

  render();
}

// === 初始化 ===
async function init() {
  const app = document.getElementById('app');

  try {
    const data = await loadData();
    state.models = data.models;
    state.tags = data.tags;
    state.negatives = data.negatives;

    // 預設選第一個模型
    if (state.models.length > 0) {
      state.selectedModel = state.models[0].id;
      loadDefaultQualityTags(state.models[0]);
    }

    render();
  } catch (err) {
    app.innerHTML = `
      <div class="error-msg">
        <p>載入資料時發生錯誤</p>
        <p class="error-detail">${err.message}</p>
      </div>
    `;
    console.error(err);
  }
}

document.addEventListener('DOMContentLoaded', init);
