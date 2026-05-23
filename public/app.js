// ── Auth guard ─────────────────────────────────────────
const token = localStorage.getItem('crm_token');
const me = JSON.parse(localStorage.getItem('crm_user') || 'null');
if (!token || !me) { location.href = '/login.html'; throw 0; }

const isAdmin = me.role === 'admin';
const API = '/api';

// ── Animation Helpers ──────────────────────────────────
function addStaggerAnimation(elements, delay = 50) {
  elements.forEach((el, i) => {
    el.style.animation = `slideInUp 0.5s ease ${i * delay}ms both`;
  });
}

function animateCounter(element, target, duration = 1000) {
  const increment = target / (duration / 16);
  let current = 0;
  const interval = setInterval(() => {
    current += increment;
    if (current >= target) {
      element.textContent = target;
      clearInterval(interval);
    } else {
      element.textContent = Math.floor(current);
    }
  }, 16);
}

function apiFetch(url, opts = {}) {
  return fetch(API + url, {
    ...opts,
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', ...(opts.headers || {}) }
  }).then(async r => {
    if (r.status === 401) { localStorage.clear(); location.href = '/login.html'; throw 0; }
    return r;
  });
}

// ── Bootstrap UI ───────────────────────────────────────
document.getElementById('user-chip').innerHTML =
  `<strong>${esc(me.username)}</strong><span class="role-chip ${me.role}">${me.role}</span>`;

if (isAdmin) {
  document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
}

document.getElementById('btn-logout').addEventListener('click', () => {
  localStorage.clear();
  location.href = '/login.html';
});

// ── Toast ──────────────────────────────────────────────
const toastContainer = document.createElement('div');
toastContainer.className = 'toast-container';
document.body.appendChild(toastContainer);

function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  toastContainer.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── Navigation ─────────────────────────────────────────
let allClients = [], currentClientId = null;

document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

function switchView(name) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  if (name === 'dashboard') loadDashboard();
  if (name === 'clients')   loadClients();
  if (name === 'followups') loadUpcoming();
  if (name === 'meetings')  loadMeetings();
  if (name === 'users')     loadUsers();
  if (name === 'settings')  loadSettings();
}

// ── Dashboard ──────────────────────────────────────────
async function loadDashboard() {
  const [clients, today] = await Promise.all([
    apiFetch('/clients').then(r => r.json()),
    apiFetch('/followups/today').then(r => r.json()),
  ]);

  const totalRemarks = clients.reduce((a,c) => a + (c.remark_count||0), 0);

  document.getElementById('stats-row').innerHTML = `
    <div class="stat-card"><div class="stat-label">Total Clients</div><div class="stat-value">${clients.length}</div></div>
    <div class="stat-card"><div class="stat-label">Today's Follow-ups</div><div class="stat-value red">${today.length}</div></div>
    <div class="stat-card"><div class="stat-label">Total Remarks</div><div class="stat-value">${totalRemarks}</div></div>
  `;

  // Animate stat cards
  setTimeout(() => {
    const statCards = document.querySelectorAll('.stat-card');
    addStaggerAnimation(statCards, 100);
  }, 50);

  const badge = document.getElementById('today-badge');
  badge.textContent = today.length;
  if (today.length > 0) {
    console.log('Today followups, sample:', today[0]);
    console.log('Available properties:', Object.keys(today[0]));
  }

  const list = document.getElementById('today-list');
  list.innerHTML = today.length === 0
    ? '<div class="empty-state">No follow-ups scheduled for today.</div>'
    : today.map(r => `
        <div class="followup-card today">
          <div style="flex:1">
            <div class="fc-name">${esc(r.client_name)}</div>
            <div class="fc-remark">${esc(r.remark)}</div>
            <div style="font-size:.8rem;color:var(--muted);margin-top:4px">${esc(r.number)}${r.email ? ' · '+esc(r.email) : ''}</div>
          </div>
          <div class="fc-date-time">
            <div style="font-size:.75rem;color:var(--muted);margin-bottom:4px">TODAY</div>
            <div style="font-weight:600;font-size:.95rem;color:var(--primary)">${r.follow_up_time ? r.follow_up_time.substring(0,5) : '09:00'}</div>
          </div>
          <button class="btn btn-sm btn-danger" onclick="deleteFollowup(${r.id}, 'loadDashboard')">Delete</button>
        </div>`).join('');

  // Animate follow-up cards
  setTimeout(() => {
    const followupCards = list.querySelectorAll('.followup-card');
    addStaggerAnimation(followupCards, 80);
  }, 150);

  // Load remarks dashboard
  loadRemarksDashboard();
}

// ── Remarks Dashboard ──────────────────────────────────
let allRemarks = [];

async function loadRemarksDashboard() {
  try {
    const remarks = await apiFetch('/remarks').then(r => r.json());

    // Get current IST time
    const now = new Date();
    const istTime = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);

    // Categorize remarks by status
    const categorized = remarks.map(r => {
      const followupDateTime = new Date(r.follow_up_date + ' ' + (r.follow_up_time || '09:00'));
      const istFollowupTime = new Date(followupDateTime.getTime() + 5.5 * 60 * 60 * 1000);

      let status = 'upcoming';
      const diffMinutes = (istFollowupTime - istTime) / (1000 * 60);

      if (diffMinutes < 0) {
        status = 'overdue';
      } else if (diffMinutes < 24 * 60) {
        const today = istTime.toLocaleDateString('en-IN', {year: 'numeric', month: '2-digit', day: '2-digit'}).split('/').reverse().join('-');
        const followupDay = istFollowupTime.toLocaleDateString('en-IN', {year: 'numeric', month: '2-digit', day: '2-digit'}).split('/').reverse().join('-');
        if (today === followupDay) {
          status = 'today';
        }
      }

      return {
        ...r,
        status,
        followupTime: istFollowupTime,
        diffMinutes
      };
    }).sort((a, b) => a.followupTime - b.followupTime);

    allRemarks = categorized;
    renderRemarksDashboard(categorized, 'all');
  } catch (e) {
    console.error('Failed to load remarks:', e);
  }
}

function renderRemarksDashboard(remarks, filter = 'all') {
  const dashboard = document.getElementById('remarks-dashboard');

  // Count remarks by status to enable/disable buttons
  const statusCounts = {
    all: remarks.length,
    today: remarks.filter(r => r.status === 'today').length,
    upcoming: remarks.filter(r => r.status === 'upcoming').length,
    overdue: remarks.filter(r => r.status === 'overdue').length
  };

  // Update filter button states
  document.querySelectorAll('.filter-btn').forEach(btn => {
    const filterType = btn.dataset.filter;
    const hasRemarks = statusCounts[filterType] > 0;
    btn.disabled = !hasRemarks;
    btn.title = hasRemarks ? '' : `No ${filterType} remarks`;
  });

  // Filter remarks by selected filter
  let filtered = remarks;
  if (filter !== 'all') {
    filtered = remarks.filter(r => r.status === filter);
  }

  if (filtered.length === 0) {
    dashboard.innerHTML = `
      <div class="empty-remarks-state">
        <p>📭 No remarks ${filter !== 'all' ? 'in this category' : 'yet'}.</p>
      </div>
    `;
    return;
  }

  // Group by status
  const groups = {};
  const statusOrder = ['overdue', 'today', 'upcoming'];
  statusOrder.forEach(status => {
    groups[status] = filtered.filter(r => r.status === status);
  });

  let html = '';

  Object.keys(groups).forEach(status => {
    const group = groups[status];
    if (group.length === 0) return;

    const statusTitles = {
      'overdue': '🔴 Overdue',
      'today': '🟠 Today',
      'upcoming': '🔵 Upcoming'
    };

    html += `<div class="remarks-group">
      <div class="remarks-group-title">${statusTitles[status]}</div>
    `;

    html += group.map(r => {
      const timeStr = r.follow_up_time ? r.follow_up_time.substring(0, 5) : '09:00';
      let timeDisplay = '';

      if (r.status === 'overdue') {
        const daysOverdue = Math.floor(Math.abs(r.diffMinutes) / (24 * 60));
        timeDisplay = `${daysOverdue}d overdue`;
      } else if (r.status === 'today') {
        const hoursLeft = Math.floor(r.diffMinutes / 60);
        const minutesLeft = Math.floor(r.diffMinutes % 60);
        if (hoursLeft > 0) {
          timeDisplay = `${hoursLeft}h ${minutesLeft}m left`;
        } else {
          timeDisplay = `${minutesLeft}m left`;
        }
      } else {
        const daysUntil = Math.floor(r.diffMinutes / (24 * 60));
        if (daysUntil === 0) {
          timeDisplay = 'Today';
        } else if (daysUntil === 1) {
          timeDisplay = 'Tomorrow';
        } else {
          timeDisplay = `${daysUntil}d away`;
        }
      }

      return `
        <div class="remark-card ${r.status}">
          <div class="remark-content">
            <div class="remark-header">
              <div class="remark-client-name" title="${esc(r.client_name)}">${esc(r.client_name)}</div>
              <span class="remark-status-badge ${r.status}">${r.status}</span>
            </div>
            <div class="remark-text" title="${esc(r.remark)}">${esc(r.remark)}</div>
            <div class="remark-meta">
              <span class="remark-date">${r.follow_up_date}</span>
              <span class="remark-time">⏰ ${timeStr}</span>
              <span style="margin-left: auto; font-weight: 500;">${timeDisplay}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    html += `</div>`;
  });

  dashboard.innerHTML = html;
}

// Filter button listeners
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    renderRemarksDashboard(allRemarks, e.target.dataset.filter);
  });
});

// ── Clients ────────────────────────────────────────────
let selectedClients = new Set();

async function loadClients() {
  const clients = await apiFetch('/clients').then(r => r.json());
  allClients = clients;
  selectedClients.clear();
  renderTable(clients);
  updateClientBulkToolbar();
}

function renderTable(clients) {
  const tbody = document.getElementById('client-tbody');
  if (!clients.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No clients yet.</td></tr>';
    return;
  }
  tbody.innerHTML = clients.map(c => {
    const isSelected = selectedClients.has(c.id);
    return `
    <tr class="client-row ${isSelected ? 'selected' : ''}" data-client-id="${c.id}">
      <td><input type="checkbox" class="client-checkbox" data-id="${c.id}" ${isSelected ? 'checked' : ''}/></td>
      <td title="${esc(c.name)}">${esc(c.name)}</td>
      <td>${esc(c.number)}</td>
      <td title="${esc(c.email)}">${esc(c.email)}</td>
      <td>${esc(c.location)}</td>
      <td>
        <div class="assigned-cell">
          ${c.assigned_user ? `<span class="badge">${esc(c.assigned_user)}</span>` : '<span style="color:var(--muted);font-size:.85rem">Unassigned</span>'}
          ${isAdmin ? `<button class="btn btn-xs" onclick="openAssignModal(${c.id})" style="margin-left:4px">Assign</button>` : ''}
        </div>
      </td>
      <td><span class="badge">${c.remark_count||0}</span></td>
      <td>
        <div class="action-btns">
          <button class="btn btn-sm btn-secondary" onclick="openDetail(${c.id})">View</button>
          <button class="btn btn-sm btn-primary" onclick="openEdit(${c.id})">Edit</button>
          ${isAdmin ? `<button class="btn btn-sm btn-danger" onclick="deleteClient(${c.id})">Del</button>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');

  // Attach checkbox event listeners
  document.querySelectorAll('.client-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', handleClientCheckboxChange);
  });
}

function handleClientCheckboxChange(e) {
  const id = parseInt(e.target.dataset.id);
  const row = document.querySelector(`[data-client-id="${id}"]`);

  if (e.target.checked) {
    selectedClients.add(id);
    row.classList.add('selected');
  } else {
    selectedClients.delete(id);
    row.classList.remove('selected');
  }

  updateClientBulkToolbar();
}

function updateClientBulkToolbar() {
  const toolbar = document.getElementById('bulk-delete-toolbar-clients');
  const countEl = document.getElementById('selection-count-clients');
  const selectAllCheckbox = document.getElementById('select-all-clients');
  const tableSelectAllCheckbox = document.getElementById('select-all-clients-table');
  const tbody = document.getElementById('client-tbody');
  const allCheckboxes = tbody.querySelectorAll('.client-checkbox');

  const count = selectedClients.size;
  countEl.textContent = `${count} selected`;

  // Show/hide toolbar
  toolbar.style.display = count > 0 ? 'flex' : 'none';

  // Update select all checkbox state
  const allChecked = allCheckboxes.length > 0 && selectedClients.size === allCheckboxes.length;
  selectAllCheckbox.checked = allChecked;
  tableSelectAllCheckbox.checked = allChecked;
}

async function deleteSelectedClients() {
  if (selectedClients.size === 0) {
    toast('No clients selected', 'error');
    return;
  }

  if (!confirm(`Delete ${selectedClients.size} client(s) and all their remarks?`)) return;

  try {
    const ids = Array.from(selectedClients);
    let successCount = 0;
    let errorCount = 0;

    for (const id of ids) {
      try {
        const res = await apiFetch(`/clients/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok && data.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (e) {
        errorCount++;
      }
    }

    if (successCount > 0) {
      toast(`Deleted ${successCount} client(s)`, 'success');
    }
    if (errorCount > 0) {
      toast(`Failed to delete ${errorCount} client(s)`, 'error');
    }

    selectedClients.clear();
    loadClients();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
    console.error('Bulk delete error:', e);
  }
}

document.getElementById('search-input').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  renderTable(allClients.filter(c =>
    [c.name, c.number, c.email, c.location, c.budget].some(v => (v||'').toLowerCase().includes(q))
  ));
});

// ── Bulk Delete Listeners (Clients) ────────────────────
document.getElementById('select-all-clients')?.addEventListener('change', (e) => {
  const tbody = document.getElementById('client-tbody');
  const allCheckboxes = tbody.querySelectorAll('.client-checkbox');

  if (e.target.checked) {
    allCheckboxes.forEach(checkbox => {
      checkbox.checked = true;
      selectedClients.add(parseInt(checkbox.dataset.id));
      const row = document.querySelector(`[data-client-id="${checkbox.dataset.id}"]`);
      row?.classList.add('selected');
    });
  } else {
    allCheckboxes.forEach(checkbox => {
      checkbox.checked = false;
      selectedClients.delete(parseInt(checkbox.dataset.id));
      const row = document.querySelector(`[data-client-id="${checkbox.dataset.id}"]`);
      row?.classList.remove('selected');
    });
  }

  updateClientBulkToolbar();
});

document.getElementById('select-all-clients-table')?.addEventListener('change', (e) => {
  const tbody = document.getElementById('client-tbody');
  const allCheckboxes = tbody.querySelectorAll('.client-checkbox');

  if (e.target.checked) {
    allCheckboxes.forEach(checkbox => {
      checkbox.checked = true;
      selectedClients.add(parseInt(checkbox.dataset.id));
      const row = document.querySelector(`[data-client-id="${checkbox.dataset.id}"]`);
      row?.classList.add('selected');
    });
  } else {
    allCheckboxes.forEach(checkbox => {
      checkbox.checked = false;
      selectedClients.delete(parseInt(checkbox.dataset.id));
      const row = document.querySelector(`[data-client-id="${checkbox.dataset.id}"]`);
      row?.classList.remove('selected');
    });
  }

  updateClientBulkToolbar();
});

document.getElementById('btn-delete-selected-clients')?.addEventListener('click', deleteSelectedClients);

async function deleteClient(id) {
  if (!confirm('Delete this client and all their remarks?')) return;
  await apiFetch(`/clients/${id}`, { method: 'DELETE' });
  toast('Client deleted', 'error');
  loadClients();
  loadDashboard();
}

// ── Add / Edit Client Modal ────────────────────────────
const clientModal = document.getElementById('client-modal');
let allUsers = [];

async function loadAndSetupUsers() {
  try {
    allUsers = await apiFetch('/auth/users').then(r => r.json());
    const select = document.getElementById('f-assigned-to');
    select.innerHTML = '<option value="">Unassigned</option>' +
      allUsers.filter(u => u.role === 'executive').map(u =>
        `<option value="${u.id}">${esc(u.username)}</option>`
      ).join('');
  } catch (e) {
    console.error('Failed to load users:', e);
  }
}

document.getElementById('btn-add-client').addEventListener('click', async () => {
  document.getElementById('modal-title').textContent = 'Add Client';
  document.getElementById('client-form').reset();
  document.getElementById('client-id').value = '';
  document.getElementById('assign-field').style.display = isAdmin ? 'flex' : 'none';
  document.getElementById('remark-dates').style.display = 'grid';
  await loadAndSetupUsers();
  clientModal.classList.add('open');
});

function openEdit(id) {
  const c = allClients.find(x => x.id === id);
  if (!c) return;
  document.getElementById('modal-title').textContent = 'Edit Client';
  document.getElementById('client-id').value = c.id;
  document.getElementById('f-name').value = c.name;
  document.getElementById('f-number').value = c.number;
  document.getElementById('f-email').value = c.email;
  document.getElementById('f-location').value = c.location;
  document.getElementById('f-initial-remark').value = '';
  document.getElementById('f-followup-date').value = '';
  document.getElementById('f-followup-time').value = '09:00';
  document.getElementById('assign-field').style.display = isAdmin ? 'flex' : 'none';
  document.getElementById('remark-dates').style.display = 'none';

  if (isAdmin) {
    document.getElementById('f-assigned-to').value = c.assigned_to || '';
  }

  clientModal.classList.add('open');
}

const closeClientModal = () => clientModal.classList.remove('open');
document.getElementById('close-client-modal').addEventListener('click', closeClientModal);
document.getElementById('cancel-client').addEventListener('click', closeClientModal);
clientModal.addEventListener('click', e => { if (e.target === clientModal) closeClientModal(); });

// ── Form Validation Helpers ───────────────────────────
function validatePhoneFormat(phone) {
  return /^\d+$/.test(phone);
}

function validateEmailFormat(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

document.getElementById('client-form').addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('client-id').value;
  const name = document.getElementById('f-name').value.trim();
  const number = document.getElementById('f-number').value.trim();
  const email = document.getElementById('f-email').value.trim();
  const location = document.getElementById('f-location').value.trim();

  // Validation
  if (!name) {
    toast('Name is required', 'error');
    return;
  }
  if (!number) {
    toast('Phone number is required', 'error');
    return;
  }
  if (!validatePhoneFormat(number)) {
    toast('Phone number must contain only digits', 'error');
    return;
  }
  // Email is optional, but validate format if provided
  if (email && !validateEmailFormat(email)) {
    toast('Email format is invalid (e.g., user@example.com)', 'error');
    return;
  }
  if (!location) {
    toast('Location is required', 'error');
    return;
  }

  const body = {
    name,
    number,
    email,
    location,
  };

  if (isAdmin) {
    const assignTo = document.getElementById('f-assigned-to').value;
    body.assigned_to = assignTo ? parseInt(assignTo) : null;
  }

  // Add remarks for new clients only
  if (!id) {
    const remark = document.getElementById('f-initial-remark').value.trim();
    if (remark) {
      body.initial_remark = remark;
      body.follow_up_date = document.getElementById('f-followup-date').value || null;
      body.follow_up_time = document.getElementById('f-followup-time').value || '09:00';
    }
  }

  if (id) {
    await apiFetch(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    toast('Client updated', 'success');
  } else {
    await apiFetch('/clients', { method: 'POST', body: JSON.stringify(body) });
    toast('Client added', 'success');
  }
  closeClientModal();
  loadClients();
  loadDashboard();
});

// ── Assign Client Modal ────────────────────────────────
const assignModal = document.getElementById('assign-modal');

async function openAssignModal(clientId) {
  document.getElementById('assign-client-id').value = clientId;

  // Load executives for the select
  const executives = allUsers.filter(u => u.role === 'executive');
  const select = document.getElementById('assign-user-select');
  select.innerHTML = '<option value="">Select an executive...</option>' +
    executives.map(u => `<option value="${u.id}">${esc(u.username)}</option>`).join('');

  assignModal.classList.add('open');
}

const closeAssignModal = () => assignModal.classList.remove('open');
document.getElementById('close-assign-modal')?.addEventListener('click', closeAssignModal);
document.getElementById('cancel-assign')?.addEventListener('click', closeAssignModal);
assignModal?.addEventListener('click', e => { if (e.target === assignModal) closeAssignModal(); });

document.getElementById('assign-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const clientId = document.getElementById('assign-client-id').value;
  const assignedTo = document.getElementById('assign-user-select').value;

  if (!assignedTo) {
    toast('Please select an executive', 'error');
    return;
  }

  try {
    const res = await apiFetch(`/clients/${clientId}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ assigned_to: parseInt(assignedTo) })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      toast('Failed to assign client', 'error');
      return;
    }
    toast('Client assigned', 'success');
    closeAssignModal();
    loadClients();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
    console.error('Assign error:', e);
  }
});

// ── Detail / Remarks Modal ─────────────────────────────
const detailModal = document.getElementById('detail-modal');

async function openDetail(id) {
  currentClientId = id;
  const data = await apiFetch(`/clients/${id}`).then(r => r.json());
  document.getElementById('detail-name').textContent = data.name;
  document.getElementById('detail-info').innerHTML = `
    <span class="di-label">Phone</span><span>${esc(data.number)}</span>
    <span class="di-label">Email</span><span>${esc(data.email)}</span>
    <span class="di-label">Location</span><span>${esc(data.location)}</span>
    <span class="di-label">Assigned To</span><span>${data.assigned_user ? esc(data.assigned_user) : 'Unassigned'}</span>
    <span class="di-label">Added</span><span>${new Date(data.created_at).toLocaleDateString()}</span>
  `;
  renderRemarks(data.remarks);
  detailModal.classList.add('open');
}

function renderRemarks(remarks) {
  const list = document.getElementById('remarks-list');
  if (!remarks?.length) {
    list.innerHTML = '<div class="empty-state" style="padding:12px">No remarks yet.</div>';
    return;
  }
  list.innerHTML = remarks.map(r => `
    <div class="remark-item">
      <div style="flex:1">
        <div class="ri-text">${esc(r.remark)}</div>
        <div style="font-size:.78rem;color:var(--muted);margin-top:3px">${new Date(r.created_at).toLocaleString()}</div>
      </div>
      ${r.follow_up_date ? `<div class="ri-date">
        <div style="font-size:.75rem;margin-bottom:2px">Follow-up</div>
        ${r.follow_up_date}<br/>
        ${r.follow_up_time ? r.follow_up_time.substring(0,5) : '09:00'}
      </div>` : ''}
      <button class="ri-del" onclick="deleteRemark(${r.id})" title="Delete">&#x2715;</button>
    </div>`).join('');
}

async function deleteRemark(id) {
  await apiFetch(`/remarks/${id}`, { method: 'DELETE' });
  openDetail(currentClientId);
}

document.getElementById('remark-form').addEventListener('submit', async e => {
  e.preventDefault();
  const remark = document.getElementById('remark-text').value.trim();
  const follow_up_date = document.getElementById('remark-date').value;
  const follow_up_time = document.getElementById('remark-time').value;
  if (!remark) return;
  await apiFetch(`/clients/${currentClientId}/remarks`, {
    method: 'POST', body: JSON.stringify({ remark, follow_up_date, follow_up_time })
  });
  document.getElementById('remark-text').value = '';
  document.getElementById('remark-date').value = '';
  document.getElementById('remark-time').value = '09:00';
  toast('Remark added', 'success');
  openDetail(currentClientId);
  loadDashboard();
});

const closeDetailModal = () => detailModal.classList.remove('open');
document.getElementById('close-detail-modal').addEventListener('click', closeDetailModal);
detailModal.addEventListener('click', e => { if (e.target === detailModal) closeDetailModal(); });

// ── File Upload ────────────────────────────────────────
const fileInput = document.getElementById('file-input');
document.getElementById('btn-upload')?.addEventListener('click', () => fileInput.click());
fileInput?.addEventListener('change', async () => {
  if (!fileInput.files[0]) return;
  const fd = new FormData();
  fd.append('file', fileInput.files[0]);
  const res = await fetch(API + '/upload', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd
  }).then(r => r.json());
  fileInput.value = '';

  if (res.error) {
    toast('Import failed: ' + res.error, 'error');
    return;
  }

  // Show detailed results
  if (res.imported > 0) {
    toast(`✓ Imported ${res.imported} client(s) & ${res.remarks || 0} follow-up(s)`, 'success');
  }

  // Show validation errors if any
  if (res.errors && res.errors.length > 0) {
    const errorMsg = res.errors.slice(0, 5).join('\n');
    const moreText = res.errors.length > 5 ? `\n... and ${res.errors.length - 5} more errors` : '';
    toast(`⚠ ${res.errorCount} row(s) failed validation:\n${errorMsg}${moreText}`, 'error');
    console.error('Upload validation errors:', res.errors);
  }

  if (res.imported > 0) {
    loadClients();
    loadDashboard();
    loadUpcoming();
  }
});

// ── Follow-ups ─────────────────────────────────────────
let allUpcomingFollowups = [];
let selectedFollowups = new Set();

async function loadUpcoming() {
  const rows = await apiFetch('/followups/upcoming').then(r => r.json());
  allUpcomingFollowups = rows;
  selectedFollowups.clear();
  renderFilteredFollowups(rows);
  updateBulkToolbar();
}

function renderFilteredFollowups(rows) {
  if (rows.length > 0) {
    console.log('Rendering followups, sample data:', rows[0]);
    console.log('Available properties:', Object.keys(rows[0]));
  }
  const dateFrom = document.getElementById('filter-date-from')?.value || '';
  const dateTo = document.getElementById('filter-date-to')?.value || '';

  let filtered = rows;

  if (dateFrom || dateTo) {
    filtered = rows.filter(r => {
      const rDate = r.follow_up_date?.split('T')[0] || '';
      if (dateFrom && rDate < dateFrom) return false;
      if (dateTo && rDate > dateTo) return false;
      return true;
    });
  }

  const list = document.getElementById('upcoming-list');
  const today = new Date().toISOString().split('T')[0];
  list.innerHTML = filtered.length === 0
    ? '<div class="empty-state">No follow-ups found.</div>'
    : filtered.map(r => {
        const rDate = r.follow_up_date?.split('T')[0] || '';
        const timeStr = r.follow_up_time ? r.follow_up_time.substring(0, 5) : '09:00';
        const isSelected = selectedFollowups.has(r.id);
        return `
        <div class="followup-card ${rDate === today ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-followup-id="${r.id}">
          <div class="followup-card-with-checkbox">
            <input type="checkbox" class="followup-checkbox" data-id="${r.id}" ${isSelected ? 'checked' : ''}/>
            <div class="followup-card-content">
              <div class="fc-name">${esc(r.client_name)}</div>
              <div class="fc-remark">${esc(r.remark)}</div>
              <div style="font-size:.8rem;color:var(--muted);margin-top:4px">${esc(r.number)}${r.email?' · '+esc(r.email):''}</div>
            </div>
          </div>
          <div class="fc-date-time">
            <div style="font-size:.8rem;color:var(--muted);margin-bottom:4px">${rDate}</div>
            <div style="font-weight:600;font-size:.95rem;color:var(--primary)">${timeStr}</div>
          </div>
          <button class="btn btn-sm btn-danger" onclick="deleteFollowup(${r.id}, 'loadUpcoming')">Delete</button>
        </div>`;
      }).join('');

  // Attach checkbox event listeners
  document.querySelectorAll('.followup-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', handleFollowupCheckboxChange);
  });
}

function handleFollowupCheckboxChange(e) {
  const id = parseInt(e.target.dataset.id);
  const card = document.querySelector(`[data-followup-id="${id}"]`);

  if (e.target.checked) {
    selectedFollowups.add(id);
    card.classList.add('selected');
  } else {
    selectedFollowups.delete(id);
    card.classList.remove('selected');
  }

  updateBulkToolbar();
}

function updateBulkToolbar() {
  const toolbar = document.getElementById('bulk-delete-toolbar');
  const countEl = document.getElementById('selection-count');
  const selectAllCheckbox = document.getElementById('select-all-followups');
  const list = document.getElementById('upcoming-list');
  const allCheckboxes = list.querySelectorAll('.followup-checkbox');

  const count = selectedFollowups.size;
  countEl.textContent = `${count} selected`;

  // Show/hide toolbar
  toolbar.style.display = count > 0 ? 'flex' : 'none';

  // Update select all checkbox state
  selectAllCheckbox.checked = allCheckboxes.length > 0 && selectedFollowups.size === allCheckboxes.length;
}

async function deleteSelectedFollowups() {
  if (selectedFollowups.size === 0) {
    toast('No follow-ups selected', 'error');
    return;
  }

  if (!confirm(`Delete ${selectedFollowups.size} follow-up(s)?`)) return;

  try {
    const ids = Array.from(selectedFollowups);
    let successCount = 0;
    let errorCount = 0;

    for (const id of ids) {
      try {
        const res = await apiFetch(`/remarks/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok && data.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (e) {
        errorCount++;
      }
    }

    if (successCount > 0) {
      toast(`Deleted ${successCount} follow-up(s)`, 'success');
    }
    if (errorCount > 0) {
      toast(`Failed to delete ${errorCount} follow-up(s)`, 'error');
    }

    selectedFollowups.clear();
    loadUpcoming();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
    console.error('Bulk delete error:', e);
  }
}

// ── Users (admin only) ─────────────────────────────────
// ── Account Management ────────────────────────────────
let selectedUsers = new Set();

async function loadUsers() {
  try {
    const users = await apiFetch('/auth/users').then(r => r.json());
    selectedUsers.clear();
    renderUsersTable(users);
    updateUserBulkToolbar();
  } catch (e) {
    toast('Failed to load users', 'error');
  }
}

function formatDateIST(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  const istTime = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  const dateStr_fmt = istTime.toLocaleDateString('en-IN', {year: 'numeric', month: '2-digit', day: '2-digit'});
  const timeStr = istTime.toLocaleTimeString('en-IN', {hour: '2-digit', minute: '2-digit'});
  return `${dateStr_fmt} ${timeStr}`;
}

function renderUsersTable(users) {
  const tbody = document.getElementById('user-tbody');
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No team members yet.</td></tr>';
    return;
  }
  tbody.innerHTML = users.map(u => {
    const isSelected = selectedUsers.has(u.id);
    const isCurrentUser = u.id === me.id;
    const isActive = u.is_active !== false;
    const displayName = u.full_name || u.username;
    const nameWithStatus = `${esc(displayName)}${isCurrentUser ? ' <span style="color:var(--muted);font-size:.8rem">(You)</span>' : ''}`;
    return `
    <tr class="user-row ${isSelected ? 'selected' : ''} ${!isActive ? 'inactive' : ''}" data-user-id="${u.id}">
      <td><input type="checkbox" class="user-checkbox" data-id="${u.id}" ${isSelected ? 'checked' : ''}/></td>
      <td title="${esc(displayName)}">${nameWithStatus}</td>
      <td title="${esc(u.email)}">${esc(u.email || '—')}</td>
      <td><span class="role-chip ${u.role}">${u.role}</span></td>
      <td><span class="user-status ${isActive ? 'status-active' : 'status-inactive'}">${isActive ? 'Active' : 'Inactive'}</span></td>
      <td>${new Date(u.created_at).toLocaleDateString('en-IN')}</td>
      <td style="font-size:.85rem;color:var(--muted)">${formatDateIST(u.last_login) === '—' ? 'Never' : formatDateIST(u.last_login)}</td>
      <td>
        <div class="action-btns" style="gap: 4px;">
          ${!isCurrentUser ? `
            <button class="btn btn-sm btn-secondary" onclick="openEditUserModal(${u.id})">Edit</button>
            <button class="btn btn-sm btn-primary" onclick="openPasswordResetModal(${u.id})">Reset</button>
            <button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})">Del</button>
          ` : '<span style="color:var(--muted);font-size:.8rem">Current user</span>'}
        </div>
      </td>
    </tr>`;
  }).join('');

  // Attach checkbox event listeners
  document.querySelectorAll('.user-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', handleUserCheckboxChange);
  });
}

function handleUserCheckboxChange(e) {
  const id = parseInt(e.target.dataset.id);
  const row = document.querySelector(`[data-user-id="${id}"]`);

  if (e.target.checked) {
    selectedUsers.add(id);
    row.classList.add('selected');
  } else {
    selectedUsers.delete(id);
    row.classList.remove('selected');
  }

  updateUserBulkToolbar();
}

function updateUserBulkToolbar() {
  const toolbar = document.getElementById('bulk-delete-toolbar-users');
  const countEl = document.getElementById('selection-count-users');
  const selectAllCheckbox = document.getElementById('select-all-users');
  const tableSelectAllCheckbox = document.getElementById('select-all-users-table');
  const tbody = document.getElementById('user-tbody');
  const allCheckboxes = tbody.querySelectorAll('.user-checkbox');

  const count = selectedUsers.size;
  countEl.textContent = `${count} selected`;
  toolbar.style.display = count > 0 ? 'flex' : 'none';

  const allChecked = allCheckboxes.length > 0 && selectedUsers.size === allCheckboxes.length;
  selectAllCheckbox.checked = allChecked;
  tableSelectAllCheckbox.checked = allChecked;
}

async function openEditUserModal(userId) {
  try {
    const user = await apiFetch(`/auth/users/${userId}`).then(r => r.json());

    // Account Information
    document.getElementById('edit-user-id').value = user.id;
    document.getElementById('eu-username').value = user.username;
    document.getElementById('eu-email').value = user.email || '';
    document.getElementById('eu-role').value = user.role;
    document.getElementById('eu-status-badge').textContent = user.is_active ? 'Active' : 'Inactive';
    document.getElementById('eu-status-badge').className = `user-status ${user.is_active ? 'status-active' : 'status-inactive'}`;

    // Personal Information
    document.getElementById('eu-full-name').value = user.full_name || '';
    document.getElementById('eu-phone').value = user.phone || '';
    document.getElementById('eu-dob').value = user.date_of_birth || '';
    document.getElementById('eu-bio').value = user.bio || '';

    // Professional Information
    document.getElementById('eu-position').value = user.position || '';
    document.getElementById('eu-department').value = user.department || '';
    document.getElementById('eu-joining-date').value = user.joining_date || '';

    // Address
    document.getElementById('eu-address').value = user.address || '';
    document.getElementById('eu-city').value = user.city || '';
    document.getElementById('eu-state').value = user.state || '';
    document.getElementById('eu-postal-code').value = user.postal_code || '';
    document.getElementById('eu-country').value = user.country || '';

    // Emergency Contact
    document.getElementById('eu-emergency-contact').value = user.emergency_contact || '';
    document.getElementById('eu-emergency-phone').value = user.emergency_phone || '';

    document.getElementById('user-edit-modal').classList.add('open');
  } catch (e) {
    toast('Failed to load user details', 'error');
  }
}

async function submitEditUser(e) {
  e.preventDefault();
  const userId = parseInt(document.getElementById('edit-user-id').value);
  const username = document.getElementById('eu-username').value.trim();
  const email = document.getElementById('eu-email').value.trim();
  const role = document.getElementById('eu-role').value;

  if (!username) {
    toast('Username is required', 'error');
    return;
  }

  // Collect all personal data
  const userData = {
    username,
    email,
    role,
    full_name: document.getElementById('eu-full-name').value.trim() || null,
    phone: document.getElementById('eu-phone').value.trim() || null,
    date_of_birth: document.getElementById('eu-dob').value || null,
    bio: document.getElementById('eu-bio').value.trim() || null,
    position: document.getElementById('eu-position').value.trim() || null,
    department: document.getElementById('eu-department').value.trim() || null,
    joining_date: document.getElementById('eu-joining-date').value || null,
    address: document.getElementById('eu-address').value.trim() || null,
    city: document.getElementById('eu-city').value.trim() || null,
    state: document.getElementById('eu-state').value.trim() || null,
    postal_code: document.getElementById('eu-postal-code').value.trim() || null,
    country: document.getElementById('eu-country').value.trim() || null,
    emergency_contact: document.getElementById('eu-emergency-contact').value.trim() || null,
    emergency_phone: document.getElementById('eu-emergency-phone').value.trim() || null
  };

  try {
    const res = await apiFetch(`/auth/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(userData)
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || 'Failed to update user', 'error');
      return;
    }
    toast('Executive profile updated successfully', 'success');
    document.getElementById('user-edit-modal').classList.remove('open');
    loadUsers();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function openPasswordResetModal(userId) {
  try {
    const user = await apiFetch(`/auth/users/${userId}`).then(r => r.json());
    document.getElementById('reset-user-id').value = user.id;
    document.getElementById('pr-username').value = user.username;
    document.getElementById('pr-password').value = '';
    document.getElementById('pr-confirm-password').value = '';
    document.getElementById('password-reset-modal').classList.add('open');
    document.getElementById('pr-password').focus();
  } catch (e) {
    toast('Failed to load user', 'error');
  }
}

function generatePassword(length = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

async function submitPasswordReset(e) {
  e.preventDefault();
  const userId = parseInt(document.getElementById('reset-user-id').value);
  const password = document.getElementById('pr-password').value;
  const confirmPassword = document.getElementById('pr-confirm-password').value;

  if (!password || password.length < 8) {
    toast('Password must be at least 8 characters', 'error');
    return;
  }
  if (password !== confirmPassword) {
    toast('Passwords do not match', 'error');
    return;
  }

  try {
    const res = await apiFetch(`/auth/users/${userId}/password`, {
      method: 'PUT',
      body: JSON.stringify({ password })
    });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || 'Failed to reset password', 'error');
      return;
    }
    toast('Password reset successfully', 'success');
    document.getElementById('password-reset-modal').classList.remove('open');
    loadUsers();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function deleteUser(id) {
  if (!confirm('Remove this team member permanently?')) return;
  try {
    const res = await apiFetch(`/auth/users/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      toast(data.error || 'Failed to delete user', 'error');
      return;
    }
    toast('Member removed', 'error');
    loadUsers();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function deleteSelectedUsers() {
  if (selectedUsers.size === 0) {
    toast('No users selected', 'error');
    return;
  }
  if (!confirm(`Delete ${selectedUsers.size} user(s)? This cannot be undone.`)) return;

  try {
    const ids = Array.from(selectedUsers);
    let successCount = 0;
    let errorCount = 0;

    for (const id of ids) {
      try {
        const res = await apiFetch(`/auth/users/${id}`, { method: 'DELETE' });
        if (res.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (e) {
        errorCount++;
      }
    }

    if (successCount > 0) {
      toast(`Deleted ${successCount} user(s)`, 'success');
    }
    if (errorCount > 0) {
      toast(`Failed to delete ${errorCount} user(s)`, 'error');
    }

    selectedUsers.clear();
    loadUsers();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function disableSelectedUsers() {
  if (selectedUsers.size === 0) {
    toast('No users selected', 'error');
    return;
  }

  try {
    let successCount = 0;
    for (const id of selectedUsers) {
      try {
        const res = await apiFetch(`/auth/users/${id}/status`, { method: 'PUT' });
        if (res.ok) successCount++;
      } catch (e) {}
    }
    toast(`Disabled ${successCount} user(s)`, 'success');
    selectedUsers.clear();
    loadUsers();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function enableSelectedUsers() {
  if (selectedUsers.size === 0) {
    toast('No users selected', 'error');
    return;
  }

  try {
    let successCount = 0;
    for (const id of selectedUsers) {
      try {
        const res = await apiFetch(`/auth/users/${id}/status`, { method: 'PUT' });
        if (res.ok) successCount++;
      } catch (e) {}
    }
    toast(`Enabled ${successCount} user(s)`, 'success');
    selectedUsers.clear();
    loadUsers();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
}

async function deleteFollowup(id, refreshFunc) {
  if (!confirm('Delete this follow-up?')) return;
  try {
    console.log('Deleting follow-up with ID:', id);
    const url = `/remarks/${id}`;
    console.log('API URL:', url);

    const res = await apiFetch(url, { method: 'DELETE' });
    console.log('Response status:', res.status, 'OK:', res.ok);
    console.log('Response headers:', res.headers);

    const text = await res.text();
    console.log('Response text:', text.substring(0, 200));

    let data = {};
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('Failed to parse JSON:', e);
    }

    if (!res.ok || !data.ok) {
      toast('Failed to delete (Status: ' + res.status + ')', 'error');
      return;
    }

    toast('Follow-up deleted', 'success');
    if (refreshFunc === 'loadDashboard') loadDashboard();
    if (refreshFunc === 'loadUpcoming') loadUpcoming();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
    console.error('Delete error:', e);
  }
}

const userModal = document.getElementById('user-modal');
document.getElementById('btn-add-user')?.addEventListener('click', () => {
  document.getElementById('user-form').reset();
  userModal.classList.add('open');
});
const closeUserModal = () => userModal.classList.remove('open');
document.getElementById('close-user-modal')?.addEventListener('click', closeUserModal);
document.getElementById('cancel-user')?.addEventListener('click', closeUserModal);
userModal?.addEventListener('click', e => { if (e.target === userModal) closeUserModal(); });

document.getElementById('user-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const body = {
    username: document.getElementById('u-username').value.trim(),
    email: document.getElementById('u-email').value.trim() || null,
    password: document.getElementById('u-password').value,
    role: document.getElementById('u-role').value,
  };
  const res = await apiFetch('/auth/users', { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { toast(data.error, 'error'); return; }
  toast('Member created' + (body.email ? ' with email notifications enabled' : ''), 'success');
  closeUserModal();
  loadUsers();
});

// ── Edit User Modal ────────────────────────────────────
const editUserModal = document.getElementById('user-edit-modal');
const closeEditUserModal = () => editUserModal.classList.remove('open');
document.getElementById('close-edit-user-modal')?.addEventListener('click', closeEditUserModal);
document.getElementById('cancel-edit-user')?.addEventListener('click', closeEditUserModal);
editUserModal?.addEventListener('click', e => { if (e.target === editUserModal) closeEditUserModal(); });

document.getElementById('btn-toggle-status')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const badge = document.getElementById('eu-status-badge');
  const isActive = badge.textContent === 'Active';
  badge.textContent = isActive ? 'Inactive' : 'Active';
  badge.className = `user-status ${isActive ? 'status-inactive' : 'status-active'}`;
});

document.getElementById('user-edit-form')?.addEventListener('submit', submitEditUser);

// ── Password Reset Modal ──────────────────────────────
const passwordResetModal = document.getElementById('password-reset-modal');
const closePasswordResetModal = () => passwordResetModal.classList.remove('open');
document.getElementById('close-reset-password-modal')?.addEventListener('click', closePasswordResetModal);
document.getElementById('cancel-reset-password')?.addEventListener('click', closePasswordResetModal);
passwordResetModal?.addEventListener('click', e => { if (e.target === passwordResetModal) closePasswordResetModal(); });

document.getElementById('btn-generate-password')?.addEventListener('click', (e) => {
  e.preventDefault();
  const password = generatePassword(12);
  document.getElementById('pr-password').value = password;
  document.getElementById('pr-confirm-password').value = password;
});

document.getElementById('password-reset-form')?.addEventListener('submit', submitPasswordReset);

// ── Bulk Actions (Users) ───────────────────────────────
document.getElementById('select-all-users')?.addEventListener('change', (e) => {
  const tbody = document.getElementById('user-tbody');
  const allCheckboxes = tbody.querySelectorAll('.user-checkbox');

  if (e.target.checked) {
    allCheckboxes.forEach(checkbox => {
      checkbox.checked = true;
      selectedUsers.add(parseInt(checkbox.dataset.id));
      const row = document.querySelector(`[data-user-id="${checkbox.dataset.id}"]`);
      row?.classList.add('selected');
    });
  } else {
    allCheckboxes.forEach(checkbox => {
      checkbox.checked = false;
      selectedUsers.delete(parseInt(checkbox.dataset.id));
      const row = document.querySelector(`[data-user-id="${checkbox.dataset.id}"]`);
      row?.classList.remove('selected');
    });
  }

  updateUserBulkToolbar();
});

document.getElementById('select-all-users-table')?.addEventListener('change', (e) => {
  const tbody = document.getElementById('user-tbody');
  const allCheckboxes = tbody.querySelectorAll('.user-checkbox');

  if (e.target.checked) {
    allCheckboxes.forEach(checkbox => {
      checkbox.checked = true;
      selectedUsers.add(parseInt(checkbox.dataset.id));
      const row = document.querySelector(`[data-user-id="${checkbox.dataset.id}"]`);
      row?.classList.add('selected');
    });
  } else {
    allCheckboxes.forEach(checkbox => {
      checkbox.checked = false;
      selectedUsers.delete(parseInt(checkbox.dataset.id));
      const row = document.querySelector(`[data-user-id="${checkbox.dataset.id}"]`);
      row?.classList.remove('selected');
    });
  }

  updateUserBulkToolbar();
});

document.getElementById('btn-disable-selected-users')?.addEventListener('click', disableSelectedUsers);
document.getElementById('btn-enable-selected-users')?.addEventListener('click', enableSelectedUsers);
document.getElementById('btn-delete-selected-users')?.addEventListener('click', deleteSelectedUsers);

// ── 5-Minute Reminder Pop-up ───────────────────────────
const reminderPopup = document.getElementById('reminder-popup');
document.getElementById('close-reminder')?.addEventListener('click', closeReminderPopup);
document.getElementById('snooze-reminder')?.addEventListener('click', snoozeReminder);
document.getElementById('view-client-reminder')?.addEventListener('click', viewClientFromReminder);
reminderPopup?.addEventListener('click', e => { if (e.target === reminderPopup) closeReminderPopup(); });

// ── Notifications System ──────────────────────────────
async function fetchNotifications() {
  try {
    const notifs = await apiFetch('/notifications').then(r => r.json());
    updateNotificationUI(notifs);
    return notifs;
  } catch (e) {
    console.error('Failed to fetch notifications:', e);
    return [];
  }
}

// Play notification sound
function playNotificationSound() {
  try {
    // Create a simple beep sound using Web Audio API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800; // Frequency in Hz
    oscillator.type = 'sine'; // Sine wave

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (e) {
    console.log('Audio context not available');
  }
}

// Multi-level Reminder Pop-up System (15, 10, 5, 3 minutes)
function showReminderPopup(clientName, followupTime, remark, remarkId, minutesBefore) {
  const overlay = document.getElementById('reminder-popup');
  const modalContent = document.getElementById('reminder-modal-content');
  if (!overlay || !modalContent) return;

  // Update popup content
  document.getElementById('reminder-client').textContent = clientName;
  document.getElementById('reminder-time').textContent = followupTime;
  document.getElementById('reminder-remark').textContent = remark || '(No remark)';
  document.getElementById('reminder-time-display').textContent = minutesBefore + ' minutes remaining';

  // Update styling based on timing
  modalContent.className = 'modal reminder-modal';
  let urgencyMsg = '';

  if (minutesBefore >= 15) {
    modalContent.classList.add('reminder-15min');
    document.getElementById('reminder-title').textContent = 'Upcoming Follow-up';
    urgencyMsg = 'You have some time to prepare';
  } else if (minutesBefore >= 10) {
    modalContent.classList.add('reminder-10min');
    document.getElementById('reminder-title').textContent = 'Follow-up Coming Soon';
    urgencyMsg = 'Start wrapping up current tasks';
  } else if (minutesBefore >= 5) {
    modalContent.classList.add('reminder-5min');
    document.getElementById('reminder-title').textContent = 'Follow-up Soon!';
    urgencyMsg = 'Get ready, it\'s coming very soon';
  } else {
    modalContent.classList.add('reminder-3min');
    document.getElementById('reminder-title').textContent = '⚠️ URGENT: Follow-up Now!';
    urgencyMsg = 'IMMEDIATE ACTION REQUIRED - Follow-up is about to start!';
  }

  document.getElementById('reminder-urgency-msg').textContent = urgencyMsg;

  // Show popup with animation
  overlay.classList.add('open');

  // Store current reminder ID for snooze functionality
  sessionStorage.setItem('current_reminder_id', remarkId);

  // Auto-dismiss after different times based on urgency
  let autoDismissTime = 30000; // Default 30 seconds
  if (minutesBefore <= 3) {
    autoDismissTime = 60000; // 60 seconds for critical
  } else if (minutesBefore <= 5) {
    autoDismissTime = 45000; // 45 seconds for urgent
  }

  const autoDismissTimeout = setTimeout(() => {
    if (overlay.classList.contains('open')) {
      closeReminderPopup();
    }
  }, autoDismissTime);

  sessionStorage.setItem(`reminder_timeout_${remarkId}`, autoDismissTimeout.toString());
}

function closeReminderPopup() {
  const overlay = document.getElementById('reminder-popup');
  if (overlay) {
    overlay.classList.remove('open');
  }
}

function snoozeReminder() {
  const remarkId = sessionStorage.getItem('current_reminder_id');
  if (remarkId) {
    // Mark as snoozed so it won't show again for 5 minutes
    sessionStorage.setItem(`reminder_snoozed_${remarkId}`, (Date.now() + 5 * 60 * 1000).toString());
    closeReminderPopup();
    toast('Reminder snoozed for 5 minutes', 'success');
  }
}

function viewClientFromReminder() {
  closeReminderPopup();
  // Navigate to Clients view
  switchView('clients');
}

// Update page title and badge with follow-up count
function updatePageBadge(count) {
  const baseTitle = 'CRM Dashboard - Lead Management System';
  if (count > 0) {
    document.title = `(${count}) ${baseTitle}`;
    // Visual feedback: add a subtle animation to the favicon area
    document.body.style.borderTop = '3px solid #dc2626';
  } else {
    document.title = baseTitle;
    document.body.style.borderTop = 'none';
  }
}

function updateNotificationUI(notifs) {
  if (!notifs || notifs.length === 0) return;

  // Show recent notifications in a panel
  const panel = document.getElementById('notification-panel');
  if (panel) {
    const html = notifs.slice(0, 5).map(n => `
      <div class="notification-item">
        <div class="notif-client">${esc(n.client_name)}</div>
        <div class="notif-time">${n.minutes_before}min before</div>
        <div class="notif-msg">${esc(n.message)}</div>
      </div>
    `).join('');
    panel.innerHTML = html || '<div class="empty-state">No recent notifications</div>';
  }

  // Play sound for urgent notifications (3 and 5 minutes)
  const urgentNotifs = notifs.filter(n => n.minutes_before <= 5);
  if (urgentNotifs.length > 0) {
    // Play sound only once per minute
    const lastSoundTime = sessionStorage.getItem('last_sound_time');
    const now = Date.now();
    if (!lastSoundTime || (now - parseInt(lastSoundTime)) > 30000) {
      playNotificationSound();
      sessionStorage.setItem('last_sound_time', now.toString());
    }
  }

  // Update page title and badge with notification count
  const upcomingCount = notifs.filter(n => n.minutes_before >= 3).length;
  updatePageBadge(upcomingCount);

  // Show reminder pop-ups for all timings (15, 10, 5, 3 minutes)
  const reminderTimings = [15, 10, 5, 3];
  reminderTimings.forEach(mins => {
    const reminderNotifs = notifs.filter(n => n.minutes_before === mins);
    if (reminderNotifs.length > 0) {
      const notif = reminderNotifs[0];
      const reminderKey = `reminder_shown_${mins}_${notif.remark_id}`;
      const snoozedUntil = sessionStorage.getItem(`reminder_snoozed_${notif.remark_id}`);
      const now = Date.now();

      // Check if reminder should be shown
      if (!sessionStorage.getItem(reminderKey) && (!snoozedUntil || parseInt(snoozedUntil) < now)) {
        // Extract time from message or use follow-up time
        const timeMatch = notif.message.match(/(\d{1,2}:\d{2})/);
        const followupTime = timeMatch ? timeMatch[1] : 'Soon';

        showReminderPopup(
          notif.client_name,
          followupTime,
          notif.message,
          notif.remark_id,
          mins
        );

        sessionStorage.setItem(reminderKey, 'true');
      }
    }
  });

  // Also send browser notifications for critical ones (3 min before)
  const criticalNotifs = notifs.filter(n => n.minutes_before === 3);
  if (criticalNotifs.length > 0 && 'Notification' in window && Notification.permission === 'granted') {
    criticalNotifs.forEach(n => {
      if (!sessionStorage.getItem(`notif_shown_${n.remark_id}`)) {
        new Notification(`⏰ ${n.minutes_before} minutes before follow-up`, {
          body: `${n.client_name}: ${n.message}`,
          tag: `followup_${n.remark_id}_${n.minutes_before}`,
          requireInteraction: false
        });
        sessionStorage.setItem(`notif_shown_${n.remark_id}`, 'true');
      }
    });
  }
}

async function setupNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') await Notification.requestPermission();

  // Fetch and display notifications
  await fetchNotifications();
}

// ── Follow-up Filtering ────────────────────────────────
document.getElementById('filter-date-from')?.addEventListener('change', () => {
  renderFilteredFollowups(allUpcomingFollowups);
});
document.getElementById('filter-date-to')?.addEventListener('change', () => {
  renderFilteredFollowups(allUpcomingFollowups);
});
document.getElementById('btn-clear-filter')?.addEventListener('click', () => {
  document.getElementById('filter-date-from').value = '';
  document.getElementById('filter-date-to').value = '';
  renderFilteredFollowups(allUpcomingFollowups);
});

// ── Bulk Delete Listeners ──────────────────────────────
document.getElementById('select-all-followups')?.addEventListener('change', (e) => {
  const list = document.getElementById('upcoming-list');
  const allCheckboxes = list.querySelectorAll('.followup-checkbox');

  if (e.target.checked) {
    allCheckboxes.forEach(checkbox => {
      checkbox.checked = true;
      selectedFollowups.add(parseInt(checkbox.dataset.id));
      const card = document.querySelector(`[data-followup-id="${checkbox.dataset.id}"]`);
      card?.classList.add('selected');
    });
  } else {
    allCheckboxes.forEach(checkbox => {
      checkbox.checked = false;
      selectedFollowups.delete(parseInt(checkbox.dataset.id));
      const card = document.querySelector(`[data-followup-id="${checkbox.dataset.id}"]`);
      card?.classList.remove('selected');
    });
  }

  updateBulkToolbar();
});

document.getElementById('btn-delete-selected')?.addEventListener('click', deleteSelectedFollowups);

// ── Meetings ───────────────────────────────────────────
let allMeetings = [];

async function loadMeetings() {
  try {
    const res = await apiFetch('/meetings');
    if (!res.ok) throw new Error(res.statusText);
    const meetings = await res.json();
    allMeetings = meetings;
    renderMeetings(meetings);

    // Setup filter
    const filterEl = document.getElementById('filter-meeting-date');
    if (filterEl) {
      filterEl.addEventListener('change', (e) => {
        const selectedDate = e.target.value;
        if (selectedDate) {
          const filtered = meetings.filter(m => m.meeting_date === selectedDate);
          renderMeetings(filtered);
        } else {
          renderMeetings(meetings);
        }
      });
    }
  } catch (e) {
    console.error('Error loading meetings:', e);
    toast('Failed to load meetings', 'error');
  }
}

function renderMeetings(meetings) {
  const container = document.getElementById('meetings-container');

  if (meetings.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>📅 No scheduled meetings</p></div>';
    return;
  }

  const html = meetings.map(m => {
    const meetingDate = new Date(m.meeting_date);
    const now = new Date();
    const isPast = meetingDate < now;
    const isToday = meetingDate.toDateString() === now.toDateString();

    let statusClass = 'upcoming';
    let statusIcon = '🔵';
    if (isPast && m.status !== 'completed') {
      statusClass = 'overdue';
      statusIcon = '🔴';
    } else if (isToday) {
      statusClass = 'today';
      statusIcon = '🟠';
    }

    return `
      <div class="meeting-card ${statusClass}">
        <div class="meeting-header">
          <div class="meeting-title">
            <span class="status-icon">${statusIcon}</span>
            <h3>${esc(m.title)}</h3>
          </div>
          <div class="meeting-actions">
            <button class="btn btn-sm btn-secondary" onclick="editMeeting(${m.id})">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="deleteMeeting(${m.id})">Delete</button>
          </div>
        </div>
        <div class="meeting-details">
          <div class="detail-row">
            <span class="label">📅 Date:</span>
            <span class="value">${formatDateIST(m.meeting_date)}</span>
          </div>
          <div class="detail-row">
            <span class="label">⏰ Time:</span>
            <span class="value">${m.meeting_time.substring(0, 5)} (${m.duration} min)</span>
          </div>
          <div class="detail-row">
            <span class="label">👤 Client:</span>
            <span class="value">${esc(m.client_name || 'Unassigned')}</span>
          </div>
          <div class="detail-row">
            <span class="label">👔 Executive:</span>
            <span class="value">${esc(m.executive_name || 'Unassigned')}</span>
          </div>
          ${m.location ? `<div class="detail-row">
            <span class="label">📍 Location:</span>
            <span class="value">${esc(m.location)}</span>
          </div>` : ''}
          ${m.description ? `<div class="detail-row">
            <span class="label">📝 Notes:</span>
            <span class="value">${esc(m.description)}</span>
          </div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

async function editMeeting(meetingId) {
  const meeting = allMeetings.find(m => m.id === meetingId);
  if (!meeting) return;

  document.getElementById('meeting-id').value = meeting.id;
  document.getElementById('m-title').value = meeting.title;
  document.getElementById('m-location').value = meeting.location || '';
  document.getElementById('m-date').value = meeting.meeting_date;
  document.getElementById('m-time').value = meeting.meeting_time.substring(0, 5);
  document.getElementById('m-duration').value = meeting.duration || 30;
  document.getElementById('m-description').value = meeting.description || '';
  document.getElementById('m-client').value = meeting.client_id;

  document.getElementById('meeting-modal').classList.add('open');
}

async function deleteMeeting(meetingId) {
  if (confirm('Delete this meeting?')) {
    try {
      const res = await apiFetch(`/meetings/${meetingId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(res.statusText);
      toast('Meeting deleted', 'success');
      loadMeetings();
    } catch (e) {
      console.error(e);
      toast('Failed to delete meeting', 'error');
    }
  }
}

// Meeting Modal Handlers
document.getElementById('btn-add-meeting')?.addEventListener('click', async () => {
  document.getElementById('meeting-id').value = '';
  document.getElementById('meeting-form').reset();

  try {
    // Load clients for dropdown
    const clientRes = await apiFetch('/clients');

    if (!clientRes.ok) throw new Error('Failed to load clients');

    const clients = await clientRes.json();

    const clientSelect = document.getElementById('m-client');

    clientSelect.innerHTML = '<option value="">Select a client...</option>' +
      clients.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');

    document.getElementById('meeting-modal').classList.add('open');
  } catch (e) {
    console.error(e);
    toast('Failed to load meeting form', 'error');
  }
});

document.getElementById('cancel-meeting')?.addEventListener('click', () => {
  document.getElementById('meeting-modal').classList.remove('open');
});

document.getElementById('close-meeting-modal')?.addEventListener('click', () => {
  document.getElementById('meeting-modal').classList.remove('open');
});

document.getElementById('meeting-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const meetingId = document.getElementById('meeting-id').value;
  const data = {
    title: document.getElementById('m-title').value,
    client_id: parseInt(document.getElementById('m-client').value),
    meeting_date: document.getElementById('m-date').value,
    meeting_time: document.getElementById('m-time').value + ':00',
    duration: parseInt(document.getElementById('m-duration').value),
    location: document.getElementById('m-location').value,
    description: document.getElementById('m-description').value
  };

  try {
    let res;
    if (meetingId) {
      res = await apiFetch(`/meetings/${meetingId}`, { method: 'PUT', body: JSON.stringify(data) });
    } else {
      res = await apiFetch('/meetings', { method: 'POST', body: JSON.stringify(data) });
    }

    if (!res.ok) throw new Error(res.statusText);

    document.getElementById('meeting-modal').classList.remove('open');
    toast('Meeting saved successfully!', 'success');
    loadMeetings();
  } catch (e) {
    console.error(e);
    toast('Error saving meeting: ' + e.message, 'error');
  }
});

// ── Settings ───────────────────────────────────────────
async function loadSettings() {
  const tabButtons = document.querySelectorAll('.settings-tab');
  const tabContents = document.querySelectorAll('.settings-tab-content');

  // Tab switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${tabName}`).classList.add('active');

      // Load tab-specific data
      if (tabName === 'profile') loadProfileSettings();
      if (tabName === 'general') loadGeneralSettings();
      if (tabName === 'notifications') loadNotificationSettings();
      if (tabName === 'security') loadSecuritySettings();
      if (tabName === 'clock') loadClockAlarmSettings();
      if (tabName === 'data') loadDataPrivacySettings();
      if (tabName === 'system') loadSystemSettings();
    });
  });

  // Load profile tab by default
  loadProfileSettings();
}

async function loadProfileSettings() {
  try {
    const data = await apiFetch('/profile/info');
    document.getElementById('sp-full-name').value = data.full_name || '';
    document.getElementById('sp-email').value = data.email || '';
    document.getElementById('sp-phone').value = data.phone || '';
    document.getElementById('sp-bio').value = data.bio || '';

    document.getElementById('profile-form').onsubmit = async (e) => {
      e.preventDefault();
      const updated = await apiFetch('/profile/info', 'PUT', {
        full_name: document.getElementById('sp-full-name').value,
        email: document.getElementById('sp-email').value,
        phone: document.getElementById('sp-phone').value,
        bio: document.getElementById('sp-bio').value
      });
      alert('Profile updated successfully!');
    };
  } catch (e) {
    console.error('Error loading profile:', e);
  }
}

async function loadGeneralSettings() {
  try {
    const data = await apiFetch('/profile/preferences');
    const selectedTheme = data.theme || 'light';
    document.querySelector(`input[name="theme"][value="${selectedTheme}"]`).checked = true;
    document.getElementById('sg-timezone').value = data.timezone || 'IST';
    document.getElementById('sg-date-format').value = data.date_format || 'DD/MM/YYYY';
    document.getElementById('sg-time-format').value = data.time_format || '24h';

    // Apply current theme
    toggleDarkMode(selectedTheme === 'dark');

    // Listen for theme changes
    document.querySelectorAll('input[name="theme"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        toggleDarkMode(e.target.value === 'dark');
      });
    });

    document.getElementById('general-form').onsubmit = async (e) => {
      e.preventDefault();
      const selectedTheme = document.querySelector('input[name="theme"]:checked').value;
      await apiFetch('/profile/preferences', 'PUT', {
        theme: selectedTheme,
        timezone: document.getElementById('sg-timezone').value,
        date_format: document.getElementById('sg-date-format').value,
        time_format: document.getElementById('sg-time-format').value
      });
      toggleDarkMode(selectedTheme === 'dark');
      alert('General settings saved!');
    };
  } catch (e) {
    console.error('Error loading general settings:', e);
  }
}

async function loadNotificationSettings() {
  try {
    const data = await apiFetch('/profile/notifications');
    document.getElementById('sn-email-notif').checked = data.email_notifications;
    document.getElementById('sn-sound-notif').checked = data.sound_notifications;
    document.getElementById('sn-browser-notif').checked = data.browser_notifications;
    document.getElementById('sn-15min').checked = data.followup_15min;
    document.getElementById('sn-10min').checked = data.followup_10min;
    document.getElementById('sn-5min').checked = data.followup_5min;
    document.getElementById('sn-3min').checked = data.followup_3min;
    document.getElementById('sn-mute-start').value = data.mute_start_time || '';
    document.getElementById('sn-mute-end').value = data.mute_end_time || '';
    document.getElementById('sn-mute-weekends').checked = data.mute_weekends;

    document.getElementById('notifications-form').onsubmit = async (e) => {
      e.preventDefault();
      await apiFetch('/profile/notifications', 'PUT', {
        email_notifications: document.getElementById('sn-email-notif').checked,
        sound_notifications: document.getElementById('sn-sound-notif').checked,
        browser_notifications: document.getElementById('sn-browser-notif').checked,
        followup_15min: document.getElementById('sn-15min').checked,
        followup_10min: document.getElementById('sn-10min').checked,
        followup_5min: document.getElementById('sn-5min').checked,
        followup_3min: document.getElementById('sn-3min').checked,
        mute_start_time: document.getElementById('sn-mute-start').value || null,
        mute_end_time: document.getElementById('sn-mute-end').value || null,
        mute_weekends: document.getElementById('sn-mute-weekends').checked
      });
      alert('Notification preferences saved!');
    };
  } catch (e) {
    console.error('Error loading notifications:', e);
  }
}

async function loadSecuritySettings() {
  try {
    // Load sessions
    const sessions = await apiFetch('/profile/sessions');
    const sessionsList = document.getElementById('sessions-list');
    if (sessions.length === 0) {
      sessionsList.innerHTML = '<p class="muted">No active sessions</p>';
    } else {
      sessionsList.innerHTML = sessions.map(s => `
        <div class="session-item">
          <div class="session-info">
            <div class="session-device">${s.user_agent || 'Unknown Device'}</div>
            <div class="session-meta">IP: ${s.ip_address} | Logged in: ${new Date(s.login_at).toLocaleString()}</div>
          </div>
          <button class="btn btn-sm btn-danger" onclick="logoutSession(${s.id})">Logout</button>
        </div>
      `).join('');
    }

    // Load activity log
    const activityLog = await apiFetch('/profile/activity-log');
    const activityDiv = document.getElementById('activity-log');
    if (activityLog.length === 0) {
      activityDiv.innerHTML = '<p class="muted">No activity yet</p>';
    } else {
      activityDiv.innerHTML = `
        <table>
          <thead>
            <tr><th>Action</th><th>IP Address</th><th>Date & Time</th></tr>
          </thead>
          <tbody>
            ${activityLog.map(log => `
              <tr>
                <td>${esc(log.action)}</td>
                <td>${log.ip_address || '--'}</td>
                <td>${new Date(log.created_at).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    // Password change form
    document.getElementById('password-change-form').onsubmit = async (e) => {
      e.preventDefault();
      const current = document.getElementById('ss-current-pwd').value;
      const next = document.getElementById('ss-new-pwd').value;
      const confirm = document.getElementById('ss-confirm-pwd').value;

      if (next !== confirm) {
        alert('Passwords do not match!');
        return;
      }

      if (next.length < 8) {
        alert('Password must be at least 8 characters!');
        return;
      }

      try {
        await apiFetch('/profile/password', 'PUT', { current, next });
        alert('Password changed successfully!');
        document.getElementById('password-change-form').reset();
      } catch (e) {
        alert(e.message || 'Failed to change password');
      }
    };
  } catch (e) {
    console.error('Error loading security settings:', e);
  }
}

async function logoutSession(sessionId) {
  if (confirm('Log out this session?')) {
    try {
      await apiFetch(`/profile/sessions/${sessionId}`, 'DELETE');
      alert('Session logged out');
      loadSecuritySettings();
    } catch (e) {
      console.error('Error logging out session:', e);
    }
  }
}

async function loadDataPrivacySettings() {
  try {
    // Get data stats
    const clients = await apiFetch('/clients');
    const stats = {
      clients: clients.length,
      remarks: 0,
      followups: 0
    };

    // Count remarks
    clients.forEach(c => {
      stats.remarks += c.remark_count || 0;
    });

    document.getElementById('data-clients').textContent = stats.clients;
    document.getElementById('data-remarks').textContent = stats.remarks;
    document.getElementById('data-followups').textContent = stats.followups;

    // Get current user info
    const user = await apiFetch('/auth/users/' + me.id);
    document.getElementById('account-created').textContent = new Date(user.created_at).toLocaleDateString();
    document.getElementById('last-login').textContent = user.last_login ? new Date(user.last_login).toLocaleString() : 'Never';

    // Export data
    document.getElementById('btn-export-data').onclick = async () => {
      try {
        const data = await apiFetch('/profile/export-data');
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `crm-data-export-${new Date().getTime()}.json`;
        a.click();
        alert('Data exported successfully!');
      } catch (e) {
        alert('Failed to export data: ' + e.message);
      }
    };

    // Delete account
    document.getElementById('btn-delete-account').onclick = () => {
      if (confirm('Are you sure you want to delete your account? This cannot be undone!')) {
        if (confirm('This will permanently delete all your data. Type "DELETE" to confirm.')) {
          const userInput = prompt('Type "DELETE" to confirm account deletion:');
          if (userInput === 'DELETE') {
            alert('Account deletion not yet implemented. Contact administrator.');
          }
        }
      }
    };
  } catch (e) {
    console.error('Error loading data privacy:', e);
  }
}

async function loadClockAlarmSettings() {
  try {
    // For now, just set up the form handlers with defaults
    document.getElementById('clock-form').onsubmit = async (e) => {
      e.preventDefault();
      alert('Clock & Alarm settings saved!');
    };
  } catch (e) {
    console.error('Error loading clock settings:', e);
  }
}

async function loadSystemSettings() {
  try {
    // Admin-only system settings
    if (me.role !== 'admin') {
      document.getElementById('system-audit-log').innerHTML = '<p class="muted">Admin access required</p>';
      return;
    }

    // Load system audit log
    const auditLog = await apiFetch('/admin/audit-log');
    const auditDiv = document.getElementById('system-audit-log');
    if (auditLog.length === 0) {
      auditDiv.innerHTML = '<p class="muted">No audit log entries yet</p>';
    } else {
      auditDiv.innerHTML = `
        <table>
          <thead>
            <tr><th>User</th><th>Action</th><th>IP Address</th><th>Date & Time</th></tr>
          </thead>
          <tbody>
            ${auditLog.map(log => `
              <tr>
                <td>${esc(log.username || 'Unknown')}</td>
                <td>${esc(log.action)}</td>
                <td>${log.ip_address || '--'}</td>
                <td>${new Date(log.created_at).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    document.getElementById('system-notif-form').onsubmit = async (e) => {
      e.preventDefault();
      alert('System settings saved!');
    };
  } catch (e) {
    console.error('Error loading system settings:', e);
  }
}

// ── Utility ────────────────────────────────────────────
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Theme Management ──────────────────────────────────
function toggleDarkMode(isDarkMode) {
  if (isDarkMode) {
    document.body.classList.add('dark-mode');
    localStorage.setItem('theme', 'dark');
  } else {
    document.body.classList.remove('dark-mode');
    localStorage.setItem('theme', 'light');
  }
}

function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
}

// ── Init ───────────────────────────────────────────────
initTheme();
loadDashboard();
setupNotifications();
// Check for notifications every 1 minute (60000ms)
setInterval(fetchNotifications, 60000);
// Also request permissions on load
setInterval(async () => {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}, 300000);
