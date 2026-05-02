/* ===========================================================
   蘇諾大姊姊 · Suno 提示詞產生器
   邏輯：6 步公式組合引擎 + 反引力井連動
   規則來源：蘇諾 Skill（templates / instruments / gravity-wells JSON）
   =========================================================== */

(() => {
  'use strict';

  // ---------- 規則庫狀態 ----------
  const rules = {
    templates: null,
    genrePairs: null,
    instruments: null,
    gravityWells: null,
  };

  // ---------- 嚕寶答題狀態 ----------
  const answers = {
    purpose: null,        // 用途
    mood: '',             // 情緒（自由輸入）
    moodChips: [],        // 情緒輔助 chips
    tempo: null,          // 快慢（含 BPM）
    vocal: null,          // 人聲
    reference: '',        // 參考歌曲
    elements: [],         // 特殊元素（多選）
    length: null,         // 長度
  };

  let currentQ = 0;          // 0 = hero / 1-7 = 題目
  const totalQ = 7;
  const STORAGE_KEY = 'suno-prompt-draft-v1';
  const ONBOARD_KEY = 'suno-prompt-onboarded-v1';

  // ---------- 題目資料（PM 追問題目）----------
  const questions = [
    null, // 0 placeholder
    {
      no: 1, eyebrow: 'Purpose · 用途',
      title: '這首歌要拿來幹嘛？',
      suno: '姊姊先問用途，配的方向才不會亂跑。',
      type: 'cards-2x2',
      key: 'purpose',
      auto: false,
      options: [
        { value: '自己聽', desc: '無壓力創作 / 喜歡就好' },
        { value: '品牌影片', desc: 'About 頁 / 形象片 / 自介' },
        { value: '客戶廣告', desc: '美業 / SPA / IG Reels' },
        { value: '電子書配樂', desc: '故事朗讀 / Podcast / 章節間' },
      ],
    },
    {
      no: 2, eyebrow: 'Mood · 情緒',
      title: '一句話形容：什麼心情下會放這首？',
      hint: '可以打字、可以選下面的 chips（會自動加進去）',
      suno: '姊姊愛這題。情緒就是 Style 的靈魂。',
      type: 'textarea-chips',
      key: 'mood',
      auto: false,
      placeholder: '例：下雨天看著窗外發呆，有點想哭但又很安靜',
      chips: ['療癒', '想哭', '溫暖', '孤單', '懷舊', '迷幻', '興奮', '夢幻', '懸疑', '深沉'],
    },
    {
      no: 3, eyebrow: 'Tempo · 速度',
      title: '快還是慢？',
      suno: 'BPM 沒有 Suno 會飄掉，姊姊一定要先鎖速度。',
      type: 'cards-row',
      key: 'tempo',
      auto: true,
      options: [
        { value: '很慢', bpm: '60', desc: '像深夜散步' },
        { value: '慢', bpm: '78', desc: '像泡咖啡' },
        { value: '中', bpm: '96', desc: '像走路上班' },
        { value: '快', bpm: '120', desc: '像在打掃' },
        { value: '很快', bpm: '140', desc: '像想跳舞' },
      ],
    },
    {
      no: 4, eyebrow: 'Vocal · 人聲',
      title: '誰來唱？',
      suno: 'Suno 沒鎖 vocal style，會自己亂選人。',
      type: 'cards-row',
      key: 'vocal',
      auto: true,
      options: [
        { value: '女聲', en: 'breathy / kobushi / smoky', desc: '溫柔到濃烈都可以' },
        { value: '男聲', en: 'raspy / smooth', desc: '敘事感強' },
        { value: '純配樂', en: 'instrumental only', desc: '不要人聲' },
      ],
    },
    {
      no: 5, eyebrow: 'Reference · 參考',
      title: '有沒有一首歌或一個歌手，你覺得「有那個味就對了」？',
      hint: '沒有也沒關係，這題可以跳過',
      suno: '有的話姊姊抄作業，沒有就靠你前面的回答。',
      type: 'input-skip',
      key: 'reference',
      auto: false,
      placeholder: '歌名 / 歌手 / 風格都可以',
    },
    {
      no: 6, eyebrow: 'Elements · 特殊元素',
      title: '想塞點什麼特別的嗎？',
      hint: '選 1-3 個（太多 Suno 會打架）',
      suno: '塞點音景跟跨類型混血，最容易讓 Suno 離開俗套。',
      type: 'chips-multi',
      key: 'elements',
      auto: false,
      max: 3,
      chips: [
        { value: '日本味', tag: 'shamisen / pachinko bell / kobushi' },
        { value: '老上海', tag: 'tape hiss / vintage piano' },
        { value: '電子', tag: 'sidechain / 808 sub bass' },
        { value: '吉他刷', tag: 'acoustic strumming' },
        { value: 'lo-fi 雜訊', tag: 'vinyl crackle' },
        { value: '鋼琴', tag: 'felt piano' },
        { value: '弦樂', tag: 'upright bass' },
        { value: '雨聲', tag: 'rain on glass' },
      ],
    },
    {
      no: 7, eyebrow: 'Length · 長度',
      title: '想要多長？',
      suno: '長度決定歌詞結構要寫到哪。',
      type: 'cards-row',
      key: 'length',
      auto: true,
      options: [
        { value: '30 秒', desc: 'IG Reels / 短影片' },
        { value: '1 分鐘', desc: 'FB 貼文 / Email 配樂' },
        { value: '3 分鐘', desc: '完整作品 / 客戶交件' },
      ],
    },
  ];

  // ---------- DOM 快捷 ----------
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // ---------- 初始化 ----------
  async function init() {
    await loadRules();
    bindEvents();
    checkResume();
    checkOnboarding();
  }

  async function loadRules() {
    try {
      const [templates, genrePairs, instruments, gravityWells] = await Promise.all([
        fetch('templates.json').then(r => r.json()),
        fetch('genre-pairs.json').then(r => r.json()),
        fetch('instruments.json').then(r => r.json()),
        fetch('gravity-wells.json').then(r => r.json()),
      ]);
      rules.templates = templates.templates;
      rules.genrePairs = genrePairs.genrePairs;
      rules.instruments = instruments;
      rules.gravityWells = gravityWells;
    } catch (e) {
      console.error('規則庫載入失敗', e);
      showToast('規則庫載入有點卡，重整一下試試？', 'error');
    }
  }

  function bindEvents() {
    $('#btn-mode-pm').addEventListener('click', () => startPM(1));
    $('#btn-mode-template').addEventListener('click', showTemplates);
    $('#hero-resume').addEventListener('click', resumeFromDraft);
    $('#btn-prev').addEventListener('click', goPrevQuestion);
    $('#btn-next').addEventListener('click', goNextQuestion);
    $('#btn-back-from-templates').addEventListener('click', backToHero);
    $('#btn-back-from-result').addEventListener('click', backToHero);
    $('#drawer-close').addEventListener('click', closeDrawer);
    $('#drawer-overlay').addEventListener('click', closeDrawer);
    $('#suno-bubble-close').addEventListener('click', closeBubble);
    $('#btn-regen-keep').addEventListener('click', () => openRegenModal());
    $('#btn-regen-fresh').addEventListener('click', () => openRegenModal());
    $('#modal-cancel').addEventListener('click', closeRegenModal);

    $$('#modal-regen [data-regen]').forEach(btn => {
      btn.addEventListener('click', () => handleRegen(btn.dataset.regen));
    });

    $$('.btn-copy').forEach(btn => {
      btn.addEventListener('click', () => copyToClipboard(btn));
    });

    // Style 字串可編輯，更新字數
    $('#style-output').addEventListener('input', updateCharCount);

    // 鍵盤導覽
    document.addEventListener('keydown', handleKeyboard);
  }

  // ---------- Onboarding & Resume ----------
  function checkOnboarding() {
    if (!localStorage.getItem(ONBOARD_KEY)) {
      $('#suno-bubble').hidden = false;
      setTimeout(closeBubble, 8000);
    }
  }
  function closeBubble() {
    $('#suno-bubble').hidden = true;
    localStorage.setItem(ONBOARD_KEY, '1');
  }

  function checkResume() {
    const draft = loadDraft();
    if (draft && draft.currentQ > 0 && draft.currentQ <= totalQ) {
      $('#hero-resume').hidden = false;
      $('#resume-q').textContent = draft.currentQ;
    }
  }
  function resumeFromDraft() {
    const draft = loadDraft();
    if (!draft) return;
    Object.assign(answers, draft.answers);
    startPM(draft.currentQ);
  }

  function saveDraft() {
    try {
      const draft = {
        currentQ,
        answers,
        ts: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch (e) { /* quota or private mode, silent fail */ }
  }
  function loadDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const draft = JSON.parse(raw);
      if (Date.now() - draft.ts > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return draft;
    } catch (e) { return null; }
  }
  function clearDraft() {
    localStorage.removeItem(STORAGE_KEY);
  }

  // ---------- Screen 切換 ----------
  function showScreen(id) {
    $$('.screen').forEach(s => s.hidden = true);
    const target = $('#' + id);
    if (target) target.hidden = false;
    $('#progress-bar').hidden = (id !== 'screen-pm');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function backToHero() {
    showScreen('screen-hero');
    closeBubble();
    checkResume();
  }

  // ---------- PM 流程 ----------
  function startPM(qNum) {
    currentQ = qNum;
    showScreen('screen-pm');
    renderQuestion();
  }

  function renderQuestion() {
    const q = questions[currentQ];
    if (!q) return;

    $('#pm-watermark').textContent = `Q.${String(q.no).padStart(2, '0')}`;
    $('#pm-eyebrow').textContent = q.eyebrow;

    // 進度條
    const progress = ((currentQ - 1) / totalQ) * 100;
    $('#progress-bar').style.setProperty('--progress', progress + '%');
    $('#progress-label').textContent = `Q.${q.no} / ${totalQ}`;

    // 上一題按鈕
    $('#btn-prev').disabled = currentQ <= 1;

    // 題目區
    const area = $('#pm-question-area');
    area.innerHTML = '';

    const titleEl = document.createElement('h2');
    titleEl.className = 'pm-question-title';
    titleEl.textContent = q.title;
    area.appendChild(titleEl);

    if (q.hint) {
      const hint = document.createElement('p');
      hint.className = 'pm-question-hint';
      hint.textContent = q.hint;
      area.appendChild(hint);
    }

    if (q.suno) {
      const suno = document.createElement('div');
      suno.className = 'pm-question-suno';
      suno.textContent = `「${q.suno}」`;
      area.appendChild(suno);
    }

    // 答題元件
    if (q.type === 'cards-2x2' || q.type === 'cards-row') {
      area.appendChild(buildCards(q));
    } else if (q.type === 'textarea-chips') {
      area.appendChild(buildTextareaChips(q));
    } else if (q.type === 'input-skip') {
      area.appendChild(buildInputSkip(q));
    } else if (q.type === 'chips-multi') {
      area.appendChild(buildChipsMulti(q));
    }

    updateNextButton();
    saveDraft();
  }

  function buildCards(q) {
    const wrap = document.createElement('div');
    wrap.className = q.type === 'cards-2x2' ? 'pm-options options-2x2' : 'pm-options options-row';

    q.options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'pm-option';
      if (answers[q.key] === opt.value) btn.classList.add('selected');

      let html = '';
      if (opt.bpm) {
        html += `<div class="pm-option-num">No.${idx + 1}</div>`;
        html += `<div class="pm-option-bpm">${opt.bpm}<span style="font-size:0.5em;color:var(--c-mute);"> bpm</span></div>`;
      }
      html += `<div class="pm-option-title">${opt.value}</div>`;
      if (opt.en) html += `<div class="pm-option-en">${opt.en}</div>`;
      if (opt.desc) html += `<div class="pm-option-desc">${opt.desc}</div>`;
      btn.innerHTML = html;

      btn.addEventListener('click', () => {
        answers[q.key] = opt.bpm ? { value: opt.value, bpm: opt.bpm } : opt.value;
        wrap.querySelectorAll('.pm-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        updateNextButton();
        saveDraft();
        if (q.auto) {
          setTimeout(goNextQuestion, 600);
        }
      });
      wrap.appendChild(btn);
    });
    return wrap;
  }

  function buildTextareaChips(q) {
    const wrap = document.createElement('div');
    const ta = document.createElement('textarea');
    ta.className = 'pm-textarea';
    ta.placeholder = q.placeholder;
    ta.value = answers.mood || '';
    ta.addEventListener('input', () => {
      answers.mood = ta.value;
      updateNextButton();
      saveDraft();
    });
    wrap.appendChild(ta);

    const chipsWrap = document.createElement('div');
    chipsWrap.className = 'pm-options options-chips';
    chipsWrap.style.marginTop = 'var(--sp-3)';
    q.chips.forEach(label => {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = label;
      if (answers.moodChips.includes(label)) chip.classList.add('selected');
      chip.addEventListener('click', () => {
        if (answers.moodChips.includes(label)) {
          answers.moodChips = answers.moodChips.filter(x => x !== label);
          chip.classList.remove('selected');
          ta.value = ta.value.replace(new RegExp(`\\s*[、,]?\\s*${label}`), '').trim();
        } else {
          answers.moodChips.push(label);
          chip.classList.add('selected');
          ta.value = ta.value ? `${ta.value}、${label}` : label;
        }
        answers.mood = ta.value;
        updateNextButton();
        saveDraft();
      });
      chipsWrap.appendChild(chip);
    });
    wrap.appendChild(chipsWrap);
    return wrap;
  }

  function buildInputSkip(q) {
    const wrap = document.createElement('div');
    wrap.className = 'pm-input-row';
    const input = document.createElement('input');
    input.className = 'pm-input';
    input.type = 'text';
    input.placeholder = q.placeholder;
    input.value = answers.reference || '';
    input.addEventListener('input', () => {
      answers.reference = input.value;
      updateNextButton();
      saveDraft();
    });
    wrap.appendChild(input);

    const skip = document.createElement('button');
    skip.className = 'pm-skip';
    skip.textContent = '沒有，跳過 →';
    skip.addEventListener('click', () => {
      answers.reference = '';
      goNextQuestion();
    });
    wrap.appendChild(skip);
    return wrap;
  }

  function buildChipsMulti(q) {
    const wrap = document.createElement('div');

    const hint = document.createElement('div');
    hint.className = 'pm-chips-hint';
    hint.id = 'chips-counter';
    updateChipsHint();
    wrap.appendChild(hint);

    const chipsWrap = document.createElement('div');
    chipsWrap.className = 'pm-options options-chips';

    q.chips.forEach(c => {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.textContent = c.value;
      chip.title = c.tag;
      if (answers.elements.includes(c.value)) chip.classList.add('selected');
      chip.addEventListener('click', () => {
        if (answers.elements.includes(c.value)) {
          answers.elements = answers.elements.filter(x => x !== c.value);
          chip.classList.remove('selected');
        } else {
          if (answers.elements.length >= q.max) return;
          answers.elements.push(c.value);
          chip.classList.add('selected');
        }
        updateChipsHint();
        updateChipsDisabled(chipsWrap, q.max);
        updateNextButton();
        saveDraft();
      });
      chipsWrap.appendChild(chip);
    });

    function updateChipsHint() {
      const counter = wrap.querySelector('#chips-counter');
      if (counter) {
        counter.textContent = `已選 ${answers.elements.length} / ${q.max}`;
      }
    }
    updateChipsDisabled(chipsWrap, q.max);
    wrap.appendChild(chipsWrap);
    return wrap;
  }

  function updateChipsDisabled(wrap, max) {
    const reachLimit = answers.elements.length >= max;
    wrap.querySelectorAll('.chip').forEach(chip => {
      if (reachLimit && !chip.classList.contains('selected')) {
        chip.classList.add('disabled');
      } else {
        chip.classList.remove('disabled');
      }
    });
  }

  function updateNextButton() {
    const q = questions[currentQ];
    if (!q) return;
    const val = answers[q.key];
    let valid = false;

    if (q.key === 'purpose' || q.key === 'tempo' || q.key === 'vocal' || q.key === 'length') {
      valid = !!val;
    } else if (q.key === 'mood') {
      valid = !!(val && val.trim().length > 0);
    } else if (q.key === 'reference') {
      valid = true; // 可空
    } else if (q.key === 'elements') {
      valid = true; // 可空
    }

    $('#btn-next').disabled = !valid;
    $('#btn-next').textContent = currentQ === totalQ ? '生成 Style →' : '下一題 →';
  }

  function goNextQuestion() {
    if (currentQ >= totalQ) {
      generateResult();
      return;
    }
    currentQ++;
    renderQuestion();
  }
  function goPrevQuestion() {
    if (currentQ <= 1) return;
    currentQ--;
    renderQuestion();
  }

  function handleKeyboard(e) {
    if ($('#screen-pm').hidden) return;
    if (e.key === 'Enter' && !$('#btn-next').disabled) {
      const tag = e.target.tagName;
      if (tag !== 'TEXTAREA' && tag !== 'INPUT') {
        goNextQuestion();
      }
    }
    if (e.key === 'ArrowLeft' && !$('#btn-prev').disabled) {
      goPrevQuestion();
    }
  }

  // ===========================================================
  // 規則引擎：6 步公式組合 + 反引力井連動
  // ===========================================================

  function generateResult() {
    const composed = composeStyle(answers);
    const lyrics = composeLyrics(answers);
    const voice = suggestVoice(answers);
    const songNames = suggestSongNames(answers, composed.pair);
    const nextSong = suggestNextSong(answers, voice, composed.pair);
    const checks = runChecklist(composed.styleString, composed.excludeString);

    showResult({ composed, lyrics, voice, songNames, nextSong, checks });
    clearDraft();
  }

  /**
   * 6 步公式：
   * 1. 抓主流派（從 genrePairs 選最匹配）
   * 2. 加樂器（從 instruments 選 vibe 匹配）
   * 3. 加音景（特殊元素或情緒推導）
   * 4. 加製作手法
   * 5. 鎖 BPM + Key
   * 6. 加負向排除（gravity-wells 自動連動）
   */
  function composeStyle(a) {
    // Step 1: 選流派配對
    const purpose = a.purpose;
    const moodAll = (a.mood + ' ' + a.moodChips.join(' ')).toLowerCase();
    const tempoBpm = a.tempo ? parseInt(a.tempo.bpm) : 96;
    const vocal = a.vocal;
    const elements = a.elements;

    const pair = pickGenrePair({ purpose, moodAll, tempoBpm, vocal, elements });

    // Step 2-3: 樂器 + 音景（從元素推導）
    const instruments = pickInstruments({ moodAll, elements, vocal });
    const soundscapes = pickSoundscapes({ moodAll, elements });

    // Step 4: 製作手法
    const productions = pickProduction({ moodAll, elements, pair });

    // Step 5: BPM + Key
    const bpm = tempoBpm;
    const key = pickKey({ pair, moodAll });

    // Vocal style + Energy arc
    const vocalDesc = pickVocalDesc({ vocal, moodAll });
    const arc = pickEnergyArc({ moodAll, tempoBpm });

    // Step 6: 反引力井（Exclude 獨立輸出，不混進 Style）
    const exclusions = collectExclusions({ pair, vocal, elements, moodAll });

    // 組裝 Style（不含 no XX）
    const parts = [];
    if (pair.tertiary) {
      parts.push(`${pair.primary}, ${pair.secondary}, ${pair.tertiary}`);
    } else {
      parts.push(`${pair.primary}, ${pair.secondary}`);
    }
    if (instruments.length) parts.push(instruments.join(', '));
    if (soundscapes.length) parts.push(soundscapes.join(', '));
    if (productions.length) parts.push(productions.join(', '));
    parts.push(`BPM ${bpm}, Key ${key}`);
    if (vocalDesc) parts.push(vocalDesc);
    if (arc) parts.push(arc);

    let styleString = parts.join(', ');
    if (styleString.length > 950) styleString = trimToLimit(styleString, 950);

    // Exclude 字串（不含 no 前綴）
    const excludeString = exclusions.map(e => e.replace(/^no\s+/i, '')).join(', ');

    // Suno 參數建議（Weirdness + Style Influence）
    const sunoParams = calcSunoParams({ pair, elements, purpose, styleString, excludeString });

    return {
      styleString,
      excludeString,
      pair,
      bpm,
      key,
      exclusions,
      sunoParams,
      reasoning: buildReasoning({ pair, instruments, soundscapes, exclusions }),
    };
  }

  // ---------- Suno 參數計算（Weirdness + Style Influence）----------
  function calcSunoParams({ pair, elements, purpose, styleString, excludeString }) {
    // Weirdness 算法
    let weirdness = 30;
    const allTerms = (pair.primary + ' ' + pair.secondary + (pair.tertiary || '')).toLowerCase();
    if (/hyperpop|glitch|experimental/.test(allTerms)) weirdness += 25;
    else if (/dark|cinematic|noir|industrial/.test(allTerms)) weirdness += 12;
    if (pair.tertiary) weirdness += 8; // 三流派疊
    if (elements.includes('電子') || elements.includes('lo-fi 雜訊')) weirdness += 5;
    if (purpose === '客戶廣告') weirdness -= 8;
    else if (purpose === '品牌影片') weirdness -= 5;
    weirdness = Math.max(20, Math.min(65, weirdness));

    // Style Influence 算法
    let styleInf = 65;
    const itemCount = styleString.split(',').length;
    if (itemCount >= 12) styleInf += 10;
    else if (itemCount >= 8) styleInf += 5;
    if (/key\s+/i.test(styleString)) styleInf += 3;
    if (excludeString && excludeString.length > 0) styleInf += 3;
    styleInf = Math.max(50, Math.min(85, styleInf));

    // 給範圍而非死值（更人性化）
    const weirdnessRange = `${weirdness - 5}-${weirdness + 5}%`;
    const styleInfRange = `${styleInf - 5}-${styleInf + 5}%`;

    // 提醒文案（依風格）
    let hint = '';
    if (weirdness >= 50) {
      hint = '這首走實驗路線，姊姊把 Weirdness 推高了一點。如果第一版太亂，往下調 5%。';
    } else if (weirdness <= 25) {
      hint = '商業向的歌，Weirdness 鎖低保險。穩定優先。';
    } else if (/japanese|enka|shanghai|vintage/.test(allTerms)) {
      hint = '復古東方類最怕跑成抖音翻唱。Weirdness 別調太高，三味線會變噪音。';
    } else if (/techno|tribal|hyperpop/.test(allTerms)) {
      hint = '這首要的是失控感。Weirdness 推到建議值上限試試。';
    } else {
      hint = 'Style Influence 70% 是甜蜜點，Suno 聽你話又留一點驚喜。';
    }

    return {
      weirdness, weirdnessRange,
      styleInfluence: styleInf, styleInfluenceRange: styleInfRange,
      hint,
    };
  }

  function pickGenrePair({ purpose, moodAll, tempoBpm, vocal, elements }) {
    const candidates = rules.genrePairs.map(p => {
      let score = 0;
      // 用途匹配
      if (p.purposeMatch && p.purposeMatch.includes(purpose)) score += 3;
      // 情緒關鍵字匹配
      if (p.moodMatch) {
        p.moodMatch.forEach(m => { if (moodAll.includes(m)) score += 2; });
      }
      // BPM 範圍
      if (p.bpmRange && tempoBpm >= p.bpmRange[0] && tempoBpm <= p.bpmRange[1]) score += 3;
      // 人聲匹配
      if (p.vocalMatch && p.vocalMatch.includes(vocal)) score += 2;
      // 特殊元素 → 流派加分（日本味 → electronic enka / city pop / japanese folk 等）
      if (elements.includes('日本味') && /enka|japanese|shamisen/i.test(p.primary + p.secondary)) score += 4;
      if (elements.includes('老上海') && /shanghai|vintage|crooner/i.test(p.primary + p.secondary)) score += 4;
      if (elements.includes('電子') && /electronic|techno|hyperpop|synth/i.test(p.primary + p.secondary)) score += 3;
      return { pair: p, score };
    });
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].pair;
  }

  function pickInstruments({ moodAll, elements, vocal }) {
    const picks = [];
    const allCategories = rules.instruments.instruments;

    // 元素映射
    const elementMap = {
      '日本味': ['shamisen bass', 'gentle piano'],
      '老上海': ['vintage piano', 'muted trumpet'],
      '電子': ['808 sub bass', 'distorted synth stabs'],
      '吉他刷': ['acoustic guitar strumming'],
      '鋼琴': ['felt piano'],
      '弦樂': ['upright bass'],
      'lo-fi 雜訊': [], // 在 soundscapes 處理
    };

    elements.forEach(el => {
      if (elementMap[el]) elementMap[el].forEach(name => picks.push(name));
    });

    // 情緒補樂器（picks 不夠 2 個時）
    if (picks.length < 2) {
      Object.values(allCategories).forEach(list => {
        list.forEach(inst => {
          if (picks.includes(inst.name)) return;
          if (picks.length >= 3) return;
          const matched = inst.vibe.some(v => moodAll.includes(v));
          if (matched) picks.push(inst.name);
        });
      });
    }

    // 還是不夠 → 給預設
    if (picks.length === 0) {
      picks.push('felt piano', 'soft brush drums');
    }

    return [...new Set(picks)].slice(0, 3);
  }

  function pickSoundscapes({ moodAll, elements }) {
    const picks = [];
    const all = rules.instruments.soundscapes;

    if (elements.includes('lo-fi 雜訊')) picks.push('vinyl crackle');
    if (elements.includes('雨聲')) picks.push('rain on glass');
    if (elements.includes('日本味')) picks.push('pachinko bell', 'neon hum');
    if (elements.includes('老上海')) picks.push('tape hiss');

    if (picks.length < 1) {
      // 從情緒匹配
      all.forEach(s => {
        if (picks.length >= 2) return;
        const matched = s.vibe.some(v => moodAll.includes(v));
        if (matched && !picks.includes(s.name)) picks.push(s.name);
      });
    }

    return [...new Set(picks)].slice(0, 2);
  }

  function pickProduction({ moodAll, elements, pair }) {
    const picks = [];
    if (elements.includes('電子') || /techno|hyperpop|enka/.test(pair.primary)) {
      picks.push('sidechain pump');
    }
    if (elements.includes('lo-fi 雜訊') || moodAll.includes('懷舊') || moodAll.includes('溫暖')) {
      picks.push('tape saturation');
    }
    if (elements.includes('老上海')) {
      picks.push('spring reverb');
    }
    return [...new Set(picks)].slice(0, 2);
  }

  function pickKey({ pair, moodAll }) {
    if (pair.keyHint && pair.keyHint.length) {
      // 深沉 / 想哭 / 懸疑 → minor
      if (/深沉|想哭|懸疑|孤單|濃烈|戲劇/.test(moodAll)) {
        const minor = pair.keyHint.find(k => /minor/.test(k));
        if (minor) return minor;
      }
      return pair.keyHint[0];
    }
    return 'A minor';
  }

  function pickVocalDesc({ vocal, moodAll }) {
    if (vocal === '純配樂') return 'no vocal, instrumental only';
    const vocalList = vocal === '女聲'
      ? rules.instruments.vocalStyles['女聲']
      : rules.instruments.vocalStyles['男聲'];
    const matched = vocalList.find(v => v.vibe.some(x => moodAll.includes(x)));
    return (matched || vocalList[0]).name;
  }

  function pickEnergyArc({ moodAll, tempoBpm }) {
    if (tempoBpm <= 75) {
      if (/濃烈|戲劇|懸疑/.test(moodAll)) return 'intimate confession → dark reveal';
      return 'intimate verse → gentle chorus';
    }
    if (tempoBpm <= 110) {
      if (/夢幻|希望|想念/.test(moodAll)) return 'wistful → hopeful arc';
      return 'intimate verse → explosive chorus';
    }
    if (/興奮|爆發|衝突/.test(moodAll)) return 'chaotic → euphoric arc';
    return 'slow build → relentless drop';
  }

  function collectExclusions({ pair, vocal, elements, moodAll }) {
    const excludes = new Set();
    const allTerms = (pair.primary + ' ' + pair.secondary + (pair.tertiary || '')).toLowerCase();

    rules.gravityWells.rules.forEach(rule => {
      const trigger = rule.trigger;
      let triggered = false;

      if (trigger === '中文歌' && (/mandarin|chinese|c-pop/i.test(allTerms) || elements.includes('老上海'))) {
        triggered = true;
      } else if (trigger === 'pop' && /pop/i.test(allTerms) && !/hyperpop|city pop|indie pop|bedroom indie/i.test(allTerms)) {
        triggered = true;
      } else if (trigger === 'jazz' && /jazz/i.test(allTerms) && !/dark|lo-fi|cinematic/i.test(allTerms)) {
        triggered = true;
      } else if (trigger === 'orchestral' && /orchestral/i.test(allTerms)) {
        triggered = true;
      } else if (trigger === 'edm' && /edm/i.test(allTerms)) {
        triggered = true;
      } else if (trigger === '復古/懷舊' && (/vintage|1940s|shanghai/i.test(allTerms) || /懷舊|復古/.test(moodAll))) {
        triggered = true;
      } else if (trigger === '電子東方' && /enka|cyber oriental/i.test(allTerms)) {
        triggered = true;
      } else if (trigger === 'Hyperpop/實驗' && /hyperpop|glitch|experimental/i.test(allTerms)) {
        triggered = true;
      } else if (trigger === 'Techno' && /techno/i.test(allTerms)) {
        triggered = true;
      } else if (trigger === 'City Pop' && /city pop/i.test(allTerms)) {
        triggered = true;
      }

      if (triggered) {
        rule.mustExclude.forEach(x => excludes.add(x));
      }
    });

    return Array.from(excludes);
  }

  function buildReasoning({ pair, instruments, soundscapes, exclusions }) {
    const lines = [];
    lines.push(`配對流派：${pair.primary} × ${pair.secondary}${pair.tertiary ? ' × ' + pair.tertiary : ''}`);
    if (instruments.length) lines.push(`樂器：${instruments.join(' / ')}`);
    if (soundscapes.length) lines.push(`音景：${soundscapes.join(' / ')}`);
    if (exclusions.length) lines.push(`姊姊幫你擋掉：${exclusions.length} 個 Suno 引力井`);
    return lines;
  }

  function trimToLimit(str, limit) {
    if (str.length <= limit) return str;
    const parts = str.split(', ');
    while (parts.join(', ').length > limit && parts.length > 5) {
      parts.splice(parts.length - 2, 1);
    }
    return parts.join(', ');
  }

  // ---------- 歌詞結構生成 ----------
  function composeLyrics(a) {
    const length = a.length || '1 分鐘';
    const purpose = a.purpose;
    const vocal = a.vocal;

    if (vocal === '純配樂') {
      return [
        '[Intro - 8s]',
        '（場景音 / 氛圍鋪底）',
        '',
        '[Section A]',
        '（主題建立，主樂器 solo）',
        '',
        '[Section B]',
        '（情緒爬升，加層次）',
        '',
        '[Outro]',
        '（淡出回到開場氛圍）',
      ].join('\n');
    }

    if (length === '30 秒' || purpose === '客戶廣告') {
      return [
        '[Intro - 4s]',
        '（場景音 + 樂器 fade in）',
        '',
        '[Hook]',
        '（品牌名或主題重複 × 2，8 秒內抓住人）',
        '',
        '[Verse]',
        '（產品/訴求，短句 × 3 行）',
        '',
        '[Final Hook]',
        '（hook 重複 + CTA）',
      ].join('\n');
    }

    return [
      '[Intro]',
      '（場景音 + 主樂器 fade in，4 小節）',
      '',
      '[Verse 1]',
      '（敘事鋪陳，4 行，押韻）',
      '',
      '[Pre-Chorus]',
      '（情緒爬升，2 行）',
      '',
      '[Chorus]',
      '（hook 句重複，4-6 行）',
      '',
      '[Verse 2]',
      '（深化故事 / 情境變化）',
      '',
      '[Pre-Chorus]',
      '',
      '[Chorus]',
      '',
      '[Break]',
      '（樂器 solo / 短獨白）',
      '',
      '[Final Chorus]',
      '（升 key 或加和聲，最後爆發）',
      '',
      '[Outro]',
      '（樂器淡出，回到開場場景音）',
    ].join('\n');
  }

  // ---------- Voice 命名建議（V5.5 從 Persona 改名為 Voice）----------
  function suggestVoice(a) {
    if (a.vocal === '純配樂') return '純配樂不需要 Voice';

    const moodMap = {
      '溫暖': '溫柔', '想哭': '夜雨', '懷舊': '懷舊',
      '夢幻': '夢遊', '迷幻': '霓虹', '興奮': '爆發',
      '懸疑': '敘事', '深沉': '暗夜', '療癒': '療癒',
      '孤單': '夜雨', '濃烈': '花魁', '解脫': '解脫',
    };
    let nick = '';
    for (const k in moodMap) {
      if (a.mood.includes(k) || a.moodChips.includes(k)) { nick = moodMap[k]; break; }
    }
    if (!nick && a.elements.length) {
      const elMap = { '日本味': '花魁', '老上海': '老上海', '電子': '霓虹', '雨聲': '夜雨', '吉他刷': '清新' };
      for (const el of a.elements) {
        if (elMap[el]) { nick = elMap[el]; break; }
      }
    }
    if (!nick) nick = '溫柔';

    return `${nick}嗓`;
  }

  // ---------- 歌名建議（3 選 1）----------
  function suggestSongNames(a, pair) {
    const namesByMood = {
      '想哭': ['〈晚安〉', '〈眼角是濕的〉', '〈那句沒說的話〉'],
      '孤單': ['〈一個人〉', '〈空椅子〉', '〈深夜便利商店〉'],
      '解脫': ['〈解脫〉', '〈終於〉', '〈最後一句晚安〉'],
      '溫暖': ['〈溫柔的時候〉', '〈夏天的房間〉', '〈剛剛好〉'],
      '懷舊': ['〈昭和的房間〉', '〈外灘月色〉', '〈舊唱片〉'],
      '夢幻': ['〈夢遊〉', '〈漂浮〉', '〈第三杯咖啡〉'],
      '興奮': ['〈點亮〉', '〈跑起來〉', '〈天還沒亮〉'],
      '懸疑': ['〈他的房間〉', '〈最後一個故事〉', '〈空椅子〉'],
      '深沉': ['〈黑夜〉', '〈凌晨三點〉', '〈不要說話〉'],
      '療癒': ['〈深呼吸〉', '〈柔軟的房間〉', '〈時光暫停〉'],
      '迷幻': ['〈霓虹〉', '〈倒數〉', '〈失重〉'],
      '濃烈': ['〈花魁〉', '〈不留痕跡〉', '〈最後一夜〉'],
    };

    // 元素優先（如果有「日本味」「老上海」之類，覆蓋情緒）
    const elemFirst = {
      '日本味': ['〈深夜駕駛〉', '〈昭和的房間〉', '〈霓虹之間〉'],
      '老上海': ['〈外灘月色〉', '〈最後一杯〉', '〈舞廳菸圈〉'],
    };
    for (const el of a.elements) {
      if (elemFirst[el]) return elemFirst[el];
    }

    // 找匹配的情緒
    for (const k in namesByMood) {
      if (a.mood.includes(k) || a.moodChips.includes(k)) return namesByMood[k];
    }

    // 純配樂
    if (a.vocal === '純配樂') return ['〈第一頁〉', '〈未完的章節〉', '〈夜談〉'];

    // 預設
    return ['〈寫給你〉', '〈那個下午〉', '〈不確定〉'];
  }

  // ---------- 下一首推薦（同 Voice 衍生）----------
  function suggestNextSong(a, voiceName, pair) {
    if (a.vocal === '純配樂') {
      return `配樂類沒 Voice 可衍生，但你可以拿這套 Style 換個歌詞結構，做「同氛圍不同章節」的系列。`;
    }

    const allTerms = (pair.primary + ' ' + pair.secondary).toLowerCase();
    let nextScene = '';

    if (/japanese|city pop|enka/.test(allTerms)) {
      nextScene = '凌晨 3 點便利商店買啤酒的女人';
    } else if (/shanghai|vintage|crooner/.test(allTerms)) {
      nextScene = '舞廳散場後一個人走回家的女人';
    } else if (/jazz|lo-fi|narrative/.test(allTerms)) {
      nextScene = '深夜廚房一邊洗碗一邊回想往事的男人';
    } else if (/hyperpop|glitch|experimental/.test(allTerms)) {
      nextScene = '在便利商店發呆但其實在崩潰的人';
    } else if (/techno|tribal/.test(allTerms)) {
      nextScene = '凌晨 5 點派對散場 一個人走回家的釋放';
    } else if (/indie|folk|dream/.test(allTerms)) {
      nextScene = '搬家前最後一晚 一個人坐在空房間的告別';
    } else if (/healing|ambient|spa/.test(allTerms)) {
      nextScene = '雨後早晨 一個人喝第一杯熱茶的安靜';
    } else {
      nextScene = '同樣情緒的另一個場景';
    }

    return `下首想做「${nextScene}」嗎？同一顆「${voiceName}」就能用，音色鎖住，自動變系列。`;
  }

  // ---------- Checklist ----------
  function runChecklist(styleString, excludeString = '') {
    const list = rules.gravityWells.checklistAfterAssembly;
    const s = styleString.toLowerCase();
    return list.map(item => {
      let pass = true;
      if (item.includes('流派詞')) pass = (s.match(/,/g) || []).length >= 2;
      else if (item.includes('具體樂器')) pass = /piano|guitar|bass|drums|synth/i.test(s);
      else if (item.includes('音景元素')) pass = /vinyl|crackle|rain|hum|hiss|bell|static/i.test(s);
      else if (item.includes('BPM')) pass = /bpm\s+\d+/i.test(s);
      else if (item.includes('Key')) pass = /key\s+\w+/i.test(s);
      else if (item.includes('vocal style')) pass = /vocal|whisper|instrumental/i.test(s);
      else if (item.includes('能量弧線')) pass = /→|verse|chorus|build|drop|arc/i.test(s);
      else if (item.includes('負向排除')) pass = !!(excludeString && excludeString.trim().length > 0);
      else if (item.includes('字元數')) pass = styleString.length < 950;
      return { item, pass };
    });
  }

  // ---------- 結果頁渲染 ----------
  function showResult({ composed, lyrics, voice, songNames, nextSong, checks }) {
    showScreen('screen-result');

    // Style 字串
    $('#style-output').value = composed.styleString;

    // Exclude 字串（獨立輸出，不含 no 前綴）
    $('#exclude-output').value = composed.excludeString || '（這首沒需要排除的引力井）';

    // Suno 參數
    if (composed.sunoParams) {
      $('#param-weirdness').textContent = composed.sunoParams.weirdnessRange;
      $('#param-style-influence').textContent = composed.sunoParams.styleInfluenceRange;
      $('#param-weirdness-bar').style.width = composed.sunoParams.weirdness + '%';
      $('#param-style-bar').style.width = composed.sunoParams.styleInfluence + '%';
      $('#params-hint').textContent = '姊姊提醒：' + composed.sunoParams.hint;
    }

    // 歌詞結構
    $('#lyrics-output').textContent = lyrics;

    // Voice 命名
    $('#voice-output').textContent = voice;

    // 歌名建議
    const songNamesUl = $('#songnames-list');
    if (songNamesUl) {
      songNamesUl.innerHTML = '';
      songNames.forEach(n => {
        const li = document.createElement('li');
        li.textContent = n;
        songNamesUl.appendChild(li);
      });
    }

    // 下一首推薦
    $('#nextsong-text').textContent = nextSong;

    // Reasoning 摘要
    $('#result-sub').textContent = composed.reasoning.join(' · ');

    // Checklist
    const ul = $('#checklist-list');
    ul.innerHTML = '';
    checks.forEach(c => {
      const li = document.createElement('li');
      if (!c.pass) li.classList.add('fail');
      li.textContent = c.item;
      ul.appendChild(li);
    });

    updateCharCount();
  }

  function updateCharCount() {
    const len = $('#style-output').value.length;
    $('#char-count').textContent = len;
    $('#char-count').parentElement.classList.toggle('over', len > 950);
  }

  // ---------- 範本流 ----------
  function showTemplates() {
    if (!rules.templates) {
      showToast('範本還沒準備好，先試試 7 題追問吧 →');
      setTimeout(() => startPM(1), 1200);
      return;
    }
    showScreen('screen-templates');
    const grid = $('#templates-grid');
    grid.innerHTML = '';
    rules.templates.forEach(t => {
      const card = document.createElement('button');
      card.className = 'template-card';
      card.innerHTML = `
        <div class="template-card-num">No.${String(t.id).padStart(2, '0')}</div>
        <div>
          <div class="template-card-title">${t.nameZh}</div>
          <div class="template-card-en">${t.nameEn}</div>
        </div>
        <div class="template-card-scenario">${t.scenario}</div>
        <div class="template-card-tags">${t.tags.map(x => `<span class="template-tag">${x}</span>`).join('')}</div>
        <div class="template-card-colors">${t.colors.map(c => `<span class="template-color-dot" style="background:${c}"></span>`).join('')}</div>
        <div class="template-card-cta">點擊預覽 →</div>
      `;
      card.addEventListener('click', () => openTemplateDrawer(t));
      grid.appendChild(card);
    });
  }

  function openTemplateDrawer(t) {
    $('#drawer-overlay').hidden = false;
    $('#template-drawer').hidden = false;
    $('#drawer-content').innerHTML = `
      <div class="drawer-eyebrow">No.${String(t.id).padStart(2, '0')} · TEMPLATE</div>
      <h3 class="drawer-title">${t.nameZh}</h3>
      <p class="drawer-en">${t.nameEn}</p>
      <p style="color:var(--c-ink-soft); margin-bottom:var(--sp-3);">${t.scenario}</p>

      <div class="drawer-section">
        <div class="drawer-section-label">STYLE 預覽</div>
        <div class="drawer-style">${t.style}</div>
      </div>

      ${t.exclude ? `
      <div class="drawer-section">
        <div class="drawer-section-label">EXCLUDE 預覽</div>
        <div class="drawer-style" style="color:var(--c-warn);">${t.exclude}</div>
      </div>
      ` : ''}

      <div class="drawer-section">
        <div class="drawer-section-label">VOICE 建議</div>
        <div style="font-family:var(--font-zh-display); font-weight:700; font-size:1.25rem;">${t.voice || t.persona || '溫柔嗓'}</div>
      </div>

      <div class="drawer-actions">
        <button class="btn-next" data-tpl-action="use" style="flex:1;">直接用 →</button>
        <button class="btn-secondary" data-tpl-action="customize">微調再用</button>
      </div>
    `;
    $$('#drawer-content [data-tpl-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tplAction === 'use') {
          applyTemplate(t);
        } else {
          customizeTemplate(t);
        }
      });
    });
  }

  function closeDrawer() {
    $('#drawer-overlay').hidden = true;
    $('#template-drawer').hidden = true;
  }

  function applyTemplate(t) {
    closeDrawer();
    const w = t.weirdness || 30;
    const si = t.styleInfluence || 70;
    const composed = {
      styleString: t.style,
      excludeString: t.exclude || '',
      pair: { primary: t.nameEn, secondary: '' },
      bpm: '', key: '',
      exclusions: t.exclude ? t.exclude.split(',').map(s => s.trim()) : [],
      sunoParams: {
        weirdness: w,
        weirdnessRange: `${Math.max(15, w - 5)}-${Math.min(70, w + 5)}%`,
        styleInfluence: si,
        styleInfluenceRange: `${Math.max(50, si - 5)}-${Math.min(85, si + 5)}%`,
        hint: `這是「${t.nameZh}」範本。Weirdness ${w}% 是這類風格的甜蜜點，第一版可以照建議跑。`,
      },
      reasoning: [`範本：${t.nameZh}`, `情境：${t.scenario}`],
    };
    const checks = runChecklist(t.style, t.exclude || '');
    showResult({
      composed,
      lyrics: t.structure,
      voice: t.voice || t.persona || '溫柔嗓',
      songNames: t.songNames || ['〈待命名〉', '〈第一首〉', '〈未完成〉'],
      nextSong: `滿意這版後存成 Voice「${t.voice || '溫柔嗓'}」，下次同系列直接套同一顆音色。`,
      checks,
    });
  }

  function customizeTemplate(t) {
    // 目前先用直接套用 + 提示，未來可擴充成精簡 PM 流程
    closeDrawer();
    showToast('微調模式待開發，先用範本看看吧');
    applyTemplate(t);
  }

  // ---------- 複製 ----------
  async function copyToClipboard(btn) {
    const targetId = btn.dataset.target;
    const target = $('#' + targetId);
    const text = target.value !== undefined ? target.value : target.textContent;

    try {
      await navigator.clipboard.writeText(text);
      btn.classList.add('copied');
      const orig = btn.textContent;
      btn.textContent = '✓ 已複製';
      showToast('已複製，可以貼到 Suno 了');
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.textContent = orig;
      }, 1800);
    } catch (e) {
      showToast('複製失敗，請手動選取', 'error');
      if (target.select) target.select();
    }
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(msg, type = '') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (type ? ' ' + type : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.hidden = true, 2400);
  }

  // ---------- Regen Modal ----------
  function openRegenModal() { $('#modal-regen').hidden = false; }
  function closeRegenModal() { $('#modal-regen').hidden = true; }
  function handleRegen(mode) {
    closeRegenModal();
    if (mode === 'fresh') {
      Object.keys(answers).forEach(k => {
        if (Array.isArray(answers[k])) answers[k] = [];
        else if (typeof answers[k] === 'string') answers[k] = '';
        else answers[k] = null;
      });
      clearDraft();
      backToHero();
    } else if (mode === 'keep') {
      startPM(1);
    } else if (mode === 'lyrics') {
      // 只重生歌詞結構
      const lyrics = composeLyrics(answers);
      $('#lyrics-output').textContent = lyrics;
      showToast('歌詞結構重生完成');
    }
  }

  // ---------- Boot ----------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
