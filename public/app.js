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
  if (name === 'users')     loadUsers();
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

// 5-Minute Reminder Pop-up System
function showReminderPopup(clientName, followupTime, remark, remarkId) {
  const overlay = document.getElementById('reminder-popup');
  if (!overlay) return;

  // Update popup content
  document.getElementById('reminder-client').textContent = clientName;
  document.getElementById('reminder-time').textContent = followupTime;
  document.getElementById('reminder-remark').textContent = remark || '(No remark)';

  // Show popup with animation
  overlay.classList.add('open');

  // Store current reminder ID for snooze functionality
  sessionStorage.setItem('current_reminder_id', remarkId);

  // Auto-dismiss after 30 seconds if not interacted
  const autoDismissTimeout = setTimeout(() => {
    if (overlay.classList.contains('open')) {
      closeReminderPopup();
    }
  }, 30000);

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

  // Show 5-minute reminder pop-up
  const fiveMinNotifs = notifs.filter(n => n.minutes_before === 5);
  if (fiveMinNotifs.length > 0) {
    const notif = fiveMinNotifs[0];
    const reminderKey = `reminder_shown_${notif.remark_id}`;
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
        notif.remark_id
      );

      sessionStorage.setItem(reminderKey, 'true');
    }
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
