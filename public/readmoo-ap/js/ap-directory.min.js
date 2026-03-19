/**
 * AP 名冊模組
 * Google Sheets 讀取 + 顯示 + 搜尋 + 編輯
 */

let directoryEditMode = false;

function initDirectory(members) {
  const listEl = document.getElementById('directory-list');
  const loadingEl = document.getElementById('directory-loading');
  const searchEl = document.getElementById('directory-search');
  const countEl = document.getElementById('directory-count');
  const btnEdit = document.getElementById('btn-edit-directory');
  const btnExport = document.getElementById('btn-export-directory');

  function render(filter = '') {
    const filtered = filter
      ? AppState.members.filter(m =>
          m.name.toLowerCase().includes(filter.toLowerCase()) ||
          m.id.includes(filter))
      : AppState.members;

    countEl.textContent = `共 ${filtered.length} 人`;
    loadingEl.style.display = 'none';

    if (filtered.length === 0) {
      listEl.innerHTML = '<p class="empty-state">找不到符合的成員。</p>';
      return;
    }

    listEl.innerHTML = filtered.map((m, i) => `
      <div class="dir-item" data-id="${m.id}">
        <input type="checkbox" class="dir-select" data-id="${m.id}">
        <span class="dir-number">#${m.id}</span>
        <span class="dir-name">${escapeHtml(m.name)}</span>
        <a href="${escapeHtml(m.link)}" target="_blank" rel="noopener" class="dir-link"
           title="${escapeHtml(m.link)}">
          ${escapeHtml(shortenLink(m.link))}
        </a>
        ${directoryEditMode ? `
          <div class="dir-actions">
            <button class="btn-icon dir-edit-btn" data-id="${m.id}" title="編輯">
              <i data-lucide="pencil"></i>
            </button>
            <button class="btn-icon dir-delete-btn" data-id="${m.id}" title="刪除">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        ` : ''}
      </div>
    `).join('');

    if (window.lucide) lucide.createIcons();
    bindDirectoryEvents();
  }

  function bindDirectoryEvents() {
    // Edit buttons
    listEl.querySelectorAll('.dir-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const member = AppState.members.find(m => m.id === id);
        if (!member) return;

        const newName = prompt('修改暱稱：', member.name);
        if (newName === null) return;
        const newLink = prompt('修改 AP 連結：', member.link);
        if (newLink === null) return;

        editMember(id, newName.trim() || member.name, newLink.trim() || member.link);
      });
    });

    // Delete buttons
    listEl.querySelectorAll('.dir-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const member = AppState.members.find(m => m.id === id);
        if (!member) return;
        if (!confirm(`確定要刪除 ${member.name} 嗎？`)) return;
        deleteMember(id);
      });
    });
  }

  async function editMember(id, name, link) {
    const member = AppState.members.find(m => m.id === id);
    const oldName = member.name;

    if (CONFIG.APPS_SCRIPT_URL) {
      const result = await writeToSheet('edit', { id, name, link });
      if (result.success) {
        addChangelogEntry('edit', `編輯成員 #${id}：${oldName} → ${name}`);
        showToast('編輯成功');
        render(searchEl.value);
      }
    } else {
      // Local fallback
      member.name = name;
      member.link = link;
      localStorage.setItem(CONFIG.STORAGE_KEYS.AP_CACHE, JSON.stringify({
        data: AppState.members, time: Date.now()
      }));
      addChangelogEntry('edit', `編輯成員 #${id}：${oldName} → ${name}`);
      showToast('已在本機更新（Apps Script 未設定，無法同步到試算表）');
      render(searchEl.value);
    }
  }

  async function deleteMember(id) {
    const member = AppState.members.find(m => m.id === id);

    if (CONFIG.APPS_SCRIPT_URL) {
      const result = await writeToSheet('delete', { id });
      if (result.success) {
        addChangelogEntry('delete', `刪除成員 #${id}：${member.name}`);
        showToast('刪除成功');
        render(searchEl.value);
      }
    } else {
      AppState.members = AppState.members.filter(m => m.id !== id);
      localStorage.setItem(CONFIG.STORAGE_KEYS.AP_CACHE, JSON.stringify({
        data: AppState.members, time: Date.now()
      }));
      addChangelogEntry('delete', `刪除成員 #${id}：${member.name}`);
      showToast('已在本機刪除');
      render(searchEl.value);
    }
  }

  // Search
  searchEl.addEventListener('input', () => render(searchEl.value));

  // Edit mode toggle
  btnEdit.addEventListener('click', () => {
    requireAuth(() => {
      directoryEditMode = !directoryEditMode;
      btnEdit.innerHTML = directoryEditMode
        ? '<i data-lucide="check"></i> 完成編輯'
        : '<i data-lucide="edit"></i> 編輯名冊';
      if (window.lucide) lucide.createIcons();

      if (directoryEditMode) {
        // Add "新增成員" button
        showAddMemberPrompt();
      }
      render(searchEl.value);
    });
  });

  function showAddMemberPrompt() {
    // Insert add button at top if in edit mode
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-secondary btn-sm';
    addBtn.style.marginBottom = 'var(--space-md)';
    addBtn.innerHTML = '<i data-lucide="user-plus"></i> 新增成員';
    addBtn.addEventListener('click', async () => {
      const name = prompt('新成員暱稱：');
      if (!name || !name.trim()) return;
      const link = prompt('AP 連結（moo.im/a/...）：');
      if (!link || !link.trim()) return;

      // 用最大 ID + 1，避免重複
      const maxId = Math.max(0, ...AppState.members.map(m => parseInt(m.id) || 0));
      const nextId = String(maxId + 1);

      if (CONFIG.APPS_SCRIPT_URL) {
        const result = await writeToSheet('add', { id: nextId, name: name.trim(), link: link.trim() });
        if (result.success) {
          addChangelogEntry('add', `新增成員 #${nextId}：${name.trim()}`);
          showToast('新增成功');
          render(searchEl.value);
        }
      } else {
        AppState.members.push({ id: nextId, name: name.trim(), link: link.trim() });
        localStorage.setItem(CONFIG.STORAGE_KEYS.AP_CACHE, JSON.stringify({
          data: AppState.members, time: Date.now()
        }));
        addChangelogEntry('add', `新增成員：${name.trim()}`);
        showToast('已在本機新增');
        render(searchEl.value);
      }
    });

    const toolbar = document.querySelector('.directory-toolbar');
    const existing = toolbar.querySelector('.btn-add-member');
    if (existing) existing.remove();
    addBtn.classList.add('btn-add-member');
    toolbar.appendChild(addBtn);
    if (window.lucide) lucide.createIcons();
  }

  // Export
  btnExport.addEventListener('click', () => {
    const selected = Array.from(listEl.querySelectorAll('.dir-select:checked'))
      .map(cb => cb.dataset.id);
    openExportModal('directory', selected);
  });

  // === 修改我的資料（快捷入口） ===
  const btnSelfEdit = document.getElementById('btn-self-edit');
  if (btnSelfEdit) {
    btnSelfEdit.addEventListener('click', () => {
      requireAuth(() => {
        // 用目前登入身份找到自己
        const user = AppState.user;
        if (!user) {
          showToast('請先選擇你的身份');
          return;
        }
        const member = AppState.members.find(m => m.name === user.name || m.id === user.id);
        if (!member) {
          showToast('在名冊中找不到你，請確認身份');
          return;
        }

        const newName = prompt('修改暱稱：', member.name);
        if (newName === null) return;
        const newLink = prompt('修改 AP 連結：', member.link);
        if (newLink === null) return;

        const finalName = newName.trim() || member.name;
        const finalLink = newLink.trim() || member.link;

        if (finalName === member.name && finalLink === member.link) {
          showToast('沒有變更');
          return;
        }

        editMember(member.id, finalName, finalLink);
      });
    });
  }

  // Initial render
  render();
}

// ============ Helpers ============
function escapeHtml(str) {
  if (!str) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return str.replace(/[&<>"']/g, c => map[c]);
}

function shortenLink(url) {
  if (!url) return '';
  return url.replace(/^https?:\/\//, '').substring(0, 25) + (url.length > 32 ? '...' : '');
}

window.initDirectory = initDirectory;
