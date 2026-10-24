/* =============================================================================
   LEGEND — admin.js   (FILE 6 of 6)
   Admin Panel Logic ONLY
   -----------------------------------------------------------------------------
   Live orders + WhatsApp updates, product & media CRUD, stock toggle,
   GST / delivery / UPI / COD live controls and personalised VIP coupons.
   All data comes from window.LegendStore (store.js).
   ============================================================================= */
(function () {
  'use strict';

  const S = window.LegendStore;
  if (!S) {
    document.body.innerHTML = '<p style="padding:40px;text-align:center;font-family:sans-serif">Unable to load store.js. Please keep all LEGEND files in the same folder.</p>';
    return;
  }

  /* ---------------------------------------------------------------------------
     1. HELPERS
     --------------------------------------------------------------------------- */
  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  const esc = S.escapeHTML;
  const inr = S.formatINR;
  const MAX_IMAGES = 8;

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

  const el = {
    gate: $('#pinGate'), gatePin: $('#gatePin'), gateError: $('#gateError'), gateBtn: $('#gateBtn'),
    app: $('#adminApp'), themeBtn: $('#themeBtn'), logoutBtn: $('#logoutBtn'),
    stats: $('#statGrid'), tabs: $('#adminTabs'),
    tabCountOrders: $('#tabCountOrders'), tabCountProducts: $('#tabCountProducts'), tabCountCoupons: $('#tabCountCoupons'),
    orderFilters: $('#orderFilters'), orderList: $('#orderList'),
    productForm: $('#productForm'), formTitle: $('#formTitle'),
    pName: $('#pName'), pNotes: $('#pNotes'), pMrp: $('#pMrp'), pPrice: $('#pPrice'), pLeft: $('#pLeft'),
    pVideo: $('#pVideo'), pStock: $('#pStock'), pStockDesc: $('#pStockDesc'),
    thumbList: $('#thumbList'), imgFiles: $('#imgFiles'), uploadText: $('#uploadText'),
    imgUrls: $('#imgUrls'), addUrls: $('#addUrls'), saveBtn: $('#saveProduct'), formReset: $('#formReset'),
    storageMeter: $('#storageMeter'), productList: $('#productList'), productCount: $('#productCount'),
    taxForm: $('#taxForm'), gstEnabled: $('#gstEnabled'), gstPercent: $('#gstPercent'),
    deliveryCharge: $('#deliveryCharge'), freeAbove: $('#freeAbove'), taxPreview: $('#taxPreview'),
    payForm: $('#payForm'), upiId: $('#upiId'), codEnabled: $('#codEnabled'),
    payStatus: $('#payStatus'), upiPreview: $('#upiPreview'),
    couponForm: $('#couponForm'), cCode: $('#cCode'), cType: $('#cType'), cValue: $('#cValue'),
    cValueLabel: $('#cValueLabel'), cName: $('#cName'), cNameHint: $('#cNameHint'),
    couponList: $('#couponList'), couponCount: $('#couponCount'),
    toastWrap: $('#toastWrap')
  };

  const state = {
    ready: false,
    tab: 'orders',
    filter: 'All',
    animateOrders: true,
    editingId: null,
    images: [],
    uploading: false
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
    }, 2600);
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
     4. TOP BAR (theme, logout) & TABS
     --------------------------------------------------------------------------- */
  function renderTheme() {
    el.themeBtn.innerHTML = S.getTheme() === 'dark' ? ico('sun', 20) : ico('moon', 20);
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
    if (name === 'products') renderStorage();
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
  }

  /* ---------------------------------------------------------------------------
     6. LIVE ORDERS
     --------------------------------------------------------------------------- */
  function billRow(label, value, cls) {
    return '<div class="bill-row' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><span class="val">' + value + '</span></div>';
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
    const items = o.items.map(function (it) {
      return '<li><span>' + esc(it.name) + ' <span class="text-mute">&times; ' + it.qty + '</span></span><span>' + inr(it.lineTotal) + '</span></li>';
    }).join('');

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
      '<div class="order-meta">' +
        '<div><strong>' + esc(o.customer.name) + '</strong> &middot; <a href="tel:+91' + esc(o.customer.phone) + '">+91 ' + esc(o.customer.phone) + '</a></div>' +
        '<div>' + esc(o.customer.address) + '</div>' +
      '</div>' +
      '<ul class="order-items">' + items + '</ul>' +
      orderBillHTML(o) +
      '<div class="order-pay">' + payHTML + '</div>' +
      '<div class="order-actions">' +
        '<select data-act="status" data-id="' + esc(o.id) + '" aria-label="Order status">' + options + '</select>' +
        waBtn +
        '<button class="btn btn-danger btn-sm" type="button" data-act="delete-order" data-id="' + esc(o.id) + '">Delete</button>' +
      '</div>' +
    '</article>';
  }

  function renderOrders() {
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
        '<p>' + (all.length ? 'Try another filter above.' : 'New orders appear here the moment a customer checks out.') + '</p></div>';
      return;
    }
    const animate = state.animateOrders;
    el.orderList.innerHTML = list.map(function (o) { return orderCardHTML(o, animate); }).join('');
    state.animateOrders = false;
  }

  el.orderFilters.addEventListener('click', function (e) {
    const chip = e.target.closest('[data-filter]');
    if (!chip) return;
    state.filter = chip.getAttribute('data-filter');
    state.animateOrders = true;
    renderOrders();
  });

  el.orderList.addEventListener('change', function (e) {
    const sel = e.target.closest('[data-act="status"]');
    if (!sel) return;
    const id = sel.getAttribute('data-id');
    const res = S.updateOrderStatus(id, sel.value);
    if (!res.ok) { toast(res.message, 'error'); return; }
    toast(id + ' marked ' + sel.value + '. Tap WhatsApp Update to tell the customer.', 'success');
  });

  el.orderList.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'copy-utr') {
      const utr = btn.getAttribute('data-utr');
      if (utr) copyText(utr, 'UTR copied');
    } else if (act === 'delete-order') {
      const id = btn.getAttribute('data-id');
      if (!window.confirm('Delete order ' + id + '? This cannot be undone.')) return;
      const res = S.deleteOrder(id);
      toast(res.ok ? 'Order deleted' : res.message, res.ok ? 'success' : 'error');
    }
  });

  /* ---------------------------------------------------------------------------
     7. PRODUCTS: FORM, GALLERY, LIST
     --------------------------------------------------------------------------- */
  function updateStockDesc() {
    el.pStockDesc.textContent = el.pStock.checked
      ? 'Customers can add this candle to their cart.'
      : 'Shown as "Sold Out" and cannot be ordered.';
  }

  function renderThumbs() {
    if (!state.images.length) {
      el.thumbList.innerHTML = '<span class="hint">No images yet. Upload photos or paste image URLs below.</span>';
      return;
    }
    el.thumbList.innerHTML = state.images.map(function (src, i) {
      return '<div class="media-thumb">' +
        '<img src="' + esc(src) + '" alt="Gallery image ' + (i + 1) + '" data-act="cover" data-i="' + i + '">' +
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

  el.imgFiles.addEventListener('change', async function () {
    const files = Array.prototype.slice.call(el.imgFiles.files || []);
    el.imgFiles.value = '';
    if (!files.length) return;
    const room = MAX_IMAGES - state.images.length;
    if (room <= 0) { toast('A product can have up to ' + MAX_IMAGES + ' images.', 'error'); return; }

    state.uploading = true;
    el.uploadText.textContent = 'Processing photos...';
    let added = 0;
    const batch = files.slice(0, room);
    for (let k = 0; k < batch.length; k += 1) {
      try {
        const url = await S.compressImage(batch[k], 900, 0.78);
        state.images.push(url);
        added += 1;
        renderThumbs();
      } catch (err) {
        toast((err && err.message) || 'Could not add this image.', 'error');
      }
    }
    state.uploading = false;
    el.uploadText.textContent = 'Upload from phone gallery';
    if (added) toast(added + (added === 1 ? ' image added' : ' images added'), 'success');
    if (files.length > room) toast('Only ' + MAX_IMAGES + ' images are allowed per product.', 'error');
  });

  el.addUrls.addEventListener('click', function () {
    const parts = el.imgUrls.value.split(/\s+/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!parts.length) { toast('Paste at least one image URL.', 'error'); return; }
    let added = 0;
    let skipped = 0;
    parts.forEach(function (u) {
      const okShape = u.length > 3 && (/^(https?:\/\/|data:image\/|\.{0,2}\/)/i.test(u) || /\.(jpe?g|png|webp|gif|avif|svg)(\?.*)?$/i.test(u));
      if (!okShape || state.images.indexOf(u) > -1 || state.images.length >= MAX_IMAGES) { skipped += 1; return; }
      state.images.push(u);
      added += 1;
    });
    renderThumbs();
    if (added) el.imgUrls.value = '';
    if (added) toast(added + (added === 1 ? ' URL added' : ' URLs added'), 'success');
    if (skipped) toast(skipped + ' skipped (invalid, duplicate or gallery full)', 'error');
  });

  el.productForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (state.uploading) { toast('Please wait until the photos finish processing.', 'error'); return; }

    const name = el.pName.value.trim();
    const price = parseNum(el.pPrice.value);
    const mrp = parseNum(el.pMrp.value);
    const video = el.pVideo.value.trim();

    if (name.length < 2) { toast('Please enter the product name.', 'error'); el.pName.focus(); return; }
    if (!(price > 0)) { toast('Enter a selling price greater than zero.', 'error'); el.pPrice.focus(); return; }
    if (isFinite(mrp) && mrp < price) { toast('MRP cannot be lower than the selling price.', 'error'); el.pMrp.focus(); return; }
    if (video && /\s/.test(video)) { toast('The video URL cannot contain spaces.', 'error'); el.pVideo.focus(); return; }

    const data = {
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
    const res = editing ? S.updateProduct(state.editingId, data) : S.addProduct(data);
    if (!res.ok) { toast(res.message, 'error'); return; }
    toast(editing ? 'Product updated' : 'Product added to the store', 'success');
    resetProductForm();
  });

  function renderStorage() {
    const kb = S.getStorageUsageKB();
    const pct = Math.min(100, Math.round((kb / 10240) * 100));
    const warn = pct >= 70;
    el.storageMeter.innerHTML =
      '<div class="row-between mb-1"><span class="field-label">Storage used</span><span class="' + (warn ? 'text-danger' : 'text-soft') + '"><b>' + pct + '%</b></span></div>' +
      '<div class="progress"><div class="progress-bar" style="width:' + Math.max(3, pct) + '%' + (warn ? ';background:linear-gradient(180deg,#ff8a97,#e0364a)' : '') + '"></div></div>' +
      (warn ? '<p class="hint mt-1 text-danger">Storage is getting full. Use image URLs or remove unused photos to free space.</p>' : '');
  }

  function productRowHTML(p) {
    const off = S.percentOff(p.mrp, p.price);
    const meta = [inr(p.price) + (p.mrp > p.price ? ' (MRP ' + inr(p.mrp) + ', ' + off + '% off)' : '')];
    meta.push(p.images.length + (p.images.length === 1 ? ' image' : ' images') + (p.video ? ' + video' : ''));
    if (p.onlyLeft > 0) meta.push('Only ' + p.onlyLeft + ' left badge');
    return '<div class="admin-product" data-id="' + esc(p.id) + '">' +
      '<img class="ap-thumb" src="' + esc(p.images[0] || S.placeholderImage) + '" alt="' + esc(p.name) + '">' +
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
      el.productList.innerHTML = '<div class="empty">' + ico('plus', 54) +
        '<div class="empty-title">No products yet</div><p>Use the form above to add your first candle.</p></div>';
    } else {
      el.productList.innerHTML = products.map(productRowHTML).join('');
    }
    renderStorage();
  }

  el.productList.addEventListener('change', function (e) {
    const t = e.target.closest('[data-act="stock"]');
    if (!t) return;
    const res = S.toggleStock(t.getAttribute('data-id'));
    if (!res.ok) { toast(res.message, 'error'); return; }
    toast(res.product.name + (res.product.inStock ? ' is back in stock' : ' marked out of stock'), 'success');
  });

  el.productList.addEventListener('click', function (e) {
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
      const res = S.deleteProduct(id);
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
    const line = function (label, on, detail) {
      return '<div class="toggle-card" style="margin-bottom:10px"><div><div class="setting-label">' + label + '</div><div class="setting-desc">' + detail + '</div></div>' +
        '<span class="status-pill ' + (on ? 'delivered' : 'cancelled') + '">' + (on ? 'Live' : 'Off') + '</span></div>';
    };
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

  function saveSettings(patch, okMessage) {
    const res = S.updateSettings(patch);
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
  el.taxForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (saveTaxFields('Tax & shipping saved')) syncSettingsForm();
  });

  el.codEnabled.addEventListener('change', function () {
    saveSettings({ codEnabled: el.codEnabled.checked }, el.codEnabled.checked ? 'Cash on Delivery is ON' : 'Cash on Delivery is OFF');
  });
  el.payForm.addEventListener('submit', function (e) {
    e.preventDefault();
    const id = el.upiId.value.trim();
    const ok = saveSettings({ upiId: id }, id ? 'UPI ID saved' : 'UPI payments switched off');
    if (ok) syncSettingsForm();
  });

  // QR preview image fallback
  document.addEventListener('error', function (e) {
    const t = e.target;
    if (!t || t.tagName !== 'IMG') return;
    const qr = t.closest('.upi-qr');
    if (qr) { qr.classList.add('hidden'); return; }
    if (t.getAttribute('data-fb')) return;
    t.setAttribute('data-fb', '1');
    t.src = S.placeholderImage;
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
        '<button class="btn btn-sm" type="button" data-act="copy-coupon" data-id="' + esc(c.id) + '">' + ico('copy', 15) + 'Copy</button>' +
        '<button class="btn btn-danger btn-sm" type="button" data-act="del-coupon" data-id="' + esc(c.id) + '">Delete</button>' +
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

  el.couponForm.addEventListener('submit', function (e) {
    e.preventDefault();
    const res = S.addCoupon({
      code: el.cCode.value,
      type: el.cType.value,
      value: el.cValue.value,
      customerName: el.cName.value
    });
    if (!res.ok) { toast(res.message, 'error'); return; }
    el.couponForm.reset();
    updateCouponHints();
    toast('Coupon ' + res.coupon.code + ' created', 'success');
  });

  el.couponList.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    const id = btn.getAttribute('data-id');
    const coupon = S.getCoupons().find(function (c) { return c.id === id; });
    if (!coupon) return;
    if (act === 'copy-coupon') {
      const text = coupon.customerName
        ? 'Welcome ' + coupon.customerName + '! Your exclusive LEGEND VIP code is ' + coupon.code + '. Enter it at checkout to unlock your privilege.'
        : 'Use code ' + coupon.code + ' at LEGEND checkout to unlock your discount.';
      copyText(text, 'Coupon message copied');
    } else if (act === 'del-coupon') {
      if (!window.confirm('Delete coupon ' + coupon.code + '?')) return;
      const res = S.deleteCoupon(id);
      toast(res.ok ? 'Coupon deleted' : res.message, res.ok ? 'success' : 'error');
    }
  });

  /* ---------------------------------------------------------------------------
     10. RENDER ALL + INIT
     --------------------------------------------------------------------------- */
  function renderAll() {
    renderTheme();
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
    renderAll();

    // live sync: changes from this tab, the storefront tab, or another device tab
    S.subscribe(function (scope) {
      if (!state.ready || !S.isAdminAuthed()) return;
      if (scope === 'theme') { renderTheme(); return; }
      if (scope === 'orders' || scope === 'all') renderOrders();
      if (scope === 'products' || scope === 'all') renderProducts();
      if (scope === 'settings' || scope === 'all') syncSettingsForm();
      if (scope === 'coupons' || scope === 'all') renderCoupons();
      if (scope === 'orders' || scope === 'products' || scope === 'coupons' || scope === 'all') renderStats();
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
