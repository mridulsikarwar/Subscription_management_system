// Brightloop Subscription Management System - Frontend App
// State and UI management

const state = {
  currentUser: {
    id: 1,
    name: 'Sarah Jenkins',
    email: 'admin@brightloop.com',
    role: 'admin',
    company: 'Brightloop Software HQ'
  },
  currentTab: 'dashboard',
  subscriptions: [],
  invoices: [],
  payments: [],
  products: [],
  plans: [],
  discounts: [],
  templates: [],
  users: [],
  taxes: []
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  setupPersona();
  loadAllData();
});

// Persona switching for quick demoing
const demoPersonas = {
  admin: { id: 1, name: 'Sarah Jenkins', email: 'admin@brightloop.com', role: 'admin', company: 'Brightloop Software HQ', avatar: 'SA' },
  staff: { id: 2, name: 'David Miller', email: 'staff@brightloop.com', role: 'staff', company: 'Brightloop Operations', avatar: 'DM' },
  'customer-acme': { id: 3, name: 'Alex Rivera (Acme Corp)', email: 'alex@acmecorp.com', role: 'customer', company: 'Acme Corporation', avatar: 'AR' },
  'customer-nova': { id: 4, name: 'Elena Rostova (Nova Retail)', email: 'elena@novaretail.io', role: 'customer', company: 'Nova Retail Stores', avatar: 'ER' }
};

function switchPersona(personaKey) {
  const p = demoPersonas[personaKey];
  if (!p) return;
  state.currentUser = p;
  updateUserHeader();
  applyRolePermissions();
  loadAllData();
  showToast(`Switched persona to ${p.name} (${p.role.toUpperCase()})`);
}

function updateUserHeader() {
  const user = state.currentUser;
  document.getElementById('current-user-name').textContent = user.name;
  document.getElementById('current-user-role').textContent = user.role.toUpperCase() + (user.company ? ` • ${user.company}` : '');
  const initials = user.avatar || user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  document.getElementById('current-user-avatar').textContent = initials;
}

function applyRolePermissions() {
  const role = state.currentUser.role;
  const adminElements = document.querySelectorAll('.admin-only');
  const adminStaffElements = document.querySelectorAll('.admin-staff-only');
  const portalBanner = document.getElementById('portal-banner');

  if (role === 'admin') {
    adminElements.forEach(el => el.style.display = '');
    adminStaffElements.forEach(el => el.style.display = '');
    if (portalBanner) portalBanner.style.display = 'none';
  } else if (role === 'staff') {
    adminElements.forEach(el => el.style.display = 'none');
    adminStaffElements.forEach(el => el.style.display = '');
    if (portalBanner) portalBanner.style.display = 'none';
  } else { // customer
    adminElements.forEach(el => el.style.display = 'none');
    adminStaffElements.forEach(el => el.style.display = 'none');
    if (portalBanner) portalBanner.style.display = 'block';

    // If current tab is admin only, redirect to subscriptions or invoices
    if (['templates', 'products', 'plans', 'discounts', 'staff'].includes(state.currentTab)) {
      switchTab('subscriptions');
    }
  }
}

function setupPersona() {
  updateUserHeader();
  applyRolePermissions();
}

// Navigation Tabs
function switchTab(tabId) {
  state.currentTab = tabId;
  document.querySelectorAll('.sidebar-menu .nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.tab-content').forEach(sec => {
    sec.classList.toggle('active', sec.id === `tab-${tabId}`);
  });

  if (tabId === 'dashboard') loadDashboard();
  else if (tabId === 'subscriptions') loadSubscriptions();
  else if (tabId === 'invoices') loadInvoices();
  else if (tabId === 'payments') loadPayments();
  else if (tabId === 'templates') loadTemplates();
  else if (tabId === 'products') loadProducts();
  else if (tabId === 'plans') loadPlans();
  else if (tabId === 'discounts') loadDiscounts();
  else if (tabId === 'staff') loadStaff();
}

// Fetch helper with headers
async function api(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-user-id': state.currentUser.id.toString(),
    ...(options.headers || {})
  };

  const res = await fetch(endpoint, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Server request failed');
  }
  return data;
}

// Toast helper
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.background = isError ? '#ef4444' : '#1e293b';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// Load All Reference Data
async function loadAllData() {
  try {
    await Promise.all([
      loadDashboard(),
      loadProducts(),
      loadPlans(),
      loadTaxes(),
      loadUsers()
    ]);
  } catch (e) {
    console.error('Initial data load error:', e);
  }
}

// 1. DASHBOARD
async function loadDashboard() {
  try {
    const stats = await api('/api/dashboard/stats');
    document.getElementById('kpi-active-subs').textContent = stats.activeSubs;
    document.getElementById('kpi-total-subs').textContent = `${stats.totalSubs} total tracked`;
    document.getElementById('kpi-mrr').textContent = `$${stats.mrr.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    document.getElementById('kpi-arr').textContent = `ARR: $${stats.arr.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    document.getElementById('kpi-billed').textContent = `$${stats.totalBilled.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    document.getElementById('kpi-collected').textContent = `$${stats.totalCollected.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    document.getElementById('kpi-overdue-amount').textContent = `$${stats.overdueAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    document.getElementById('kpi-overdue-count').textContent = `${stats.overdueCount} overdue invoices`;

    const rate = stats.totalBilled > 0 ? Math.round((stats.totalCollected / stats.totalBilled) * 100) : 100;
    document.getElementById('kpi-collection-rate').textContent = `${rate}% collection rate`;

    // Plans breakdown bars
    const maxPlan = Math.max(...(stats.subsByPlan.map(p => p.count) || [1]), 1);
    const planHtml = stats.subsByPlan.map(p => `
      <div class="bar-item">
        <div class="bar-label-wrap">
          <span>${p.name}</span>
          <span>${p.count} active</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${(p.count / maxPlan) * 100}%"></div>
        </div>
      </div>
    `).join('') || '<div class="text-muted p-2">No active subscriptions yet.</div>';
    document.getElementById('plan-breakdown-list').innerHTML = planHtml;

    // Status Pipeline boxes
    const statuses = ['Draft', 'Confirmed', 'Paid', 'Cancelled'];
    const statusMap = Object.fromEntries(stats.statusCounts.map(s => [s.status, s]));
    const pipelineHtml = statuses.map(st => {
      const item = statusMap[st] || { count: 0, total: 0 };
      return `
        <div class="pipeline-box">
          <div class="pipeline-box-count">${item.count}</div>
          <div class="pipeline-box-label">${st}</div>
          <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">$${(item.total || 0).toLocaleString()}</div>
        </div>
      `;
    }).join('');
    document.getElementById('status-breakdown-list').innerHTML = pipelineHtml;

    // Recent Invoices Table
    const recInvTbody = document.getElementById('dash-recent-invoices');
    recInvTbody.innerHTML = (stats.recentInvoices || []).map(inv => `
      <tr>
        <td><b>${inv.invoice_number}</b></td>
        <td>${inv.customer_name}</td>
        <td><b>$${inv.total_amount.toFixed(2)}</b></td>
        <td><span class="badge badge-${inv.status.toLowerCase()}">${inv.status}</span></td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="p-4 text-center">No recent invoices</td></tr>';

    // Recent Payments Table
    const recPayTbody = document.getElementById('dash-recent-payments');
    recPayTbody.innerHTML = (stats.recentPayments || []).map(p => `
      <tr>
        <td><b>${p.payment_number}</b></td>
        <td>${p.customer_name}</td>
        <td style="color: var(--success); font-weight: 600;">+$${p.amount.toFixed(2)}</td>
        <td>${p.method}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="p-4 text-center">No recent payments</td></tr>';

  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

// 2. SUBSCRIPTIONS
async function loadSubscriptions() {
  try {
    const role = state.currentUser.role;
    let url = '/api/subscriptions?';
    if (role === 'customer') {
      url += `customer_id=${state.currentUser.id}&`;
    }
    const status = document.getElementById('sub-filter-status').value;
    if (status) url += `status=${status}&`;

    state.subscriptions = await api(url);
    renderSubscriptionsTable(state.subscriptions);
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderSubscriptionsTable(subs) {
  const tbody = document.getElementById('subscriptions-tbody');
  if (!subs.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 30px;">No subscriptions found.</td></tr>';
    return;
  }

  tbody.innerHTML = subs.map(s => {
    const isCustomer = state.currentUser.role === 'customer';
    return `
      <tr>
        <td>
          <b>${s.sub_number}</b>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${s.payment_terms}</div>
        </td>
        <td>
          <b>${s.customer_name}</b>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${s.customer_company || s.customer_email}</div>
        </td>
        <td>
          <div>${s.plan_name}</div>
          <span class="badge" style="background:#f1f5f9; text-transform: capitalize;">${s.billing_interval}</span>
        </td>
        <td>${s.start_date}</td>
        <td><b>${s.next_billing_date || '—'}</b></td>
        <td><span class="badge badge-${s.status.toLowerCase()}">${s.status}</span></td>
        <td><b>$${(s.total_amount || 0).toFixed(2)}</b></td>
        <td>
          <div style="display: flex; gap: 4px; flex-wrap: wrap;">
            ${!isCustomer ? getSubscriptionActionButtons(s) : ''}
            <button class="btn btn-outline btn-sm" onclick="viewSubscriptionDetails(${s.id})">Details</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function getSubscriptionActionButtons(s) {
  let btns = '';
  if (s.status === 'Draft') {
    btns += `<button class="btn btn-sm btn-secondary" onclick="updateSubStatus(${s.id}, 'Quotation')">Send Quote</button>`;
  } else if (s.status === 'Quotation') {
    btns += `<button class="btn btn-sm btn-primary" onclick="updateSubStatus(${s.id}, 'Confirmed')">Confirm</button>`;
  } else if (s.status === 'Confirmed') {
    btns += `<button class="btn btn-sm btn-success" onclick="updateSubStatus(${s.id}, 'Active')">Activate</button>`;
  } else if (s.status === 'Active') {
    btns += `<button class="btn btn-sm btn-primary" onclick="billSubscriptionNow(${s.id})" title="Generate recurring invoice">⚡ Bill Now</button>`;
    if (s.allow_pause) {
      btns += `<button class="btn btn-sm btn-secondary" onclick="updateSubStatus(${s.id}, 'Paused')">Pause</button>`;
    }
    btns += `<button class="btn btn-sm btn-danger" onclick="updateSubStatus(${s.id}, 'Closed')">Close</button>`;
  } else if (s.status === 'Paused') {
    btns += `<button class="btn btn-sm btn-success" onclick="updateSubStatus(${s.id}, 'Active')">Resume</button>`;
  } else if (s.status === 'Closed' && s.allow_renew) {
    btns += `<button class="btn btn-sm btn-secondary" onclick="updateSubStatus(${s.id}, 'Active')">Renew</button>`;
  }
  return btns;
}

async function updateSubStatus(subId, newStatus) {
  try {
    await api(`/api/subscriptions/${subId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: newStatus })
    });
    showToast(`Subscription status updated to ${newStatus}`);
    loadSubscriptions();
    loadDashboard();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function billSubscriptionNow(subId) {
  try {
    const res = await api(`/api/subscriptions/${subId}/bill`, { method: 'POST' });
    showToast(`Invoice #${res.invoice.invoice_number} created successfully!`);
    loadSubscriptions();
    loadDashboard();
    switchTab('invoices');
  } catch (err) {
    showToast(err.message, true);
  }
}

function filterSubscriptionsTable(query) {
  const q = query.toLowerCase().trim();
  const filtered = state.subscriptions.filter(s => 
    s.sub_number.toLowerCase().includes(q) ||
    s.customer_name.toLowerCase().includes(q) ||
    (s.customer_company && s.customer_company.toLowerCase().includes(q)) ||
    s.plan_name.toLowerCase().includes(q) ||
    s.status.toLowerCase().includes(q)
  );
  renderSubscriptionsTable(filtered);
}

// 3. INVOICES
async function loadInvoices() {
  try {
    const role = state.currentUser.role;
    let url = '/api/invoices?';
    if (role === 'customer') {
      url += `customer_id=${state.currentUser.id}&`;
    }
    const status = document.getElementById('inv-filter-status').value;
    if (status) url += `status=${status}&`;
    if (document.getElementById('inv-filter-overdue').checked) {
      url += 'overdue=true&';
    }

    state.invoices = await api(url);
    renderInvoicesTable(state.invoices);
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderInvoicesTable(invs) {
  const tbody = document.getElementById('invoices-tbody');
  if (!invs.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 30px;">No invoices found.</td></tr>';
    return;
  }

  tbody.innerHTML = invs.map(i => {
    const isCustomer = state.currentUser.role === 'customer';
    return `
      <tr class="${i.is_overdue ? 'table-warning-row' : ''}">
        <td><b>${i.invoice_number}</b></td>
        <td>${i.sub_number ? `<span class="badge" style="background:#e0e7ff;">${i.sub_number}</span>` : '—'}</td>
        <td>
          <b>${i.customer_name}</b>
          <div style="font-size: 0.72rem; color: var(--text-muted);">${i.customer_company || i.customer_email}</div>
        </td>
        <td>${i.invoice_date}</td>
        <td>
          ${i.due_date} 
          ${i.is_overdue ? '<span class="badge badge-overdue">OVERDUE</span>' : ''}
        </td>
        <td><b>$${i.total_amount.toFixed(2)}</b></td>
        <td>
          <b style="color: ${i.balance > 0 ? 'var(--danger)' : 'var(--success)'};">
            $${i.balance.toFixed(2)}
          </b>
        </td>
        <td><span class="badge badge-${i.status.toLowerCase()}">${i.status}</span></td>
        <td>
          <div style="display: flex; gap: 4px; flex-wrap: wrap;">
            <button class="btn btn-outline btn-sm" onclick="printInvoiceView(${i.id})">🖨️ View/Print</button>
            ${!isCustomer && i.status === 'Draft' ? `<button class="btn btn-secondary btn-sm" onclick="updateInvoiceStatus(${i.id}, 'Confirmed')">Confirm</button>` : ''}
            ${!isCustomer ? `<button class="btn btn-outline btn-sm" onclick="sendInvoiceEmail(${i.id})">✉️ Send</button>` : ''}
            ${i.balance > 0 && i.status !== 'Cancelled' ? `<button class="btn btn-success btn-sm" onclick="openPaymentModal(${i.id}, ${i.balance})">💳 Pay</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterInvoicesTable(query) {
  const q = query.toLowerCase().trim();
  const filtered = state.invoices.filter(i => 
    i.invoice_number.toLowerCase().includes(q) ||
    i.customer_name.toLowerCase().includes(q) ||
    (i.sub_number && i.sub_number.toLowerCase().includes(q)) ||
    i.status.toLowerCase().includes(q)
  );
  renderInvoicesTable(filtered);
}

async function updateInvoiceStatus(invId, status) {
  try {
    await api(`/api/invoices/${invId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status })
    });
    showToast(`Invoice updated to ${status}`);
    loadInvoices();
    loadDashboard();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function sendInvoiceEmail(invId) {
  try {
    const res = await api(`/api/invoices/${invId}/send`, { method: 'POST' });
    showToast(res.message);
    loadInvoices();
  } catch (err) {
    showToast(err.message, true);
  }
}

// 4. PAYMENTS
async function loadPayments() {
  try {
    state.payments = await api('/api/payments');
    const tbody = document.getElementById('payments-tbody');
    if (!state.payments.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 30px;">No payments recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = state.payments.map(p => `
      <tr>
        <td><b>${p.payment_number}</b></td>
        <td><b>${p.invoice_number}</b></td>
        <td>${p.customer_name}</td>
        <td>${p.payment_date}</td>
        <td><span class="badge" style="background:#e0f2fe; color:#0369a1;">${p.method}</span></td>
        <td><b style="color:var(--success);">+$${p.amount.toFixed(2)}</b></td>
        <td style="color:var(--text-muted);">${p.note || '—'}</td>
      </tr>
    `).join('');
  } catch (err) {
    showToast(err.message, true);
  }
}

// 5. PRODUCTS & VARIANTS
async function loadProducts() {
  try {
    state.products = await api('/api/products');
    const tbody = document.getElementById('products-tbody');
    if (!tbody) return;

    if (!state.products.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">No products found.</td></tr>';
      return;
    }

    tbody.innerHTML = state.products.map(p => `
      <tr>
        <td><b>${p.name}</b></td>
        <td><span class="badge" style="background:#f1f5f9; text-transform: uppercase;">${p.type}</span></td>
        <td><b>$${p.sales_price.toFixed(2)}</b></td>
        <td>$${p.cost_price.toFixed(2)}</td>
        <td>
          ${p.variants && p.variants.length > 0 ? p.variants.map(v => `
            <span class="feature-tag">${v.name} (+$${v.price_extra})</span>
          `).join(' ') : '<span style="color:var(--text-muted); font-size:0.75rem;">None</span>'}
        </td>
        <td style="color:var(--text-muted); font-size:0.8rem;">${p.notes || '—'}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Products load error:', err);
  }
}

// 6. PLANS
async function loadPlans() {
  try {
    state.plans = await api('/api/plans');
    const grid = document.getElementById('plans-grid');
    if (!grid) return;

    grid.innerHTML = state.plans.map(pl => `
      <div class="feature-box">
        <div>
          <div class="feature-box-title">${pl.name}</div>
          <div class="feature-box-price">$${pl.cost.toFixed(2)} <span style="font-size:0.85rem; color:var(--text-muted); font-weight:400;">/ ${pl.billing_interval}</span></div>
          <div class="feature-tag-list">
            <span class="feature-tag">Min Seats: ${pl.min_quantity}</span>
            <span class="feature-tag">${pl.auto_close_on_end ? 'Auto-close on end' : 'Renews unless cancelled'}</span>
            <span class="feature-tag">${pl.allow_pause ? 'Pause enabled' : 'No pause'}</span>
            <span class="feature-tag">${pl.allow_close_early ? 'Early closure permitted' : 'Contract fixed duration'}</span>
          </div>
        </div>
        <div style="font-size:0.75rem; color:var(--text-muted); border-top:1px solid var(--border-color); padding-top:10px;">
          Valid: ${pl.start_date || 'Any'} to ${pl.end_date || 'Any'}
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Plans load error:', err);
  }
}

// 7. DISCOUNTS
async function loadDiscounts() {
  try {
    state.discounts = await api('/api/discounts');
    const tbody = document.getElementById('discounts-tbody');
    if (!tbody) return;

    if (!state.discounts.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px;">No discount rules created yet.</td></tr>';
      return;
    }

    tbody.innerHTML = state.discounts.map(d => `
      <tr>
        <td><b>${d.code}</b></td>
        <td>
          <span class="badge" style="background:#fef3c7; color:#b45309;">
            ${d.type === 'percentage' ? `${d.value}% Off` : `$${d.value.toFixed(2)} Off`}
          </span>
        </td>
        <td>${d.scope === 'all' ? 'Whole Subscription' : `Product: ${d.product_name || 'Selected'}`}</td>
        <td>
          ${d.min_purchase > 0 ? `Min $${d.min_purchase}` : ''}
          ${d.min_quantity > 0 ? `Min ${d.min_quantity} seats` : ''}
          ${d.min_purchase === 0 && d.min_quantity === 0 ? 'None' : ''}
        </td>
        <td>${d.start_date || 'Evergreen'} to ${d.end_date || 'Ongoing'}</td>
        <td>${d.used_count} / ${d.usage_limit > 0 ? d.usage_limit : '∞'}</td>
        <td><span class="badge badge-active">${d.is_active ? 'Active' : 'Disabled'}</span></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Discounts load error:', err);
  }
}

// 8. TEMPLATES
async function loadTemplates() {
  try {
    state.templates = await api('/api/templates');
    const grid = document.getElementById('templates-grid');
    if (!grid) return;

    grid.innerHTML = state.templates.map(tpl => `
      <div class="feature-box">
        <div>
          <div class="feature-box-title">${tpl.name}</div>
          <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom:10px;">
            Based on Plan: <b>${tpl.plan_name}</b> ($${tpl.plan_cost}/${tpl.billing_interval})
          </div>
          <div style="font-size:0.8rem; font-weight:600; margin-bottom:4px;">Pre-filled Product Lines:</div>
          <div class="feature-tag-list">
            ${(tpl.lines || []).map(l => `
              <span class="feature-tag">${l.quantity}x ${l.product_name} ${l.variant_name ? '(' + l.variant_name + ')' : ''}</span>
            `).join('')}
          </div>
        </div>
        <div class="flex-between" style="border-top:1px solid var(--border-color); padding-top:12px; margin-top:10px;">
          <span style="font-size:0.75rem; color:var(--text-muted);">Valid for ${tpl.validity_days} days</span>
          <button class="btn btn-sm btn-primary" onclick="openNewSubscriptionFromTemplate(${tpl.id})">Create Quote</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Templates load error:', err);
  }
}

// 9. STAFF MEMBERS
async function loadStaff() {
  try {
    const users = await api('/api/users?role=staff');
    const tbody = document.getElementById('staff-tbody');
    if (!tbody) return;

    tbody.innerHTML = users.map(u => `
      <tr>
        <td><b>${u.name}</b></td>
        <td>${u.email}</td>
        <td><span class="badge" style="background:#e0e7ff; color:#3730a3;">Staff Rep</span></td>
        <td>${u.company || 'Brightloop Operations'}</td>
        <td>${u.created_at || '2026-10-31'}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Staff load error:', err);
  }
}

async function loadTaxes() {
  state.taxes = await api('/api/taxes');
}

async function loadUsers() {
  state.users = await api('/api/users');
}

// ==================== MODALS & USER ACTIONS ====================

function showModal(title, bodyHtml, footerButtonsHtml, isWide = false) {
  const container = document.getElementById('modal-container');
  container.className = isWide ? 'modal-dialog wide' : 'modal-dialog';
  container.innerHTML = `
    <div class="modal-header">
      <h3>${title}</h3>
      <button class="modal-close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">${bodyHtml}</div>
    <div class="modal-footer">${footerButtonsHtml}</div>
  `;
  document.getElementById('modal-backdrop').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal-backdrop').style.display = 'none';
}

function closeModalOnBackdrop(e) {
  if (e.target.id === 'modal-backdrop') closeModal();
}

// BILLING DAY MODAL
function triggerBillingDayModal() {
  showModal(
    '⚡ Execute Billing Day',
    `
      <div style="font-size: 0.9rem; line-height: 1.6;">
        <p>This automated billing run scans <b>all active subscriptions</b> where the billing cycle is due (today or earlier).</p>
        <p style="margin-top: 10px;">For each due subscription:</p>
        <ul style="margin-left: 20px; margin-top: 6px;">
          <li>Generates customer invoice with lines & tax automatically filled</li>
          <li>Applies valid eligible discount rules automatically</li>
          <li>Advances <code>next_billing_date</code> based on billing interval</li>
          <li>Guarantees: <b>Nothing is billed twice or skipped</b></li>
        </ul>
      </div>
    `,
    `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="executeBillingDay()">Run Billing Now</button>
    `
  );
}

async function executeBillingDay() {
  try {
    const res = await api('/api/billing/run-day', { method: 'POST' });
    closeModal();
    showToast(res.message);
    loadDashboard();
    loadSubscriptions();
    loadInvoices();
  } catch (err) {
    showToast(err.message, true);
  }
}

// NEW SUBSCRIPTION / QUOTATION MODAL
function openNewSubscriptionModal(preselectedTemplateId = null) {
  const customers = state.users.filter(u => u.role === 'customer');
  const bodyHtml = `
    <form id="new-sub-form">
      <div class="form-row">
        <div class="form-group">
          <label>Customer *</label>
          <select id="sub-customer" required>
            ${customers.map(c => `<option value="${c.id}">${c.name} (${c.company || c.email})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Plan *</label>
          <select id="sub-plan" required>
            ${state.plans.map(p => `<option value="${p.id}">${p.name} ($${p.cost}/${p.billing_interval})</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Payment Terms</label>
          <select id="sub-terms">
            <option value="Immediate Payment">Immediate Payment</option>
            <option value="Net 15">Net 15</option>
            <option value="Net 30">Net 30</option>
          </select>
        </div>
        <div class="form-group">
          <label>Start Date</label>
          <input type="date" id="sub-start-date" value="${new Date().toISOString().split('T')[0]}">
        </div>
      </div>

      <div class="form-group">
        <label>Load from Quotation Template (Optional)</label>
        <select id="sub-template" onchange="onTemplateSelectInModal(this.value)">
          <option value="">-- Choose Template or customize manually --</option>
          ${state.templates.map(t => `<option value="${t.id}" ${preselectedTemplateId == t.id ? 'selected' : ''}>${t.name} (Plan: ${t.plan_name})</option>`).join('')}
        </select>
      </div>

      <div class="form-group">
        <label>Add Product Line Item</label>
        <div class="form-row" style="grid-template-columns: 2fr 1fr 1fr auto; align-items: flex-end;">
          <div>
            <select id="sub-line-product" onchange="updateVariantOptions(this.value)">
              ${state.products.map(p => `<option value="${p.id}">${p.name} ($${p.sales_price})</option>`).join('')}
            </select>
            <select id="sub-line-variant" style="margin-top: 4px;">
              <option value="">No variant / Standard</option>
            </select>
          </div>
          <div>
            <input type="number" id="sub-line-qty" value="1" min="1" placeholder="Qty">
          </div>
          <div>
            <input type="number" id="sub-line-price" placeholder="Price" step="0.01">
          </div>
          <div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="addLineToSubModal()">+ Add</button>
          </div>
        </div>
      </div>

      <table class="data-table" style="margin-top: 10px;">
        <thead>
          <tr>
            <th>Product / Variant</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Line Total</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="sub-modal-lines-tbody">
          <!-- Dynamically added -->
        </tbody>
      </table>

      <div class="form-group" style="margin-top: 14px;">
        <label>Notes / Scope Description</label>
        <textarea id="sub-notes" rows="2" placeholder="Custom terms or customer notes..."></textarea>
      </div>
    </form>
  `;

  showModal(
    '➕ Create Subscription / Quotation Offer',
    bodyHtml,
    `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitNewSubscription()">Create Offer</button>
    `,
    true
  );

  window.subModalLines = [];
  if (state.products.length > 0) {
    updateVariantOptions(state.products[0].id);
    document.getElementById('sub-line-price').value = state.products[0].sales_price;
  }
}

function openNewSubscriptionFromTemplate(templateId) {
  openNewSubscriptionModal(templateId);
  onTemplateSelectInModal(templateId);
}

function onTemplateSelectInModal(tplId) {
  if (!tplId) return;
  const tpl = state.templates.find(t => t.id == tplId);
  if (!tpl) return;
  document.getElementById('sub-plan').value = tpl.plan_id;
  window.subModalLines = (tpl.lines || []).map(l => ({
    product_id: l.product_id,
    variant_id: l.variant_id,
    product_name: l.product_name,
    variant_name: l.variant_name,
    quantity: l.quantity,
    unit_price: l.sales_price + (l.price_extra || 0),
    tax_rate: 10.0
  }));
  renderSubModalLines();
}

function updateVariantOptions(prodId) {
  const prod = state.products.find(p => p.id == prodId);
  const variantSelect = document.getElementById('sub-line-variant');
  const priceInput = document.getElementById('sub-line-price');
  if (!prod || !variantSelect) return;

  priceInput.value = prod.sales_price;
  let options = '<option value="">No variant / Standard</option>';
  if (prod.variants && prod.variants.length > 0) {
    options += prod.variants.map(v => `<option value="${v.id}" data-extra="${v.price_extra}">${v.name} (+${v.price_extra})</option>`).join('');
  }
  variantSelect.innerHTML = options;
}

function addLineToSubModal() {
  const prodId = parseInt(document.getElementById('sub-line-product').value);
  const prod = state.products.find(p => p.id === prodId);
  const varSelect = document.getElementById('sub-line-variant');
  const varId = varSelect.value ? parseInt(varSelect.value) : null;
  const varText = varSelect.options[varSelect.selectedIndex]?.text || '';
  const qty = parseInt(document.getElementById('sub-line-qty').value) || 1;
  const price = parseFloat(document.getElementById('sub-line-price').value) || prod.sales_price;

  window.subModalLines.push({
    product_id: prodId,
    variant_id: varId,
    product_name: prod.name,
    variant_name: varId ? varText : null,
    quantity: qty,
    unit_price: price,
    tax_rate: 10.0
  });

  renderSubModalLines();
}

function renderSubModalLines() {
  const tbody = document.getElementById('sub-modal-lines-tbody');
  tbody.innerHTML = window.subModalLines.map((l, index) => `
    <tr>
      <td>${l.product_name} ${l.variant_name ? `<br><small style="color:var(--text-muted);">${l.variant_name}</small>` : ''}</td>
      <td>${l.quantity}</td>
      <td>$${l.unit_price.toFixed(2)}</td>
      <td><b>$${(l.quantity * l.unit_price).toFixed(2)}</b></td>
      <td><button type="button" class="btn btn-link" style="color:var(--danger);" onclick="removeSubModalLine(${index})">Remove</button></td>
    </tr>
  `).join('');
}

function removeSubModalLine(index) {
  window.subModalLines.splice(index, 1);
  renderSubModalLines();
}

async function submitNewSubscription() {
  const customerId = document.getElementById('sub-customer').value;
  const planId = document.getElementById('sub-plan').value;
  const terms = document.getElementById('sub-terms').value;
  const startDate = document.getElementById('sub-start-date').value;
  const notes = document.getElementById('sub-notes').value;

  if (window.subModalLines.length === 0) {
    showToast('Please add at least one product line item', true);
    return;
  }

  try {
    const res = await api('/api/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        customer_id: customerId,
        plan_id: planId,
        payment_terms: terms,
        start_date: startDate,
        notes,
        lines: window.subModalLines
      })
    });

    closeModal();
    showToast(`Subscription ${res.sub_number} created successfully!`);
    loadSubscriptions();
    loadDashboard();
  } catch (err) {
    showToast(err.message, true);
  }
}

// PAYMENT MODAL
function openPaymentModal(invoiceId = null, dueBalance = null) {
  const confirmedInvoices = state.invoices.filter(i => i.status !== 'Paid' && i.status !== 'Cancelled');
  const targetInv = invoiceId ? state.invoices.find(i => i.id == invoiceId) : confirmedInvoices[0];

  const bodyHtml = `
    <form id="payment-form">
      <div class="form-group">
        <label>Invoice to Settle *</label>
        <select id="pay-invoice" onchange="onPaymentInvoiceSelect(this.value)" required>
          ${confirmedInvoices.map(i => `<option value="${i.id}" ${targetInv && targetInv.id == i.id ? 'selected' : ''}>
            ${i.invoice_number} — ${i.customer_name} (Balance Due: $${i.balance.toFixed(2)})
          </option>`).join('')}
        </select>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Payment Amount ($) *</label>
          <input type="number" id="pay-amount" step="0.01" value="${dueBalance !== null ? dueBalance : (targetInv ? targetInv.balance : '')}" required>
        </div>
        <div class="form-group">
          <label>Payment Method *</label>
          <select id="pay-method" required>
            <option value="Bank Transfer">Bank Transfer (Wire)</option>
            <option value="Credit Card">Credit Card</option>
            <option value="Stripe">Stripe Online</option>
            <option value="Cash">Cash</option>
            <option value="Cheque">Corporate Cheque</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label>Transaction Reference / Bank Statement Note</label>
        <input type="text" id="pay-note" placeholder="e.g. Wire confirmation ref #TXN-9021">
      </div>
    </form>
  `;

  showModal(
    '💳 Record Incoming Payment',
    bodyHtml,
    `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-success" onclick="submitPayment()">Confirm & Settle</button>
    `
  );
}

function onPaymentInvoiceSelect(invId) {
  const inv = state.invoices.find(i => i.id == invId);
  if (inv) {
    document.getElementById('pay-amount').value = inv.balance;
  }
}

async function submitPayment() {
  const invoiceId = document.getElementById('pay-invoice').value;
  const amount = parseFloat(document.getElementById('pay-amount').value);
  const method = document.getElementById('pay-method').value;
  const note = document.getElementById('pay-note').value;

  if (!amount || amount <= 0) {
    showToast('Please enter a valid payment amount', true);
    return;
  }

  try {
    const res = await api('/api/payments', {
      method: 'POST',
      body: JSON.stringify({
        invoice_id: invoiceId,
        amount,
        method,
        note
      })
    });

    closeModal();
    showToast(res.message);
    loadPayments();
    loadInvoices();
    loadDashboard();
  } catch (err) {
    showToast(err.message, true);
  }
}

// PRINT / VIEW INVOICE
function printInvoiceView(invId) {
  const inv = state.invoices.find(i => i.id == invId);
  if (!inv) return;

  const invoiceHtml = `
    <div class="invoice-sheet">
      <div class="invoice-header">
        <div>
          <div class="brand" style="margin-bottom: 6px;">
            <div class="logo-icon">🟣</div>
            <span class="brand-name" style="font-size: 1.5rem;">Brightloop Software</span>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-muted);">
            742 Evergreen Suite 400 • San Francisco, CA<br>
            billing@brightloop.com • https://brightloop.software
          </div>
        </div>
        <div class="invoice-meta">
          <div class="invoice-title">INVOICE</div>
          <div style="font-size: 1rem; font-weight: 700; color: var(--text-main); margin-top: 4px;"># ${inv.invoice_number}</div>
          <div>Status: <span class="badge badge-${inv.status.toLowerCase()}">${inv.status}</span></div>
          <div>Date: ${inv.invoice_date}</div>
          <div>Due Date: <b>${inv.due_date}</b></div>
          ${inv.sub_number ? `<div>Subscription: <b>${inv.sub_number}</b></div>` : ''}
        </div>
      </div>

      <div class="invoice-parties">
        <div class="party-col">
          <div class="party-title">Billed To</div>
          <div style="font-size: 1rem; font-weight: 700;">${inv.customer_name}</div>
          <div>${inv.customer_company || ''}</div>
          <div>${inv.customer_email}</div>
        </div>
        <div class="party-col" style="text-align: right;">
          <div class="party-title">Payment Terms</div>
          <div>Due Upon Expiry / Terms</div>
          <div style="margin-top: 4px;">Balance Outstanding: <b style="color:var(--primary); font-size: 1.1rem;">$${inv.balance.toFixed(2)}</b></div>
        </div>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Tax</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${(inv.lines || []).map(l => `
            <tr>
              <td><b>${l.description}</b></td>
              <td>${l.quantity}</td>
              <td>$${l.unit_price.toFixed(2)}</td>
              <td>${l.tax_rate}% ($${l.line_tax.toFixed(2)})</td>
              <td><b>$${l.line_total.toFixed(2)}</b></td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="invoice-summary-box">
        <table class="summary-table">
          <tr>
            <td>Subtotal:</td>
            <td style="text-align: right;">$${inv.subtotal.toFixed(2)}</td>
          </tr>
          ${inv.discount_total > 0 ? `
            <tr style="color: var(--success);">
              <td>Applied Discount:</td>
              <td style="text-align: right;">-$${inv.discount_total.toFixed(2)}</td>
            </tr>
          ` : ''}
          <tr>
            <td>Tax Total:</td>
            <td style="text-align: right;">+$${inv.tax_total.toFixed(2)}</td>
          </tr>
          <tr class="total-row">
            <td>Invoice Total:</td>
            <td style="text-align: right;">$${inv.total_amount.toFixed(2)}</td>
          </tr>
          <tr>
            <td>Amount Paid:</td>
            <td style="text-align: right; color: var(--success);">-$${inv.amount_paid.toFixed(2)}</td>
          </tr>
          <tr style="font-weight: 700; border-top: 1px solid var(--border-color);">
            <td>Remaining Balance:</td>
            <td style="text-align: right; color: ${inv.balance > 0 ? 'var(--danger)' : 'var(--success)'};">
              $${inv.balance.toFixed(2)}
            </td>
          </tr>
        </table>
      </div>
    </div>
  `;

  showModal(
    `Invoice #${inv.invoice_number}`,
    invoiceHtml,
    `
      <button class="btn btn-secondary" onclick="closeModal()">Close</button>
      <button class="btn btn-outline" onclick="sendInvoiceEmail(${inv.id})">✉️ Email Customer</button>
      <button class="btn btn-primary" onclick="triggerPrint()">🖨️ Print Invoice</button>
    `,
    true
  );

  document.getElementById('printable-invoice').innerHTML = invoiceHtml;
}

function triggerPrint() {
  window.print();
}

// NEW PRODUCT MODAL (WITH VARIANTS SUPPORT, e.g. Odoo brand adds +560)
function openNewProductModal() {
  const bodyHtml = `
    <form id="new-product-form">
      <div class="form-group">
        <label>Product Name *</label>
        <input type="text" id="prod-name" placeholder="e.g. Brightloop Analytics Suite" required>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Type *</label>
          <select id="prod-type" required>
            <option value="software">Software SaaS</option>
            <option value="service">Cloud Service</option>
            <option value="add_on">Add-on Feature</option>
            <option value="hardware">Hardware Appliance</option>
          </select>
        </div>
        <div class="form-group">
          <label>Sales Price ($) *</label>
          <input type="number" id="prod-price" step="0.01" placeholder="450.00" required>
        </div>
      </div>

      <div class="form-group">
        <label>Cost Price ($)</label>
        <input type="number" id="prod-cost" step="0.01" placeholder="80.00">
      </div>

      <div class="form-group">
        <label>Product Variants & Pricing (e.g. Brand: Odoo +560)</label>
        <div id="variant-input-list">
          <div class="form-row variant-row" style="margin-bottom: 6px;">
            <input type="text" class="v-name" placeholder="Variant name (e.g. Brand: Odoo)" value="Brand: Odoo">
            <input type="number" class="v-extra" placeholder="Extra Price (e.g. 560)" value="560">
          </div>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" onclick="addVariantRow()">+ Add Another Variant</button>
      </div>

      <div class="form-group">
        <label>Notes</label>
        <textarea id="prod-notes" rows="2" placeholder="Product specifications and features..."></textarea>
      </div>
    </form>
  `;

  showModal(
    '📦 Add Catalog Product',
    bodyHtml,
    `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitNewProduct()">Save Product</button>
    `
  );
}

function addVariantRow() {
  const container = document.getElementById('variant-input-list');
  const div = document.createElement('div');
  div.className = 'form-row variant-row';
  div.style.marginBottom = '6px';
  div.innerHTML = `
    <input type="text" class="v-name" placeholder="Variant name">
    <input type="number" class="v-extra" placeholder="Extra Price" value="0">
  `;
  container.appendChild(div);
}

async function submitNewProduct() {
  const name = document.getElementById('prod-name').value;
  const type = document.getElementById('prod-type').value;
  const sales_price = parseFloat(document.getElementById('prod-price').value);
  const cost_price = parseFloat(document.getElementById('prod-cost').value) || 0;
  const notes = document.getElementById('prod-notes').value;

  const variantRows = document.querySelectorAll('.variant-row');
  const variants = [];
  variantRows.forEach(row => {
    const vName = row.querySelector('.v-name').value;
    const vExtra = parseFloat(row.querySelector('.v-extra').value) || 0;
    if (vName) variants.push({ name: vName, price_extra: vExtra });
  });

  try {
    await api('/api/products', {
      method: 'POST',
      body: JSON.stringify({ name, type, sales_price, cost_price, notes, variants })
    });
    closeModal();
    showToast('Product and variants added successfully!');
    loadProducts();
  } catch (err) {
    showToast(err.message, true);
  }
}

// NEW PLAN MODAL
function openNewPlanModal() {
  const bodyHtml = `
    <form id="new-plan-form">
      <div class="form-group">
        <label>Plan Name *</label>
        <input type="text" id="plan-name" placeholder="e.g. Growth Enterprise Yearly" required>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Billing Frequency *</label>
          <select id="plan-interval" required>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
            <option value="weekly">Weekly</option>
            <option value="daily">Daily</option>
          </select>
        </div>
        <div class="form-group">
          <label>Recurring Cost ($) *</label>
          <input type="number" id="plan-cost" step="0.01" placeholder="450.00" required>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Min Quantity / Seats</label>
          <input type="number" id="plan-min-qty" value="1" min="1">
        </div>
        <div class="form-group">
          <label>Available From & Until</label>
          <div style="display:flex; gap:6px;">
            <input type="date" id="plan-start" value="2026-01-01">
            <input type="date" id="plan-end" value="2027-12-31">
          </div>
        </div>
      </div>

      <div class="form-group" style="background:#f8fafc; padding:12px; border-radius: var(--radius-sm);">
        <label style="margin-bottom:8px;">Plan Closure & Lifecycle Rules</label>
        <div style="display:flex; flex-direction:column; gap:6px; font-size:0.85rem;">
          <label><input type="checkbox" id="plan-auto-close" checked> Auto-close on plan end date</label>
          <label><input type="checkbox" id="plan-close-early" checked> Allow customer/staff to close early</label>
          <label><input type="checkbox" id="plan-pause" checked> Allow pausing and resuming</label>
          <label><input type="checkbox" id="plan-renew" checked> Allow automatic or manual renewal</label>
        </div>
      </div>
    </form>
  `;

  showModal(
    '⏱️ Create Recurring Plan',
    bodyHtml,
    `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitNewPlan()">Create Plan</button>
    `
  );
}

async function submitNewPlan() {
  const name = document.getElementById('plan-name').value;
  const billing_interval = document.getElementById('plan-interval').value;
  const cost = parseFloat(document.getElementById('plan-cost').value);
  const min_quantity = parseInt(document.getElementById('plan-min-qty').value) || 1;
  const start_date = document.getElementById('plan-start').value;
  const end_date = document.getElementById('plan-end').value;
  const auto_close_on_end = document.getElementById('plan-auto-close').checked;
  const allow_close_early = document.getElementById('plan-close-early').checked;
  const allow_pause = document.getElementById('plan-pause').checked;
  const allow_renew = document.getElementById('plan-renew').checked;

  try {
    await api('/api/plans', {
      method: 'POST',
      body: JSON.stringify({
        name, billing_interval, cost, min_quantity, start_date, end_date,
        auto_close_on_end, allow_close_early, allow_pause, allow_renew
      })
    });
    closeModal();
    showToast('Plan created successfully!');
    loadPlans();
    loadDashboard();
  } catch (err) {
    showToast(err.message, true);
  }
}

// NEW DISCOUNT MODAL
function openNewDiscountModal() {
  const bodyHtml = `
    <form id="new-discount-form">
      <div class="form-row">
        <div class="form-group">
          <label>Discount Code *</label>
          <input type="text" id="disc-code" placeholder="e.g. VIP20" required>
        </div>
        <div class="form-group">
          <label>Type & Value *</label>
          <div style="display:flex; gap:6px;">
            <select id="disc-type">
              <option value="percentage">% Percentage</option>
              <option value="fixed">$ Fixed Amount</option>
            </select>
            <input type="number" id="disc-value" step="0.1" placeholder="20" required>
          </div>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Applies To (Scope) *</label>
          <select id="disc-scope" onchange="toggleDiscountProductSelect(this.value)">
            <option value="all">Whole Subscription</option>
            <option value="product">Specific Product Only</option>
          </select>
        </div>
        <div class="form-group" id="disc-prod-wrap" style="display:none;">
          <label>Specific Product</label>
          <select id="disc-product">
            ${state.products.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Min Purchase ($)</label>
          <input type="number" id="disc-min-spend" value="0">
        </div>
        <div class="form-group">
          <label>Min Quantity / Seats</label>
          <input type="number" id="disc-min-qty" value="0">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Valid Dates</label>
          <div style="display:flex; gap:6px;">
            <input type="date" id="disc-start" value="2026-01-01">
            <input type="date" id="disc-end" value="2026-12-31">
          </div>
        </div>
        <div class="form-group">
          <label>Usage Limit (0 for unlimited)</label>
          <input type="number" id="disc-limit" value="50">
        </div>
      </div>
    </form>
  `;

  showModal(
    '🏷️ Add Discount Rule',
    bodyHtml,
    `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitNewDiscount()">Save Rule</button>
    `
  );
}

function toggleDiscountProductSelect(scope) {
  document.getElementById('disc-prod-wrap').style.display = scope === 'product' ? 'block' : 'none';
}

async function submitNewDiscount() {
  const code = document.getElementById('disc-code').value;
  const type = document.getElementById('disc-type').value;
  const value = parseFloat(document.getElementById('disc-value').value);
  const scope = document.getElementById('disc-scope').value;
  const product_id = scope === 'product' ? document.getElementById('disc-product').value : null;
  const min_purchase = parseFloat(document.getElementById('disc-min-spend').value) || 0;
  const min_quantity = parseInt(document.getElementById('disc-min-qty').value) || 0;
  const start_date = document.getElementById('disc-start').value;
  const end_date = document.getElementById('disc-end').value;
  const usage_limit = parseInt(document.getElementById('disc-limit').value) || 0;

  try {
    await api('/api/discounts', {
      method: 'POST',
      body: JSON.stringify({ code, type, value, scope, product_id, min_purchase, min_quantity, start_date, end_date, usage_limit })
    });
    closeModal();
    showToast('Discount rule created successfully!');
    loadDiscounts();
  } catch (err) {
    showToast(err.message, true);
  }
}

// NEW STAFF MEMBER MODAL
function openNewStaffModal() {
  const bodyHtml = `
    <form id="new-staff-form">
      <div class="form-group">
        <label>Staff Member Full Name *</label>
        <input type="text" id="staff-name" placeholder="e.g. Rachel Adams" required>
      </div>

      <div class="form-group">
        <label>Corporate Email *</label>
        <input type="email" id="staff-email" placeholder="rachel@brightloop.com" required>
      </div>

      <div class="form-group">
        <label>Initial Password *</label>
        <input type="password" id="staff-pass" placeholder="More than 8 chars, 1 upper, 1 lower, 1 special symbol" required>
        <small style="color:var(--text-muted); font-size:0.75rem;">Must be >8 characters with uppercase, lowercase, and special character.</small>
      </div>

      <div class="form-group">
        <label>Direct Phone</label>
        <input type="tel" id="staff-phone" placeholder="+1 (555) 019-3388">
      </div>
    </form>
  `;

  showModal(
    '👥 Add Internal Staff Member',
    bodyHtml,
    `
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitNewStaff()">Create Account</button>
    `
  );
}

async function submitNewStaff() {
  const name = document.getElementById('staff-name').value;
  const email = document.getElementById('staff-email').value;
  const password = document.getElementById('staff-pass').value;
  const phone = document.getElementById('staff-phone').value;

  try {
    await api('/api/users/staff', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, phone })
    });
    closeModal();
    showToast(`Staff member ${name} added successfully!`);
    loadStaff();
    loadUsers();
  } catch (err) {
    showToast(err.message, true);
  }
}

// AUTH MODAL FOR REGISTER / LOGIN / FORGOT PASSWORD
function showAuthModal() {
  const bodyHtml = `
    <div>
      <div style="display:flex; gap:10px; border-bottom:1px solid var(--border-color); padding-bottom:12px; margin-bottom:16px;">
        <button class="btn btn-primary btn-sm" id="auth-tab-register" onclick="switchAuthTab('register')">New Customer Signup</button>
        <button class="btn btn-secondary btn-sm" id="auth-tab-login" onclick="switchAuthTab('login')">Account Login</button>
        <button class="btn btn-outline btn-sm" id="auth-tab-reset" onclick="switchAuthTab('reset')">Reset Password</button>
      </div>

      <div id="auth-content-register">
        <form onsubmit="handleCustomerRegister(event)">
          <div class="form-group">
            <label>Business / Contact Name *</label>
            <input type="text" id="reg-name" placeholder="John Doe" required>
          </div>
          <div class="form-group">
            <label>Company Name</label>
            <input type="text" id="reg-company" placeholder="Acme Logistics LLC">
          </div>
          <div class="form-group">
            <label>Email Address *</label>
            <input type="email" id="reg-email" placeholder="john@example.com" required>
          </div>
          <div class="form-group">
            <label>Password *</label>
            <input type="password" id="reg-password" placeholder="Min 9 chars, uppercase, lowercase, special char" required>
            <small style="color:var(--text-muted); font-size:0.75rem;">Password rule: > 8 chars, uppercase, lowercase, and special character.</small>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%; margin-top:10px;">Create Customer Account</button>
        </form>
      </div>

      <div id="auth-content-login" style="display:none;">
        <form onsubmit="handleAccountLogin(event)">
          <div class="form-group">
            <label>Email Address</label>
            <input type="email" id="login-email" required>
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="login-password" required>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%; margin-top:10px;">Sign In</button>
        </form>
      </div>

      <div id="auth-content-reset" style="display:none;">
        <form onsubmit="handleForgotPassword(event)">
          <div class="form-group">
            <label>Registered Email Address</label>
            <input type="email" id="reset-email" placeholder="your@email.com" required>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%; margin-top:10px;">Send Reset Link</button>
        </form>
        <div id="reset-result-box" style="margin-top:14px; font-size:0.85rem;"></div>
      </div>
    </div>
  `;

  showModal('🔐 Authentication & Customer Portal', bodyHtml, `<button class="btn btn-secondary" onclick="closeModal()">Close</button>`);
}

function switchAuthTab(tab) {
  document.getElementById('auth-content-register').style.display = tab === 'register' ? 'block' : 'none';
  document.getElementById('auth-content-login').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('auth-content-reset').style.display = tab === 'reset' ? 'block' : 'none';
}

async function handleCustomerRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value;
  const company = document.getElementById('reg-company').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;

  try {
    const res = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, company, email, password, role: 'customer' })
    });
    closeModal();
    state.currentUser = res.user;
    updateUserHeader();
    applyRolePermissions();
    loadAllData();
    showToast('Customer account registered successfully!');
  } catch (err) {
    showToast(err.message, true);
  }
}

async function handleAccountLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    closeModal();
    state.currentUser = res.user;
    updateUserHeader();
    applyRolePermissions();
    loadAllData();
    showToast(`Welcome back, ${res.user.name}!`);
  } catch (err) {
    showToast(err.message, true);
  }
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const email = document.getElementById('reset-email').value;
  try {
    const res = await api('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    const box = document.getElementById('reset-result-box');
    box.innerHTML = `
      <div style="background:#ecfdf5; border:1px solid #a7f3d0; color:#065f46; padding:10px; border-radius:4px;">
        ${res.message}<br>
        ${res.simulatedToken ? `<b>Simulated Dispatch:</b> Link generated: <code>${res.resetLink}</code>` : ''}
      </div>
    `;
  } catch (err) {
    showToast(err.message, true);
  }
}

// VIEW SUBSCRIPTION DETAILS
function viewSubscriptionDetails(subId) {
  const sub = state.subscriptions.find(s => s.id == subId);
  if (!sub) return;

  const bodyHtml = `
    <div>
      <div style="display:flex; justify-content:space-between; margin-bottom:16px;">
        <div>
          <h2 style="font-size:1.4rem; color:var(--primary); font-weight:700;">${sub.sub_number}</h2>
          <div style="font-size:0.85rem; color:var(--text-muted);">${sub.customer_name} • ${sub.customer_company || ''}</div>
        </div>
        <div>
          <span class="badge badge-${sub.status.toLowerCase()}">${sub.status}</span>
        </div>
      </div>

      <div class="dashboard-grid" style="margin-bottom:16px;">
        <div style="background:#f8fafc; padding:12px; border-radius:6px; font-size:0.85rem;">
          <div><b>Plan:</b> ${sub.plan_name} (${sub.billing_interval})</div>
          <div><b>Terms:</b> ${sub.payment_terms}</div>
          <div><b>Start Date:</b> ${sub.start_date}</div>
        </div>
        <div style="background:#f8fafc; padding:12px; border-radius:6px; font-size:0.85rem;">
          <div><b>Last Billed:</b> ${sub.last_billed_date || 'Not billed yet'}</div>
          <div><b>Next Billing:</b> ${sub.next_billing_date || '—'}</div>
          <div><b>Expiry:</b> ${sub.expiry_date || 'Ongoing renewal'}</div>
        </div>
      </div>

      <h4 style="font-size:0.95rem; margin-bottom:8px;">Subscribed Product Lines</h4>
      <table class="data-table">
        <thead>
          <tr>
            <th>Product / Variant</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Tax</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${(sub.lines || []).map(l => `
            <tr>
              <td><b>${l.product_name}</b> ${l.variant_name ? `(${l.variant_name})` : ''}</td>
              <td>${l.quantity}</td>
              <td>$${l.unit_price.toFixed(2)}</td>
              <td>${l.tax_rate}%</td>
              <td><b>$${l.amount.toFixed(2)}</b></td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${sub.notes ? `<div style="margin-top:14px; font-size:0.85rem; color:var(--text-muted);"><b>Notes:</b> ${sub.notes}</div>` : ''}
    </div>
  `;

  showModal(`Contract ${sub.sub_number}`, bodyHtml, `<button class="btn btn-secondary" onclick="closeModal()">Close</button>`, true);
}

// GLOBAL SEARCH
function handleGlobalSearch(query) {
  const q = query.toLowerCase().trim();
  if (!q) {
    loadSubscriptions();
    loadInvoices();
    return;
  }
  filterSubscriptionsTable(q);
  filterInvoicesTable(q);
}

// EXPORT FINANCE SUMMARY TO CSV
function exportFinanceSummary() {
  const headers = ['Subscription / Invoice Ref', 'Customer', 'Date', 'Type', 'Amount', 'Status'];
  const rows = [];

  state.subscriptions.forEach(s => {
    rows.push([s.sub_number, `"${s.customer_name}"`, s.start_date, 'Subscription', s.total_amount || 0, s.status]);
  });

  state.invoices.forEach(i => {
    rows.push([i.invoice_number, `"${i.customer_name}"`, i.invoice_date, 'Invoice', i.total_amount, i.status]);
  });

  let csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `brightloop_finance_summary_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Finance summary exported to CSV!');
}
