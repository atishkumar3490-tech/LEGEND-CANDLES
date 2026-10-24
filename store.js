/* =============================================================================
   LEGEND — store.js   (FILE 1 of 6)
   Central Data & State Engine
   -----------------------------------------------------------------------------
   Shared by index.html (customer) and admin.html (admin).
   Everything is kept in localStorage so both pages stay in sync live
   (same tab via events, other tabs via the browser "storage" event).

   Exposes ONE global object:  window.LegendStore
   Load this file inside <head> (before app.js / admin.js) so the saved
   theme is applied before the first paint.
   ============================================================================= */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------------------------
     1. CONSTANTS
     --------------------------------------------------------------------------- */
  const BRAND = 'LEGEND';
  const ADMIN_PIN = '9999';
  const MAX_QTY = 10;
  const ORDER_STATUSES = ['Pending', 'Packed', 'Delivered', 'Cancelled'];
  const KEYS = {
    db: 'legend_db_v1',
    cart: 'legend_cart_v1',
    theme: 'legend_theme_v1',
    admin: 'legend_admin_session_v1'
  };
  const STORAGE_FULL = 'Storage is full. Remove some images or older data and try again.';
  const PHONE_RE = /^[6-9]\d{9}$/;

  /* ---------------------------------------------------------------------------
     2. SAFE STORAGE LAYER
     --------------------------------------------------------------------------- */
  const memoryStore = {};
  let lastError = '';

  const storageOK = (function () {
    try {
      const probe = '__legend_probe__';
      global.localStorage.setItem(probe, '1');
      global.localStorage.removeItem(probe);
      return true;
    } catch (e) {
      return false;
    }
  })();

  function lsGet(key) {
    if (storageOK) {
      try { return global.localStorage.getItem(key); } catch (e) { return null; }
    }
    return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
  }

  function lsSet(key, value) {
    if (storageOK) {
      try {
        global.localStorage.setItem(key, value);
        return true;
      } catch (e) {
        lastError = STORAGE_FULL;
        return false;
      }
    }
    memoryStore[key] = value;
    return true;
  }

  function ssGet(key) {
    try { return global.sessionStorage.getItem(key); } catch (e) { return memoryStore['ss_' + key] || null; }
  }
  function ssSet(key, value) {
    try { global.sessionStorage.setItem(key, value); } catch (e) { memoryStore['ss_' + key] = value; }
  }
  function ssRemove(key) {
    try { global.sessionStorage.removeItem(key); } catch (e) { /* ignore */ }
    delete memoryStore['ss_' + key];
  }

  /* ---------------------------------------------------------------------------
     3. SMALL HELPERS
     --------------------------------------------------------------------------- */
  function clone(value) {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
  }
  function num(v, fallback) {
    const n = parseFloat(v);
    return isFinite(n) ? n : fallback;
  }
  function int(v, fallback) {
    const n = parseInt(v, 10);
    return isFinite(n) ? n : fallback;
  }
  function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
  }
  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }
  function bool(v, fallback) {
    if (typeof v === 'boolean') return v;
    if (v === 'true' || v === 1 || v === '1') return true;
    if (v === 'false' || v === 0 || v === '0') return false;
    return fallback;
  }
  function str(v) {
    return v == null ? '' : String(v).trim();
  }
  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function formatINR(n) {
    const v = round2(num(n, 0));
    const hasPaise = Math.abs(v - Math.round(v)) > 0.001;
    return '₹' + v.toLocaleString('en-IN', {
      minimumFractionDigits: hasPaise ? 2 : 0,
      maximumFractionDigits: 2
    });
  }
  function formatDateTime(ts) {
    try {
      return new Date(ts).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (e) {
      return '';
    }
  }
  function percentOff(mrp, price) {
    const m = num(mrp, 0);
    const p = num(price, 0);
    if (m <= 0 || p >= m) return 0;
    return Math.round(((m - p) / m) * 100);
  }
  function normName(s) {
    return str(s).toLowerCase().replace(/\s+/g, ' ');
  }
  function success(extra) {
    return Object.assign({ ok: true }, extra || {});
  }
  function fail(message) {
    return { ok: false, message: message };
  }

  /* ---------------------------------------------------------------------------
     4. EVENTS  (subscribe to any data change, local or from another tab)
     --------------------------------------------------------------------------- */
  const listeners = [];

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function unsubscribe() {
      const i = listeners.indexOf(fn);
      if (i > -1) listeners.splice(i, 1);
    };
  }

  function emit(scope) {
    listeners.slice().forEach(function (fn) {
      try { fn(scope); } catch (e) { if (global.console) console.error(e); }
    });
  }

  /* ---------------------------------------------------------------------------
     5. BUILT-IN CANDLE ARTWORK (inline SVG, no external images needed)
     --------------------------------------------------------------------------- */
  function flameSVG(cx, top) {
    return '<g transform="translate(' + cx + ',' + top + ')">' +
      '<path d="M0 0 C-16 30 -16 56 0 74 C16 56 16 30 0 0 Z" fill="#FFB347"/>' +
      '<path d="M0 22 C-7 38 -7 52 0 64 C7 52 7 38 0 22 Z" fill="#FFF3C4"/></g>';
  }

  function candleArt(bgA, bgB, wax, variant) {
    let body = '';
    if (variant === 1) {
      body =
        '<circle cx="152" cy="200" r="120" fill="url(#glow)"/>' +
        '<circle cx="256" cy="150" r="120" fill="url(#glow)"/>' +
        '<rect x="110" y="262" width="84" height="178" rx="10" fill="' + wax + '"/>' +
        '<rect x="110" y="262" width="84" height="16" rx="8" fill="#ffffff" fill-opacity=".18"/>' +
        '<rect x="214" y="212" width="84" height="228" rx="10" fill="' + wax + '"/>' +
        '<rect x="214" y="212" width="84" height="16" rx="8" fill="#ffffff" fill-opacity=".18"/>' +
        '<rect x="149" y="246" width="6" height="20" rx="3" fill="#15151a"/>' +
        '<rect x="253" y="196" width="6" height="20" rx="3" fill="#15151a"/>' +
        flameSVG(152, 176) + flameSVG(256, 126);
    } else {
      body =
        '<circle cx="200" cy="210" r="150" fill="url(#glow)"/>' +
        '<rect x="112" y="238" width="176" height="204" rx="26" fill="#0b0b10"/>' +
        '<rect x="124" y="270" width="152" height="160" rx="16" fill="' + wax + '"/>' +
        '<rect x="124" y="270" width="152" height="22" rx="11" fill="#ffffff" fill-opacity=".18"/>' +
        '<rect x="112" y="238" width="176" height="204" rx="26" fill="url(#jar)" stroke="#ffffff" stroke-opacity=".26" stroke-width="2"/>' +
        '<path d="M200 322 L218 346 L200 370 L182 346 Z" fill="none" stroke="#7FA9FF" stroke-width="2.4"/>' +
        '<rect x="197" y="214" width="6" height="58" rx="3" fill="#15151a"/>' +
        flameSVG(200, 140);
    }
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">' +
      '<defs>' +
      '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + bgA + '"/><stop offset="1" stop-color="' + bgB + '"/></linearGradient>' +
      '<radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFD58A" stop-opacity=".5"/><stop offset="1" stop-color="#FFD58A" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="jar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff" stop-opacity=".22"/><stop offset=".5" stop-color="#ffffff" stop-opacity=".03"/><stop offset="1" stop-color="#ffffff" stop-opacity=".16"/></linearGradient>' +
      '</defs>' +
      '<rect width="400" height="500" fill="url(#bg)"/>' + body + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  const PLACEHOLDER = candleArt('#0d1a3f', '#05070f', '#1E6BFF', 0);

  /* ---------------------------------------------------------------------------
     6. DEFAULT DATA
     --------------------------------------------------------------------------- */
  function defaultSettings() {
    return {
      brandName: BRAND,
      gstEnabled: true,
      gstPercent: 18,
      deliveryCharge: 79,
      freeDeliveryAbove: 1999,
      upiId: '',
      codEnabled: true
    };
  }

  function normalizeSettings(raw) {
    const d = defaultSettings();
    const r = raw || {};
    return {
      brandName: d.brandName,
      gstEnabled: bool(r.gstEnabled, d.gstEnabled),
      gstPercent: clamp(round2(num(r.gstPercent, d.gstPercent)), 0, 100),
      deliveryCharge: Math.max(0, round2(num(r.deliveryCharge, d.deliveryCharge))),
      freeDeliveryAbove: Math.max(0, round2(num(r.freeDeliveryAbove, d.freeDeliveryAbove))),
      upiId: str(r.upiId),
      codEnabled: bool(r.codEnabled, d.codEnabled)
    };
  }

  function seedProducts() {
    const base = Date.now();
    return [
      buildProduct({
        id: 'p_obsidian_oud', name: 'Obsidian Oud', notes: 'Smoked Oud, Black Amber, Vetiver',
        mrp: 2999, price: 2299, inStock: true, onlyLeft: 4, createdAt: base - 3,
        images: [candleArt('#0d1a3f', '#05070f', '#27418a', 0), candleArt('#0d1a3f', '#05070f', '#27418a', 1)]
      }, null),
      buildProduct({
        id: 'p_sapphire_noir', name: 'Sapphire Noir', notes: 'Bergamot, Midnight Iris, Cedarwood',
        mrp: 2499, price: 1899, inStock: true, onlyLeft: 0, createdAt: base - 2,
        images: [candleArt('#0a1f4d', '#04060f', '#1E6BFF', 0), candleArt('#0a1f4d', '#04060f', '#1E6BFF', 1)]
      }, null),
      buildProduct({
        id: 'p_velvet_amber', name: 'Velvet Amber', notes: 'Warm Amber, Vanilla Bean, Tonka',
        mrp: 2199, price: 1699, inStock: true, onlyLeft: 2, createdAt: base - 1,
        images: [candleArt('#2a1608', '#0a0705', '#b9803a', 0), candleArt('#2a1608', '#0a0705', '#b9803a', 1)]
      }, null),
      buildProduct({
        id: 'p_midnight_jasmine', name: 'Midnight Jasmine', notes: 'Night Jasmine, White Musk, Sandalwood',
        mrp: 1999, price: 1499, inStock: true, onlyLeft: 0, createdAt: base,
        images: [candleArt('#1a1030', '#07050f', '#cfc8ee', 0), candleArt('#1a1030', '#07050f', '#cfc8ee', 1)]
      }, null)
    ];
  }

  function seedCoupons() {
    return [buildCoupon({ id: 'c_legend10', code: 'LEGEND10', type: 'percent', value: 10, customerName: '' })];
  }

  function freshDB() {
    return {
      version: 1,
      settings: defaultSettings(),
      products: seedProducts(),
      coupons: seedCoupons(),
      orders: [],
      customer: null
    };
  }

  /* ---------------------------------------------------------------------------
     7. DATABASE LOAD / SAVE
     --------------------------------------------------------------------------- */
  let cache = null;

  function loadDB() {
    if (cache) return cache;
    let parsed = null;
    const text = lsGet(KEYS.db);
    if (text) {
      try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
      if (!parsed) lsSet(KEYS.db + '_corrupt_backup', text);
    }
    if (!parsed || typeof parsed !== 'object') {
      cache = freshDB();
      persist();
      return cache;
    }
    cache = {
      version: 1,
      settings: normalizeSettings(parsed.settings),
      products: Array.isArray(parsed.products)
        ? parsed.products.map(function (p) { return buildProduct(p, null); }).filter(function (p) { return p.name; })
        : [],
      coupons: Array.isArray(parsed.coupons)
        ? parsed.coupons.map(buildCoupon).filter(function (c) { return c.code; })
        : [],
      orders: Array.isArray(parsed.orders)
        ? parsed.orders.filter(function (o) { return o && o.id && o.customer && o.bill; })
        : [],
      customer: normalizeCustomer(parsed.customer)
    };
    return cache;
  }

  function persist() {
    return lsSet(KEYS.db, JSON.stringify(cache));
  }

  function save(scope) {
    if (!persist()) {
      cache = null; // discard the unsaved change, reload last good copy next time
      return false;
    }
    emit(scope);
    return true;
  }

  function getStorageUsageKB() {
    const t = lsGet(KEYS.db) || '';
    return Math.round((t.length * 2) / 1024);
  }

  function getLastError() {
    return lastError;
  }

  /* ---------------------------------------------------------------------------
     8. THEME
     --------------------------------------------------------------------------- */
  function getTheme() {
    return lsGet(KEYS.theme) === 'light' ? 'light' : 'dark';
  }

  function applyTheme(t) {
    const theme = t === 'light' ? 'light' : 'dark';
    const doc = global.document;
    if (doc && doc.documentElement) {
      doc.documentElement.setAttribute('data-theme', theme);
      doc.documentElement.style.colorScheme = theme;
      const meta = doc.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', theme === 'light' ? '#F8F9FA' : '#070709');
    }
    return theme;
  }

  function setTheme(t) {
    const theme = applyTheme(t);
    lsSet(KEYS.theme, theme);
    emit('theme');
    return theme;
  }

  function toggleTheme() {
    return setTheme(getTheme() === 'dark' ? 'light' : 'dark');
  }

  /* ---------------------------------------------------------------------------
     9. ADMIN SESSION  (PIN is a client-side convenience lock, not real security)
     --------------------------------------------------------------------------- */
  function verifyAdminPin(pin) {
    if (str(pin) === ADMIN_PIN) {
      ssSet(KEYS.admin, '1');
      return true;
    }
    return false;
  }
  function isAdminAuthed() {
    return ssGet(KEYS.admin) === '1';
  }
  function adminLogout() {
    ssRemove(KEYS.admin);
  }

  /* ---------------------------------------------------------------------------
     10. SETTINGS  (GST, delivery, UPI, COD)
     --------------------------------------------------------------------------- */
  function isValidUpiId(v) {
    return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/.test(str(v));
  }

  function getSettings() {
    return clone(loadDB().settings);
  }

  function updateSettings(patch) {
    const db = loadDB();
    const p = patch || {};
    if (p.upiId !== undefined && str(p.upiId) && !isValidUpiId(p.upiId)) {
      return fail('Enter a valid UPI ID, for example: legend@okaxis');
    }
    db.settings = normalizeSettings(Object.assign({}, db.settings, p));
    if (!save('settings')) return fail(STORAGE_FULL);
    return success({ settings: clone(db.settings) });
  }

  /* ---------------------------------------------------------------------------
     11. PRODUCTS
     --------------------------------------------------------------------------- */
  function buildProduct(raw, existing) {
    const r = raw || {};
    const b = existing || {};
    function pick(key, fallback) {
      if (r[key] !== undefined) return r[key];
      if (b[key] !== undefined) return b[key];
      return fallback;
    }
    const price = Math.max(0, round2(num(pick('price', 0), 0)));
    let mrp = Math.max(0, round2(num(pick('mrp', price), price)));
    if (mrp < price) mrp = price;
    let images = pick('images', []);
    if (!Array.isArray(images)) images = String(images || '').split(/\r?\n/);
    images = images.map(str).filter(Boolean);
    return {
      id: b.id || r.id || uid('p'),
      name: str(pick('name', '')),
      notes: str(pick('notes', '')),
      mrp: mrp,
      price: price,
      images: images,
      video: str(pick('video', '')),
      inStock: bool(pick('inStock', true), true),
      onlyLeft: Math.max(0, int(pick('onlyLeft', 0), 0)),
      createdAt: b.createdAt || r.createdAt || Date.now(),
      updatedAt: b.updatedAt || r.updatedAt || Date.now()
    };
  }

  function validateProduct(p) {
    if (p.name.length < 2) return 'Please enter the product name.';
    if (!(p.price > 0)) return 'Selling price must be greater than zero.';
    return '';
  }

  function getProducts() {
    return clone(loadDB().products);
  }

  function getProduct(id) {
    const p = loadDB().products.find(function (x) { return x.id === id; });
    return p ? clone(p) : null;
  }

  function addProduct(data) {
    const p = buildProduct(data, null);
    const msg = validateProduct(p);
    if (msg) return fail(msg);
    const db = loadDB();
    db.products.unshift(p);
    if (!save('products')) return fail(STORAGE_FULL);
    return success({ product: clone(p) });
  }

  function updateProduct(id, patch) {
    const db = loadDB();
    const i = db.products.findIndex(function (x) { return x.id === id; });
    if (i < 0) return fail('Product not found.');
    const p = buildProduct(patch, db.products[i]);
    p.updatedAt = Date.now();
    const msg = validateProduct(p);
    if (msg) return fail(msg);
    db.products[i] = p;
    if (!save('products')) return fail(STORAGE_FULL);
    return success({ product: clone(p) });
  }

  function deleteProduct(id) {
    const db = loadDB();
    const before = db.products.length;
    db.products = db.products.filter(function (x) { return x.id !== id; });
    if (db.products.length === before) return fail('Product not found.');
    if (!save('products')) return fail(STORAGE_FULL);
    return success();
  }

  function toggleStock(id) {
    const db = loadDB();
    const p = db.products.find(function (x) { return x.id === id; });
    if (!p) return fail('Product not found.');
    p.inStock = !p.inStock;
    p.updatedAt = Date.now();
    if (!save('products')) return fail(STORAGE_FULL);
    return success({ product: clone(p) });
  }

  /* ---------------------------------------------------------------------------
     12. VIP COUPONS   (type: 'flat' = rupees off, 'percent' = % off)
     --------------------------------------------------------------------------- */
  function buildCoupon(raw) {
    const r = raw || {};
    return {
      id: r.id || uid('c'),
      code: str(r.code).toUpperCase().replace(/\s+/g, ''),
      type: r.type === 'percent' ? 'percent' : 'flat',
      value: Math.max(0, round2(num(r.value, 0))),
      customerName: str(r.customerName),
      createdAt: r.createdAt || Date.now()
    };
  }

  function getCoupons() {
    return clone(loadDB().coupons);
  }

  function addCoupon(data) {
    const c = buildCoupon(data);
    if (c.code.length < 3) return fail('Coupon code must be at least 3 characters.');
    if (!/^[A-Z0-9_-]+$/.test(c.code)) return fail('Use only letters, numbers, - or _ in the code.');
    if (!(c.value > 0)) return fail('Enter a discount greater than zero.');
    if (c.type === 'percent' && c.value > 100) return fail('A percentage discount cannot exceed 100%.');
    const db = loadDB();
    if (db.coupons.some(function (x) { return x.code === c.code; })) return fail('This coupon code already exists.');
    db.coupons.unshift(c);
    if (!save('coupons')) return fail(STORAGE_FULL);
    return success({ coupon: clone(c) });
  }

  function deleteCoupon(id) {
    const db = loadDB();
    const before = db.coupons.length;
    db.coupons = db.coupons.filter(function (x) { return x.id !== id; });
    if (db.coupons.length === before) return fail('Coupon not found.');
    if (!save('coupons')) return fail(STORAGE_FULL);
    return success();
  }

  function validateCoupon(code, customerName) {
    const c = str(code).toUpperCase().replace(/\s+/g, '');
    if (!c) return fail('Enter a coupon code.');
    const coupon = loadDB().coupons.find(function (x) { return x.code === c; });
    if (!coupon) return fail('This coupon code is not valid.');
    if (coupon.customerName && normName(customerName) !== normName(coupon.customerName)) {
      return fail('This is a personalised VIP coupon. Please log in or enter the name it was issued to.');
    }
    return success({
      coupon: clone(coupon),
      message: 'Coupon ' + coupon.code + ' applied.',
      welcome: coupon.customerName
        ? 'Welcome ' + coupon.customerName + ', Legend VIP Privilege Unlocked!'
        : ''
    });
  }

  /* ---------------------------------------------------------------------------
     13. CUSTOMER LOGIN  (quick login: name + mobile)
     --------------------------------------------------------------------------- */
  function cleanPhone(p) {
    let d = String(p == null ? '' : p).replace(/\D/g, '');
    if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
    if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
    return d;
  }

  function normalizeCustomer(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const name = str(raw.name);
    const phone = cleanPhone(raw.phone);
    if (name.length < 2 || !PHONE_RE.test(phone)) return null;
    return { name: name, phone: phone, address: str(raw.address), loggedInAt: raw.loggedInAt || Date.now() };
  }

  function getCustomer() {
    return clone(loadDB().customer);
  }

  function loginCustomer(data) {
    const d = data || {};
    const name = str(d.name).replace(/\s+/g, ' ');
    const phone = cleanPhone(d.phone);
    if (name.length < 2) return fail('Please enter your name.');
    if (!PHONE_RE.test(phone)) return fail('Enter a valid 10-digit mobile number.');
    const db = loadDB();
    const prev = db.customer;
    db.customer = {
      name: name,
      phone: phone,
      address: str(d.address) || (prev && prev.phone === phone ? prev.address : ''),
      loggedInAt: Date.now()
    };
    if (!save('customer')) return fail(STORAGE_FULL);
    return success({ customer: clone(db.customer) });
  }

  function logoutCustomer() {
    const db = loadDB();
    db.customer = null;
    save('customer');
    return success();
  }

  /* ---------------------------------------------------------------------------
     14. CART  (stored per device)
     --------------------------------------------------------------------------- */
  function readCartRaw() {
    let arr = [];
    try { arr = JSON.parse(lsGet(KEYS.cart) || '[]'); } catch (e) { arr = []; }
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(function (x) { return x && x.id; })
      .map(function (x) { return { id: String(x.id), qty: clamp(int(x.qty, 1), 1, MAX_QTY) }; });
  }

  function writeCart(items) {
    lsSet(KEYS.cart, JSON.stringify(items));
    emit('cart');
  }

  function getCartLines() {
    const products = loadDB().products;
    const lines = [];
    readCartRaw().forEach(function (item) {
      const p = products.find(function (x) { return x.id === item.id; });
      if (!p) return;
      lines.push({
        id: p.id,
        name: p.name,
        notes: p.notes,
        price: p.price,
        mrp: p.mrp,
        qty: item.qty,
        image: p.images[0] || PLACEHOLDER,
        inStock: p.inStock,
        lineTotal: round2(p.price * item.qty),
        lineMrp: round2(p.mrp * item.qty)
      });
    });
    return lines;
  }

  function cartCount() {
    return getCartLines().reduce(function (sum, l) { return sum + l.qty; }, 0);
  }

  function addToCart(id, qty) {
    const p = loadDB().products.find(function (x) { return x.id === id; });
    if (!p) return fail('This product is no longer available.');
    if (!p.inStock) return fail('Sorry, this candle is currently out of stock.');
    const add = Math.max(1, int(qty, 1));
    const items = readCartRaw();
    const line = items.find(function (x) { return x.id === id; });
    if (line) {
      if (line.qty >= MAX_QTY) return fail('Maximum ' + MAX_QTY + ' of each candle per order.');
      line.qty = Math.min(MAX_QTY, line.qty + add);
    } else {
      items.push({ id: id, qty: Math.min(MAX_QTY, add) });
    }
    writeCart(items);
    return success({ count: cartCount() });
  }

  function setCartQty(id, qty) {
    const q = int(qty, 0);
    let items = readCartRaw();
    if (q <= 0) {
      items = items.filter(function (x) { return x.id !== id; });
    } else {
      const line = items.find(function (x) { return x.id === id; });
      if (line) line.qty = clamp(q, 1, MAX_QTY);
    }
    writeCart(items);
    return success({ count: cartCount() });
  }

  function removeFromCart(id) {
    return setCartQty(id, 0);
  }

  function clearCart() {
    writeCart([]);
    return success();
  }

  /* ---------------------------------------------------------------------------
     15. BILLING  (subtotal, VIP discount, GST, delivery, total)
     Prices are treated as GST-exclusive; GST is added on the discounted amount.
     --------------------------------------------------------------------------- */
  function calculateBill(coupon) {
    const s = loadDB().settings;
    const allLines = getCartLines();
    const lines = allLines.filter(function (l) { return l.inStock; });
    const subtotal = round2(lines.reduce(function (a, l) { return a + l.lineTotal; }, 0));
    const mrpTotal = round2(lines.reduce(function (a, l) { return a + l.lineMrp; }, 0));
    const itemCount = lines.reduce(function (a, l) { return a + l.qty; }, 0);

    let discount = 0;
    let applied = null;
    if (coupon && subtotal > 0) {
      discount = coupon.type === 'percent'
        ? round2((subtotal * coupon.value) / 100)
        : round2(coupon.value);
      discount = Math.min(discount, subtotal);
      applied = {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        customerName: coupon.customerName || ''
      };
    }

    const taxable = round2(subtotal - discount);
    const gst = s.gstEnabled ? round2((taxable * s.gstPercent) / 100) : 0;

    let delivery = 0;
    let freeDeliveryRemaining = 0;
    if (subtotal > 0) {
      const qualifies = s.freeDeliveryAbove > 0 && taxable >= s.freeDeliveryAbove;
      delivery = qualifies ? 0 : s.deliveryCharge;
      if (!qualifies && s.freeDeliveryAbove > 0 && s.deliveryCharge > 0) {
        freeDeliveryRemaining = round2(s.freeDeliveryAbove - taxable);
      }
    }

    const total = round2(taxable + gst + delivery);
    const mrpSavings = round2(Math.max(0, mrpTotal - subtotal));

    return {
      lines: lines,
      hasUnavailable: allLines.length !== lines.length,
      itemCount: itemCount,
      mrpTotal: mrpTotal,
      mrpSavings: mrpSavings,
      subtotal: subtotal,
      coupon: applied,
      discount: discount,
      taxable: taxable,
      gstEnabled: s.gstEnabled,
      gstPercent: s.gstPercent,
      gst: gst,
      delivery: delivery,
      deliveryFree: subtotal > 0 && delivery === 0,
      deliveryCharge: s.deliveryCharge,
      freeDeliveryAbove: s.freeDeliveryAbove,
      freeDeliveryRemaining: freeDeliveryRemaining,
      totalSavings: round2(mrpSavings + discount),
      total: total
    };
  }

  /* ---------------------------------------------------------------------------
     16. UPI PAYMENT HELPERS
     --------------------------------------------------------------------------- */
  function buildUpiLink(amount, note) {
    const upi = loadDB().settings.upiId;
    if (!isValidUpiId(upi)) return '';
    const parts = [
      'pa=' + encodeURIComponent(upi).replace(/%40/g, '@'),
      'pn=' + encodeURIComponent(BRAND),
      'am=' + round2(num(amount, 0)).toFixed(2),
      'cu=INR'
    ];
    if (note) parts.push('tn=' + encodeURIComponent(note));
    return 'upi://pay?' + parts.join('&');
  }

  function buildUpiQrUrl(link, size) {
    if (!link) return '';
    const px = size || 260;
    return 'https://api.qrserver.com/v1/create-qr-code/?size=' + px + 'x' + px +
      '&margin=12&data=' + encodeURIComponent(link);
  }

  /* ---------------------------------------------------------------------------
     17. ORDERS
     --------------------------------------------------------------------------- */
  function newOrderId() {
    const d = new Date();
    const stamp = String(d.getFullYear()).slice(2) + pad2(d.getMonth() + 1) + pad2(d.getDate());
    const existing = loadDB().orders;
    let id;
    do {
      id = 'LG' + stamp + '-' + (1000 + Math.floor(Math.random() * 9000));
    } while (existing.some(function (o) { return o.id === id; }));
    return id;
  }

  function placeOrder(input) {
    const data = input || {};
    const db = loadDB();
    const s = db.settings;
    const c = data.customer || {};

    const customer = {
      name: str(c.name).replace(/\s+/g, ' '),
      phone: cleanPhone(c.phone),
      address: str(c.address)
    };
    if (customer.name.length < 2) return fail('Please enter your full name.');
    if (!PHONE_RE.test(customer.phone)) return fail('Enter a valid 10-digit mobile number.');
    if (customer.address.length < 10) return fail('Please enter your complete delivery address.');

    const cartLines = getCartLines();
    if (!cartLines.length) return fail('Your cart is empty.');
    if (cartLines.some(function (l) { return !l.inStock; })) {
      return fail('Please remove out-of-stock items from your cart.');
    }

    let coupon = null;
    if (str(data.couponCode)) {
      const v = validateCoupon(data.couponCode, customer.name);
      if (!v.ok) return fail(v.message);
      coupon = v.coupon;
    }

    const method = data.method === 'COD' ? 'COD' : 'UPI';
    let utr = '';
    if (method === 'COD' && !s.codEnabled) {
      return fail('Cash on Delivery is currently unavailable.');
    }
    if (method === 'UPI') {
      if (!isValidUpiId(s.upiId)) return fail('Online payment is not set up yet. Please choose another method.');
      utr = str(data.utr).toUpperCase().replace(/\s+/g, '');
      if (!/^[A-Z0-9]{8,22}$/.test(utr)) return fail('Please enter a valid UTR / transaction reference after paying.');
    }

    const bill = calculateBill(coupon);
    const order = {
      id: newOrderId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'Pending',
      customer: customer,
      items: bill.lines.map(function (l) {
        return {
          id: l.id,
          name: l.name,
          price: l.price,
          mrp: l.mrp,
          qty: l.qty,
          lineTotal: l.lineTotal,
          image: l.image.indexOf('data:') === 0 ? '' : l.image
        };
      }),
      bill: {
        subtotal: bill.subtotal,
        couponCode: bill.coupon ? bill.coupon.code : '',
        couponCustomer: bill.coupon ? bill.coupon.customerName : '',
        discount: bill.discount,
        gstEnabled: bill.gstEnabled,
        gstPercent: bill.gstPercent,
        gst: bill.gst,
        delivery: bill.delivery,
        deliveryFree: bill.deliveryFree,
        total: bill.total
      },
      payment: {
        method: method,
        utr: utr,
        upiId: method === 'UPI' ? s.upiId : ''
      }
    };

    db.orders.unshift(order);
    if (db.customer && !db.customer.address) db.customer.address = customer.address;
    if (!save('orders')) return fail(STORAGE_FULL);
    clearCart();
    return success({ order: clone(order) });
  }

  function getOrders() {
    return clone(loadDB().orders).sort(function (a, b) { return b.createdAt - a.createdAt; });
  }

  function getOrder(id) {
    const o = loadDB().orders.find(function (x) { return x.id === id; });
    return o ? clone(o) : null;
  }

  function updateOrderStatus(id, status) {
    if (ORDER_STATUSES.indexOf(status) < 0) return fail('Invalid order status.');
    const db = loadDB();
    const o = db.orders.find(function (x) { return x.id === id; });
    if (!o) return fail('Order not found.');
    o.status = status;
    o.updatedAt = Date.now();
    if (!save('orders')) return fail(STORAGE_FULL);
    return success({ order: clone(o) });
  }

  function deleteOrder(id) {
    const db = loadDB();
    const before = db.orders.length;
    db.orders = db.orders.filter(function (x) { return x.id !== id; });
    if (db.orders.length === before) return fail('Order not found.');
    if (!save('orders')) return fail(STORAGE_FULL);
    return success();
  }

  function getOrderStats() {
    const stats = { total: 0, Pending: 0, Packed: 0, Delivered: 0, Cancelled: 0, revenue: 0, deliveredRevenue: 0 };
    loadDB().orders.forEach(function (o) {
      stats.total += 1;
      if (stats[o.status] !== undefined) stats[o.status] += 1;
      if (o.status !== 'Cancelled') stats.revenue += o.bill.total;
      if (o.status === 'Delivered') stats.deliveredRevenue += o.bill.total;
    });
    stats.revenue = round2(stats.revenue);
    stats.deliveredRevenue = round2(stats.deliveredRevenue);
    return stats;
  }

  /* ---------------------------------------------------------------------------
     18. WHATSAPP ORDER UPDATE LINK
     --------------------------------------------------------------------------- */
  function waNumber(phone) {
    const d = String(phone == null ? '' : phone).replace(/\D/g, '');
    if (d.length === 10) return '91' + d;
    if (d.length === 11 && d.charAt(0) === '0') return '91' + d.slice(1);
    return d;
  }

  function buildWhatsAppLink(orderOrId) {
    const order = typeof orderOrId === 'string'
      ? loadDB().orders.find(function (o) { return o.id === orderOrId; })
      : orderOrId;
    if (!order || !order.customer) return '';

    const statusLine = {
      Pending: 'We have received your order and our team is reviewing it.',
      Packed: 'Your order has been carefully packed and will be on its way shortly.',
      Delivered: 'Your order has been delivered. We hope it lights up your space.',
      Cancelled: 'Your order has been cancelled. Please reply here if you need any help.'
    };
    const items = (order.items || []).map(function (it, i) {
      return (i + 1) + '. ' + it.name + ' x ' + it.qty + ' - ' + formatINR(it.lineTotal);
    }).join('\n');
    const pay = order.payment || {};
    const payText = pay.method === 'UPI'
      ? 'UPI (UTR: ' + (pay.utr || '-') + ')'
      : 'Cash on Delivery';

    const message = [
      '*' + BRAND + '* | Order Update',
      '',
      'Hello ' + order.customer.name + ',',
      'Your order *' + order.id + '* is now *' + order.status + '*.',
      statusLine[order.status] || '',
      '',
      '*Items*',
      items,
      '',
      'Total: *' + formatINR(order.bill.total) + '* (' + payText + ')',
      '',
      'Thank you for choosing ' + BRAND + '.'
    ].join('\n');

    return 'https://wa.me/' + waNumber(order.customer.phone) + '?text=' + encodeURIComponent(message);
  }

  /* ---------------------------------------------------------------------------
     19. IMAGE UPLOAD HELPER  (resizes phone photos so storage never fills up)
     --------------------------------------------------------------------------- */
  function compressImage(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) {
        reject(new Error('Please choose an image file.'));
        return;
      }
      const reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read this image.')); };
      reader.onload = function () {
        const img = new Image();
        img.onerror = function () { reject(new Error('Could not open this image.')); };
        img.onload = function () {
          const side = maxSide || 900;
          const scale = Math.min(1, side / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = global.document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#101015';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality || 0.78));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---------------------------------------------------------------------------
     20. BOOT  (theme first, cross-tab sync, warm the database)
     --------------------------------------------------------------------------- */
  applyTheme(getTheme());

  if (global.document) {
    global.document.addEventListener('DOMContentLoaded', function () {
      applyTheme(getTheme());
    });
  }

  global.addEventListener('storage', function (e) {
    if (e.storageArea && e.storageArea !== global.localStorage) return;
    if (e.key === null || e.key === KEYS.db) {
      cache = null;
      emit('all');
    } else if (e.key === KEYS.cart) {
      emit('cart');
    } else if (e.key === KEYS.theme) {
      applyTheme(getTheme());
      emit('theme');
    }
  });

  loadDB();

  /* ---------------------------------------------------------------------------
     21. PUBLIC API
     --------------------------------------------------------------------------- */
  global.LegendStore = {
    version: '1.0.0',
    brand: BRAND,
    maxQty: MAX_QTY,
    orderStatuses: ORDER_STATUSES.slice(),
    placeholderImage: PLACEHOLDER,

    formatINR: formatINR,
    formatDateTime: formatDateTime,
    escapeHTML: escapeHTML,
    percentOff: percentOff,
    uid: uid,
    compressImage: compressImage,
    getStorageUsageKB: getStorageUsageKB,
    getLastError: getLastError,

    subscribe: subscribe,

    getTheme: getTheme,
    setTheme: setTheme,
    toggleTheme: toggleTheme,
    applyTheme: applyTheme,

    verifyAdminPin: verifyAdminPin,
    isAdminAuthed: isAdminAuthed,
    adminLogout: adminLogout,

    getSettings: getSettings,
    updateSettings: updateSettings,

    getProducts: getProducts,
    getProduct: getProduct,
    addProduct: addProduct,
    updateProduct: updateProduct,
    deleteProduct: deleteProduct,
    toggleStock: toggleStock,

    getCoupons: getCoupons,
    addCoupon: addCoupon,
    deleteCoupon: deleteCoupon,
    validateCoupon: validateCoupon,

    getCustomer: getCustomer,
    loginCustomer: loginCustomer,
    logoutCustomer: logoutCustomer,
    cleanPhone: cleanPhone,

    getCartLines: getCartLines,
    cartCount: cartCount,
    addToCart: addToCart,
    setCartQty: setCartQty,
    removeFromCart: removeFromCart,
    clearCart: clearCart,

    calculateBill: calculateBill,

    isValidUpiId: isValidUpiId,
    buildUpiLink: buildUpiLink,
    buildUpiQrUrl: buildUpiQrUrl,

    placeOrder: placeOrder,
    getOrders: getOrders,
    getOrder: getOrder,
    updateOrderStatus: updateOrderStatus,
    deleteOrder: deleteOrder,
    getOrderStats: getOrderStats,
    buildWhatsAppLink: buildWhatsAppLink
  };
})(window);
