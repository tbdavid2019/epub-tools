// ─── 圖書館新書探測器 ───

const API_BASE = '/api/hyread-proxy';

// ══════════════════════════════════════════════════
// State
// ══════════════════════════════════════════════════

let currentTab = 'new';
let currentLib = 'tpml';
let currentBooks = [];
let sortAsc = true;
let libraries = {};

// ══════════════════════════════════════════════════
// API
// ══════════════════════════════════════════════════

async function fetchAPI(params) {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}?${qs}`);
  if (!res.ok) throw new Error(`API 錯誤 ${res.status}`);
  return await res.json();
}

async function loadLibraries() {
  try {
    const data = await fetchAPI({ action: 'libraries' });
    libraries = data.libraries;
    populateLibrarySelect();
  } catch {
    // 使用內建列表作為備用
    libraries = {
      tpml: '臺北市立圖書館', tphcc: '新北市立圖書館', ntledu: '國立臺灣圖書館',
      tycccgov: '桃園市立圖書館', hcmlgov: '新竹市圖書館', hchcc: '新竹縣公共圖書館',
      miaolilib: '苗栗縣立圖書館', taichunggov: '臺中市立圖書館', cabcygov: '嘉義市政府文化局',
      tnml: '臺南市立圖書館', ksml: '高雄市立圖書館', ilccb: '宜蘭縣政府文化局',
      hccc: '花蓮縣文化局', cclttct: '臺東縣政府文化處', bocach: '南投縣公共圖書館',
      ylccb: '雲林縣公共圖書館', chcedu: '彰化雲端電子書庫', pthggov: '屏東縣公共圖書館',
      klccab: '基隆市文化局', ncl: '國家圖書館',
      kinmen: '金門縣文化局', phhcc: '澎湖縣圖書館', matsucc: '連江縣公共圖書館',
    };
    populateLibrarySelect();
  }
}

function populateLibrarySelect() {
  const select = document.getElementById('select-lib');
  select.innerHTML = '';
  for (const [code, name] of Object.entries(libraries)) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = name;
    if (code === currentLib) opt.selected = true;
    select.appendChild(opt);
  }
}

// ══════════════════════════════════════════════════
// Tab 切換
// ══════════════════════════════════════════════════

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));

  // 搜尋面板永遠顯示，圖書館選擇器在非搜尋模式顯示
  if (tab === 'free-hits') {
    loadFreeHits();
  } else {
    loadBooks();
  }
}

// ══════════════════════════════════════════════════
// 載入書籍
// ══════════════════════════════════════════════════

async function loadFreeHits() {
  showLoading(true, `比對${libraries[currentLib] || ''}新書 vs 書店暢銷榜...`);
  clearResults();

  try {
    const data = await fetchAPI({ action: 'free-hits', lib: currentLib });
    const hits = data.hits || [];
    currentBooks = hits;

    const container = document.getElementById('results');
    const emptyState = document.getElementById('empty-state');
    const sortRow = document.getElementById('sort-row');

    if (hits.length === 0) {
      emptyState.style.display = '';
      emptyState.querySelector('p').textContent =
        `目前沒有交集。（新書 ${data.totalNew} 本 vs 暢銷榜 ${data.totalBestseller} 本）`;
      sortRow.style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';
    sortRow.style.display = '';
    document.getElementById('result-count').textContent =
      `${hits.length} 本熱賣中，圖書館免費借得到`;

    const grid = document.createElement('div');
    grid.className = 'book-grid';

    for (const book of hits) {
      const a = document.createElement('a');
      a.className = 'book-card free-hit';
      a.href = `https://${currentLib}.ebook.hyread.com.tw/bookDetail.jsp?id=${book.id}`;
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML = `
        <span class="free-hit-badge">${book.source || '熱賣中'} 免費借</span>
        <img class="book-cover" src="${book.thumbnail}" alt="${escapeHtml(book.title)}"
             onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 3 4%22><rect fill=%22%23E5E0DB%22 width=%223%22 height=%224%22/></svg>'">
        <div class="book-title">${escapeHtml(book.title)}</div>
      `;
      grid.appendChild(a);
    }

    container.innerHTML = '';
    container.appendChild(grid);
  } catch (err) {
    showToast('比對失敗：' + err.message);
  } finally {
    showLoading(false);
  }
}

async function loadBooks() {
  const action = currentTab === 'new' ? 'new' : 'top';
  showLoading(true, `正在查詢${libraries[currentLib] || ''}...`);
  clearResults();

  try {
    const data = await fetchAPI({ action, lib: currentLib });
    currentBooks = data.books || [];
    renderBooks();
  } catch (err) {
    showToast('查詢失敗：' + err.message);
    clearResults();
  } finally {
    showLoading(false);
  }
}

async function searchBooks() {
  const query = document.getElementById('search-input').value.trim();
  if (!query) { showToast('請輸入書名'); return; }

  showLoading(true, `正在搜尋「${query}」...`);
  clearResults();

  try {
    const data = await fetchAPI({ action: 'search', q: query });
    const books = data.books || [];
    currentBooks = books;
    if (books.length === 0) {
      document.getElementById('empty-state').style.display = '';
      document.getElementById('empty-state').querySelector('p').textContent = '沒有找到相關書籍。';
    } else {
      // 用卡片模式渲染搜尋結果（點擊連到書店頁面）
      currentTab = '_search_result';
      renderBooks();
      currentTab = 'new'; // 恢復
    }
  } catch (err) {
    showToast('搜尋失敗：' + err.message);
  } finally {
    showLoading(false);
  }
}

// ══════════════════════════════════════════════════
// 渲染
// ══════════════════════════════════════════════════

function renderBooks() {
  const container = document.getElementById('results');
  const emptyState = document.getElementById('empty-state');
  const countEl = document.getElementById('result-count');
  const sortRow = document.getElementById('sort-row');

  if (currentBooks.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = '';
    sortRow.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  sortRow.style.display = '';
  countEl.textContent = `共 ${currentBooks.length} 本`;

  // 排序
  const sorted = [...currentBooks].sort((a, b) => {
    const cmp = (a.title || '').localeCompare(b.title || '', 'zh-TW');
    return sortAsc ? cmp : -cmp;
  });

  const isTop = currentTab === 'top';
  // 如果是熱門排行，預設按排名排（不按書名）
  const display = isTop && sortAsc ? currentBooks : sorted;

  const grid = document.createElement('div');
  grid.className = 'book-grid';

  for (const book of display) {
    const a = document.createElement('a');
    a.className = 'book-card';
    const isSearchResult = currentTab === '_search_result';
    const host = isSearchResult ? 'ebook.hyread.com.tw' : `${currentLib}.ebook.hyread.com.tw`;
    a.href = `https://${host}/bookDetail.jsp?id=${book.id}`;
    a.target = '_blank';
    a.rel = 'noopener';

    let rankHtml = '';
    if (isTop && book.rank) {
      const top3 = book.rank <= 3 ? ' top3' : '';
      rankHtml = `<span class="book-rank${top3}">${book.rank}</span>`;
    }

    let dateHtml = '';
    if (book.firstSeen && currentTab === 'new') {
      dateHtml = `<div class="book-date">${book.firstSeen} 上架</div>`;
    }

    a.innerHTML = `
      ${rankHtml}
      <img class="book-cover" src="${book.thumbnail}" alt="${escapeHtml(book.title)}"
           onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 3 4%22><rect fill=%22%23E5E0DB%22 width=%223%22 height=%224%22/></svg>'">
      <div class="book-title">${escapeHtml(book.title)}</div>
      ${dateHtml}
    `;
    grid.appendChild(a);
  }

  container.innerHTML = '';
  container.appendChild(grid);
  lucide.createIcons();
}

function renderSearchResults(results) {
  const container = document.getElementById('results');
  const emptyState = document.getElementById('empty-state');
  const sortRow = document.getElementById('sort-row');

  const entries = Object.entries(results);

  if (entries.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = '';
    emptyState.querySelector('p').textContent = '沒有找到。試試其他關鍵字，或到 HyRead One 搜尋完整館藏。';
    sortRow.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  sortRow.style.display = '';

  let totalBooks = 0;
  entries.forEach(([, v]) => { totalBooks += v.books.length; });
  document.getElementById('result-count').textContent =
    `${entries.length} 間圖書館有結果，共 ${totalBooks} 本`;

  container.innerHTML = '';

  for (const [code, data] of entries) {
    const group = document.createElement('div');
    group.className = 'lib-group';

    group.innerHTML = `
      <div class="lib-group-header">
        <span class="lib-dot"></span>
        <span class="lib-group-name">${escapeHtml(data.name)}</span>
        <span class="lib-group-count">${data.books.length} 本</span>
      </div>
    `;

    const list = document.createElement('div');
    for (const book of data.books) {
      const a = document.createElement('a');
      a.className = 'book-list-item';
      a.href = `https://${code}.ebook.hyread.com.tw/bookDetail.jsp?id=${book.id}`;
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML = `
        <img class="book-cover-sm" src="${book.thumbnail}" alt=""
             onerror="this.style.display='none'">
        <span class="book-title">${escapeHtml(book.title)}</span>
      `;
      list.appendChild(a);
    }

    group.appendChild(list);
    container.appendChild(group);
  }
}

// ══════════════════════════════════════════════════
// Dark Mode
// ══════════════════════════════════════════════════

function initDarkMode() {
  const btn = document.getElementById('btn-dark-mode');
  const saved = localStorage.getItem('helloruru-theme');

  const applyDark = (isDark) => {
    document.documentElement.classList.toggle('dark', isDark);
    const icon = btn?.querySelector('[data-lucide]');
    if (icon) {
      icon.setAttribute('data-lucide', isDark ? 'sun' : 'moon');
      lucide.createIcons();
    }
  };

  if (saved === 'dark' || (!saved && matchMedia('(prefers-color-scheme: dark)').matches)) {
    applyDark(true);
  }

  btn?.addEventListener('click', () => {
    const isDark = !document.documentElement.classList.contains('dark');
    localStorage.setItem('helloruru-theme', isDark ? 'dark' : 'light');
    applyDark(isDark);
  });
}

// ══════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════

function showLoading(show, text) {
  const el = document.getElementById('loading');
  el.style.display = show ? '' : 'none';
  if (text) document.getElementById('loading-text').textContent = text;
}

function clearResults() {
  document.getElementById('results').innerHTML = '';
  document.getElementById('sort-row').style.display = 'none';
  document.getElementById('empty-state').style.display = 'none';
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = '';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.display = 'none'; }, 3000);
}

function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ══════════════════════════════════════════════════
// Init
// ══════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  loadLibraries();

  // Tab
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // 圖書館切換
  document.getElementById('select-lib').addEventListener('change', (e) => {
    currentLib = e.target.value;
    if (currentTab === 'free-hits') loadFreeHits();
    else if (currentTab !== 'search') loadBooks();
  });

  // 搜尋
  document.getElementById('btn-search').addEventListener('click', searchBooks);
  document.getElementById('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchBooks();
  });

  // 排序
  document.getElementById('btn-sort').addEventListener('click', () => {
    sortAsc = !sortAsc;
    document.getElementById('btn-sort').innerHTML =
      `<i data-lucide="arrow-up-down" width="14" height="14"></i> ${sortAsc ? '按書名' : '按書名 Z-A'}`;
    lucide.createIcons();
    if (currentTab !== 'search') renderBooks();
  });

  // 初始載入
  lucide.createIcons();
  loadBooks();
});
