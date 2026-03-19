// === 每日好書 Tab（週曆排法） ===
(function() {
  'use strict';

  const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:8787'
    : 'https://ebook-deals.vmpvmp1017.workers.dev';

  const PLATFORM_NAMES = {
    readmoo: 'Readmoo', books: '博客來',
    kobo: 'Kobo', googlebooks: 'Google Books'
  };

  const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function isTrialBook(title) {
    return /(試讀本|精華試讀|試閱版|體驗版|免費試讀|試讀精華)/.test(title || '');
  }

  function normalizeTitle(title) {
    return (title || '')
      .replace(/\s*[\(（]電子書[\)）]\s*/g, '')
      .replace(/\s*[\(（][^)）]*[\)）]\s*$/g, '')
      .trim().toLowerCase();
  }

  function getToday() {
    const now = new Date();
    return now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');
  }

  // === 搜尋比價 ===
  const searchBtn = document.getElementById('deals-search-btn');
  const searchInput = document.getElementById('deals-search-input');
  if (searchBtn) searchBtn.addEventListener('click', doSearch);
  if (searchInput) searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
  });

  async function doSearch() {
    const query = searchInput.value.trim();
    if (!query) return;
    const sr = document.getElementById('deals-search-results');

    sr.innerHTML = '<div class="deals-shimmer">' +
      [1,2,3].map(() =>
        '<div class="deals-shimmer-item">' +
          '<div class="deals-shimmer-block" style="width:70%"></div>' +
          '<div class="deals-shimmer-block" style="width:45%"></div>' +
          '<div class="deals-shimmer-block" style="width:50%"></div>' +
        '</div>'
      ).join('') + '</div>';

    try {
      const res = await fetch(API_BASE + '/api/search?q=' + encodeURIComponent(query));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();

      const platforms = ['readmoo', 'books', 'kobo', 'googlebooks'];
      let all = [];
      for (const p of platforms) {
        const results = data.results?.[p] || [];
        all.push(...results
          .filter(r => !isTrialBook(r.title))
          .map(r => ({ ...r, platform: r.platform || p }))
        );
      }

      if (all.length === 0) {
        sr.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:var(--space-lg)">沒有找到相關書籍</p>';
        return;
      }

      const groups = new Map();
      for (const r of all) {
        const key = normalizeTitle(r.title);
        if (!groups.has(key)) {
          groups.set(key, { title: r.title, author: r.author || '', items: [] });
        }
        const g = groups.get(key);
        if (!g.author && r.author) g.author = r.author;
        g.items.push(r);
      }

      for (const g of groups.values()) {
        g.items.sort((a, b) => {
          if (!a.price && !b.price) return 0;
          if (!a.price) return 1;
          if (!b.price) return -1;
          return a.price - b.price;
        });
        g.cheapest = g.items.find(r => r.price > 0)?.price || 0;
      }

      const sorted = [...groups.values()].sort((a, b) => b.items.length - a.items.length);

      let html = '<p class="deals-search-summary">找到 ' + all.length + ' 筆，' + sorted.length + ' 本書</p>';

      html += sorted.map(g => {
        let inner = '<div class="deals-book-group">';
        inner += '<div class="deals-book-group-header">';
        inner += '<div class="deals-book-group-title">' + esc(g.title) + '</div>';
        if (g.author) inner += '<div class="deals-book-group-author">' + esc(g.author) + '</div>';
        inner += '</div>';

        inner += g.items.map(r => {
          const isCheapest = g.items.length > 1 && r.price > 0 && r.price === g.cheapest;
          return '<div class="deals-price-row' + (isCheapest ? ' cheapest' : '') + '">' +
            '<span class="deals-platform-tag ' + r.platform + '">' + (PLATFORM_NAMES[r.platform] || r.platform) + '</span>' +
            (isCheapest ? '<span class="deals-cheapest-tag">最便宜</span>' : '') +
            (r.price ? '<span class="deals-price">$' + r.price + '</span>' : '<span class="deals-price no-price">未標價</span>') +
            '<a href="' + esc(r.url || r.bookUrl || '#') + '" class="deals-go-link" target="_blank" rel="noopener">前往</a>' +
          '</div>';
        }).join('');

        inner += '</div>';
        return inner;
      }).join('');

      sr.innerHTML = html;
    } catch (err) {
      sr.innerHTML = '<p style="text-align:center;color:var(--status-error);padding:var(--space-lg)">搜尋失敗：' + esc(err.message) + '</p>';
    }
  }

  // === 讀墨週曆優惠 ===
  function renderCalendarHeader(deals, today) {
    const headerEl = document.getElementById('deals-cal-header');
    const gridEl = document.getElementById('deals-cal-grid');
    if (!headerEl || deals.length === 0) return;

    const cols = deals.length;
    const colStyle = 'repeat(' + cols + ', minmax(150px, 1fr))';
    gridEl.style.gridTemplateColumns = colStyle;

    // 同日合併表頭
    const dateGroups = [];
    let prev = null;
    for (const deal of deals) {
      if (prev && prev.date === deal.date) {
        prev.count++;
      } else {
        prev = { date: deal.date, count: 1 };
        dateGroups.push(prev);
      }
    }

    headerEl.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(150px, 1fr))';
    headerEl.innerHTML = dateGroups.map(g => {
      const d = new Date(g.date + 'T00:00:00');
      const isToday = g.date === today;
      const dayName = WEEKDAYS[d.getDay()];
      const dateLabel = (d.getMonth() + 1) + '/' + d.getDate();
      const spanAttr = g.count > 1 ? ' style="grid-column: span ' + g.count + '"' : '';
      const cls = isToday ? ' is-today' : '';
      return '<span class="deals-cal-day' + cls + '"' + spanAttr + '>' +
        dayName + '<br>' + dateLabel +
        (isToday ? '<br><b>今天</b>' : '') +
        (g.count > 1 ? '<br>' + g.count + ' 本' : '') +
        '</span>';
    }).join('');
  }

  function renderDealCell(deal, today) {
    const isToday = deal.date === today;
    const is99 = deal.dealPrice === 99;

    const cover = deal.coverUrl
      ? '<img src="' + esc(deal.coverUrl) + '" alt="' + esc(deal.title) + '" loading="lazy" onerror="this.outerHTML=\'<div class=deal-cell-cover-ph>' + esc(deal.title.slice(0, 6)) + '</div>\'">'
      : '<div class="deal-cell-cover-ph">' + esc(deal.title.slice(0, 6)) + '</div>';

    const cls = 'deal-cell' + (isToday ? ' is-today' : '') + (is99 ? ' is-99' : '');
    return '<article class="' + cls + '">' +
      (is99 ? '<span class="deal-99-badge">$99</span>' : '') +
      '<div class="deal-cell-cover">' + cover + '</div>' +
      '<div class="deal-cell-title">' + esc(deal.title) + '</div>' +
      (deal.author ? '<div class="deal-cell-author">' + esc(deal.author) + '</div>' : '') +
      '<div class="deal-cell-pricing">' +
        '<span class="deal-cell-deal-price">$' + deal.dealPrice + '</span>' +
        (deal.originalPrice > 0 ? '<span class="deal-cell-orig-price">$' + deal.originalPrice + '</span>' : '') +
      '</div>' +
      '<div class="deal-cell-actions">' +
        '<button class="deal-cell-add-btn" onclick="window._dealsAddBook(this)" ' +
          'data-title="' + esc(deal.title) + '" ' +
          'data-author="' + esc(deal.author || '') + '" ' +
          'data-publisher="' + esc(deal.publisher || '') + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> 加入書單' +
        '</button>' +
        '<a href="' + esc(deal.bookUrl) + '" class="deal-cell-link" target="_blank" rel="noopener">' +
          '前往購買 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>' +
        '</a>' +
      '</div>' +
    '</article>';
  }

  async function fetchReadmooDeals() {
    const gridEl = document.getElementById('deals-cal-grid');
    try {
      const res = await fetch(API_BASE + '/api/deals');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();

      // 更新時間
      if (data.updatedAt) {
        const d = new Date(data.updatedAt);
        const el = document.getElementById('deals-updated-at');
        if (el) el.textContent = '最後更新：' + d.toLocaleDateString('zh-TW') + ' ' +
          d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
      }

      const deals = data.readmoo?.deals || [];
      const today = getToday();

      // 只顯示今天 + 未來，按日期排
      const showDeals = deals
        .filter(d => d.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date));

      if (showDeals.length === 0) {
        gridEl.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:var(--space-xl)">今天讀墨沒有特價書</p>';
        return;
      }

      // 渲染日期表頭
      renderCalendarHeader(showDeals, today);

      // 渲染書格
      gridEl.innerHTML = showDeals.map(deal => renderDealCell(deal, today)).join('');

    } catch (err) {
      gridEl.innerHTML = '<p style="text-align:center;color:var(--status-error);padding:var(--space-xl)">載入失敗：' + esc(err.message) + '</p>';
    }
  }

  // === 加入書單 ===
  window._dealsAddBook = function(btn) {
    const title = btn.dataset.title;
    const author = btn.dataset.author || '';
    const publisher = btn.dataset.publisher || '';
    if (!title) return;

    // 用 books.js 的全域函式
    if (typeof getBooks !== 'function' || typeof saveBooks !== 'function') return;

    const books = getBooks();
    // 檢查重複
    const exists = books.some(b => b.title === title);
    if (exists) {
      btn.textContent = '已在書單';
      btn.disabled = true;
      btn.classList.add('added');
      return;
    }

    books.push({
      id: Date.now().toString(36),
      title: title,
      author: author,
      publisher: publisher,
      pubdate: '',
      notes: '',
      orderNumber: '',
      status: 'want',
      addedAt: new Date().toISOString()
    });
    saveBooks(books);

    btn.textContent = '已加入';
    btn.disabled = true;
    btn.classList.add('added');

    // toast
    if (typeof showToast === 'function') {
      showToast('已加入書單：' + title);
    }
  };

  // 延遲載入：切到 tab 才抓
  let dealsLoaded = false;
  const observer = new MutationObserver(() => {
    const panel = document.getElementById('tab-deals');
    if (panel && panel.classList.contains('active') && !dealsLoaded) {
      dealsLoaded = true;
      fetchReadmooDeals();
    }
  });

  const tabDeals = document.getElementById('tab-deals');
  if (tabDeals) {
    observer.observe(tabDeals, { attributes: true, attributeFilter: ['class'] });
    if (tabDeals.classList.contains('active')) {
      dealsLoaded = true;
      fetchReadmooDeals();
    }
  }
})();
