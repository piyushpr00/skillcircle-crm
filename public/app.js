// ── Auth guard ─────────────────────────────────────────
const token = localStorage.getItem('crm_token');
const me = JSON.parse(localStorage.getItem('crm_user') || 'null');
if (!token || !me) { location.href = '/login.html'; throw 0; }

const isAdmin = me.role === 'admin';
const API = '/api';

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
  if (name === 'users')     loadUsers();
}

// ── Dashboard ──────────────────────────────────────────
async function loadDashboard() {
  const [clients, today] = await Promise.all([
    apiFetch('/clients').then(r => r.json()),
    apiFetch('/followups/today').then(r => r.json()),
  ]);

  document.getElementById('stats-row').innerHTML = `
    <div class="stat-card"><div class="stat-label">Total Clients</div><div class="stat-value">${clients.length}</div></div>
    <div class="stat-card"><div class="stat-label">Today's Follow-ups</div><div class="stat-value red">${today.length}</div></div>
    <div class="stat-card"><div class="stat-label">Total Remarks</div><div class="stat-value">${clients.reduce((a,c) => a + (c.remark_count||0), 0)}</div></div>
  `;

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
}

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
      <td>${esc(c.budget)}</td>
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

document.getElementById('btn-add-client').addEventListener('click', () => {
  document.getElementById('modal-title').textContent = 'Add Client';
  document.getElementById('client-form').reset();
  document.getElementById('client-id').value = '';
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
  document.getElementById('f-budget').value = c.budget;
  clientModal.classList.add('open');
}

const closeClientModal = () => clientModal.classList.remove('open');
document.getElementById('close-client-modal').addEventListener('click', closeClientModal);
document.getElementById('cancel-client').addEventListener('click', closeClientModal);
clientModal.addEventListener('click', e => { if (e.target === clientModal) closeClientModal(); });

document.getElementById('client-form').addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('client-id').value;
  const body = {
    name: document.getElementById('f-name').value.trim(),
    number: document.getElementById('f-number').value.trim(),
    email: document.getElementById('f-email').value.trim(),
    location: document.getElementById('f-location').value.trim(),
    budget: document.getElementById('f-budget').value.trim(),
  };
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
    <span class="di-label">Budget</span><span>${esc(data.budget)}</span>
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
  if (res.error) { toast('Import failed: ' + res.error, 'error'); return; }
  toast(`Imported ${res.imported} clients & ${res.remarks || 0} follow-ups`, 'success');
  loadClients(); loadDashboard(); loadUpcoming();
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
async function loadUsers() {
  const users = await apiFetch('/auth/users').then(r => r.json());
  const tbody = document.getElementById('user-tbody');
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${esc(u.username)}</td>
      <td><span class="role-chip ${u.role}">${u.role}</span></td>
      <td>${new Date(u.created_at).toLocaleDateString()}</td>
      <td>${u.id !== me.id
        ? `<button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})">Remove</button>`
        : '<span style="color:var(--muted);font-size:.8rem">You</span>'}</td>
    </tr>`).join('');
}

async function deleteUser(id) {
  if (!confirm('Remove this team member?')) return;
  await apiFetch(`/auth/users/${id}`, { method: 'DELETE' });
  toast('Member removed', 'error');
  loadUsers();
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
    password: document.getElementById('u-password').value,
    role: document.getElementById('u-role').value,
  };
  const res = await apiFetch('/auth/users', { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) { toast(data.error, 'error'); return; }
  toast('Member created', 'success');
  closeUserModal();
  loadUsers();
});

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

// ── Utility ────────────────────────────────────────────
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ───────────────────────────────────────────────
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
