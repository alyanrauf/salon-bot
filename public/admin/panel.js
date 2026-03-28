// ══════════════════════════════════════
//  STATE
// ══════════════════════════════════════
let allServices = [];
let allDeals = [];
let allBookings = [];
let allBranches = [];
let allStaff = [];
let allRoles = [];
let appCurrency = 'Rs.';

const titles = {
  dashboard: 'Dashboard',
  bookings: 'Bookings',
  packages: 'Packages & Prices',
  deals: 'Deals & Offers',
  clients: 'Clients',
  settings: 'Settings',
};

// ══════════════════════════════════════
//  NAV
// ══════════════════════════════════════
function showTab(tab, el) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('page-title').textContent = titles[tab];

  if (el) {
    el.classList.add('active');
  } else {
    document.querySelectorAll('nav a').forEach(a => {
      if (a.getAttribute('onclick') && a.getAttribute('onclick').includes("'" + tab + "'")) {
        a.classList.add('active');
      }
    });
  }

  if (tab === 'bookings') loadBookings();
  if (tab === 'packages') loadServices();
  if (tab === 'deals') loadDeals();
  if (tab === 'clients') loadClients();
  if (tab === 'settings') loadSettings();
}

// ══════════════════════════════════════
//  FETCH HELPERS
// ══════════════════════════════════════
async function api(path, opts = {}) {
  const r = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  return r.json();
}

function toast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.className = ''), 2800);
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusBadge(s) {
  const map = {
    pending: 'badge-pending',
    confirmed: 'badge-confirmed',
    cancelled: 'badge-cancelled',
  };
  return `<span class="badge ${map[s] || ''}">${s || '—'}</span>`;
}

function setSelect(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  [...el.options].forEach(o => (o.selected = o.value === String(val)));
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

// ══════════════════════════════════════
//  STATS
// ══════════════════════════════════════
async function loadStats() {
  const today = new Date().toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  document.getElementById('s-today-date').textContent = today;

  try {
    const d = await api('/admin/api/stats');
    document.getElementById('s-total').textContent = d.total_bookings ?? 0;
    document.getElementById('s-today').textContent = d.today_bookings ?? 0;
    document.getElementById('s-services').textContent = d.active_services ?? 0;
    document.getElementById('s-clients').textContent = d.total_clients ?? 0;
  } catch (e) {
    ['s-total', 's-today', 's-services', 's-clients'].forEach(
      id => (document.getElementById(id).textContent = '0')
    );
  }
}

// ══════════════════════════════════════
//  BOOKINGS
// ══════════════════════════════════════
async function loadBookings(recent = false) {
  const tbody = document.getElementById(recent ? 'recent-tbody' : 'bookings-tbody');
  const cols = recent ? 7 : 9;
  tbody.innerHTML = `<tr class="loading-row"><td colspan="${cols}"><span class="spinner"></span></td></tr>`;

  let url = '/admin/api/bookings';
  if (!recent) {
    const date = document.getElementById('f-date')?.value || '';
    const status = document.getElementById('f-status')?.value || '';
    const params = new URLSearchParams();
    if (date) params.set('date', date);
    if (status) params.set('status', status);
    if ([...params].length) url += '?' + params;
  } else {
    url += '?limit=6';
  }

  try {
    const rows = await api(url);
    allBookings = rows;
    renderBookings(rows, tbody, recent);
  } catch (e) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="${cols}">Could not load bookings.</td></tr>`;
  }
}

function renderBookings(rows, tbody, recent = false) {
  const cols = recent ? 7 : 9;
  if (!rows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="${cols}">No appointments found.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      ${!recent ? `<td><span style="color:var(--sub)">#${r.id}</span></td>` : ''}
      <td><strong>${esc(r.customer_name)}</strong></td>
      ${!recent ? `<td>${esc(r.phone || '—')}</td>` : ''}
      <td>${esc(r.service || '—')}</td>
      <td>${esc(r.branch || '—')}</td>
      <td>${esc(r.date || '—')}</td>
      <td>${esc(r.time || '—')}</td>
      <td>${statusBadge(r.status)}</td>
      <td>
        <button class="btn btn-sm btn-success" onclick="patchStatus(${r.id},'confirmed')">✅</button>
        <button class="btn btn-sm btn-danger"  onclick="patchStatus(${r.id},'cancelled')">❌</button>
        ${!recent
      ? `<button class="btn btn-sm btn-outline" onclick="editBooking(${r.id})">✏️</button>
             <button class="btn btn-sm btn-danger"  onclick="deleteBooking(${r.id})">🗑</button>`
      : ''}
      </td>
    </tr>`).join('');
}

async function patchStatus(id, status) {
  await api(`/admin/api/bookings/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  toast(`Marked as ${status}`, 'ok');
  loadBookings();
  loadBookings(true);
  loadStats();
}

async function deleteBooking(id) {
  if (!confirm('Delete this booking?')) return;
  await api(`/admin/api/bookings/${id}`, { method: 'DELETE' });
  toast('Booking deleted', 'ok');
  loadBookings();
  loadStats();
}

function editBooking(id) {
  const b = allBookings.find(x => x.id === id);
  if (!b) return;
  document.getElementById('bm-id').value = b.id;
  document.getElementById('bm-name').value = b.customer_name;
  document.getElementById('bm-phone').value = b.phone || '';
  document.getElementById('bm-date').value = b.date || '';
  document.getElementById('bm-time').value = b.time || '';
  document.getElementById('bm-notes').value = b.notes || '';
  setSelect('bm-branch', b.branch);
  setSelect('bm-status', b.status);
  populateServiceSelect(b.service);
  populateStaffSelect(b.staff_id);
  document.getElementById('bm-title').textContent = 'Edit Appointment';
  document.getElementById('booking-modal').classList.add('open');
}

function openBookingModal() {
  ['bm-id', 'bm-name', 'bm-phone', 'bm-date', 'bm-time', 'bm-notes'].forEach(
    id => (document.getElementById(id).value = '')
  );
  setSelect('bm-status', 'pending');
  populateServiceSelect();
  populateStaffSelect();
  document.getElementById('bm-title').textContent = 'New Appointment';
  document.getElementById('booking-modal').classList.add('open');
}

async function saveBooking() {
  const id = document.getElementById('bm-id').value;
  const staffSel = document.getElementById('bm-staff');
  const staffId = staffSel.value || null;
  const staffName = staffId
    ? (staffSel.selectedOptions[0]?.text?.split(' (')[0] || null)
    : null;
  const body = {
    customer_name: document.getElementById('bm-name').value.trim(),
    phone: document.getElementById('bm-phone').value.trim(),
    service: document.getElementById('bm-service').value,
    branch: document.getElementById('bm-branch').value,
    date: document.getElementById('bm-date').value,
    time: document.getElementById('bm-time').value,
    notes: document.getElementById('bm-notes').value.trim(),
    status: document.getElementById('bm-status').value,
    staff_id: staffId,
    staff_name: staffName,
  };
  if (!body.customer_name) { toast('Name is required', 'err'); return; }

  const url = id ? `/admin/api/bookings/${id}` : '/admin/api/bookings';
  const method = id ? 'PUT' : 'POST';
  await api(url, { method, body: JSON.stringify(body) });
  toast(id ? 'Appointment updated' : 'Appointment created', 'ok');
  closeModal('booking-modal');
  loadBookings();
  loadBookings(true);
  loadStats();
}

function populateStaffSelect(selectedId = null) {
  const sel = document.getElementById('bm-staff');
  if (!sel) return;
  sel.innerHTML =
    `<option value="">— No preference —</option>` +
    allStaff
      .filter(s => s.status === 'active')
      .map(s => `<option value="${s.id}" ${s.id == selectedId ? 'selected' : ''}>${esc(s.name)} (${esc(s.role)})</option>`)
      .join('');
}

function populateServiceSelect(selected = '') {
  const sel = document.getElementById('bm-service');
  sel.innerHTML =
    `<option value="">— Choose service —</option>` +
    allServices
      .map(s => `<option value="${esc(s.name)}" ${s.name === selected ? 'selected' : ''}>${esc(s.name)} (${esc(s.price)})</option>`)
      .join('');
}

// ══════════════════════════════════════
//  SERVICES
// ══════════════════════════════════════
async function loadServices() {
  try {
    allServices = await api('/admin/api/services');
    // Rebuild branch filter options dynamically
    const filter = document.getElementById('branch-filter');
    if (filter && allBranches.length) {
      const currentVal = filter.value;
      filter.innerHTML =
        `<option value="">All Branches</option><option value="All Branches">General</option>` +
        allBranches.map(b => `<option value="${esc(b.name)}">${esc(b.name)}</option>`).join('');
      if (currentVal) setSelect('branch-filter', currentVal);
    }
    renderServices();
  } catch (e) {
    document.getElementById('services-grid').innerHTML =
      '<div style="grid-column:1/-1;text-align:center;color:var(--sub);padding:40px">Could not load services.</div>';
  }
}

function renderServices() {
  const branch = document.getElementById('branch-filter').value;
  const list = branch ? allServices.filter(s => s.branch === branch) : allServices;
  const grid = document.getElementById('services-grid');

  grid.innerHTML =
    list.map(s => `
      <div class="pkg-card">
        <div class="pkg-card-name">${esc(s.name)}</div>
        <div class="pkg-card-price">${appCurrency} ${esc(s.price)}</div>
        <div class="pkg-card-branch">📍 ${esc(s.branch)}</div>
        ${s.description
        ? `<div class="pkg-card-desc">${esc(s.description).replace(/·/g, '<span class="dot">·</span>')}</div>`
        : ''}
        <div class="pkg-card-actions">
          <button class="btn btn-sm btn-outline" onclick="editService(${s.id})">Edit</button>
          <button class="btn btn-sm btn-danger"  onclick="deleteService(${s.id})">Delete</button>
        </div>
      </div>`).join('') +
    `<button class="pkg-add-btn" onclick="openServiceModal()">➕ Add Service</button>`;
}

function openServiceModal() {
  document.getElementById('sm-id').value = '';
  document.getElementById('sm-name').value = '';
  document.getElementById('sm-price').value = '';
  document.getElementById('sm-price').placeholder = `e.g. 2500`;
  document.getElementById('sm-desc').value = '';
  setSelect('sm-branch', 'All Branches');
  document.getElementById('sm-title').textContent = 'Add Service';
  document.getElementById('service-modal').classList.add('open');
}

function editService(id) {
  const s = allServices.find(x => x.id === id);
  if (!s) return;
  document.getElementById('sm-id').value = s.id;
  document.getElementById('sm-name').value = s.name;
  document.getElementById('sm-price').value = s.price;
  document.getElementById('sm-desc').value = s.description || '';
  setSelect('sm-branch', s.branch);
  document.getElementById('sm-title').textContent = 'Edit Service';
  document.getElementById('service-modal').classList.add('open');
}

async function saveService() {
  const id = document.getElementById('sm-id').value;
  const body = {
    name: document.getElementById('sm-name').value.trim(),
    price: document.getElementById('sm-price').value.trim(),
    description: document.getElementById('sm-desc').value.trim(),
    branch: document.getElementById('sm-branch').value,
  };
  if (!body.name || !body.price) { toast('Name and price required', 'err'); return; }

  const existing = allServices.map(s => ({ ...s }));
  if (id) {
    const idx = existing.findIndex(s => s.id == id);
    if (idx > -1) existing[idx] = { ...existing[idx], ...body };
  } else {
    existing.push(body);
  }

  const r = await api('/admin/services', {
    method: 'POST',
    body: JSON.stringify({ services: existing }),
  });
  if (r.ok) {
    allServices = r.services;
    renderServices();
    closeModal('service-modal');
    toast(id ? 'Service updated' : 'Service added', 'ok');
    loadStats();
  } else {
    toast(r.error || 'Error', 'err');
  }
}

async function deleteService(id) {
  if (!confirm('Delete this service?')) return;
  const remaining = allServices.filter(s => s.id !== id);
  const r = await api('/admin/services', {
    method: 'POST',
    body: JSON.stringify({ services: remaining }),
  });
  if (r.ok) {
    allServices = r.services;
    renderServices();
    toast('Service deleted', 'ok');
    loadStats();
  }
}

// ══════════════════════════════════════
//  DEALS
// ══════════════════════════════════════
async function loadDeals() {
  try {
    allDeals = await api('/admin/api/deals');
    renderDeals();
  } catch (e) {
    document.getElementById('deals-list').innerHTML =
      '<p style="color:var(--sub);padding:20px">Could not load deals.</p>';
  }
}

function renderDeals() {
  document.getElementById('deals-list').innerHTML =
    allDeals.map(d => `
      <div class="deal-card">
        <div class="deal-card-body">
          <div class="deal-card-title">${esc(d.title)}</div>
          <div class="deal-card-desc">${esc(d.description)}</div>
        </div>
        <div class="deal-card-actions">
          <span class="badge ${d.active ? 'badge-active' : 'badge-inactive'}">${d.active ? 'Active' : 'Inactive'}</span>
          <button class="btn btn-sm btn-outline" onclick="editDeal(${d.id})">Edit</button>
          <button class="btn btn-sm btn-danger"  onclick="deleteDeal(${d.id})">Delete</button>
        </div>
      </div>`).join('') ||
    '<p style="color:var(--sub);padding:20px">No deals yet.</p>';
}

function openDealModal() {
  document.getElementById('dm-id').value = '';
  document.getElementById('dm-title-input').value = '';
  document.getElementById('dm-desc').value = '';
  setSelect('dm-active', '1');
  document.getElementById('dm-title').textContent = 'Add Deal';
  document.getElementById('deal-modal').classList.add('open');
}

function editDeal(id) {
  const d = allDeals.find(x => x.id === id);
  if (!d) return;
  document.getElementById('dm-id').value = d.id;
  document.getElementById('dm-title-input').value = d.title;
  document.getElementById('dm-desc').value = d.description;
  setSelect('dm-active', String(d.active));
  document.getElementById('dm-title').textContent = 'Edit Deal';
  document.getElementById('deal-modal').classList.add('open');
}

async function saveDeal() {
  const id = document.getElementById('dm-id').value;
  const body = {
    id: id ? parseInt(id) : undefined,
    title: document.getElementById('dm-title-input').value.trim(),
    description: document.getElementById('dm-desc').value.trim(),
    active: document.getElementById('dm-active').value === '1',
  };
  if (!body.title) { toast('Title required', 'err'); return; }

  const updated = id
    ? allDeals.map(d => (d.id == id ? { ...d, ...body } : d))
    : [...allDeals, body];

  const r = await api('/admin/deals', {
    method: 'POST',
    body: JSON.stringify({ deals: updated }),
  });
  if (r.ok) {
    allDeals = r.deals;
    renderDeals();
    closeModal('deal-modal');
    toast('Deal saved', 'ok');
  } else {
    toast(r.error || 'Error', 'err');
  }
}

async function deleteDeal(id) {
  if (!confirm('Delete this deal?')) return;
  const remaining = allDeals.filter(d => d.id !== id);
  const r = await api('/admin/deals', {
    method: 'POST',
    body: JSON.stringify({ deals: remaining }),
  });
  if (r.ok) {
    allDeals = r.deals;
    renderDeals();
    toast('Deal deleted', 'ok');
  }
}

// ══════════════════════════════════════
//  CLIENTS
// ══════════════════════════════════════
async function loadClients() {
  try {
    const rows = await api('/admin/api/clients');
    const tbody = document.getElementById('clients-tbody');
    if (!rows.length) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No clients yet.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map(c => `
      <tr>
        <td><strong>${esc(c.customer_name)}</strong></td>
        <td>${esc(c.phone || '—')}</td>
        <td>${c.booking_count}</td>
        <td>${esc(c.last_visit || '—')}</td>
        <td><span class="badge badge-confirmed">Active</span></td>
      </tr>`).join('');
  } catch (e) {
    document.getElementById('clients-tbody').innerHTML =
      `<tr class="empty-row"><td colspan="5">Could not load clients.</td></tr>`;
  }
}

// ══════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════

// Populate all branch <select> elements across the admin panel from allBranches
function populateBranchSelects() {
  // Booking modal branch select
  const bmBranch = document.getElementById('bm-branch');
  if (bmBranch) {
    const cur = bmBranch.value;
    bmBranch.innerHTML =
      `<option value="All Branches">All Branches</option>` +
      allBranches.map(b => `<option value="${esc(b.name)}">${esc(b.name)}</option>`).join('');
    if (cur) setSelect('bm-branch', cur);
  }

  // Service modal branch select
  const smBranch = document.getElementById('sm-branch');
  if (smBranch) {
    const cur = smBranch.value;
    smBranch.innerHTML =
      `<option value="All Branches">All Branches</option>` +
      allBranches.map(b => `<option value="${esc(b.name)}">${esc(b.name)}</option>`).join('');
    if (cur) setSelect('sm-branch', cur);
  }
}

// Show a settings sub-tab
function showSettingsTab(tab, el) {
  document.querySelectorAll('.stab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
  document.getElementById('stab-' + tab).classList.add('active');
  if (el) el.classList.add('active');

  if (tab === 'general') loadGeneral();
  if (tab === 'branches') loadBranches();
  if (tab === 'staff') loadStaff();
  if (tab === 'roles') loadRoles();
  if (tab === 'timings') loadTimings();
}

// Entry point when Settings nav tab is clicked
async function loadSettings() {
  // Reset to General sub-tab
  document.querySelectorAll('.stab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
  document.getElementById('stab-general').classList.add('active');
  document.querySelector('.stab').classList.add('active');
  // Preload all sub-tab data so it's ready when user switches tabs
  await loadGeneral();
  loadBranches();
  loadStaff();
  loadRoles();
  loadTimings();
}

// ── BRANCHES ──────────────────────────────────────────────────────────────────

async function loadBranches() {
  const tbody = document.getElementById('branches-tbody');
  tbody.innerHTML = `<tr class="loading-row"><td colspan="6"><span class="spinner"></span></td></tr>`;
  try {
    allBranches = await api('/admin/api/settings/branches');
    renderBranches();
    populateBranchSelects();
  } catch (e) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Could not load branches.</td></tr>`;
  }
}

function renderBranches() {
  const tbody = document.getElementById('branches-tbody');
  if (!allBranches.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No branches added yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = allBranches.map(b => `
    <tr>
      <td><strong>#${b.number}</strong></td>
      <td>${esc(b.name)}</td>
      <td>${esc(b.address)}</td>
      <td>${esc(b.phone)}</td>
      <td><a href="${esc(b.map_link)}" target="_blank" class="map-link">View Map ↗</a></td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="editBranch(${b.id})">✏️ Edit</button>
        <button class="btn btn-sm btn-danger"  onclick="deleteBranch(${b.id})">🗑 Delete</button>
      </td>
    </tr>`).join('');
}

let editingBranchId = null;

function openBranchModal(branch) {
  editingBranchId = branch ? branch.id : null;
  document.getElementById('brm-name').value = branch ? branch.name : '';
  document.getElementById('brm-address').value = branch ? branch.address : '';
  document.getElementById('brm-maplink').value = branch ? branch.map_link : '';
  document.getElementById('brm-phone').value = branch ? branch.phone : '';
  document.getElementById('brm-title').textContent = branch ? 'Edit Branch' : 'Add Branch';
  document.getElementById('branch-modal').classList.add('open');
}

function editBranch(id) {
  const b = allBranches.find(x => x.id === id);
  if (b) openBranchModal(b);
}

async function saveBranch() {
  const body = {
    name: document.getElementById('brm-name').value.trim(),
    address: document.getElementById('brm-address').value.trim(),
    map_link: document.getElementById('brm-maplink').value.trim(),
    phone: document.getElementById('brm-phone').value.trim(),
  };

  const errs = [];
  if (!body.name) errs.push('Branch Name');
  if (!body.address) errs.push('Address');
  if (!body.map_link || !body.map_link.startsWith('http')) errs.push('Valid Map Link (must start with http)');
  if (!body.phone) errs.push('Phone');
  if (errs.length) { toast('Required: ' + errs.join(', '), 'err'); return; }

  const url = editingBranchId ? `/admin/api/settings/branches/${editingBranchId}` : '/admin/api/settings/branches';
  const method = editingBranchId ? 'PUT' : 'POST';
  const r = await api(url, { method, body: JSON.stringify(body) });
  if (r.error) { toast(r.error, 'err'); return; }

  toast(editingBranchId ? 'Branch updated' : 'Branch added', 'ok');
  closeModal('branch-modal');
  loadBranches();
}

async function deleteBranch(id) {
  if (!confirm('Delete this branch? This cannot be undone.')) return;
  await api(`/admin/api/settings/branches/${id}`, { method: 'DELETE' });
  toast('Branch deleted', 'ok');
  loadBranches();
}

// ── STAFF ─────────────────────────────────────────────────────────────────────

async function loadStaff() {
  const tbody = document.getElementById('staff-tbody');
  tbody.innerHTML = `<tr class="loading-row"><td colspan="6"><span class="spinner"></span></td></tr>`;
  try {
    allStaff = await api('/admin/api/settings/staff');
    renderStaff();
  } catch (e) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Could not load staff.</td></tr>`;
  }
}

function renderStaff() {
  const tbody = document.getElementById('staff-tbody');
  if (!allStaff.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No staff added yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = allStaff.map(s => `
    <tr>
      <td><strong>${esc(s.name)}</strong></td>
      <td>${esc(s.phone)}</td>
      <td><span class="role-badge">${esc(s.role)}</span></td>
      <td>${esc(s.branch_name || '—')}</td>
      <td><span class="badge ${s.status === 'active' ? 'badge-confirmed' : 'badge-inactive'}">${esc(s.status)}</span></td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="editStaff(${s.id})">✏️ Edit</button>
        <button class="btn btn-sm btn-danger"  onclick="deleteStaff(${s.id})">🗑 Delete</button>
      </td>
    </tr>`).join('');
}

let editingStaffId = null;

function openStaffModal(staff) {
  editingStaffId = staff ? staff.id : null;
  document.getElementById('stm-name').value = staff ? staff.name : '';
  document.getElementById('stm-phone').value = staff ? staff.phone : '';
  setSelect('stm-status', staff ? staff.status : 'active');

  // Populate role select dynamically from DB roles
  const roleSel = document.getElementById('stm-role');
  roleSel.innerHTML = allRoles.length
    ? allRoles.map(r => `<option value="${esc(r.name)}">${esc(r.name)}</option>`).join('')
    : `<option value="">No roles defined</option>`;
  if (staff) setSelect('stm-role', staff.role);

  // Populate branch select dynamically
  const branchSel = document.getElementById('stm-branch');
  branchSel.innerHTML =
    `<option value="">— None —</option>` +
    allBranches.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');
  if (staff && staff.branch_id) setSelect('stm-branch', String(staff.branch_id));

  document.getElementById('stm-title').textContent = staff ? 'Edit Staff' : 'Add Staff';
  document.getElementById('staff-modal').classList.add('open');
}

function editStaff(id) {
  const s = allStaff.find(x => x.id === id);
  if (s) openStaffModal(s);
}

async function saveStaff() {
  const body = {
    name: document.getElementById('stm-name').value.trim(),
    phone: document.getElementById('stm-phone').value.trim(),
    role: document.getElementById('stm-role').value,
    branch_id: document.getElementById('stm-branch').value || null,
    status: document.getElementById('stm-status').value,
  };

  const errs = [];
  if (!body.name) errs.push('Name');
  if (!body.phone) errs.push('Phone');
  if (!body.role) errs.push('Role');
  if (errs.length) { toast('Required: ' + errs.join(', '), 'err'); return; }

  const url = editingStaffId ? `/admin/api/settings/staff/${editingStaffId}` : '/admin/api/settings/staff';
  const method = editingStaffId ? 'PUT' : 'POST';
  const r = await api(url, { method, body: JSON.stringify(body) });
  if (r.error) { toast(r.error, 'err'); return; }

  toast(editingStaffId ? 'Staff updated' : 'Staff added', 'ok');
  closeModal('staff-modal');
  loadStaff();
}

async function deleteStaff(id) {
  if (!confirm('Remove this staff member?')) return;
  await api(`/admin/api/settings/staff/${id}`, { method: 'DELETE' });
  toast('Staff removed', 'ok');
  loadStaff();
}

// ── TIMINGS ───────────────────────────────────────────────────────────────────

async function loadTimings() {
  try {
    const d = await api('/admin/api/settings/timings');
    if (d.workday) {
      document.getElementById('tm-workday-open').value = d.workday.open_time;
      document.getElementById('tm-workday-close').value = d.workday.close_time;
    }
    if (d.weekend) {
      document.getElementById('tm-weekend-open').value = d.weekend.open_time;
      document.getElementById('tm-weekend-close').value = d.weekend.close_time;
    }
  } catch (e) {
    toast('Could not load timings', 'err');
  }
}

async function saveTimings() {
  const body = {
    workday: {
      open_time: document.getElementById('tm-workday-open').value,
      close_time: document.getElementById('tm-workday-close').value,
    },
    weekend: {
      open_time: document.getElementById('tm-weekend-open').value,
      close_time: document.getElementById('tm-weekend-close').value,
    },
  };

  if (!body.workday.open_time || !body.workday.close_time ||
    !body.weekend.open_time || !body.weekend.close_time) {
    toast('Please fill in all time fields', 'err'); return;
  }
  if (body.workday.close_time <= body.workday.open_time) {
    toast('Workday closing time must be after opening time', 'err'); return;
  }
  if (body.weekend.close_time <= body.weekend.open_time) {
    toast('Weekend closing time must be after opening time', 'err'); return;
  }

  const r = await api('/admin/api/settings/timings', { method: 'PUT', body: JSON.stringify(body) });
  if (r.ok) {
    toast('Salon hours saved', 'ok');
  } else {
    toast(r.error || 'Error saving timings', 'err');
  }
}

// ══════════════════════════════════════
//  GENERAL SETTINGS (currency etc.)
// ══════════════════════════════════════

async function loadGeneral() {
  try {
    const d = await api('/admin/api/settings/general');
    const currency = d.currency || 'Rs.';
    const sel = document.getElementById('gen-currency');
    const knownValues = [...sel.options].map(o => o.value).filter(v => v !== 'custom');
    if (knownValues.includes(currency)) {
      setSelect('gen-currency', currency);
      document.getElementById('gen-currency-custom-row').style.display = 'none';
    } else {
      setSelect('gen-currency', 'custom');
      document.getElementById('gen-currency-custom').value = currency;
      document.getElementById('gen-currency-custom-row').style.display = '';
    }
  } catch (e) {
    toast('Could not load settings', 'err');
  }
}

// Show/hide custom currency input when dropdown changes
document.addEventListener('DOMContentLoaded', () => {
  const sel = document.getElementById('gen-currency');
  if (sel) sel.addEventListener('change', () => {
    document.getElementById('gen-currency-custom-row').style.display =
      sel.value === 'custom' ? '' : 'none';
  });
});

async function saveGeneral() {
  const sel = document.getElementById('gen-currency');
  const currency = sel.value === 'custom'
    ? document.getElementById('gen-currency-custom').value.trim()
    : sel.value;
  if (!currency) { toast('Please enter a currency prefix', 'err'); return; }
  const r = await api('/admin/api/settings/general', {
    method: 'PUT',
    body: JSON.stringify({ currency }),
  });
  if (r.ok) {
    appCurrency = currency;
    const priceInput = document.getElementById('sm-price');
    if (priceInput) priceInput.placeholder = `e.g. 2500`;
    toast('Settings saved', 'ok');
  } else {
    toast(r.error || 'Error saving settings', 'err');
  }
}

// ══════════════════════════════════════
//  ROLES
// ══════════════════════════════════════

async function loadRoles() {
  const tbody = document.getElementById('roles-tbody');
  tbody.innerHTML = `<tr class="loading-row"><td colspan="2"><span class="spinner"></span></td></tr>`;
  try {
    allRoles = await api('/admin/api/settings/roles');
    renderRoles();
  } catch (e) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="2">Could not load roles.</td></tr>`;
  }
}

function renderRoles() {
  const tbody = document.getElementById('roles-tbody');
  if (!allRoles.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="2">No roles defined yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = allRoles.map(r => `
    <tr>
      <td><span class="role-badge">${esc(r.name)}</span></td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="deleteRole(${r.id}, '${esc(r.name)}')">🗑 Delete</button>
      </td>
    </tr>`).join('');
}

function openRoleModal() {
  document.getElementById('role-name-input').value = '';
  document.getElementById('role-modal').classList.add('open');
}

async function saveRole() {
  const name = document.getElementById('role-name-input').value.trim();
  if (!name) { toast('Please enter a role name', 'err'); return; }
  const r = await api('/admin/api/settings/roles', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  if (r.error) { toast(r.error, 'err'); return; }
  toast('Role added', 'ok');
  closeModal('role-modal');
  await loadRoles();
}

async function deleteRole(id, name) {
  if (!confirm(`Delete role "${name}"? Staff with this role will keep it as a label, but it won't appear in the dropdown anymore.`)) return;
  await api(`/admin/api/settings/roles/${id}`, { method: 'DELETE' });
  toast('Role deleted', 'ok');
  await loadRoles();
}

// ══════════════════════════════════════
//  MODAL CLOSE ON OVERLAY CLICK
// ══════════════════════════════════════
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => {
    if (e.target === o) o.classList.remove('open');
  });
});

// ══════════════════════════════════════
//  INIT
// ══════════════════════════════════════
(async function init() {
  // Load branches and roles first so all selects can be populated immediately
  try {
    allBranches = await api('/admin/api/settings/branches');
    populateBranchSelects();
  } catch (e) { /* non-fatal */ }

  try {
    allRoles = await api('/admin/api/settings/roles');
  } catch (e) { /* non-fatal */ }

  // Load currency setting into cache
  try {
    const settings = await api('/admin/api/settings/general');
    if (settings.currency) appCurrency = settings.currency;
    // Update price placeholder in service modal
    const priceInput = document.getElementById('sm-price');
    if (priceInput) priceInput.placeholder = `e.g. 2500`;
  } catch (e) { /* non-fatal */ }

  // Load staff for booking modal
  try {
    allStaff = await api('/admin/api/settings/staff');
  } catch (e) { /* non-fatal */ }

  await Promise.all([loadBookings(true), loadServices()]);
  await loadStats();
})();
