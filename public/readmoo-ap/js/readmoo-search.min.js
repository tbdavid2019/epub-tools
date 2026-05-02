/**
 * 讀墨站內搜尋模組
 * 透過 Cloudflare Function 搜尋讀墨書庫，一鍵加入書單
 */

function initReadmooSearch() {
  const btnToggle = document.getElementById('btn-search-readmoo');
  const panel = document.getElementById('readmoo-search-panel');
  const input = document.getElementById('readmoo-search-input');
  const btnGo = document.getElementById('btn-readmoo-go');
  const statusEl = document.getElementById('readmoo-search-status');
  const resultsEl = document.getElementById('readmoo-search-results');

  let isOpen = false;
  let searching = false;

  // Toggle search panel
  btnToggle.addEventListener('click', () => {
    isOpen = !isOpen;
    panel.style.display = isOpen ? 'block' : 'none';
    if (isOpen) input.focus();
  });

  // 只在按 Enter 或點按鈕時搜尋（不自動搜尋，避免干擾中文輸入）
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      doSearch();
    }
  });

  btnGo.addEventListener('click', () => doSearch());

  // 貼讀墨網址 → 抓書
  const pasteInput = document.getElementById('paste-url-input');
  const pasteBtn = document.getElementById('btn-paste-url-go');
  const pasteStatus = document.getElementById('paste-url-status');
  const pasteResult = document.getElementById('paste-url-result');
  if (pasteBtn && pasteInput) {
    pasteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        fetchByUrl();
      }
    });
    pasteBtn.addEventListener('click', () => fetchByUrl());
  }

  async function fetchByUrl() {
    const raw = pasteInput.value.trim();
    if (!raw) { showToast('請貼網址或書本 ID'); return; }
    pasteStatus.style.display = 'block';
    pasteStatus.innerHTML = '<div class="spinner-sm"></div> 抓取中...';
    pasteResult.innerHTML = '';
    try {
      const res = await fetch(`/api/readmoo-book?url=${encodeURIComponent(raw)}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        pasteStatus.innerHTML = `<span class="search-error">${escapeHtml(data.error || ('HTTP ' + res.status))}</span>`;
        return;
      }
      pasteStatus.innerHTML = `已抓到「${escapeHtml(data.book.title)}」`;
      renderResultsTo(pasteResult, [data.book]);
    } catch (err) {
      pasteStatus.innerHTML = `<span class="search-error">抓取失敗：${escapeHtml(err.message)}</span>`;
    }
  }

  // 備用連結：輸入時同步更新「直接到讀墨搜尋」的 URL
  const directLink = document.getElementById('readmoo-direct-link');
  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (directLink) {
      directLink.href = q
        ? `https://readmoo.com/search/keyword?q=${encodeURIComponent(q)}`
        : 'https://readmoo.com/search/keyword';
    }
  });

  async function doSearch() {
    const query = input.value.trim();
    if (!query) {
      showToast('請輸入關鍵字');
      return;
    }
    if (searching) return; // 防止重複搜尋
    searching = true;

    statusEl.style.display = 'block';
    statusEl.innerHTML = '<div class="spinner-sm"></div> 正在搜尋讀墨...';
    resultsEl.innerHTML = '';

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const res = await fetch(`/api/readmoo-search?q=${encodeURIComponent(query)}`, {
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const cacheHit = res.headers.get('X-Cache') === 'HIT';
      const books = data.books;

      if (books.length === 0) {
        const q = encodeURIComponent(query);
        statusEl.innerHTML = `
          <div class="search-zero-result">
            <p>「${escapeHtml(query)}」沒找到。</p>
            <p class="search-zero-hint">讀墨自家搜尋有時候搜不全。可以到下面這些地方找找看，找到那本書時，<strong>把網址貼到下方「貼網址秒加」</strong>就好。</p>
            <div class="search-zero-actions">
              <a href="https://readmoo.com/search/keyword?q=${q}" target="_blank" rel="noopener" class="btn-secondary btn-sm">
                <i data-lucide="external-link"></i> 到讀墨搜尋
              </a>
              <a href="https://www.google.com/search?q=site%3Areadmoo.com+${q}" target="_blank" rel="noopener" class="btn-secondary btn-sm">
                <i data-lucide="external-link"></i> Google 搜讀墨
              </a>
              <a href="https://taiwan-ebook-lover.github.io/?q=${q}" target="_blank" rel="noopener" class="btn-secondary btn-sm">
                <i data-lucide="external-link"></i> 跨書城比價
              </a>
            </div>
          </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
      }

      statusEl.innerHTML = `「${escapeHtml(query)}」找到 ${books.length} 本${cacheHit ? ' <span class="cache-badge">快取</span>' : ''}`;
      renderResults(books);
    } catch (err) {
      const isTimeout = err.name === 'AbortError';
      let msg;
      if (isTimeout) {
        msg = '連線逾時，可能是網路環境（中華電信等）連線不穩。';
      } else if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        msg = '無法連線，可能是網路環境限制。';
      } else {
        msg = `搜尋失敗：${escapeHtml(err.message)}`;
      }
      const readmooUrl = `https://readmoo.com/search/keyword?q=${encodeURIComponent(query)}`;
      const errCode = isTimeout ? 'TIMEOUT' : err.message.includes('Failed to fetch') ? 'NETWORK' : err.message.substring(0, 30);
      statusEl.innerHTML = `
        <span class="search-error">${msg}</span>
        <div class="search-fallback">
          <p style="margin:8px 0 4px;font-size:13px;color:var(--color-muted);">搜尋替代方案：</p>
          <a href="${readmooUrl}" target="_blank" rel="noopener" class="btn-primary btn-sm">
            <i data-lucide="external-link"></i> 直接到讀墨搜尋
          </a>
          <button class="btn-secondary btn-sm" id="btn-retry-search">重試</button>
          <button class="btn-secondary btn-sm" id="btn-diagnose">診斷網路</button>
        </div>
        <div style="margin-top:6px;font-size:11px;color:var(--color-muted,#aaa);">錯誤代碼：${errCode}</div>`;
      if (window.lucide) lucide.createIcons();
      const retryBtn = document.getElementById('btn-retry-search');
      if (retryBtn) retryBtn.addEventListener('click', doSearch);
      const diagBtn = document.getElementById('btn-diagnose');
      if (diagBtn) diagBtn.addEventListener('click', runDiagnostics);
    } finally {
      searching = false;
    }
  }

  function renderResults(books) {
    renderResultsTo(resultsEl, books);
  }

  function renderResultsTo(targetEl, books) {
    const existingBooks = getBooks();
    const existingTitles = new Set(existingBooks.map(b => b.title.toLowerCase()));

    targetEl.innerHTML = books.map(book => {
      const alreadyAdded = existingTitles.has(book.title.toLowerCase());
      return `
        <div class="rm-result-card">
          <div class="rm-result-cover">
            ${book.cover
              ? `<img src="${escapeHtml(book.cover)}" alt="${escapeHtml(book.title)}" loading="lazy">`
              : '<div class="rm-no-cover"><i data-lucide="book"></i></div>'
            }
          </div>
          <div class="rm-result-info">
            <div class="rm-result-title">${escapeHtml(book.title)}</div>
            <div class="rm-result-meta">
              ${book.author ? escapeHtml(book.author) : ''}
              ${book.publisher ? ' · ' + escapeHtml(book.publisher) : ''}
            </div>
            <div class="rm-result-price">
              ${book.price ? `NT$ ${book.price}` : ''}
              ${book.pubdate ? ` · ${book.pubdate}` : ''}
            </div>
          </div>
          <div class="rm-result-actions">
            ${alreadyAdded
              ? '<span class="rm-already-added"><i data-lucide="check"></i> 已在書單</span>'
              : `<button class="btn-primary btn-sm rm-add-btn"
                   data-title="${escapeHtml(book.title)}"
                   data-author="${escapeHtml(book.author || '')}"
                   data-publisher="${escapeHtml(book.publisher || '')}"
                   data-price="${book.price || ''}"
                   data-cover="${escapeHtml(book.cover || '')}"
                   data-url="${escapeHtml(book.url || '')}"
                   data-pubdate="${escapeHtml(book.pubdate || '')}">
                  <i data-lucide="plus"></i> 加入書單
                </button>`
            }
            <a href="${escapeHtml(book.url)}" target="_blank" rel="noopener" class="btn-secondary btn-sm">
              <i data-lucide="external-link"></i>
            </a>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();
    bindAddButtons(targetEl);
  }

  function bindAddButtons(scopeEl) {
    (scopeEl || resultsEl).querySelectorAll('.rm-add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const books = getBooks();
        books.push({
          id: 'book_' + Date.now(),
          title: btn.dataset.title,
          author: btn.dataset.author,
          version: '電子書',
          pubdate: btn.dataset.pubdate || '',
          publisher: btn.dataset.publisher,
          price: btn.dataset.price,
          cover: btn.dataset.cover,
          readmooUrl: btn.dataset.url,
          status: 'want',
          createdAt: new Date().toISOString(),
        });
        saveBooks(books);

        btn.outerHTML = '<span class="rm-already-added"><i data-lucide="check"></i> 已在書單</span>';
        if (window.lucide) lucide.createIcons();
        showToast(`已加入書單：${btn.dataset.title}`);
        document.dispatchEvent(new Event('books-updated'));
      });
    });
  }
}

// ============ 診斷工具 ============
async function runDiagnostics() {
  const statusEl = document.getElementById('readmoo-search-status');
  if (!statusEl) return;

  statusEl.style.display = 'block';
  statusEl.innerHTML = '<div class="spinner-sm"></div> 正在診斷...';

  const diag = {};

  // 1. 版本
  const scripts = document.querySelectorAll('script[src*="app.min.js"]');
  const verMatch = scripts[0]?.src?.match(/\?v=(\w+)/);
  diag.version = verMatch ? verMatch[1] : '?';

  // 2. API 連線
  try {
    const t0 = Date.now();
    const res = await fetch('/api/readmoo-search?q=__ping__');
    diag.apiMs = Date.now() - t0;
    const data = await res.json();
    diag.apiOk = !!data.ok;
  } catch (e) {
    diag.apiOk = false;
    diag.apiErr = e.name === 'AbortError' ? 'TIMEOUT' : e.message.substring(0, 40);
  }

  // 3. 搜尋功能
  try {
    const t0 = Date.now();
    const res = await fetch('/api/readmoo-search?q=test');
    diag.searchMs = Date.now() - t0;
    if (res.ok) {
      const data = await res.json();
      diag.searchOk = true;
      diag.searchCount = data.count || 0;
    } else {
      diag.searchOk = false;
      diag.searchErr = `HTTP ${res.status}`;
    }
  } catch (e) {
    diag.searchOk = false;
    diag.searchErr = e.name === 'AbortError' ? 'TIMEOUT' : e.message.substring(0, 40);
  }

  // 4. 瀏覽器
  const ua = navigator.userAgent;
  const isLINE = ua.includes('Line/');
  const isFB = ua.includes('FBAN') || ua.includes('FBAV');
  if (isLINE) diag.browser = 'LINE 內建';
  else if (isFB) diag.browser = 'FB 內建';
  else if (ua.includes('Chrome')) diag.browser = 'Chrome';
  else if (ua.includes('Safari')) diag.browser = 'Safari';
  else if (ua.includes('Firefox')) diag.browser = 'Firefox';
  else diag.browser = '其他';

  // 5. 裝置
  diag.screen = `${screen.width}x${screen.height}`;
  diag.viewport = `${window.innerWidth}x${window.innerHeight}`;
  const uaPlatform = ua.match(/\(([^)]+)\)/);
  diag.os = uaPlatform ? uaPlatform[1].split(';')[0].trim() : '?';

  // 6. 網路
  const conn = navigator.connection || navigator.mozConnection;
  diag.net = conn ? `${conn.effectiveType || '?'}${conn.downlink ? ' / ' + conn.downlink + 'Mbps' : ''}` : '無法偵測';

  // 7. LocalStorage
  try {
    const testKey = '__diag_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    diag.storageOk = true;
    const books = typeof getBooks === 'function' ? getBooks() : [];
    diag.bookCount = books.length;
    diag.boughtCount = books.filter(b => b.status === 'bought').length;
    diag.wantCount = books.filter(b => b.status === 'want').length;
  } catch (e) {
    diag.storageOk = false;
  }

  // 8. 使用者身分
  diag.user = AppState?.user?.name || '(未選擇)';

  // 9. Clipboard API
  diag.clipboardOk = !!navigator.clipboard?.writeText;

  // ===== 白話文結論 =====
  let verdict = '';
  let verdictColor = '';
  const tips = [];

  if (diag.apiOk && diag.searchOk) {
    verdict = '連線正常，搜尋功能正常！';
    verdictColor = '#7BAE7F';
  } else if (diag.apiOk && !diag.searchOk) {
    verdict = '連線正常，但讀墨搜尋暫時有狀況。';
    verdictColor = '#D4A85A';
    tips.push('讀墨網站可能忙碌，稍後再試。');
  } else {
    verdict = '無法連線到搜尋服務。';
    verdictColor = '#C97070';
    if (isLINE) tips.push('LINE 內建瀏覽器可能受限 → 點右上角「...」→「用預設瀏覽器開啟」');
    else if (isFB) tips.push('FB 內建瀏覽器建議複製網址到 Chrome / Safari');
    else tips.push('可能是公司 WiFi 防火牆擋住了，試試手機行動網路。');
  }
  if (!diag.storageOk) tips.push('LocalStorage 無法使用！書單功能會失效，請檢查隱私模式或儲存空間。');
  if (isLINE || isFB) tips.push('內建瀏覽器可能導致功能異常，建議用 Chrome / Safari 開啟。');

  // ===== 組合純文字（給使用者複製回報用） =====
  const now = new Date().toLocaleString('zh-TW', { hour12: false });
  const plainLines = [
    `[診斷報告] ${now}`,
    `版本: ${diag.version}`,
    `結果: ${verdict}`,
    `API: ${diag.apiOk ? 'OK ' + diag.apiMs + 'ms' : 'FAIL ' + (diag.apiErr || '')}`,
    `搜尋: ${diag.searchOk ? 'OK ' + diag.searchCount + '本 ' + diag.searchMs + 'ms' : 'FAIL ' + (diag.searchErr || '')}`,
    `瀏覽器: ${diag.browser}`,
    `裝置: ${diag.os} | 螢幕 ${diag.screen} | 視窗 ${diag.viewport}`,
    `網路: ${diag.net}`,
    `儲存: ${diag.storageOk ? 'OK' : 'FAIL'} | 書單 ${diag.bookCount || 0} 本（想買 ${diag.wantCount || 0} / 已買 ${diag.boughtCount || 0}）`,
    `身分: ${diag.user}`,
    `剪貼簿: ${diag.clipboardOk ? 'OK' : '不支援'}`,
  ];
  const plainText = plainLines.join('\n');

  // ===== 渲染 =====
  const ok = (t) => `<span style="color:#7BAE7F">&#10003;</span> ${t}`;
  const fail = (t) => `<span style="color:#C97070">&#10007;</span> ${t}`;
  const info = (t) => `<span style="color:#888">&#9679;</span> ${t}`;

  statusEl.innerHTML = `
    <div style="text-align:left; font-size:13px; line-height:1.8;">
      <div style="font-size:15px; font-weight:400; margin-bottom:6px; color:${verdictColor};">
        ${verdict}
      </div>
      <div style="color:var(--color-muted, #888); font-size:12px;">
        ${diag.apiOk ? ok('伺服器連線 OK（' + diag.apiMs + 'ms）') : fail('伺服器無法連線' + (diag.apiErr ? '：' + diag.apiErr : ''))}<br>
        ${diag.searchOk ? ok('搜尋功能 OK（' + diag.searchCount + ' 本 / ' + diag.searchMs + 'ms）') : fail('搜尋功能異常' + (diag.searchErr ? '：' + diag.searchErr : ''))}<br>
        ${info('瀏覽器：' + diag.browser + '｜' + diag.os)}<br>
        ${info('螢幕：' + diag.screen + '｜視窗：' + diag.viewport)}<br>
        ${info('網路：' + diag.net)}<br>
        ${diag.storageOk ? ok('儲存 OK｜書單 ' + (diag.bookCount || 0) + ' 本') : fail('儲存異常（LocalStorage 無法使用）')}<br>
        ${info('身分：' + diag.user + '｜版本：' + diag.version)}
      </div>
      ${tips.length > 0 ? '<div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--color-border, #eee);"><strong style="font-size:12px;">建議</strong><br>' + tips.map(t => '<span style="font-size:13px;">&#8226; ' + t + '</span>').join('<br>') + '</div>' : ''}
      <div style="margin-top:8px; text-align:right;">
        <button id="btn-copy-diag" class="btn-secondary btn-sm" style="font-size:11px; padding:4px 10px;">
          <i data-lucide="copy" style="width:12px;height:12px;"></i> 複製診斷結果
        </button>
      </div>
    </div>`;

  if (window.lucide) lucide.createIcons();
  const copyBtn = document.getElementById('btn-copy-diag');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => copyToClipboard(plainText));
  }
}

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('readmoo-search-panel')) {
    initReadmooSearch();
  }
});

document.addEventListener('books-updated', () => {
  if (window._booksRender) window._booksRender();
});

window.initReadmooSearch = initReadmooSearch;
window.runDiagnostics = runDiagnostics;
