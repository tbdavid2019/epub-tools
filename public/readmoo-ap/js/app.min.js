/**
 * 讀墨 AP 接龍工具 — 主程式
 * Tab 路由 + 深色模式 + 全域初始化
 */

// ============ Config ============
const CONFIG = {
  // Google Sheets ID
  SHEET_ID: '1xjGSZquaGyLPRWsBEKtM2_1t_CRS1LLKSF76NhYzaeA',
  // Google Apps Script Web App URL
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwdRGfRb8YvPdOzewdvPZgchW8JHd6sQVL6AJ-AIjxgw41PDL4VZfZtGWYeh69cqObX/exec',
  // localStorage keys
  STORAGE_KEYS: {
    BOOKS: 'readmoo-ap-books',
    USER: 'readmoo-ap-user',
    CHANGELOG: 'readmoo-ap-changelog',
    AP_CACHE: 'readmoo-ap-cache',
    THEME: 'helloruru-theme',
    CHAIN_STATE: 'readmoo-ap-chain-state'
  }
};

// ============ Global State ============
const AppState = {
  members: [],
  user: null,
  isVerified: false
};

// ============ Tab Router ============
function initTabs() {
  const tabs = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  const AUTH_TABS = new Set(['books', 'chain']);

  function doSwitchTab(tabId) {
    tabs.forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabId);
      t.setAttribute('aria-selected', t.dataset.tab === tabId);
    });
    panels.forEach(p => {
      p.classList.toggle('active', p.id === `tab-${tabId}`);
    });
    window.location.hash = tabId;
    document.dispatchEvent(new CustomEvent('tab-changed', { detail: { tab: tabId } }));
  }

  function switchTab(tabId) {
    if (AUTH_TABS.has(tabId) && !AppState.user) {
      requireIdentity(() => doSwitchTab(tabId));
      return;
    }
    doSwitchTab(tabId);
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Hash routing（延後到 applyInitialHash 呼叫，等成員載入完成）
  window.addEventListener('hashchange', () => {
    const h = window.location.hash.slice(1);
    if (h && document.getElementById(`tab-${h}`)) {
      switchTab(h);
    }
  });

  // 初始 hash 路由：等成員載入後才觸發，避免空下拉選單
  window._applyInitialHash = function() {
    const hash = window.location.hash.slice(1);
    if (hash && document.getElementById(`tab-${hash}`)) {
      switchTab(hash);
    }
  };
}

// ============ Dark Mode ============
function initDarkMode() {
  const STORAGE_KEY = CONFIG.STORAGE_KEYS.THEME;
  const toggle = document.querySelector('.theme-toggle');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

  function applyTheme(dark) {
    document.documentElement.classList.toggle('dark', dark);
  }

  function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark') applyTheme(true);
    else if (saved === 'light') applyTheme(false);
    else applyTheme(prefersDark.matches);
  }

  function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    const next = !isDark;
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
  }

  prefersDark.addEventListener('change', (e) => {
    if (!localStorage.getItem(STORAGE_KEY)) applyTheme(e.matches);
  });

  if (toggle) toggle.addEventListener('click', toggleTheme);
  initTheme();
}

// ============ Toast ============
function showToast(message, duration = 2500) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.display = 'block';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.display = 'none';
  }, duration);
}

// ============ Modal Helpers ============
function openModal(id) {
  document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

function initModalCloses() {
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal-overlay').style.display = 'none';
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.style.display = 'none';
    });
  });
}

// ============ User Session ============
function loadUser() {
  const saved = localStorage.getItem(CONFIG.STORAGE_KEYS.USER);
  if (saved) {
    AppState.user = JSON.parse(saved);
    AppState.isVerified = true;
  }
  updateUserBar();
}

function saveUser(name, date) {
  AppState.user = { name, date };
  AppState.isVerified = true;
  localStorage.setItem(CONFIG.STORAGE_KEYS.USER, JSON.stringify(AppState.user));
  updateUserBar();
}

function updateUserBar() {
  const bar = document.getElementById('user-bar');
  const nameEl = document.getElementById('user-bar-name');
  const booksTitle = document.getElementById('books-title');
  if (!bar) return;
  if (AppState.user && AppState.user.name) {
    const books = typeof getBooks === 'function' ? getBooks() : [];
    const countText = books.length > 0 ? ` · ${books.length} 本書` : '';
    nameEl.innerHTML = `${AppState.user.name} <span class="local-hint">本機紀錄${countText}</span>`;
    bar.style.display = 'flex';
    if (booksTitle) booksTitle.textContent = `${AppState.user.name} 的書單`;
  } else {
    bar.style.display = 'none';
    if (booksTitle) booksTitle.textContent = '我的書單';
  }
}

function requireAuth(callback) {
  if (AppState.isVerified) {
    callback();
  } else {
    AppState._identityOnly = false;
    openModal('quiz-modal');
    AppState._authCallback = callback;
  }
}

// 輕量身分選擇（書單/接龍用，不需答題）
function requireIdentity(callback) {
  if (AppState.user) {
    callback();
  } else {
    AppState._identityOnly = true;
    openModal('quiz-modal');
    AppState._authCallback = callback;
  }
}

// ============ Google Sheets Reader ============
async function fetchMembersFromSheet() {
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/gviz/tq?tqx=out:json&headers=0`;
  try {
    const res = await fetch(url);
    const text = await res.text();
    // gviz returns JSONP-like: google.visualization.Query.setResponse({...})
    const jsonStr = text.match(/google\.visualization\.Query\.setResponse\((.+)\)/);
    if (!jsonStr) throw new Error('Parse error');
    const json = JSON.parse(jsonStr[1]);

    const rows = json.table.rows;
    const members = [];
    const sheetLogs = [];
    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i].c;
      const id = cells[0]?.v;
      const name = cells[1]?.v;
      const link = cells[2]?.v;
      const notes = cells[4]?.v; // E 欄：操作紀錄
      if (id && name) {
        members.push({
          id: String(id),
          name: String(name),
          link: link ? String(link) : ''
        });
        // 解析 E 欄的 log（格式：ver.20260303 由 XXX 新增）
        if (notes) {
          String(notes).split('\n').forEach(line => {
            const m = line.match(/ver\.(\d{8})\s+由\s+(.+?)\s+(新增|編輯|刪除)/);
            if (m) {
              sheetLogs.push({
                date: m[1],
                editor: m[2],
                action: m[3],
                memberId: String(id),
                memberName: String(name),
                raw: line.trim()
              });
            }
          });
        }
      }
    }

    AppState.members = members;
    AppState.sheetLogs = sheetLogs;
    // Cache
    localStorage.setItem(CONFIG.STORAGE_KEYS.AP_CACHE, JSON.stringify({
      data: members,
      time: Date.now()
    }));
    return members;
  } catch (err) {
    console.error('Failed to fetch from Google Sheets:', err);
    // Try cache
    const cached = localStorage.getItem(CONFIG.STORAGE_KEYS.AP_CACHE);
    if (cached) {
      const parsed = JSON.parse(cached);
      AppState.members = parsed.data;
      return parsed.data;
    }
    return [];
  }
}

// ============ Apps Script Writer ============
async function writeToSheet(action, data) {
  if (!AppState.user?.name) {
    showToast('請先選擇你的身分');
    return { success: false };
  }
  if (!CONFIG.APPS_SCRIPT_URL) {
    showToast('Apps Script 尚未設定，請聯繫管理員');
    return { success: false };
  }
  try {
    const res = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({
        action,
        editor: AppState.user.name,
        ...data
      })
    });
    const result = await res.json();
    if (result.success) {
      // Refresh data
      await fetchMembersFromSheet();
    }
    return result;
  } catch (err) {
    console.error('Write failed:', err);
    showToast('寫入失敗，請稍後再試');
    return { success: false };
  }
}

// ============ Footer Year ============
function initFooter() {
  const startYear = 2026;
  const currentYear = new Date().getFullYear();
  const el = document.getElementById('footer-year');
  if (el) {
    el.textContent = currentYear > startYear
      ? `${startYear}\u2013${currentYear}`
      : `${startYear}`;
  }
}

// ============ Init ============
document.addEventListener('DOMContentLoaded', async () => {
  initDarkMode();
  loadUser();
  initTabs();
  initModalCloses();
  initFooter();

  // Initialize Lucide icons
  if (window.lucide) lucide.createIcons();

  // Fetch AP members
  const members = await fetchMembersFromSheet();

  // Initialize all modules
  if (window.initQuiz) initQuiz();
  if (window.initDirectory) initDirectory(members);
  if (window.initChain) initChain();
  if (window.initBooks) initBooks();
  if (window.initChangelog) initChangelog();

  // 成員載入完成，觸發初始 hash 路由
  if (window._applyInitialHash) window._applyInitialHash();

  // Quick action: "修改 AP 連結" → switch to directory tab + open edit mode
  const qaEditLink = document.getElementById('qa-edit-link');
  if (qaEditLink) {
    qaEditLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.hash = 'directory';
      setTimeout(() => {
        const btnEdit = document.getElementById('btn-edit-directory');
        if (btnEdit) btnEdit.click();
      }, 300);
    });
  }

  // Logout / switch identity
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.removeItem(CONFIG.STORAGE_KEYS.USER);
      AppState.user = null;
      AppState.isVerified = false;
      updateUserBar();
      openModal('quiz-modal');
    });
  }

  // 每日 $99 特惠書
  loadDaily99();
});

// ============ Daily 99 ============
async function loadDaily99() {
  try {
    const res = await fetch('/api/daily-99');
    if (!res.ok) return;
    const data = await res.json();
    if (!data.today) return;

    const book = data.today;
    const card = document.getElementById('daily-99');
    if (!card) return;

    document.getElementById('daily-99-title').textContent = book.title;
    document.getElementById('daily-99-meta').textContent =
      [book.author, book.publisher].filter(Boolean).join(' · ');
    document.getElementById('daily-99-original').textContent =
      book.originalPrice ? `NT$ ${book.originalPrice}` : '';
    const promoEl = document.getElementById('daily-99-promo');
    if (promoEl) promoEl.textContent = `NT$ ${book.promoPrice}`;
    document.getElementById('daily-99-link').href = book.url;

    const coverImg = document.getElementById('daily-99-cover');
    if (book.cover) {
      coverImg.src = book.cover;
      coverImg.alt = book.title;
    }

    // 加入書單
    const btnAdd = document.getElementById('daily-99-add');
    const existingBooks = getBooks();
    const alreadyHas = existingBooks.some(b =>
      b.title.toLowerCase() === book.title.toLowerCase()
    );

    if (alreadyHas) {
      btnAdd.innerHTML = '<i data-lucide="check"></i> 已在書單';
      btnAdd.disabled = true;
      btnAdd.classList.remove('btn-primary');
      btnAdd.classList.add('btn-secondary');
    }

    btnAdd.addEventListener('click', () => {
      const books = getBooks();
      books.push({
        id: 'book_' + Date.now(),
        title: book.title,
        author: book.author,
        version: '電子書',
        pubdate: '',
        publisher: book.publisher,
        price: String(book.promoPrice),
        cover: book.cover,
        readmooUrl: book.url,
        status: 'want',
        createdAt: new Date().toISOString(),
      });
      saveBooks(books);
      btnAdd.innerHTML = '<i data-lucide="check"></i> 已加入';
      btnAdd.disabled = true;
      btnAdd.classList.remove('btn-primary');
      btnAdd.classList.add('btn-secondary');
      if (window.lucide) lucide.createIcons();
      showToast(`已加入書單：${book.title}`);
      document.dispatchEvent(new Event('books-updated'));
    });

    card.style.display = 'block';
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    console.error('Daily 99 load failed:', e);
  }
}
