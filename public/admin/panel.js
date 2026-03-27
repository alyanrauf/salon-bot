// ══════════════════════════════════════
//  STATE
// ══════════════════════════════════════
let allServices = [];
let allDeals    = [];
let allBookings = [];

const titles = {
  dashboard: 'Dashboard',
  bookings:  'Bookings',
  packages:  'Packages & Prices',
  deals:     'Deals & Offers',
  clients:   'Clients',
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
  if (tab === 'deals')    loadDeals();
  if (tab === 'clients')  loadClients();
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
    pending:   'badge-pending',
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
    document.getElementById('s-total').textContent    = d.total_bookings   ?? 0;
    document.getElementById('s-today').textContent    = d.today_bookings   ?? 0;
    document.getElementById('s-services').textContent = d.active_services  ?? 0;
    document.getElementById('s-clients').textContent  = d.total_clients    ?? 0;
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
  const cols  = recent ? 7 : 9;
  tbody.innerHTML = `<tr class="loading-row"><td colspan="${cols}"><span class="spinner"></span></td></tr>`;

  let url = '/admin/api/bookings';
  if (!recent) {
    const date   = document.getElementById('f-date')?.value   || '';
    const status = document.getElementById('f-status')?.value || '';
    const params = new URLSearchParams();
    if (date)   params.set('date', date);
    if (status) params.set('status', status);
    if ([...params].length) url += '?' + params;
  } else {
    url += '?limit=6';
  }

  try {
    const rows  = await api(url);
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
      <td>${esc(r.branch  || '—')}</td>
      <td>${esc(r.date    || '—')}</td>
      <td>${esc(r.time    || '—')}</td>
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
  document.getElementById('bm-id').value    = b.id;
  document.getElementById('bm-name').value  = b.customer_name;
  document.getElementById('bm-phone').value = b.phone  || '';
  document.getElementById('bm-date').value  = b.date   || '';
  document.getElementById('bm-time').value  = b.time   || '';
  document.getElementById('bm-notes').value = b.notes  || '';
  setSelect('bm-branch', b.branch);
  setSelect('bm-status', b.status);
  populateServiceSelect(b.service);
  document.getElementById('bm-title').textContent = 'Edit Appointment';
  document.getElementById('booking-modal').classList.add('open');
}

function openBookingModal() {
  ['bm-id', 'bm-name', 'bm-phone', 'bm-date', 'bm-time', 'bm-notes'].forEach(
    id => (document.getElementById(id).value = '')
  );
  setSelect('bm-status', 'pending');
  populateServiceSelect();
  document.getElementById('bm-title').textContent = 'New Appointment';
  document.getElementById('booking-modal').classList.add('open');
}

async function saveBooking() {
  const id   = document.getElementById('bm-id').value;
  const body = {
    customer_name: document.getElementById('bm-name').value.trim(),
    phone:         document.getElementById('bm-phone').value.trim(),
    service:       document.getElementById('bm-service').value,
    branch:        document.getElementById('bm-branch').value,
    date:          document.getElementById('bm-date').value,
    time:          document.getElementById('bm-time').value,
    notes:         document.getElementById('bm-notes').value.trim(),
    status:        document.getElementById('bm-status').value,
  };
  if (!body.customer_name) { toast('Name is required', 'err'); return; }

  const url    = id ? `/admin/api/bookings/${id}` : '/admin/api/bookings';
  const method = id ? 'PUT' : 'POST';
  await api(url, { method, body: JSON.stringify(body) });
  toast(id ? 'Appointment updated' : 'Appointment created', 'ok');
  closeModal('booking-modal');
  loadBookings();
  loadBookings(true);
  loadStats();
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
    renderServices();
  } catch (e) {
    document.getElementById('services-grid').innerHTML =
      '<div style="grid-column:1/-1;text-align:center;color:var(--sub);padding:40px">Could not load services.</div>';
  }
}

function renderServices() {
  const branch = document.getElementById('branch-filter').value;
  const list   = branch ? allServices.filter(s => s.branch === branch) : allServices;
  const grid   = document.getElementById('services-grid');
  grid.innerHTML =
    list.map(s => `
      <div class="pkg-card">
        <div class="pkg-card-name">${esc(s.name)}</div>
        <div class="pkg-card-price">${esc(s.price)}</div>
        <div class="pkg-card-branch">📍 ${esc(s.branch)}</div>
        <div class="pkg-card-actions">
          <button class="btn btn-sm btn-outline" onclick="editService(${s.id})">Edit</button>
          <button class="btn btn-sm btn-danger"  onclick="deleteService(${s.id})">Delete</button>
        </div>
      </div>`).join('') +
    `<button class="pkg-add-btn" onclick="openServiceModal()">➕ Add Service</button>`;
}

function openServiceModal() {
  document.getElementById('sm-id').value    = '';
  document.getElementById('sm-name').value  = '';
  document.getElementById('sm-price').value = '';
  setSelect('sm-branch', 'All Branches');
  document.getElementById('sm-title').textContent = 'Add Service';
  document.getElementById('service-modal').classList.add('open');
}

function editService(id) {
  const s = allServices.find(x => x.id === id);
  if (!s) return;
  document.getElementById('sm-id').value    = s.id;
  document.getElementById('sm-name').value  = s.name;
  document.getElementById('sm-price').value = s.price;
  setSelect('sm-branch', s.branch);
  document.getElementById('sm-title').textContent = 'Edit Service';
  document.getElementById('service-modal').classList.add('open');
}

async function saveService() {
  const id   = document.getElementById('sm-id').value;
  const body = {
    name:   document.getElementById('sm-name').value.trim(),
    price:  document.getElementById('sm-price').value.trim(),
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
  document.getElementById('dm-id').value          = '';
  document.getElementById('dm-title-input').value = '';
  document.getElementById('dm-desc').value        = '';
  setSelect('dm-active', '1');
  document.getElementById('dm-title').textContent = 'Add Deal';
  document.getElementById('deal-modal').classList.add('open');
}

function editDeal(id) {
  const d = allDeals.find(x => x.id === id);
  if (!d) return;
  document.getElementById('dm-id').value          = d.id;
  document.getElementById('dm-title-input').value = d.title;
  document.getElementById('dm-desc').value        = d.description;
  setSelect('dm-active', String(d.active));
  document.getElementById('dm-title').textContent = 'Edit Deal';
  document.getElementById('deal-modal').classList.add('open');
}

async function saveDeal() {
  const id   = document.getElementById('dm-id').value;
  const body = {
    id:          id ? parseInt(id) : undefined,
    title:       document.getElementById('dm-title-input').value.trim(),
    description: document.getElementById('dm-desc').value.trim(),
    active:      document.getElementById('dm-active').value === '1',
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
    const rows  = await api('/admin/api/clients');
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
  await Promise.all([loadStats(), loadBookings(true), loadServices()]);
})();
