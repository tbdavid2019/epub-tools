// === 每日好書 Tab ===
(function() {
  'use strict';

  const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:8787'
    : 'https://ebook-deals.vmpvmp1017.workers.dev';

  const PLATFORM_NAMES = {
    readmoo: 'Readmoo', books: '博客來',
    kobo: 'Kobo', googlebooks: 'Google Books'
  };

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

    // shimmer
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

      // 同書分組
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

  // === 讀墨今日優惠 ===
  async function fetchReadmooDeals() {
    const grid = document.getElementById('deals-readmoo-grid');
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
      const now = new Date();
      const today = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0');

      // 只顯示今天 + 未來
      const showDeals = deals.filter(d => d.date >= today)
        .sort((a, b) => a.date.localeCompare(b.date));

      if (showDeals.length === 0) {
        grid.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:var(--space-xl);grid-column:1/-1">今天讀墨沒有特價書</p>';
        return;
      }

      grid.innerHTML = showDeals.map(deal => {
        const is99 = deal.dealPrice === 99;
        const cover = deal.coverUrl
          ? '<img src="' + esc(deal.coverUrl) + '" alt="' + esc(deal.title) + '" loading="lazy" onerror="this.outerHTML=\'<div class=deal-item-cover-placeholder>' + esc(deal.title.slice(0, 6)) + '</div>\'">'
          : '<div class="deal-item-cover-placeholder">' + esc(deal.title.slice(0, 6)) + '</div>';

        return '<article class="deal-item' + (is99 ? ' is-99' : '') + '">' +
          (is99 ? '<span class="deal-99-badge">$99</span>' : '') +
          '<div class="deal-item-cover">' + cover + '</div>' +
          '<div class="deal-item-title">' + esc(deal.title) + '</div>' +
          (deal.author ? '<div class="deal-item-author">' + esc(deal.author) + '</div>' : '') +
          '<div class="deal-item-pricing">' +
            '<span class="deal-item-deal-price">$' + deal.dealPrice + '</span>' +
            (deal.originalPrice > 0 ? '<span class="deal-item-original-price">$' + deal.originalPrice + '</span>' : '') +
          '</div>' +
          '<a href="' + esc(deal.bookUrl) + '" class="deal-item-link" target="_blank" rel="noopener">' +
            '前往購買 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>' +
          '</a>' +
        '</article>';
      }).join('');

    } catch (err) {
      grid.innerHTML = '<p style="text-align:center;color:var(--status-error);padding:var(--space-xl);grid-column:1/-1">載入失敗：' + esc(err.message) + '</p>';
    }
  }

  // 當 tab 切到「每日好書」時才載入（延遲載入）
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
    // 如果 URL hash 直接開到 deals tab
    if (tabDeals.classList.contains('active')) {
      dealsLoaded = true;
      fetchReadmooDeals();
    }
  }
})();
