/**
 * AP 接龍核心模組
 * 選人 → 每人配一本書 → 複製書名 → 開 AP 連結
 */

function initChain() {
  const selectAllCb = document.getElementById('chain-select-all');
  const searchEl = document.getElementById('chain-search');
  const countEl = document.getElementById('chain-selected-count');
  const memberListEl = document.getElementById('chain-member-list');
  const btnStart = document.getElementById('btn-start-chain');
  const btnExit = document.getElementById('btn-exit-chain');
  const stepSelect = document.getElementById('chain-step-select');
  const stepActive = document.getElementById('chain-step-active');
  const queueEl = document.getElementById('chain-queue');
  const noBooksEl = document.getElementById('chain-no-books');
  const progressFill = document.getElementById('chain-progress-fill');
  const progressText = document.getElementById('chain-progress-text');

  let selectedIds = new Set();
  let chainQueue = [];
  let chainDone = new Set();
  // Map: memberId → bookId
  let chainBookMap = {};
  // Map: memberId → orderNumber（內嵌輸入）
  let chainOrderMap = {};
  // Map: memberId → purchaseDate（內嵌輸入）
  let chainDateMap = {};
  const todayStr = new Date().toISOString().split('T')[0];

  // Render member selection grid
  function renderMembers(filter = '') {
    const members = (filter
      ? AppState.members.filter(m => m.name.toLowerCase().includes(filter.toLowerCase()))
      : [...AppState.members]
    ).sort((a, b) => Number(a.id) - Number(b.id));

    memberListEl.innerHTML = members.map(m => `
      <label class="member-item ${selectedIds.has(m.id) ? 'selected' : ''}" data-id="${m.id}">
        <input type="checkbox" ${selectedIds.has(m.id) ? 'checked' : ''} data-id="${m.id}">
        <span>${escapeHtml(m.name)}</span>
      </label>
    `).join('');

    memberListEl.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) selectedIds.add(cb.dataset.id);
        else selectedIds.delete(cb.dataset.id);
        updateSelection();
      });
    });
  }

  function updateSelection() {
    countEl.textContent = `已選 ${selectedIds.size} 人`;
    btnStart.disabled = selectedIds.size === 0;
    selectAllCb.checked = selectedIds.size === AppState.members.length && AppState.members.length > 0;

    memberListEl.querySelectorAll('.member-item').forEach(item => {
      item.classList.toggle('selected', selectedIds.has(item.dataset.id));
    });
    // 同步 AP 紀錄橋接區的勾選狀態
    syncApLogBridgeChecks();
  }

  // ============ AP 紀錄橋接區 ============
  // 從 localStorage 讀 AP 紀錄，渲染兩個清單：待回禮 / 全部
  // 勾選後比對 AP 名冊，自動勾選對應的成員
  function getApLog() {
    try { return JSON.parse(localStorage.getItem('readmoo-ap-log') || '[]'); }
    catch (e) { return []; }
  }

  // 比對名冊找相似名字（完全相同 / 互相包含）
  function findMatchingMember(apFromName) {
    if (!AppState.members || AppState.members.length === 0) return null;
    const norm = (s) => (s || '').toLowerCase().trim();
    const target = norm(apFromName);
    if (!target) return null;
    // 完全相同優先
    let exact = AppState.members.find(m => norm(m.name) === target);
    if (exact) return exact;
    // 互相包含（例如 AP 紀錄「小魚」對名冊「小魚（Yu）」）
    let partial = AppState.members.find(m => {
      const mn = norm(m.name);
      return mn.includes(target) || target.includes(mn);
    });
    return partial || null;
  }

  function renderApLogBridge() {
    const bridgeEl = document.getElementById('chain-ap-log-bridge');
    if (!bridgeEl) return;
    const log = getApLog();

    if (log.length === 0) {
      bridgeEl.style.display = 'block';
      const allEl = document.getElementById('chain-ap-log-all');
      const allEmpty = document.getElementById('chain-ap-log-all-empty');
      const pendingEl = document.getElementById('chain-ap-log-pending');
      const pendingEmpty = document.getElementById('chain-ap-log-pending-empty');
      if (allEl) allEl.innerHTML = '';
      if (pendingEl) pendingEl.innerHTML = '';
      if (allEmpty) allEmpty.style.display = 'block';
      if (pendingEmpty) pendingEmpty.style.display = 'block';
      return;
    }

    bridgeEl.style.display = 'block';
    const pendingEl = document.getElementById('chain-ap-log-pending');
    const pendingEmpty = document.getElementById('chain-ap-log-pending-empty');
    const allEl = document.getElementById('chain-ap-log-all');
    const allEmpty = document.getElementById('chain-ap-log-all-empty');

    const pending = log.filter(r => !r.returned);

    function renderItem(r) {
      const matched = findMatchingMember(r.from);
      const isChecked = matched ? selectedIds.has(matched.id) : false;
      const matchHint = matched
        ? `<span class="chain-ap-log-match" title="會對應到名冊：${escapeHtml(matched.name)}"><i data-lucide="check"></i> ${escapeHtml(matched.name)}</span>`
        : `<span class="chain-ap-log-nomatch" title="名冊找不到此人，這次接龍不會包含"><i data-lucide="alert-circle"></i> 名冊查無</span>`;
      return `
        <label class="chain-ap-log-item ${isChecked ? 'selected' : ''} ${matched ? '' : 'unmatched'}" data-from="${escapeHtml(r.from)}">
          <input type="checkbox" class="chain-ap-log-check" data-from="${escapeHtml(r.from)}" ${matched ? '' : 'disabled'} ${isChecked ? 'checked' : ''}>
          <span class="chain-ap-log-name">${escapeHtml(r.from)}</span>
          <span class="chain-ap-log-meta">*${escapeHtml(r.code)} · ${escapeHtml(r.date || '')}</span>
          ${matchHint}
          ${r.returned ? '<span class="chain-ap-log-returned">已回禮</span>' : ''}
        </label>
      `;
    }

    if (pending.length === 0) {
      pendingEl.innerHTML = '';
      pendingEmpty.style.display = 'block';
    } else {
      pendingEmpty.style.display = 'none';
      pendingEl.innerHTML = pending.map(renderItem).join('');
    }

    allEmpty.style.display = 'none';
    allEl.innerHTML = log.map(renderItem).join('');

    if (window.lucide) lucide.createIcons();

    // 綁勾選事件
    bridgeEl.querySelectorAll('.chain-ap-log-check').forEach(cb => {
      cb.addEventListener('change', e => {
        const fromName = e.target.dataset.from;
        const matched = findMatchingMember(fromName);
        if (!matched) return;
        if (e.target.checked) selectedIds.add(matched.id);
        else selectedIds.delete(matched.id);
        renderMembers(searchEl.value);
        updateSelection();
      });
    });
  }

  function syncApLogBridgeChecks() {
    const bridgeEl = document.getElementById('chain-ap-log-bridge');
    if (!bridgeEl) return;
    bridgeEl.querySelectorAll('.chain-ap-log-check').forEach(cb => {
      const fromName = cb.dataset.from;
      const matched = findMatchingMember(fromName);
      if (!matched) return;
      const shouldCheck = selectedIds.has(matched.id);
      if (cb.checked !== shouldCheck) cb.checked = shouldCheck;
      const item = cb.closest('.chain-ap-log-item');
      if (item) item.classList.toggle('selected', shouldCheck);
    });
  }

  // Select all
  selectAllCb.addEventListener('change', () => {
    if (selectAllCb.checked) {
      AppState.members.forEach(m => selectedIds.add(m.id));
    } else {
      selectedIds.clear();
    }
    renderMembers(searchEl.value);
    updateSelection();
  });

  // Search
  searchEl.addEventListener('input', () => renderMembers(searchEl.value));

  // Start chain
  btnStart.addEventListener('click', () => {
    chainQueue = Array.from(selectedIds).map(id =>
      AppState.members.find(m => m.id === id)
    ).filter(Boolean);
    chainDone = new Set();
    chainBookMap = {};

    stepSelect.style.display = 'none';
    stepActive.style.display = 'block';
    renderChainActive();
  });

  // Exit chain
  btnExit.addEventListener('click', () => {
    if (chainDone.size < chainQueue.length) {
      if (!confirm('接龍尚未完成，確定要離開嗎？')) return;
    }
    stepSelect.style.display = 'block';
    stepActive.style.display = 'none';
  });

  // Render active chain
  function renderChainActive() {
    const allBooks = getBooks();
    // 顯示未購買的書 + 已在接龍中配對的書（即使已購買）
    const pairedBookIds = new Set(Object.values(chainBookMap));
    const books = allBooks.filter(b => b.status === 'want' || pairedBookIds.has(b.id));
    const total = chainQueue.length;
    const done = chainDone.size;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    progressFill.style.width = `${pct}%`;
    progressText.textContent = `${done} / ${total} 完成`;

    noBooksEl.style.display = books.length === 0 ? 'block' : 'none';

    queueEl.innerHTML = chainQueue.map((m, i) => {
      const isDone = chainDone.has(m.id);
      const selectedBookId = chainBookMap[m.id] || '';
      const selectedBook = books.find(b => b.id === selectedBookId);
      const orderVal = chainOrderMap[m.id] || '';

      const dateVal = chainDateMap[m.id] || todayStr;

      return `
        <div class="queue-card ${isDone ? 'done' : ''}">
          <div class="queue-card-header">
            <input type="checkbox" ${isDone ? 'checked' : ''} class="chain-done-cb" data-id="${m.id}"
                   style="accent-color: var(--color-sage);">
            <span class="queue-number">#${i + 1}</span>
            <span class="queue-name">${escapeHtml(m.name)}</span>
          </div>
          <div class="queue-card-body">
            <select class="input-field chain-book-select" data-member="${m.id}">
              <option value="">-- 選一本書 --</option>
              ${books.map(b => `<option value="${b.id}" ${b.id === selectedBookId ? 'selected' : ''}>${escapeHtml(b.title)}</option>`).join('')}
            </select>
            <button class="btn-icon chain-copy-btn" data-member="${m.id}" title="複製書名"
                    ${!selectedBook ? 'disabled' : ''}>
              <i data-lucide="copy"></i>
            </button>
            <a href="${escapeHtml(m.link)}" target="_blank" rel="noopener"
               class="btn-primary btn-sm btn-open-ap">
              <i data-lucide="external-link"></i> AP 連結
            </a>
          </div>
          <div class="queue-card-footer">
            <input type="date" class="input-field chain-date-input" data-member="${m.id}"
                   value="${dateVal}" style="width:140px;">
            <input type="text" class="input-field chain-order-input" data-member="${m.id}"
                   placeholder="訂單編號" value="${escapeHtml(orderVal)}"
                   style="width:120px; text-align:center;">
            <span class="queue-footer-hint">書名純紀錄，日期+訂單可產生 LINE 訊息</span>
          </div>
        </div>
      `;
    }).join('');

    // Bind events
    queueEl.querySelectorAll('.chain-done-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        const memberId = cb.dataset.id;
        if (cb.checked) {
          const bookId = chainBookMap[memberId];
          if (bookId) {
            // 直接標記書為已購買（不跳窗）
            const member = chainQueue.find(m => m.id === memberId);
            const orderVal = chainOrderMap[memberId] || '';
            const dateVal = chainDateMap[memberId] || todayStr;
            const allBooks = getBooks();
            const book = allBooks.find(b => b.id === bookId);
            if (book) {
              book.status = 'bought';
              book.purchaseDate = dateVal;
              book.purchaseVia = member ? member.name : '';
              book.orderNumber = orderVal;
              saveBooks(allBooks);
              document.dispatchEvent(new Event('books-updated'));
            }
          }
          chainDone.add(memberId);
          renderChainActive();
        } else {
          chainDone.delete(memberId);
          // 同時取消書的購買標記
          const bookId = chainBookMap[memberId];
          if (bookId) {
            const allBooks = getBooks();
            const book = allBooks.find(b => b.id === bookId);
            if (book && book.status === 'bought') {
              book.status = 'want';
              delete book.purchaseDate;
              delete book.purchaseVia;
              delete book.orderNumber;
              saveBooks(allBooks);
              document.dispatchEvent(new Event('books-updated'));
            }
          }
          renderChainActive();
        }
      });
    });

    queueEl.querySelectorAll('.chain-book-select').forEach(sel => {
      sel.addEventListener('change', () => {
        chainBookMap[sel.dataset.member] = sel.value;
        // Re-render to update copy button state
        renderChainActive();
      });
    });

    // 日期和訂單編號即時記住（不 re-render，避免失焦）
    queueEl.querySelectorAll('.chain-date-input').forEach(inp => {
      inp.addEventListener('change', () => {
        chainDateMap[inp.dataset.member] = inp.value;
      });
    });
    queueEl.querySelectorAll('.chain-order-input').forEach(inp => {
      inp.addEventListener('input', () => {
        chainOrderMap[inp.dataset.member] = inp.value.trim();
      });
    });

    queueEl.querySelectorAll('.chain-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const bookId = chainBookMap[btn.dataset.member];
        const book = books.find(b => b.id === bookId);
        if (book) copyToClipboard(book.title);
      });
    });

    if (window.lucide) lucide.createIcons();

    // 有完成的接龍時顯示「複製 LINE 訊息」按鈕
    const copyLineEl = document.getElementById('chain-copy-line');
    if (copyLineEl) {
      copyLineEl.style.display = done > 0 ? 'flex' : 'none';
    }
  }

  // 產生 LINE 訊息：同訂單合併，名字前加 @
  function generateLineMessage() {
    const allBooks = getBooks();
    // 收集已完成的接龍：memberId → book
    const doneItems = [];
    chainQueue.forEach(m => {
      if (!chainDone.has(m.id)) return;
      const bookId = chainBookMap[m.id];
      if (!bookId) return;
      const book = allBooks.find(b => b.id === bookId);
      if (!book) return;
      doneItems.push({
        name: m.name,
        orderNumber: book.orderNumber || ''
      });
    });

    // 按訂單編號分組
    const groups = {};
    doneItems.forEach(item => {
      const key = item.orderNumber || '(無編號)';
      if (!groups[key]) groups[key] = [];
      groups[key].push(item.name);
    });

    // 組合訊息
    const lines = ['AP正在飛往你的路上～'];
    let i = 1;
    Object.entries(groups).forEach(([orderNum, names]) => {
      const nameStr = names.map(n => `@${n}`).join(' ');
      if (orderNum === '(無編號)') {
        lines.push(`${i}. ${nameStr}`);
      } else {
        lines.push(`${i}. 訂單編號 ${orderNum} ${nameStr}`);
      }
      i++;
    });
    lines.push('請收～～');

    return lines.join('\n');
  }

  // 複製 LINE 訊息按鈕
  const btnCopyLine = document.getElementById('btn-copy-line-msg');
  if (btnCopyLine) {
    btnCopyLine.addEventListener('click', () => {
      const msg = generateLineMessage();
      copyToClipboard(msg);
    });
  }

  // Initial render
  renderMembers();
  updateSelection();
  renderApLogBridge();

  // 切到 AP 接龍分頁時，重新渲染（讓 AP 紀錄新增的人即時出現）
  document.addEventListener('tab-changed', (e) => {
    if (e.detail && e.detail.tab === 'chain') {
      renderApLogBridge();
    }
  });

  // 暴露給外部呼叫（從 ap-log.js 登記後可以觸發）
  window.refreshChainApLogBridge = renderApLogBridge;
}

// Copy helper
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(`已複製：${text}`);
  }).catch(() => {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(`已複製：${text}`);
  });
}

window.initChain = initChain;
window.copyToClipboard = copyToClipboard;
