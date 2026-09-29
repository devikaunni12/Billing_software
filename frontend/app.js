/* Takeline POS frontend. The browser talks to Django through same-origin JSON endpoints. */
const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const toast = document.querySelector('#toast');
const isMobileRoute = window.location.pathname.startsWith('/mobile-admin');
const state = {
  user: null,
  page: window.location.pathname.startsWith('/billing') ? 'billing' : 'dashboard',
  products: [], suppliers: [], staff: [], transactions: [], returns: [], ledger: [], reports: null,
  cart: {}, query: '', mobileToolsOpen: false,
};

const NAV_ITEMS = [
  ['dashboard', '⌂', 'Overview'], ['products', '▧', 'Products'], ['staff', '♙', 'Staff'],
  ['suppliers', '▤', 'Suppliers'], ['returns', '↩', 'Returns'], ['ledger', '≋', 'Ledger'], ['transactions', '▣', 'Transactions'],
];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function money(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

async function api(path, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
  const csrfToken = getCookie('csrftoken');
  if (csrfToken) headers['X-CSRFToken'] = csrfToken;
  const response = await fetch(path, { ...options, headers, credentials: 'same-origin' });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      state.user = null;
      render();
    }
    const message = payload?.detail || Object.entries(payload || {})
      .map(([field, errors]) => `${field === 'sku' ? 'SKU' : field}: ${Array.isArray(errors) ? errors.join(', ') : errors}`)
      .join(' ');
    throw new Error(message || 'Something went wrong. Please try again.');
  }
  return payload;
}

function notify(message, isError = false) {
  toast.textContent = message;
  toast.className = `toast show${isError ? ' error' : ''}`;
  window.clearTimeout(notify.timer);
  notify.timer = window.setTimeout(() => { toast.className = 'toast'; }, 3200);
}

function initials(user) {
  return (user.first_name?.[0] || user.username?.[0] || 'T').toUpperCase();
}

function renderLogin() {
  app.innerHTML = `
    <main class="login-screen">
      <section class="login-story">
        <div class="brand-mark"><span class="brand-symbol">T</span> TAKELINE <span style="font-weight:500;color:#b4c9bf">/ POS</span></div>
        <div class="story-copy"><span class="story-kicker">Retail precision, made effortless.</span><h1>Bring total clarity to your checkout and inventory.</h1><p>Effortlessly balance registers, track live stock levels, and view daily revenue from one dashboard.</p></div>
        <div class="story-footer">Takeline Store Operations &nbsp;·&nbsp; Local Demo Edition</div>
      </section>
      <section class="login-panel">
        <form class="login-form" id="login-form">
          <div class="brand-mark"><span class="brand-symbol">T</span> TAKELINE / POS</div>
          <h2>Welcome back</h2><p>Sign in to open your store workspace.</p>
          <div class="field"><label for="login-username">Username</label><input id="login-username" name="username" autocomplete="username" required placeholder="Your username"></div>
          <div class="field"><label for="login-password">Password</label><input id="login-password" name="password" type="password" autocomplete="current-password" required placeholder="Your password"></div>
          <button class="button login-submit" type="submit">Sign in <span aria-hidden="true">→</span></button>
          <section class="demo-credentials" aria-label="Default demo account credentials">
            <div class="demo-credentials-heading"><strong>Demo account credentials</strong><span>Local testing</span></div>
            <div class="demo-credential-row"><strong>Admin</strong><span><small>Username</small><code>admin</code></span><span><small>Password</small><code>Admin123!</code></span></div>
            <div class="demo-credential-row"><strong>Cashier</strong><span><small>Username</small><code>cashier</code></span><span><small>Password</small><code>Staff123!</code></span></div>
          </section>
        </form>
      </section>
    </main>`;
}

function pageTitle(page) {
  return ({ dashboard: 'Overview', products: 'Products', staff: 'Staff', suppliers: 'Suppliers', returns: 'Returns', ledger: 'Ledger', transactions: 'Transactions', billing: 'New bill' })[page] || 'Overview';
}

function navButton([page, icon, label]) {
  return `<button class="nav-item${state.page === page ? ' active' : ''}" data-page="${page}"><span class="nav-icon">${icon}</span>${label}</button>`;
}

function shell(content) {
  const admin = state.user.is_admin;
  const navItems = admin ? NAV_ITEMS : [['billing', '▣', 'Billing']];
  const mobileNav = `
    <nav class="mobile-nav" aria-label="Main navigation">
      <button class="${state.page === 'dashboard' ? 'active' : ''}" data-page="dashboard"><span>⌂</span>Home</button>
      <button class="${state.page === 'products' ? 'active' : ''}" data-page="products"><span>▧</span>Stock</button>
      <button class="${state.page === 'billing' ? 'active' : ''}" data-page="billing"><span>▣</span>Billing</button>
      <button class="${state.mobileToolsOpen ? 'active' : ''}" data-action="toggle-tools"><span>•••</span>More</button>
    </nav>
    <nav class="mobile-tools${state.mobileToolsOpen ? ' open' : ''}" aria-label="All admin pages">
      ${NAV_ITEMS.filter(([page]) => page !== 'dashboard').map(([page, icon, label]) => `<button data-page="${page}">${icon} &nbsp; ${label}</button>`).join('')}
      <button data-action="logout">↪ &nbsp; Sign out</button>
    </nav>`;

  document.body.classList.toggle('mobile-mode', isMobileRoute && admin);
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand-mark"><span class="brand-symbol">T</span> TAKELINE</div>
        <div class="nav-label">${admin ? 'Store management' : 'Point of sale'}</div>
        <nav class="side-nav">${navItems.map(navButton).join('')}</nav>
        <div class="sidebar-bottom">
          ${admin ? '<a class="billing-link" href="/billing/" data-page="billing"><span>▣</span> Open billing desk <span style="margin-left:auto">↗</span></a>' : ''}
          <div class="user-mini"><div class="avatar">${initials(state.user)}</div><div class="user-info"><strong>${escapeHtml(state.user.first_name || state.user.username)}</strong><span>${admin ? 'Shop admin' : 'Sales staff'}</span></div><button class="icon-button" data-action="logout" aria-label="Sign out" title="Sign out">↪</button></div>
        </div>
      </aside>
      <section class="main-area">
        <header class="topbar"><div class="topbar-start">${isMobileRoute && admin ? '<button class="mobile-back" data-action="desktop-admin" aria-label="Back to desktop admin dashboard" title="Back to desktop admin dashboard">←</button>' : ''}<div class="breadcrumb">${admin ? 'Store management' : 'Point of sale'} &nbsp; / &nbsp; <strong>${pageTitle(state.page)}</strong></div></div><div class="topbar-right"><span class="date-chip">${new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}</span>${isMobileRoute ? '' : '<a class="button secondary small" href="/mobile-admin/">▣ &nbsp; Mobile admin</a>'}</div></header>
        <main class="main-content">${content}</main>
      </section>
    </div>${mobileNav}`;
}

function heading(title, description, action = '') {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${description}</p></div><div class="heading-actions">${action}</div></div>`;
}

function panel(title, body, note = '') {
  return `<section class="panel"><div class="panel-head"><h2>${title}</h2>${note ? `<span>${note}</span>` : ''}</div><div class="panel-body">${body}</div></section>`;
}

function productSwatch(product) {
  const letter = escapeHtml((product.category || product.name || 'T').slice(0, 1).toUpperCase());
  return `<span class="swatch">${letter}</span>`;
}

function dashboardView() {
  const report = state.reports || {};
  const sales = report.recent_sales || [];
  const week = report.week || [];
  const max = Math.max(1, ...week.map((day) => Number(day.total)));
  const chart = Array.from({ length: 7 }, (_, index) => {
    const dayDate = new Date(); dayDate.setDate(dayDate.getDate() - (6 - index));
    const match = week.find((item) => item.date === dayDate.toISOString().slice(0, 10));
    const value = Number(match?.total || 0);
    const label = new Intl.DateTimeFormat('en', { weekday: 'short' }).format(dayDate);
    return `<div class="chart-column"><div class="chart-bar-wrap"><div class="chart-bar${index === 6 ? ' today' : ''}" style="height:${Math.max(4, value / max * 100)}%" title="${money(value)}"></div></div><span class="chart-label">${label}</span></div>`;
  }).join('');
  const rows = sales.length ? sales.map((sale) => `<tr><td><strong>${escapeHtml(sale.receipt_number)}</strong></td><td>${escapeHtml(sale.cashier_name)}</td><td>${escapeHtml(sale.payment_method)}</td><td><strong>${money(sale.total)}</strong></td><td>${new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td></tr>`).join('') : '<tr><td colspan="5"><div class="empty-state">No sales yet. A completed bill will appear here.</div></td></tr>';
  const quick = `<div class="quick-actions"><button class="quick-action" data-page="products"><span>▧</span>Manage products <span>→</span></button><button class="quick-action" data-page="staff"><span>♙</span>Staff access <span>→</span></button><button class="quick-action" data-page="returns"><span>↩</span>Process a return <span>→</span></button><button class="quick-action" data-page="ledger"><span>≋</span>Open ledger <span>→</span></button></div>`;
  return `${heading(`Good ${greeting()}, ${escapeHtml(state.user.first_name || state.user.username)}`, 'A live snapshot of your shop floor and today’s trade.', '<button class="button" data-page="billing">＋ &nbsp; New bill</button>')}
    <div class="metric-grid">
      <article class="metric"><div class="metric-top">Today’s revenue <span class="metric-mark">$</span></div><strong>${money(report.revenue_today)}</strong><small>Net of discounts</small></article>
      <article class="metric"><div class="metric-top">Bills today <span class="metric-mark">▣</span></div><strong>${report.sales_today || 0}</strong><small>Completed transactions</small></article>
      <article class="metric"><div class="metric-top">Active products <span class="metric-mark">▧</span></div><strong>${report.products || 0}</strong><small>${report.low_stock || 0} at low stock</small></article>
      <article class="metric"><div class="metric-top">Sales staff <span class="metric-mark">♙</span></div><strong>${report.staff || 0}</strong><small>Active cashier accounts</small></article>
    </div>
    <div class="dashboard-grid">
      ${panel('Sales this week', '<div class="chart">' + chart + '</div>', 'Last 7 days')}
      ${panel('Quick access', quick)}
      <div class="panel" style="grid-column:1/-1"><div class="panel-head"><h2>Latest transactions</h2><button class="button secondary small" data-page="transactions">All transactions &nbsp; →</button></div><div class="table-wrap"><table><thead><tr><th>Receipt</th><th>Cashier</th><th>Payment</th><th>Total</th><th>Time</th></tr></thead><tbody>${rows}</tbody></table></div></div>
    </div>`;
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
}

function productsView() {
  const query = state.query.toLowerCase();
  const products = state.products.filter((product) => `${product.name} ${product.sku} ${product.category} ${product.color}`.toLowerCase().includes(query));
  const rows = products.length ? products.map((product) => `<tr><td><div class="product-name">${productSwatch(product)}<span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku)} · ${escapeHtml(product.color || 'No color')} · ${escapeHtml(product.size || 'One size')}</small></span></div></td><td>${escapeHtml(product.category || '—')}</td><td><strong>${money(product.price)}</strong><br><small style="color:#89948d">Cost ${money(product.cost)}</small></td><td><span class="tag${product.stock <= 5 ? ' warn' : ''}">${product.stock} on hand</span></td><td><span class="tag${product.is_active ? '' : ' red'}">${product.is_active ? 'Active' : 'Inactive'}</span></td><td>${escapeHtml(product.supplier_name || '—')}</td><td><div class="actions-cell"><button class="button secondary small" data-action="edit-product" data-id="${product.id}">Edit</button><button class="button danger small" data-action="delete-product" data-id="${product.id}">Delete</button></div></td></tr>`).join('') : '<tr><td colspan="7"><div class="empty-state">No products match your search.</div></td></tr>';
  return `${heading('Products', 'Manage your catalog, pricing, and on-hand stock.', '<button class="button" data-action="add-product">＋ &nbsp; Add product</button>')}
    <section class="panel"><div class="panel-body"><div class="table-tools"><input class="toolbar-search" id="product-search" placeholder="Search name, SKU, category…" value="${escapeHtml(state.query)}"><span class="tag">${state.products.length} products · ${state.products.filter((product) => product.is_active).length} active</span></div><div class="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Price / cost</th><th>Stock</th><th>Status</th><th>Supplier</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div></div></section>`;
}

function staffView() {
  const rows = state.staff.length ? state.staff.map((member) => `<tr><td><div class="product-name"><span class="avatar" style="width:30px;height:30px">${escapeHtml((member.first_name || member.username)[0].toUpperCase())}</span><span><strong>${escapeHtml([member.first_name, member.last_name].filter(Boolean).join(' ') || member.username)}</strong><small>@${escapeHtml(member.username)} · ${escapeHtml(member.email || 'No email')}</small></span></div></td><td><span class="tag${member.role === 'admin' ? ' warn' : ''}">${member.role === 'admin' ? 'Admin' : 'Staff'}</span></td><td><span class="tag${member.is_active ? '' : ' red'}">${member.is_active ? 'Active' : 'Inactive'}</span></td><td><div class="actions-cell"><button class="button secondary small" data-action="edit-staff" data-id="${member.id}">Edit</button><button class="button danger small" data-action="toggle-staff" data-id="${member.id}" data-active="${member.is_active}">${member.is_active ? 'Deactivate' : 'Activate'}</button></div></td></tr>`).join('') : '<tr><td colspan="4"><div class="empty-state">No staff accounts found.</div></td></tr>';
  return `${heading('Staff', 'Create accounts and control who can access shop management.', '<button class="button" data-action="add-staff">＋ &nbsp; Add staff</button>')}
    ${panel('Team access', `<div class="table-wrap"><table><thead><tr><th>Team member</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`, `${state.staff.length} accounts`)}`;
}

function suppliersView() {
  const rows = state.suppliers.length ? state.suppliers.map((supplier) => `<tr><td><strong>${escapeHtml(supplier.name)}</strong><br><small style="color:#87938c">${escapeHtml(supplier.contact_name || 'No contact')}</small></td><td>${escapeHtml(supplier.phone || '—')}</td><td>${escapeHtml(supplier.email || '—')}</td><td>${state.products.filter((product) => product.supplier === supplier.id).length}</td><td><div class="actions-cell"><button class="button secondary small" data-action="edit-supplier" data-id="${supplier.id}">Edit</button><button class="button danger small" data-action="delete-supplier" data-id="${supplier.id}">Delete</button></div></td></tr>`).join('') : '<tr><td colspan="5"><div class="empty-state">Add your first supplier to start building a purchasing directory.</div></td></tr>';
  return `${heading('Suppliers', 'Keep supplier contacts and product relationships in one place.', '<button class="button" data-action="add-supplier">＋ &nbsp; Add supplier</button>')}
    ${panel('Supplier directory', `<div class="table-wrap"><table><thead><tr><th>Supplier</th><th>Phone</th><th>Email</th><th>Products</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table></div>`, `${state.suppliers.length} suppliers`)}`;
}

function transactionsView() {
  const rows = state.transactions.length ? state.transactions.map((sale) => `<tr><td><button class="button secondary small" data-action="view-receipt" data-id="${sale.id}">${escapeHtml(sale.receipt_number)}</button></td><td>${new Date(sale.created_at).toLocaleString()}</td><td>${escapeHtml(sale.cashier_name)}</td><td>${sale.items.length} line(s)</td><td>${escapeHtml(sale.payment_method)}</td><td><strong>${money(sale.total)}</strong></td></tr>`).join('') : '<tr><td colspan="6"><div class="empty-state">Completed bills will appear here.</div></td></tr>';
  return `${heading('Transactions', 'Review completed bills and reprint customer receipts.', '<button class="button" data-page="billing">＋ &nbsp; New bill</button>')}
    ${panel('All transactions', `<div class="table-wrap"><table><thead><tr><th>Receipt</th><th>Date</th><th>Cashier</th><th>Items</th><th>Payment</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div>`, `${state.transactions.length} bills`)}`;
}

function returnableQuantity(saleItemId, soldQuantity) {
  const alreadyReturned = state.returns
    .flatMap((record) => record.items)
    .filter((item) => item.id === saleItemId)
    .reduce((total, item) => total + Number(item.quantity), 0);
  return Math.max(0, soldQuantity - alreadyReturned);
}

function returnsView() {
  const returned = state.returns.flatMap((record) => record.items.map((item) => ({ ...item, record })));
  const rows = returned.length ? returned.map((item) => `<tr><td>${escapeHtml(item.record.receipt_number)}</td><td>${escapeHtml(item.product_name)} <small>(${escapeHtml(item.sku)})</small></td><td>${item.quantity}</td><td>${money(item.refund_amount)}</td><td>${escapeHtml(item.record.reason || '—')}</td><td>${new Date(item.record.created_at).toLocaleDateString()}</td></tr>`).join('') : '<tr><td colspan="6"><div class="empty-state">No returns have been processed yet.</div></td></tr>';
  const eligible = state.transactions.filter((sale) => sale.items.some((item) => returnableQuantity(item.id, item.quantity) > 0));
  const options = eligible.map((sale) => `<option value="${sale.id}">${escapeHtml(sale.receipt_number)} · ${money(sale.total)} · ${new Date(sale.created_at).toLocaleDateString()}</option>`).join('');
  return `${heading('Returns', 'Record an item return, restore inventory, and track the refund in your ledger.', '')}
    <div class="dashboard-grid" style="margin-bottom:14px"><section class="panel"><div class="panel-head"><h2>Start a return</h2><span>Admin approval required</span></div><div class="panel-body"><form id="return-lookup-form"><div class="field"><label for="return-sale">Completed transaction</label><select id="return-sale" required><option value="">Select a receipt…</option>${options}</select></div><button class="button" type="submit" ${eligible.length ? '' : 'disabled'}>Choose an item &nbsp; →</button></form></div></section>${panel('Return totals', `<div style="display:flex;align-items:baseline;gap:9px"><strong style="font:800 27px Manrope">${money(returned.reduce((sum, item) => sum + Number(item.refund_amount), 0))}</strong><span style="color:var(--muted);font-size:11px">refunded to date</span></div>`)}</div>
    ${panel('Return history', `<div class="table-wrap"><table><thead><tr><th>Receipt</th><th>Item</th><th>Qty</th><th>Refund</th><th>Reason</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table></div>`, `${returned.length} line returns`)}`;
}

function ledgerView() {
  const total = state.ledger.reduce((sum, entry) => sum + Number(entry.amount), 0);
  const rows = state.ledger.length ? state.ledger.map((entry) => `<tr><td>${new Date(entry.created_at).toLocaleString()}</td><td><span class="tag${entry.entry_type === 'refund' ? ' red' : ''}">${escapeHtml(entry.entry_type)}</span></td><td>${escapeHtml(entry.note)}</td><td>${escapeHtml(entry.receipt_number || '—')}</td><td style="font-weight:700;color:${Number(entry.amount) < 0 ? '#a04b3e' : '#355f46'}">${money(entry.amount)}</td></tr>`).join('') : '<tr><td colspan="5"><div class="empty-state">Sales and refunds will post here automatically.</div></td></tr>';
  return `${heading('Ledger', 'A running record of completed sales and customer refunds.', '<button class="button secondary" data-action="export-ledger">↓ &nbsp; Export CSV</button>')}
    <div class="metric-grid" style="grid-template-columns:repeat(2,minmax(0,1fr));max-width:620px"><article class="metric"><div class="metric-top">Net ledger balance <span class="metric-mark">≋</span></div><strong>${money(total)}</strong><small>From the latest 200 entries</small></article><article class="metric"><div class="metric-top">Entries <span class="metric-mark">▤</span></div><strong>${state.ledger.length}</strong><small>Sales and returns</small></article></div>
    ${panel('Ledger entries', `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Receipt</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table></div>`)}`;
}

function cartTotal() {
  const subtotal = Object.values(state.cart).reduce((sum, line) => sum + Number(line.product.price) * line.quantity, 0);
  const discount = Math.min(subtotal, Math.max(0, Number(document.querySelector('#cart-discount')?.value || 0)));
  return { subtotal, discount, total: subtotal - discount };
}

function billingView() {
  const query = state.query.toLowerCase();
  const products = state.products.filter((product) => product.is_active && product.stock > 0 && `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(query));
  const productCards = products.length ? products.map((product) => `<button class="billing-product" data-action="add-cart" data-id="${product.id}">${productSwatch(product)}<strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.sku)} · ${product.stock} left</small><b>${money(product.price)}</b></button>`).join('') : '<div class="empty-state" style="grid-column:1/-1">No available products match your search.</div>';
  const lines = Object.values(state.cart);
  const cartRows = lines.length ? lines.map(({ product, quantity }) => `<div class="cart-row"><div><strong>${escapeHtml(product.name)}</strong><small>${money(product.price)} each · ${money(Number(product.price) * quantity)}</small></div><div class="qty-control"><button data-action="cart-minus" data-id="${product.id}" aria-label="Remove one">−</button><span>${quantity}</span><button data-action="cart-plus" data-id="${product.id}" aria-label="Add one">＋</button></div></div>`).join('') : '<div class="empty-state">Your bill is empty. Select an item to begin.</div>';
  const { subtotal, discount, total } = cartTotal();
  return `${heading('New bill', 'Select items, take payment, then print or re-open the receipt.', `<span class="tag">Cashier: ${escapeHtml(state.user.username)}</span>`)}
    <div class="billing-layout">
      <div><div class="table-tools"><input class="toolbar-search" id="billing-search" placeholder="Find product by name or SKU…" value="${escapeHtml(state.query)}"></div><div class="billing-products">${productCards}</div></div>
      <section class="panel cart-panel"><div class="panel-head"><h2>Current bill</h2><button class="button secondary small" data-action="clear-cart" ${lines.length ? '' : 'disabled'}>Clear</button></div><div class="panel-body"><div class="cart-items">${cartRows}</div><div class="cart-totals"><div class="total-line"><span>Subtotal</span><strong id="checkout-subtotal">${money(subtotal)}</strong></div><div class="total-line"><span>Discount</span><strong id="checkout-discount-total">− ${money(discount)}</strong></div><div class="total-line grand"><span>Amount due</span><strong id="checkout-due">${money(total)}</strong></div></div>
      <form id="checkout-form"><div class="cart-fields"><div class="field span-two"><label for="customer-name">Customer (optional)</label><input id="customer-name" name="customer_name" placeholder="Walk-in customer"></div><div class="field"><label for="payment-method">Payment method</label><select id="payment-method" name="payment_method"><option value="cash">Cash</option><option value="card">Card</option><option value="mobile">Mobile</option><option value="bank">Bank transfer</option></select></div><div class="field"><label for="amount-paid">Amount paid</label><input id="amount-paid" name="amount_paid" type="number" min="0" step="0.01" value="${total.toFixed(2)}" required></div><div class="field"><label for="cart-discount">Discount</label><input id="cart-discount" name="discount" type="number" min="0" max="${subtotal.toFixed(2)}" step="0.01" value="${discount.toFixed(2)}"></div></div><button class="button checkout-button" type="submit" ${lines.length ? '' : 'disabled'}>Complete payment &nbsp; →</button></form></div></section>
    </div>`;
}

function renderPage() {
  const admin = state.user.is_admin;
  if (!admin && state.page !== 'billing') state.page = 'billing';
  const views = { dashboard: dashboardView, products: productsView, staff: staffView, suppliers: suppliersView, returns: returnsView, ledger: ledgerView, transactions: transactionsView, billing: billingView };
  shell((admin || state.page === 'billing') ? (views[state.page] || dashboardView)() : billingView());
}

function render() {
  if (!state.user) {
    document.body.classList.remove('mobile-mode');
    renderLogin();
    return;
  }
  renderPage();
}

async function refreshData() {
  const tasks = [api('/api/products/').then((data) => { state.products = data; }), api('/api/transactions/').then((data) => { state.transactions = data; })];
  if (state.user.is_admin) {
    tasks.push(api('/api/suppliers/').then((data) => { state.suppliers = data; }));
    tasks.push(api('/api/staff/').then((data) => { state.staff = data; }));
    tasks.push(api('/api/returns/').then((data) => { state.returns = data; }));
    tasks.push(api('/api/ledger/').then((data) => { state.ledger = data; }));
    tasks.push(api('/api/reports/').then((data) => { state.reports = data; }));
  }
  await Promise.all(tasks);
  render();
}

function showDialog(title, body, actions = '<button class="button secondary" type="button" data-action="close-dialog">Cancel</button><button class="button" type="submit">Save</button>') {
  dialog.innerHTML = `<form id="dialog-form"><div class="dialog-head"><h2>${title}</h2><button class="icon-button" type="button" data-action="close-dialog" aria-label="Close">×</button></div><div class="dialog-body"><div class="dialog-error" role="alert" hidden></div>${body}</div><div class="dialog-actions">${actions}</div></form>`;
  dialog.showModal();
}

function showDialogError(message) {
  const errorBox = dialog.querySelector('.dialog-error');
  if (!errorBox) {
    notify(message, true);
    return;
  }
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function productForm(product = {}) {
  const supplierOptions = state.suppliers.map((supplier) => `<option value="${supplier.id}" ${product.supplier === supplier.id ? 'selected' : ''}>${escapeHtml(supplier.name)}</option>`).join('');
  showDialog(product.id ? 'Edit product' : 'Add product', `<input type="hidden" name="id" value="${product.id || ''}"><div class="form-grid">
    <div class="field"><label>Product name</label><input name="name" required maxlength="140" value="${escapeHtml(product.name)}"></div><div class="field"><label>SKU</label><input name="sku" required maxlength="40" value="${escapeHtml(product.sku)}"></div>
    <div class="field"><label>Category</label><input name="category" value="${escapeHtml(product.category)}" placeholder="Fabric, Apparel…"></div><div class="field"><label>Supplier</label><select name="supplier"><option value="">No supplier</option>${supplierOptions}</select></div>
    <div class="field"><label>Price</label><input name="price" type="number" min="0" step="0.01" required value="${escapeHtml(product.price ?? '')}"></div><div class="field"><label>Cost</label><input name="cost" type="number" min="0" step="0.01" value="${escapeHtml(product.cost ?? '0.00')}"></div>
    <div class="field"><label>Stock on hand</label><input name="stock" type="number" min="0" step="1" required value="${escapeHtml(product.stock ?? 0)}"></div><div class="field"><label>Size</label><input name="size" value="${escapeHtml(product.size)}"></div><div class="field"><label>Color</label><input name="color" value="${escapeHtml(product.color)}"></div>${product.id ? `<div class="field"><label>Status</label><select name="is_active"><option value="true" ${product.is_active ? 'selected' : ''}>Active</option><option value="false" ${product.is_active ? '' : 'selected'}>Inactive</option></select></div>` : ''}
    </div>`);
}

function supplierForm(supplier = {}) {
  showDialog(supplier.id ? 'Edit supplier' : 'Add supplier', `<input type="hidden" name="id" value="${supplier.id || ''}"><div class="form-grid">
    <div class="field span-two"><label>Business name</label><input name="name" required value="${escapeHtml(supplier.name)}"></div><div class="field"><label>Contact person</label><input name="contact_name" value="${escapeHtml(supplier.contact_name)}"></div><div class="field"><label>Phone</label><input name="phone" value="${escapeHtml(supplier.phone)}"></div><div class="field span-two"><label>Email</label><input name="email" type="email" value="${escapeHtml(supplier.email)}"></div><div class="field span-two"><label>Address</label><textarea name="address">${escapeHtml(supplier.address)}</textarea></div></div>`);
}

function staffForm(member = {}) {
  const isEdit = Boolean(member.id);
  const body = `<input type="hidden" name="id" value="${member.id || ''}"><div class="form-grid">
    <div class="field"><label>Username</label><input name="username" required ${isEdit ? 'readonly' : ''} value="${escapeHtml(member.username)}"></div><div class="field"><label>Role</label><select name="role"><option value="staff" ${member.role !== 'admin' ? 'selected' : ''}>Staff / cashier</option><option value="admin" ${member.role === 'admin' ? 'selected' : ''}>Administrator</option></select></div>
    <div class="field"><label>First name</label><input name="first_name" value="${escapeHtml(member.first_name)}"></div><div class="field"><label>Last name</label><input name="last_name" value="${escapeHtml(member.last_name)}"></div><div class="field span-two"><label>Email</label><input name="email" type="email" value="${escapeHtml(member.email)}"></div>${isEdit ? '' : '<div class="field span-two"><label>Temporary password (8+ characters)</label><input name="password" type="password" minlength="8" required></div>'}</div>`;
  showDialog(isEdit ? 'Edit staff account' : 'Add staff account', body);
}

function returnForm(sale) {
  const returnableItems = sale.items
    .map((item) => ({ ...item, remaining: returnableQuantity(item.id, item.quantity) }))
    .filter((item) => item.remaining > 0);
  const options = returnableItems.map((item) => `<option value="${item.id}" data-remaining="${item.remaining}">${escapeHtml(item.product_name)} · ${escapeHtml(item.sku)} · ${item.remaining} returnable · ${money(item.unit_price)} each</option>`).join('');
  if (!options) {
    notify('All items on this receipt have already been returned.', true);
    return;
  }
  showDialog(`Return · ${escapeHtml(sale.receipt_number)}`, `<div class="field"><label>Item from receipt</label><select name="sale_item_id" required>${options}</select></div><div class="field"><label>Quantity to return</label><input name="quantity" type="number" min="1" max="${returnableItems[0].remaining}" value="1" required></div><div class="field"><label>Reason (optional)</label><input name="reason" maxlength="240" placeholder="Size exchange, defect…"></div>`, '<button class="button secondary" type="button" data-action="close-dialog">Cancel</button><button class="button" type="submit">Record refund</button>');
  const itemSelect = dialog.querySelector('[name="sale_item_id"]');
  const quantityInput = dialog.querySelector('[name="quantity"]');
  itemSelect.addEventListener('change', () => {
    quantityInput.max = itemSelect.selectedOptions[0].dataset.remaining;
    quantityInput.value = '1';
  });
}

function receiptMarkup(sale) {
  const items = sale.items.map((item) => `<div class="receipt-line"><span>${escapeHtml(item.product_name)} × ${item.quantity}<br><small>${money(item.unit_price)} each</small></span><strong>${money(item.line_total)}</strong></div>`).join('');
  return `<article class="receipt"><div class="receipt-brand"><span class="brand-symbol">T</span><h2>TAKELINE</h2><p>Thank you for shopping local</p></div><div class="receipt-meta"><span>Receipt <strong>${escapeHtml(sale.receipt_number)}</strong></span><span>${new Date(sale.created_at).toLocaleString()}</span><span>Cashier ${escapeHtml(sale.cashier_name || state.user.username)}</span>${sale.customer_name ? `<span>Customer ${escapeHtml(sale.customer_name)}</span>` : ''}</div><div style="padding:10px 0">${items}</div><div class="receipt-line"><span>Subtotal</span><strong>${money(sale.subtotal)}</strong></div>${Number(sale.discount) ? `<div class="receipt-line"><span>Discount</span><strong>− ${money(sale.discount)}</strong></div>` : ''}<div class="receipt-line receipt-total"><span>Total</span><strong>${money(sale.total)}</strong></div><div class="receipt-line"><span>${escapeHtml(sale.payment_method)} · paid</span><strong>${money(sale.amount_paid)}</strong></div>${Number(sale.change_due) ? `<div class="receipt-line"><span>Change</span><strong>${money(sale.change_due)}</strong></div>` : ''}<p class="receipt-thanks">We hope to see you again.</p></article>`;
}

function showReceipt(sale) {
  dialog.innerHTML = `<div class="dialog-head"><h2>Receipt ready</h2><button class="icon-button" data-action="close-dialog" aria-label="Close">×</button></div><div class="dialog-body">${receiptMarkup(sale)}</div><div class="dialog-actions"><button class="button secondary" data-action="close-dialog">Done</button><button class="button" data-action="print-receipt">▣ &nbsp; Print receipt</button></div>`;
  dialog.showModal();
}

async function runAction(action, target) {
  const id = Number(target.dataset.id);
  if (action === 'toggle-tools') { state.mobileToolsOpen = !state.mobileToolsOpen; render(); return; }
  if (action === 'desktop-admin') { window.location.assign('/'); return; }
  if (action === 'close-dialog') { dialog.close(); return; }
  if (action === 'print-receipt') { window.print(); return; }
  if (action === 'logout') {
    try { await api('/api/auth/logout/', { method: 'POST' }); } catch (_) { /* Clear the UI even if the session already expired. */ }
    state.user = null; state.cart = {}; state.page = 'dashboard'; render(); return;
  }
  if (action === 'add-product') { productForm(); return; }
  if (action === 'edit-product') { productForm(state.products.find((item) => item.id === id)); return; }
  if (action === 'delete-product') {
    if (!window.confirm('Permanently delete this product? Products used in completed transactions cannot be deleted.')) return;
    try { await api(`/api/products/${id}/`, { method: 'DELETE' }); await refreshData(); notify('Product deleted.'); } catch (error) { notify(error.message, true); }
    return;
  }
  if (action === 'add-supplier') { supplierForm(); return; }
  if (action === 'edit-supplier') { supplierForm(state.suppliers.find((item) => item.id === id)); return; }
  if (action === 'delete-supplier') {
    if (!window.confirm('Delete this supplier? Products linked to it will remain in the catalog without a supplier.')) return;
    try { await api(`/api/suppliers/${id}/`, { method: 'DELETE' }); await refreshData(); notify('Supplier deleted.'); } catch (error) { notify(error.message, true); }
    return;
  }
  if (action === 'add-staff') { staffForm(); return; }
  if (action === 'edit-staff') { staffForm(state.staff.find((item) => item.id === id)); return; }
  if (action === 'toggle-staff') {
    try { await api(`/api/staff/${id}/`, { method: 'PATCH', body: JSON.stringify({ is_active: target.dataset.active !== 'true' }) }); await refreshData(); notify('Staff access updated.'); } catch (error) { notify(error.message, true); }
    return;
  }
  if (action === 'add-cart') {
    const product = state.products.find((item) => item.id === id);
    if (product && (state.cart[id]?.quantity || 0) < product.stock) state.cart[id] = { product, quantity: (state.cart[id]?.quantity || 0) + 1 };
    else notify('There is no more stock available for this item.', true);
    render(); return;
  }
  if (action === 'cart-plus' || action === 'cart-minus') {
    const line = state.cart[id];
    if (line && action === 'cart-plus' && line.quantity < line.product.stock) line.quantity += 1;
    else if (line && action === 'cart-minus') { line.quantity -= 1; if (!line.quantity) delete state.cart[id]; }
    render(); return;
  }
  if (action === 'clear-cart') { state.cart = {}; render(); return; }
  if (action === 'view-receipt') {
    const sale = state.transactions.find((item) => item.id === id);
    if (sale) showReceipt(sale);
    return;
  }
  if (action === 'export-ledger') { exportLedger(); return; }
}

function exportLedger() {
  const rows = [['Date', 'Type', 'Description', 'Receipt', 'Amount'], ...state.ledger.map((entry) => [entry.created_at, entry.entry_type, entry.note, entry.receipt_number || '', entry.amount])];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = 'takeline-ledger.csv'; link.click(); URL.revokeObjectURL(link.href);
}

async function submitLogin(form) {
  const data = new FormData(form);
  try {
    await api('/api/auth/login/', { method: 'POST', body: JSON.stringify({ username: data.get('username'), password: data.get('password') }) });
    state.user = await api('/api/auth/me/');
    if (!state.user.is_admin) state.page = 'billing';
    await refreshData();
  } catch (error) { notify(error.message, true); }
}

async function submitCheckout(form) {
  if (!Object.keys(state.cart).length) return;
  const data = new FormData(form);
  const payload = {
    items: Object.values(state.cart).map(({ product, quantity }) => ({ product_id: product.id, quantity })),
    customer_name: data.get('customer_name'), payment_method: data.get('payment_method'),
    amount_paid: data.get('amount_paid'), discount: data.get('discount') || '0',
  };
  try {
    const sale = await api('/api/checkout/', { method: 'POST', body: JSON.stringify(payload) });
    state.cart = {}; state.query = '';
    await refreshData();
    showReceipt(sale);
  } catch (error) { notify(error.message, true); }
}

async function submitDialog(form) {
  const data = new FormData(form);
  const values = Object.fromEntries(data.entries());
  try {
    if (dialog.querySelector('[name="sku"]')) {
      const id = values.id; delete values.id;
      values.price = Number(values.price); values.cost = Number(values.cost || 0); values.stock = Number(values.stock);
      values.supplier = values.supplier ? Number(values.supplier) : null;
      if (values.is_active !== undefined) values.is_active = values.is_active === 'true';
      await api(id ? `/api/products/${id}/` : '/api/products/', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(values) });
      if (!id) state.query = '';
      notify(id ? 'Product updated.' : 'Product created.');
    } else if (dialog.querySelector('[name="contact_name"]')) {
      const id = values.id; delete values.id;
      await api(id ? `/api/suppliers/${id}/` : '/api/suppliers/', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(values) });
      notify(id ? 'Supplier updated.' : 'Supplier added.');
    } else if (dialog.querySelector('[name="role"]')) {
      const id = values.id; delete values.id;
      if (id) delete values.username;
      await api(id ? `/api/staff/${id}/` : '/api/staff/', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(values) });
      notify(id ? 'Staff account updated.' : 'Staff account created.');
    } else if (dialog.querySelector('[name="sale_item_id"]')) {
      values.sale_item_id = Number(values.sale_item_id); values.quantity = Number(values.quantity);
      await api('/api/returns/', { method: 'POST', body: JSON.stringify(values) });
      notify('Return recorded and stock restored.');
    }
    dialog.close(); await refreshData();
  } catch (error) { showDialogError(error.message); }
}

document.addEventListener('click', async (event) => {
  const pageTarget = event.target.closest('[data-page]');
  if (pageTarget) {
    event.preventDefault();
    const nextPage = pageTarget.dataset.page;
    state.page = nextPage;
    state.mobileToolsOpen = false;
    state.query = '';
    if (state.page === 'billing' && window.location.pathname === '/') history.replaceState({}, '', '/');
    await refreshData().catch((error) => notify(error.message, true));
    return;
  }
  const actionTarget = event.target.closest('[data-action]');
  if (actionTarget) await runAction(actionTarget.dataset.action, actionTarget);
});

document.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const formId = form.getAttribute('id');
  if (formId === 'login-form') await submitLogin(form);
  else if (formId === 'checkout-form') await submitCheckout(form);
  else if (formId === 'dialog-form') await submitDialog(form);
  else if (formId === 'return-lookup-form') {
    const saleId = Number(new FormData(form).get('sale_id') || document.querySelector('#return-sale').value);
    const sale = state.transactions.find((item) => item.id === saleId);
    if (sale) returnForm(sale);
  }
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'product-search' || event.target.id === 'billing-search') {
    const inputId = event.target.id;
    state.query = event.target.value;
    const cursor = event.target.selectionStart;
    renderPage();
    const nextInput = document.querySelector(`#${inputId}`);
    nextInput?.focus(); nextInput?.setSelectionRange(cursor, cursor);
  }
  if (event.target.id === 'cart-discount') {
    const totals = cartTotal();
    document.querySelector('#checkout-subtotal').textContent = money(totals.subtotal);
    document.querySelector('#checkout-discount-total').textContent = `− ${money(totals.discount)}`;
    document.querySelector('#checkout-due').textContent = money(totals.total);
  }
});

async function start() {
  if (isMobileRoute) document.body.classList.add('mobile-mode');
  try {
    await api('/api/csrf/');
    state.user = await api('/api/auth/me/');
    if (!state.user.is_admin && isMobileRoute) state.page = 'billing';
    await refreshData();
  } catch (_) {
    state.user = null;
    render();
  }
}

start();
