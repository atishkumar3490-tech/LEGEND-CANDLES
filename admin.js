/* =============================================================================
   LEGEND — admin.js   (FILE 6 of 6)
   Admin Panel Logic ONLY
   -----------------------------------------------------------------------------
   Live Firebase orders with full delivery details + WhatsApp confirmation,
   product CRUD with a Category dropdown (Candles / Hampers) and multiple image
   URLs, stock toggle, GST / delivery / UPI / COD live controls and personalised
   VIP coupons. All data comes from window.LegendStore (store.js).
   ============================================================================= */
(function () {
  'use strict';

  const S = window.LegendStore;
  if (!S) {
    document.body.innerHTML = '<p style="padding:40px;text-align:center;font-family:sans-serif">Unable to load store.js. Please keep all LEGEND files in the same folder.</p>';
    return;
  }

  /* ---------------------------------------------------------------------------
     1. HELPERS & REFERENCES
     --------------------------------------------------------------------------- */
  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  const esc = S.escapeHTML;
  const inr = S.formatINR;

  function ico(name, size) {
    const px = size || 18;
    return '<svg viewBox="0 0 24 24" width="' + px + '" height="' + px + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function parseNum(v) {
    const n = parseFloat(v);
    return isFinite(n) ? n : NaN;
  }

  function nonNeg(v) {
    const n = parseFloat(v);
    return isFinite(n) && n >= 0 ? n : 0;
  }

  function okRef(u) {
    return u.length > 3 && u.length <= 700 &&
      (/^(https?:\/\/|art:)/i.test(u) || /\.(jpe?g|png|webp|gif|avif|svg)(\?.*)?$/i.test(u));
  }

  const el = {
    gate: $('#pinGate'), gatePin: $('#gatePin'), gateError: $('#gateError'), gateBtn: $('#gateBtn'),
    app: $('#adminApp'), themeBtn: $('#themeBtn'), logoutBtn: $('#logoutBtn'),
    liveDot: $('#liveDot'), connLabel: $('#connLabel'), statusBanner: $('#statusBanner'),
    stats: $('#statGrid'), tabs: $('#adminTabs'),
    tabCountOrders: $('#tabCountOrders'), tabCountProducts: $('#tabCountProducts'), tabCountCoupons: $('#tabCountCoupons'),
    orderFilters: $('#orderFilters'), orderList: $('#orderList'),
    productForm: $('#productForm'), formTitle: $('#formTitle'),
    pCategory: $('#pCategory'), pName: $('#pName'), pNotes: $('#pNotes'), pMrp: $('#pMrp'), pPrice: $('#pPrice'),
    pLeft: $('#pLeft'), pVideo: $('#pVideo'), pStock: $('#pStock'), pStockDesc: $('#pStockDesc'),
    thumbList: $('#thumbList'), imgUrls: $('#imgUrls'), addUrls: $('#addUrls'),
    saveBtn: $('#saveProduct'), formReset: $('#formReset'),
    seedBox: $('#seedBox'), productList: $('#productList'), productCount: $('#productCount'),
    taxForm: $('#taxForm'), gstEnabled: $('#gstEnabled'), gstPercent: $('#gstPercent'),
    deliveryCharge: $('#deliveryCharge'), freeAbove: $('#freeAbove'), taxPreview: $('#taxPreview'),
    payForm: $('#payForm'), upiId: $('#upiId'), codEnabled: $('#codEnabled'),
    payStatus: $('#payStatus'), upiPreview: $('#upiPreview'),
    couponForm: $('#couponForm'), couponBtn: $('#couponBtn'),
    cCode: $('#cCode'), cType: $('#cType'), cValue: $('#cValue'),
    cValueLabel: $('#cValueLabel'), cName: $('#cName'), cNameHint: $('#cNameHint'),
    couponList: $('#couponList'), couponCount: $('#couponCount'),
    toastWrap: $('#toastWrap')
  };

  const state = {
    ready: false,
    loaded: false,
    tab: 'orders',
    filter: 'All',
    animateOrders: true,
    ordersDirty: false,
    known: null,
    editingId: null,
    images: [],
    saving: false
  };

  /* ---------------------------------------------------------------------------
     2. TOASTS, CLIPBOARD, SCROLL
     --------------------------------------------------------------------------- */
  function toast(message, type) {
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.setAttribute('role', 'status');
    t.textContent = message;
    el.toastWrap.appendChild(t);
    while (el.toastWrap.children.length > 3) el.toastWrap.removeChild(el.toastWrap.firstChild);
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 320);
    }, 2800);
  }

  function copyText(text, okMessage) {
    function fallback() {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? okMessage : 'Copy failed. Please copy it manually.', ok ? 'success' : 'error');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMessage, 'success'); }, fallback);
    } else {
      fallback();
    }
  }

  function scrollToNode(node) {
    const bar = $('.admin-topbar');
    const y = node.getBoundingClientRect().top + window.scrollY - ((bar ? bar.offsetHeight : 60) + 12);
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }

  /* ---------------------------------------------------------------------------
     3. PIN GATE
     --------------------------------------------------------------------------- */
  let gateFails = 0;
  let gateLockUntil = 0;

  function showGate() {
    el.app.classList.add('hidden');
    el.gate.classList.remove('hidden');
    el.gatePin.value = '';
    el.gateError.textContent = '';
    setTimeout(function () { el.gatePin.focus(); }, 80);
  }

  function unlock() {
    el.gate.classList.add('hidden');
    el.app.classList.remove('hidden');
    if (!state.ready) init();
    else renderAll();
  }

  function tryUnlock() {
    const now = Date.now();
    if (now < gateLockUntil) {
      el.gateError.textContent = 'Too many attempts. Try again in ' + Math.ceil((gateLockUntil - now) / 1000) + 's.';
      return;
    }
    if (S.verifyAdminPin(el.gatePin.value)) {
      gateFails = 0;
      el.gateError.textContent = '';
      unlock();
      return;
    }
    gateFails += 1;
    el.gatePin.value = '';
    if (gateFails >= 5) {
      gateFails = 0;
      gateLockUntil = Date.now() + 30000;
      el.gateError.textContent = 'Too many attempts. Locked for 30 seconds.';
    } else {
      el.gateError.textContent = 'Incorrect PIN. Please try again.';
    }
  }

  el.gateBtn.addEventListener('click', tryUnlock);
  el.gatePin.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); }
  });
  el.gatePin.addEventListener('input', function () {
    const c = el.gatePin.value.replace(/\D/g, '').slice(0, 4);
    if (c !== el.gatePin.value) el.gatePin.value = c;
    el.gateError.textContent = '';
  });

  window.addEventListener('pageshow', function (e) {
    if (e.persisted && !S.isAdminAuthed()) window.location.reload();
  });

  /* ---------------------------------------------------------------------------
     4. TOP BAR (theme, logout, connection) & TABS
     --------------------------------------------------------------------------- */
  function renderTheme() {
    el.themeBtn.innerHTML = S.getTheme() === 'dark' ? ico('sun', 20) : ico('moon', 20);
  }

  function renderStatus() {
    const st = S.getStatus();
    let label = 'Live';
    let dot = '';
    let cls = '';
    let msg = '';
    if (st.error) {
      label = 'Problem';
      dot = 'off';
      cls = 'error';
      msg = '<b>Connection problem.</b> ' + esc(st.error);
    } else if (st.demo) {
      label = 'Demo mode';
      dot = 'demo';
      cls = 'warn';
      msg = '<b>Demo mode.</b> Firebase is not connected, so everything is saved only on this device. Paste your keys into firebaseConfig at the top of store.js to go live.';
    } else if (!st.online) {
      label = 'Offline';
      dot = 'off';
      cls = 'error';
      msg = '<b>You are offline.</b> Changes cannot be saved until your connection returns.';
    }
    el.liveDot.className = 'live-dot' + (dot ? ' ' + dot : '');
    el.connLabel.textContent = label;
    if (msg) {
      el.statusBanner.className = 'banner ' + cls + ' mb-2';
      el.statusBanner.innerHTML = msg;
    } else {
      el.statusBanner.className = 'hidden';
      el.statusBanner.innerHTML = '';
    }
  }

  function setTab(name) {
    state.tab = name;
    $$('.tab-btn', el.tabs).forEach(function (b) {
      const on = b.getAttribute('data-tab') === name;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on && b.scrollIntoView) b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    });
    $$('.tab-panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'tab-' + name);
    });
    if (name === 'orders') {
      state.animateOrders = true;
      renderOrders();
    }
  }

  /* ---------------------------------------------------------------------------
     5. STATS
     --------------------------------------------------------------------------- */
  function renderStats() {
    const st = S.getOrderStats();
    const cards = [
      ['Total Orders', String(st.total), ''],
      ['Pending', String(st.Pending), ''],
      ['Delivered', String(st.Delivered), ''],
      ['Revenue', inr(st.revenue), 'accent']
    ];
    el.stats.innerHTML = cards.map(function (c) {
      return '<div class="stat-card"><div class="stat-label">' + c[0] + '</div><div class="stat-value ' + c[2] + '">' + c[1] + '</div></div>';
    }).join('');
    el.tabCountOrders.textContent = String(st.Pending);
    el.tabCountProducts.textContent = String(S.getProducts().length);
    el.tabCountCoupons.textContent = String(S.getCoupons().length);
    document.title = (st.Pending ? '(' + st.Pending + ') ' : '') + 'LEGEND | Admin Command Center';
  }

  /* ---------------------------------------------------------------------------
     6. LIVE ORDERS
     --------------------------------------------------------------------------- */
  function billRow(label, value, cls) {
    return '<div class="bill-row' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><span class="val">' + value + '</span></div>';
  }

  function kv(label, valueHTML) {
    return '<dt>' + label + '</dt><dd>' + valueHTML + '</dd>';
  }

  function addressText(o) {
    const c = o.customer;
    return [
      c.name,
      '+91 ' + c.phone,
      [c.flat, c.area].filter(Boolean).join(', ') || c.address,
      c.landmark ? 'Landmark: ' + c.landmark : '',
      c.pincode ? 'PIN: ' + c.pincode : ''
    ].filter(Boolean).join('\n');
  }

  function orderBillHTML(o) {
    const b = o.bill;
    let rows = billRow('Subtotal', inr(b.subtotal));
    if (b.discount > 0) {
      let label = 'VIP Discount';
      if (b.couponCode) label += ' (' + esc(b.couponCode) + (b.couponCustomer ? ' &middot; ' + esc(b.couponCustomer) : '') + ')';
      rows += billRow(label, '&minus;' + inr(b.discount), 'discount');
    }
    if (b.gstEnabled) rows += billRow('GST (' + b.gstPercent + '%)', inr(b.gst));
    rows += billRow('Delivery', b.deliveryFree ? 'FREE' : inr(b.delivery), b.deliveryFree ? 'free' : '');
    rows += billRow('Total', inr(b.total), 'total');
    return '<div class="order-bill">' + rows + '</div>';
  }

  function orderCardHTML(o, animate) {
    const c = o.customer;
    const items = o.items.map(function (it) {
      return '<li><span>' + esc(it.name) + ' <span class="text-mute">&times; ' + it.qty + '</span></span><span>' + inr(it.lineTotal) + '</span></li>';
    }).join('');

    const hasParts = !!(c.flat || c.area);
    const delivery =
      '<div class="order-address"><dl class="kv">' +
        kv('Name', esc(c.name)) +
        kv('Mobile', '<a href="tel:+91' + esc(c.phone) + '">+91 ' + esc(c.phone) + '</a>') +
        (hasParts
          ? kv('Flat / House', esc(c.flat || '-')) + kv('Area / Street', esc(c.area || '-')) + kv('Landmark', esc(c.landmark || '-')) + kv('Pincode', '<b>' + esc(c.pincode || '-') + '</b>')
          : kv('Address', esc(c.address || '-'))) +
      '</dl></div>';

    const pay = o.payment || {};
    let payHTML;
    if (pay.method === 'UPI') {
      payHTML = '<span class="pay-chip">UPI</span><span>UTR: <b class="mono">' + esc(pay.utr || '-') + '</b></span>' +
        '<button class="btn btn-sm" type="button" data-act="copy-utr" data-utr="' + esc(pay.utr || '') + '">' + ico('copy', 15) + 'Copy</button>';
    } else {
      payHTML = '<span class="pay-chip">COD</span><span>Collect <b>' + inr(o.bill.total) + '</b> on delivery</span>';
    }

    const options = S.orderStatuses.map(function (s) {
      return '<option value="' + s + '"' + (s === o.status ? ' selected' : '') + '>' + s + '</option>';
    }).join('');

    const wa = S.buildWhatsAppLink(o);
    const waBtn = wa
      ? '<a class="btn btn-whatsapp" href="' + esc(wa) + '" target="_blank" rel="noopener">' + ico('chat', 18) + 'WhatsApp Update</a>'
      : '<button class="btn" type="button" disabled>No WhatsApp number</button>';

    return '<article class="order-card" data-id="' + esc(o.id) + '"' + (animate ? '' : ' style="animation:none"') + '>' +
      '<div class="order-head">' +
        '<div><div class="order-id">' + esc(o.id) + '</div><div class="order-date">' + esc(S.formatDateTime(o.createdAt)) + '</div></div>' +
        '<span class="status-pill ' + esc(o.status.toLowerCase()) + '">' + esc(o.status) + '</span>' +
      '</div>' +
      delivery +
      '<ul class="order-items">' + items + '</ul>' +
      orderBillHTML(o) +
      '<div class="order-pay">' + payHTML + '</div>' +
      '<div class="order-actions">' +
        '<select data-act="status" data-id="' + esc(o.id) + '" aria-label="Order status">' + options + '</select>' +
        waBtn +
        '<button class="btn btn-sm" type="button" data-act="copy-address" data-id="' + esc(o.id) + '">' + ico('copy', 15) + 'Copy Address</button>' +
        '<button class="btn btn-danger btn-sm" type="button" data-act="delete-order" data-id="' + esc(o.id) + '">Delete</button>' +
      '</div>' +
    '</article>';
  }

  function ordersBusy() {
    const a = document.activeElement;
    return !!(a && el.orderList.contains(a) && a.tagName === 'SELECT');
  }

  function renderOrders() {
    if (ordersBusy()) {
      state.ordersDirty = true;
      return;
    }
    state.ordersDirty = false;

    const all = S.getOrders();
    const counts = { All: all.length };
    S.orderStatuses.forEach(function (s) { counts[s] = 0; });
    all.forEach(function (o) { if (counts[o.status] !== undefined) counts[o.status] += 1; });
    if (state.filter !== 'All' && S.orderStatuses.indexOf(state.filter) < 0) state.filter = 'All';

    el.orderFilters.innerHTML = ['All'].concat(S.orderStatuses).map(function (f) {
      return '<button class="chip' + (state.filter === f ? ' active' : '') + '" type="button" data-filter="' + f + '">' + f + ' (' + counts[f] + ')</button>';
    }).join('');

    const list = state.filter === 'All' ? all : all.filter(function (o) { return o.status === state.filter; });
    if (!list.length) {
      el.orderList.innerHTML = '<div class="empty">' + ico('bag', 54) +
        '<div class="empty-title">' + (all.length ? 'No ' + esc(state.filter.toLowerCase()) + ' orders' : 'No orders yet') + '</div>' +
        '<p>' + (all.length ? 'Try another filter above.' : 'New orders appear here live the moment a customer checks out.') + '</p></div>';
      return;
    }
    const animate = state.animateOrders;
    el.orderList.innerHTML = list.map(function (o) { return orderCardHTML(o, animate); }).join('');
    state.animateOrders = false;
  }

  function handleNewOrders() {
    const ids = S.getOrders().map(function (o) { return o.id; });
    if (state.known === null) {
      state.known = {};
      ids.forEach(function (id) { state.known[id] = true; });
      return;
    }
    ids.forEach(function (id) {
      if (state.known[id]) return;
      state.known[id] = true;
      const o = S.getOrder(id);
      toast('New order ' + id + (o ? ' \u00b7 ' + inr(o.bill.total) : ''), 'success');
      try { if (navigator.vibrate) navigator.vibrate(120); } catch (e) { /* ignore */ }
    });
  }

  el.orderFilters.addEventListener('click', function (e) {
    const chip = e.target.closest('[data-filter]');
    if (!chip) return;
    state.filter = chip.getAttribute('data-filter');
    state.animateOrders = true;
    renderOrders();
  });

  el.orderList.addEventListener('change', async function (e) {
    const sel = e.target.closest('[data-act="status"]');
    if (!sel) return;
    const id = sel.getAttribute('data-id');
    const value = sel.value;
    sel.blur();
    sel.disabled = true;
    const res = await S.updateOrderStatus(id, value);
    if (!res.ok) {
      toast(res.message, 'error');
      state.ordersDirty = false;
      renderOrders();
      return;
    }
    toast(id + ' marked ' + value + '. Tap WhatsApp Update to tell the customer.', 'success');
  });

  el.orderList.addEventListener('focusout', function () {
    setTimeout(function () {
      if (state.ordersDirty && !ordersBusy()) renderOrders();
    }, 150);
  });

  el.orderList.addEventListener('click', async function (e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'copy-utr') {
      const utr = btn.getAttribute('data-utr');
      if (utr) copyText(utr, 'UTR copied');
    } else if (act === 'copy-address') {
      const o = S.getOrder(btn.getAttribute('data-id'));
      if (o) copyText(addressText(o), 'Delivery address copied');
    } else if (act === 'delete-order') {
      const id = btn.getAttribute('data-id');
      if (!window.confirm('Delete order ' + id + '? This cannot be undone.')) return;
      const res = await S.deleteOrder(id);
      toast(res.ok ? 'Order deleted' : res.message, res.ok ? 'success' : 'error');
    }
  });

  /* ---------------------------------------------------------------------------
     7. PRODUCTS: FORM, GALLERY, LIST
     --------------------------------------------------------------------------- */
  function updateStockDesc() {
    el.pStockDesc.textContent = el.pStock.checked
      ? 'Customers can add this to their cart.'
      : 'Shown as "Sold Out" and cannot be ordered.';
  }

  function renderThumbs() {
    if (!state.images.length) {
      el.thumbList.innerHTML = '<span class="hint">No images yet. Paste image URLs below to build the swipe gallery.</span>';
      return;
    }
    el.thumbList.innerHTML = state.images.map(function (ref, i) {
      return '<div class="media-thumb">' +
        '<img src="' + esc(S.imageSrc(ref)) + '" alt="Gallery image ' + (i + 1) + '" data-act="cover" data-i="' + i + '">' +
        (i === 0 ? '<span class="thumb-first">Cover</span>' : '') +
        '<button class="thumb-remove" type="button" data-act="img-remove" data-i="' + i + '" aria-label="Remove image ' + (i + 1) + '">&times;</button>' +
      '</div>';
    }).join('');
  }

  function resetProductForm() {
    state.editingId = null;
    state.images = [];
    el.productForm.reset();
    el.imgUrls.value = '';
    el.formTitle.textContent = 'Add New Product';
    el.formReset.textContent = 'Clear Form';
    el.saveBtn.textContent = 'Save Product';
    updateStockDesc();
    renderThumbs();
  }

  function loadProductIntoForm(p) {
    state.editingId = p.id;
    state.images = p.images.slice();
    el.pCategory.value = p.category;
    el.pName.value = p.name;
    el.pNotes.value = p.notes;
    el.pMrp.value = p.mrp;
    el.pPrice.value = p.price;
    el.pLeft.value = p.onlyLeft > 0 ? p.onlyLeft : '';
    el.pVideo.value = p.video;
    el.pStock.checked = p.inStock;
    el.imgUrls.value = '';
    el.formTitle.textContent = 'Edit Product';
    el.formReset.textContent = 'Cancel Edit';
    el.saveBtn.textContent = 'Update Product';
    updateStockDesc();
    renderThumbs();
    scrollToNode($('#productFormCard'));
  }

  el.pStock.addEventListener('change', updateStockDesc);
  el.formReset.addEventListener('click', function () {
    resetProductForm();
    toast('Form cleared', '');
  });

  el.thumbList.addEventListener('click', function (e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const i = parseInt(t.getAttribute('data-i'), 10);
    if (!isFinite(i) || i < 0 || i >= state.images.length) return;
    const act = t.getAttribute('data-act');
    if (act === 'img-remove') {
      state.images.splice(i, 1);
      renderThumbs();
    } else if (act === 'cover' && i > 0) {
      state.images.unshift(state.images.splice(i, 1)[0]);
      renderThumbs();
      toast('Cover image updated', 'success');
    }
  });

  el.addUrls.addEventListener('click', function () {
    const parts = el.imgUrls.value.split(/\s+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!parts.length) { toast('Paste at least one image URL.', 'error'); return; }
    let added = 0;
    let skipped = 0;
    parts.forEach(function (u) {
      if (!okRef(u) || state.images.indexOf(u) > -1 || state.images.length >= S.maxImages) { skipped += 1; return; }
      state.images.push(u);
      added += 1;
    });
    renderThumbs();
    if (added) {
      el.imgUrls.value = '';
      toast(added + (added === 1 ? ' image added' : ' images added'), 'success');
    }
    if (skipped) toast(skipped + ' skipped (not an image link, duplicate or gallery full)', 'error');
  });

  el.productForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (state.saving) return;

    const name = el.pName.value.trim();
    const price = parseNum(el.pPrice.value);
    const mrp = parseNum(el.pMrp.value);
    const video = el.pVideo.value.trim();

    if (name.length < 2) { toast('Please enter the product name.', 'error'); el.pName.focus(); return; }
    if (!(price > 0)) { toast('Enter a selling price greater than zero.', 'error'); el.pPrice.focus(); return; }
    if (isFinite(mrp) && mrp < price) { toast('MRP cannot be lower than the selling price.', 'error'); el.pMrp.focus(); return; }
    if (video && !/^https?:\/\/\S+$/i.test(video)) { toast('Enter a valid video link starting with https://', 'error'); el.pVideo.focus(); return; }

    const data = {
      category: el.pCategory.value,
      name: name,
      notes: el.pNotes.value.trim(),
      mrp: isFinite(mrp) ? mrp : price,
      price: price,
      onlyLeft: Math.max(0, parseInt(el.pLeft.value, 10) || 0),
      inStock: el.pStock.checked,
      images: state.images.slice(),
      video: video
    };

    const editing = !!state.editingId;
    const label = editing ? 'Update Product' : 'Save Product';
    state.saving = true;
    el.saveBtn.disabled = true;
    el.saveBtn.textContent = 'Saving...';
    const res = editing ? await S.updateProduct(state.editingId, data) : await S.addProduct(data);
    state.saving = false;
    el.saveBtn.disabled = false;
    el.saveBtn.textContent = label;

    if (!res.ok) { toast(res.message, 'error'); return; }
    toast(editing ? 'Product updated' : 'Product added to ' + S.categoryLabel(data.category), 'success');
    if (!data.images.length) toast('No image added. A default LEGEND artwork will be shown.', '');
    resetProductForm();
  });

  function productRowHTML(p) {
    const off = S.percentOff(p.mrp, p.price);
    const fallback = p.category === 'hampers' ? 'art:hamper:sapphire:0' : 'art:candle:amber:0';
    const meta = [inr(p.price) + (p.mrp > p.price ? ' (MRP ' + inr(p.mrp) + ', ' + off + '% off)' : '')];
    meta.push(p.images.length + (p.images.length === 1 ? ' image' : ' images') + (p.video ? ' + video' : ''));
    if (p.onlyLeft > 0) meta.push('Only ' + p.onlyLeft + ' left badge');
    return '<div class="admin-product" data-id="' + esc(p.id) + '">' +
      '<img class="ap-thumb" src="' + esc(S.imageSrc(p.images[0] || fallback)) + '" alt="' + esc(p.name) + '">' +
      '<div>' +
        '<div class="ap-name">' + esc(p.name) + '</div>' +
        '<div class="ap-meta">' + esc(meta.join(' \u00b7 ')) + '</div>' +
        (p.notes ? '<div class="ap-meta">' + esc(p.notes) + '</div>' : '') +
      '</div>' +
      '<div class="ap-actions">' +
        '<label class="ap-stock"><span class="switch"><input type="checkbox" data-act="stock" data-id="' + esc(p.id) + '"' + (p.inStock ? ' checked' : '') + ' aria-label="In stock"><span class="switch-track"></span></span>' +
          '<span>' + (p.inStock ? 'In Stock' : 'Out of Stock') + '</span></label>' +
        '<div class="ap-btns">' +
          '<button class="btn btn-sm" type="button" data-act="edit" data-id="' + esc(p.id) + '">Edit</button>' +
          '<button class="btn btn-danger btn-sm" type="button" data-act="delete" data-id="' + esc(p.id) + '">Delete</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderProducts() {
    const products = S.getProducts();
    el.productCount.textContent = products.length + (products.length === 1 ? ' product' : ' products');

    if (!products.length) {
      el.seedBox.innerHTML =
        '<div class="banner mb-2"><div><b>Your store has no products yet.</b> Add your first one above, or fill the store with sample candles and gift boxes to see how it looks.' +
        '<div class="mt-1"><button class="btn btn-primary btn-sm" type="button" data-act="seed">Load Sample Products</button></div></div></div>';
      el.productList.innerHTML = '<div class="empty">' + ico('plus', 54) +
        '<div class="empty-title">No products yet</div><p>Use the form above to add your first candle or hamper.</p></div>';
      return;
    }

    el.seedBox.innerHTML = '';
    el.productList.innerHTML = S.categories.map(function (cat) {
      const list = products.filter(function (p) { return p.category === cat.id; });
      return '<h3 class="group-title"><span class="gem"></span>' + esc(cat.section) + ' <span class="cat-pill">' + list.length + '</span></h3>' +
        (list.length ? list.map(productRowHTML).join('') : '<p class="hint">Nothing in this section yet.</p>');
    }).join('');
  }

  el.seedBox.addEventListener('click', async function (e) {
    const btn = e.target.closest('[data-act="seed"]');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = 'Loading...';
    const res = await S.seedDemo();
    if (res.ok) toast('Sample products loaded', 'success');
    else {
      toast(res.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Load Sample Products';
    }
  });

  el.productList.addEventListener('change', async function (e) {
    const t = e.target.closest('[data-act="stock"]');
    if (!t) return;
    t.disabled = true;
    const res = await S.toggleStock(t.getAttribute('data-id'));
    if (!res.ok) {
      toast(res.message, 'error');
      renderProducts();
      return;
    }
    toast(res.product.name + (res.product.inStock ? ' is back in stock' : ' marked out of stock'), 'success');
  });

  el.productList.addEventListener('click', async function (e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    const id = btn.getAttribute('data-id');
    if (act === 'edit') {
      const p = S.getProduct(id);
      if (p) loadProductIntoForm(p);
    } else if (act === 'delete') {
      const p = S.getProduct(id);
      if (!p) return;
      if (!window.confirm('Delete "' + p.name + '" from the store? This cannot be undone.')) return;
      const res = await S.deleteProduct(id);
      if (res.ok && state.editingId === id) resetProductForm();
      toast(res.ok ? 'Product deleted' : res.message, res.ok ? 'success' : 'error');
    }
  });

  /* ---------------------------------------------------------------------------
     8. TAX, SHIPPING & PAYMENT CONTROLS
     --------------------------------------------------------------------------- */
  function renderTaxPreview(s) {
    const sub = 1000;
    const gst = s.gstEnabled ? round2((sub * s.gstPercent) / 100) : 0;
    const free = s.freeDeliveryAbove > 0 && sub >= s.freeDeliveryAbove;
    const delivery = free ? 0 : s.deliveryCharge;
    const total = round2(sub + gst + delivery);
    let rows = billRow('Subtotal', inr(sub));
    rows += s.gstEnabled ? billRow('GST (' + s.gstPercent + '%)', inr(gst)) : billRow('GST', 'Off');
    rows += billRow('Delivery', delivery === 0 ? 'FREE' : inr(delivery), delivery === 0 ? 'free' : '');
    rows += billRow('Customer pays', inr(total), 'total');
    el.taxPreview.innerHTML = rows;
  }

  function renderPayStatus(s) {
    const upiOK = S.isValidUpiId(s.upiId);
    function line(label, on, detail) {
      return '<div class="toggle-card" style="margin-bottom:10px"><div><div class="setting-label">' + label + '</div><div class="setting-desc">' + detail + '</div></div>' +
        '<span class="status-pill ' + (on ? 'delivered' : 'cancelled') + '">' + (on ? 'Live' : 'Off') + '</span></div>';
    }
    let html = line('UPI / QR payments', upiOK, upiOK ? esc(s.upiId) : 'Add a valid UPI ID to switch this on') +
      line('Cash on Delivery', s.codEnabled, s.codEnabled ? 'Customers can pay in cash' : 'Turned off by you');
    if (!upiOK && !s.codEnabled) {
      html += '<p class="coupon-msg err">Customers cannot place orders right now. Turn on COD or add a UPI ID.</p>';
    }
    el.payStatus.innerHTML = html;

    if (upiOK) {
      const link = S.buildUpiLink(1, 'LEGEND test');
      const qr = S.buildUpiQrUrl(link, 260);
      el.upiPreview.innerHTML =
        '<div class="upi-box">' +
          '<span class="field-label">Test QR (&#8377;1.00)</span>' +
          '<div class="upi-qr"><img src="' + esc(qr) + '" alt="UPI test QR" width="188" height="188"></div>' +
          '<div class="upi-id">' + esc(s.upiId) + '</div>' +
          '<p class="upi-steps">Scan this with any UPI app to confirm the money reaches the right account.</p>' +
        '</div>';
    } else {
      el.upiPreview.innerHTML = '';
    }
  }

  function setIfIdle(node, value) {
    if (document.activeElement !== node) node.value = value;
  }

  function syncSettingsForm() {
    const s = S.getSettings();
    el.gstEnabled.checked = s.gstEnabled;
    setIfIdle(el.gstPercent, s.gstPercent);
    setIfIdle(el.deliveryCharge, s.deliveryCharge);
    setIfIdle(el.freeAbove, s.freeDeliveryAbove);
    setIfIdle(el.upiId, s.upiId);
    el.codEnabled.checked = s.codEnabled;
    renderTaxPreview(s);
    renderPayStatus(s);
  }

  async function saveSettings(patch, okMessage) {
    const res = await S.updateSettings(patch);
    if (!res.ok) {
      toast(res.message, 'error');
      syncSettingsForm();
      return false;
    }
    if (okMessage) toast(okMessage, 'success');
    return true;
  }

  function saveTaxFields(message) {
    return saveSettings({
      gstEnabled: el.gstEnabled.checked,
      gstPercent: Math.min(100, nonNeg(el.gstPercent.value)),
      deliveryCharge: nonNeg(el.deliveryCharge.value),
      freeDeliveryAbove: nonNeg(el.freeAbove.value)
    }, message);
  }

  el.gstEnabled.addEventListener('change', function () {
    saveSettings({ gstEnabled: el.gstEnabled.checked }, el.gstEnabled.checked ? 'GST is now ON' : 'GST is now OFF');
  });
  [el.gstPercent, el.deliveryCharge, el.freeAbove].forEach(function (input) {
    input.addEventListener('change', function () { saveTaxFields('Saved'); });
  });
  el.taxForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (await saveTaxFields('Tax & shipping saved')) syncSettingsForm();
  });

  el.codEnabled.addEventListener('change', function () {
    saveSettings({ codEnabled: el.codEnabled.checked }, el.codEnabled.checked ? 'Cash on Delivery is ON' : 'Cash on Delivery is OFF');
  });
  el.payForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const id = el.upiId.value.trim();
    const ok = await saveSettings({ upiId: id }, id ? 'UPI ID saved' : 'UPI payments switched off');
    if (ok) syncSettingsForm();
  });

  // image fallback (QR hides, product thumbs use the default artwork)
  document.addEventListener('error', function (e) {
    const t = e.target;
    if (!t || t.tagName !== 'IMG') return;
    const qr = t.closest('.upi-qr');
    if (qr) { qr.classList.add('hidden'); return; }
    if (t.getAttribute('data-fb')) return;
    t.setAttribute('data-fb', '1');
    t.src = S.defaultCandleImage;
  }, true);

  /* ---------------------------------------------------------------------------
     9. VIP COUPONS
     --------------------------------------------------------------------------- */
  function updateCouponHints() {
    const isPercent = el.cType.value === 'percent';
    el.cValueLabel.textContent = isPercent ? 'Discount (%)' : 'Discount (\u20B9)';
    el.cValue.placeholder = isPercent ? '15' : '500';
    const name = el.cName.value.trim();
    el.cNameHint.textContent = name
      ? 'Customer will see: Welcome ' + name + ', Legend VIP Privilege Unlocked!'
      : 'Leave blank for a public coupon anyone can use.';
  }

  function couponRowHTML(c) {
    const off = c.type === 'percent' ? c.value + '% off' : inr(c.value) + ' off';
    return '<div class="coupon-ticket">' +
      '<div>' +
        '<div class="ct-code">' + esc(c.code) + '</div>' +
        '<div class="ct-meta">' + off + '</div>' +
        (c.customerName ? '<span class="vip-tag">VIP &middot; ' + esc(c.customerName) + '</span>' : '<span class="vip-tag">Public</span>') +
      '</div>' +
      '<div class="ap-btns">' +
        '<button class="btn btn-sm" type="button" data-act="copy-coupon" data-code="' + esc(c.code) + '">' + ico('copy', 15) + 'Copy</button>' +
        '<button class="btn btn-danger btn-sm" type="button" data-act="del-coupon" data-code="' + esc(c.code) + '">Delete</button>' +
      '</div>' +
    '</div>';
  }

  function renderCoupons() {
    const coupons = S.getCoupons();
    el.couponCount.textContent = coupons.length + (coupons.length === 1 ? ' coupon' : ' coupons');
    if (!coupons.length) {
      el.couponList.innerHTML = '<div class="empty">' + ico('plus', 54) +
        '<div class="empty-title">No coupons yet</div><p>Create a VIP coupon above to reward a special customer.</p></div>';
      return;
    }
    el.couponList.innerHTML = coupons.map(couponRowHTML).join('');
  }

  el.cCode.addEventListener('input', function () {
    const c = el.cCode.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (c !== el.cCode.value) el.cCode.value = c;
  });
  el.cType.addEventListener('change', updateCouponHints);
  el.cName.addEventListener('input', updateCouponHints);

  el.couponForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    el.couponBtn.disabled = true;
    const res = await S.addCoupon({
      code: el.cCode.value,
      type: el.cType.value,
      value: el.cValue.value,
      customerName: el.cName.value
    });
    el.couponBtn.disabled = false;
    if (!res.ok) { toast(res.message, 'error'); return; }
    el.couponForm.reset();
    updateCouponHints();
    toast('Coupon ' + res.coupon.code + ' created', 'success');
  });

  el.couponList.addEventListener('click', async function (e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    const code = btn.getAttribute('data-code');
    const coupon = S.getCoupons().filter(function (c) { return c.code === code; })[0];
    if (!coupon) return;
    if (act === 'copy-coupon') {
      const text = coupon.customerName
        ? 'Welcome ' + coupon.customerName + '! Your exclusive LEGEND VIP code is ' + coupon.code + '. Enter it at checkout to unlock your privilege.'
        : 'Use code ' + coupon.code + ' at LEGEND checkout to unlock your discount.';
      copyText(text, 'Coupon message copied');
    } else if (act === 'del-coupon') {
      if (!window.confirm('Delete coupon ' + coupon.code + '?')) return;
      const res = await S.deleteCoupon(coupon.code);
      toast(res.ok ? 'Coupon deleted' : res.message, res.ok ? 'success' : 'error');
    }
  });

  /* ---------------------------------------------------------------------------
     10. RENDER ALL + INIT
     --------------------------------------------------------------------------- */
  function renderAll() {
    renderTheme();
    renderStatus();
    renderStats();
    renderOrders();
    renderProducts();
    syncSettingsForm();
    renderCoupons();
  }

  function init() {
    state.ready = true;

    el.tabs.addEventListener('click', function (e) {
      const b = e.target.closest('[data-tab]');
      if (b) setTab(b.getAttribute('data-tab'));
    });

    el.themeBtn.addEventListener('click', function () {
      S.toggleTheme();
      renderTheme();
    });

    el.logoutBtn.addEventListener('click', function () {
      S.adminLogout();
      window.location.href = 'index.html';
    });

    resetProductForm();
    updateCouponHints();
    renderTheme();
    renderStatus();
    el.orderList.innerHTML = '<div class="skeleton" style="height:180px"></div><div class="skeleton" style="height:180px"></div>';

    // live sync: Firebase pushes every change here the moment it happens
    S.subscribe(function (scope) {
      if (!state.ready || !S.isAdminAuthed()) return;
      if (scope === 'theme') { renderTheme(); return; }
      if (scope === 'connection' || scope === 'status') { renderStatus(); return; }
      if (!state.loaded) return;
      if (scope === 'orders') { handleNewOrders(); renderOrders(); renderStats(); }
      if (scope === 'products') { renderProducts(); renderStats(); }
      if (scope === 'settings') syncSettingsForm();
      if (scope === 'coupons') { renderCoupons(); renderStats(); }
    });

    S.connect('admin').then(function () {
      state.loaded = true;
      handleNewOrders();
      renderAll();
    });
  }

  /* ---------------------------------------------------------------------------
     11. BOOT
     --------------------------------------------------------------------------- */
  if (S.isAdminAuthed()) {
    unlock();
  } else {
    showGate();
  }
})();
