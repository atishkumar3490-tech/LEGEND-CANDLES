/* =============================================================================
   LEGEND — app.js   (FILE 4 of 6)
   Customer Storefront Logic ONLY
   -----------------------------------------------------------------------------
   Rendering products, horizontal media swipe, cart + GST/delivery calculation,
   VIP coupon verification, UPI / COD checkout, settings modal, theme switch
   and quick login. All data comes from window.LegendStore (store.js).
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

  function ico(name, size) {
    const px = size || 20;
    return '<svg viewBox="0 0 24 24" width="' + px + '" height="' + px + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }

  const el = {
    header: $('#appHeader'),
    showcase: $('#showcase'),
    railPrev: $('#railPrev'),
    railNext: $('#railNext'),
    overlay: $('#overlay'),
    drawer: $('#cartDrawer'),
    drawerHead: $('#drawerHead'),
    drawerHandle: $('#drawerHandle'),
    cartTitle: $('#cartTitle'),
    cartBody: $('#cartBody'),
    cartFoot: $('#cartFoot'),
    settings: $('#settingsModal'),
    themeSwitch: $('#themeSwitch'),
    themeDesc: $('#themeDesc'),
    loginArea: $('#loginArea'),
    adminToggle: $('#adminToggle'),
    pinBox: $('#pinBox'),
    pinInput: $('#pinInput'),
    pinSubmit: $('#pinSubmit'),
    pinError: $('#pinError'),
    badge: $('#dockBadge'),
    toastWrap: $('#toastWrap')
  };
  const dockItems = $$('.dock-item');

  const state = {
    layer: null,          // 'cart' | 'settings' | null
    view: 'cart',         // 'cart' | 'checkout' | 'success'
    coupon: null,
    couponCode: '',
    couponMsg: null,      // { type: 'ok' | 'err', text }
    welcome: '',
    payMethod: 'UPI',
    form: { name: '', phone: '', address: '', utr: '' },
    lastOrder: null,
    placing: false,
    checkoutError: ''
  };

  let lastRenderedView = '';
  let pinFails = 0;
  let pinLockUntil = 0;

  /* ---------------------------------------------------------------------------
     2. TOASTS & CLIPBOARD
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

  function scrollToCatalog() {
    const target = $('#catalog');
    if (!target) return;
    const y = target.getBoundingClientRect().top + window.scrollY - (el.header.offsetHeight + 6);
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }

  /* ---------------------------------------------------------------------------
     3. PRODUCT SHOWCASE
     --------------------------------------------------------------------------- */
  function splitNotes(text) {
    return String(text || '').split(/[,•|·]+/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 6);
  }

  function productCardHTML(p, index) {
    const images = p.images.length ? p.images : [S.placeholderImage];
    const slides = images.map(function (src, k) {
      return '<div class="media-slide"><img src="' + esc(src) + '" alt="' + esc(p.name) + ' view ' + (k + 1) + '" ' +
        (k === 0 ? '' : 'loading="lazy" ') + 'decoding="async" draggable="false"></div>';
    });
    if (p.video) {
      slides.push('<div class="media-slide"><video src="' + esc(p.video) + '" controls playsinline preload="metadata"></video></div>');
    }
    const total = slides.length;
    const off = S.percentOff(p.mrp, p.price);

    const badges = [];
    if (off > 0) badges.push('<span class="badge badge-off">' + off + '% OFF</span>');
    if (p.inStock && p.onlyLeft > 0) badges.push('<span class="badge badge-left">Only ' + p.onlyLeft + ' Left</span>');

    const dots = total > 1
      ? '<div class="media-dots">' + slides.map(function (_, k) { return '<span class="dot' + (k === 0 ? ' active' : '') + '"></span>'; }).join('') + '</div>'
      : '';
    const notes = splitNotes(p.notes).map(function (n) { return '<span class="note-chip">' + esc(n) + '</span>'; }).join('');

    const action = p.inStock
      ? '<button class="btn btn-primary" type="button" data-add="' + esc(p.id) + '">' + ico('plus', 18) + 'Add to Cart</button>'
      : '<button class="btn" type="button" disabled>Sold Out</button>';

    return '<article class="product-card' + (p.inStock ? '' : ' is-oos') + '" data-id="' + esc(p.id) + '" style="animation-delay:' + (Math.min(index, 8) * 70) + 'ms">' +
      '<div class="media-wrap">' +
        (badges.length ? '<div class="badge-stack">' + badges.join('') + '</div>' : '') +
        (total > 1 ? '<div class="media-count">1 / ' + total + '</div>' : '') +
        '<div class="media-rail">' + slides.join('') + '</div>' +
        dots +
        (p.inStock ? '' : '<div class="oos-veil"><span>Sold Out</span></div>') +
      '</div>' +
      '<div class="card-body">' +
        '<h3 class="product-name">' + esc(p.name) + '</h3>' +
        (notes ? '<div class="note-list">' + notes + '</div>' : '') +
        '<div class="price-row">' +
          '<span class="price">' + inr(p.price) + '</span>' +
          (p.mrp > p.price ? '<span class="mrp">' + inr(p.mrp) + '</span>' : '') +
          (p.mrp > p.price ? '<span class="off">Save ' + inr(p.mrp - p.price) + '</span>' : '') +
        '</div>' +
        '<div class="card-actions">' + action + '</div>' +
      '</div>' +
    '</article>';
  }

  function renderCatalog() {
    const prevLeft = el.showcase.scrollLeft;
    const products = S.getProducts();
    if (!products.length) {
      el.showcase.innerHTML = '<div class="empty" style="flex:1 1 100%">' + ico('flame', 54) +
        '<div class="empty-title">Collection arriving soon</div><p>Our next candles are being poured. Please check back shortly.</p></div>';
      return;
    }
    el.showcase.innerHTML = products.map(productCardHTML).join('');
    el.showcase.scrollLeft = prevLeft;
  }

  function syncRail(rail) {
    const w = rail.clientWidth || 1;
    const idx = Math.round(rail.scrollLeft / w);
    const wrap = rail.parentNode;
    const dots = $$('.dot', wrap);
    dots.forEach(function (d, k) { d.classList.toggle('active', k === idx); });
    const count = $('.media-count', wrap);
    if (count) count.textContent = (idx + 1) + ' / ' + dots.length;
    $$('.media-slide', rail).forEach(function (slide, k) {
      const v = slide.querySelector('video');
      if (v && k !== idx && !v.paused) v.pause();
    });
  }

  // scroll events do not bubble, so listen in the capture phase
  el.showcase.addEventListener('scroll', function (e) {
    const rail = e.target;
    if (!rail || !rail.classList || !rail.classList.contains('media-rail')) return;
    if (rail._ticking) return;
    rail._ticking = true;
    requestAnimationFrame(function () {
      rail._ticking = false;
      syncRail(rail);
    });
  }, true);

  el.showcase.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-add]');
    if (!btn) return;
    const res = S.addToCart(btn.getAttribute('data-add'), 1);
    if (!res.ok) { toast(res.message, 'error'); return; }
    toast('Added to your cart', 'success');
    const original = btn.innerHTML;
    btn.innerHTML = ico('check', 18) + 'Added';
    btn.disabled = true;
    setTimeout(function () { btn.innerHTML = original; btn.disabled = false; }, 1100);
  });

  function scrollRail(dir) {
    const card = $('.product-card', el.showcase);
    const step = card ? card.offsetWidth + 18 : 340;
    el.showcase.scrollBy({ left: dir * step, behavior: 'smooth' });
  }
  el.railPrev.addEventListener('click', function () { scrollRail(-1); });
  el.railNext.addEventListener('click', function () { scrollRail(1); });

  /* ---------------------------------------------------------------------------
     4. CART BADGE
     --------------------------------------------------------------------------- */
  function updateBadge(pop) {
    const n = S.cartCount();
    el.badge.textContent = n > 99 ? '99+' : String(n);
    el.badge.classList.toggle('hidden', n === 0);
    if (pop && n > 0) {
      el.badge.classList.remove('pop');
      void el.badge.offsetWidth;
      el.badge.classList.add('pop');
    }
  }

  /* ---------------------------------------------------------------------------
     5. LAYERS (cart drawer / settings modal)
     --------------------------------------------------------------------------- */
  function setDockActive(name) {
    dockItems.forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-dock') === name);
    });
  }

  function resetPin() {
    el.pinBox.classList.add('hidden');
    el.pinInput.value = '';
    el.pinError.textContent = '';
  }

  function closeLayer() {
    if (!state.layer) return;
    el.drawer.classList.remove('open');
    el.drawer.setAttribute('aria-hidden', 'true');
    el.drawer.style.transform = '';
    el.settings.classList.remove('open');
    el.settings.setAttribute('aria-hidden', 'true');
    el.overlay.classList.remove('open');
    document.body.classList.remove('no-scroll');
    if (state.view === 'success') {
      state.view = 'cart';
      state.lastOrder = null;
    }
    state.layer = null;
    setDockActive('home');
    resetPin();
  }

  function openLayer(name) {
    if (state.layer) closeLayer();
    state.layer = name;
    document.body.classList.add('no-scroll');
    el.overlay.classList.add('open');
    if (name === 'cart') {
      if (state.view === 'success') state.view = 'cart';
      state.checkoutError = '';
      prefillForm(false);
      renderDrawer();
      el.cartBody.scrollTop = 0;
      el.drawer.classList.add('open');
      el.drawer.setAttribute('aria-hidden', 'false');
    } else {
      syncThemeSwitch();
      renderLogin();
      el.settings.classList.add('open');
      el.settings.setAttribute('aria-hidden', 'false');
    }
    setDockActive(name);
  }

  $('.dock').addEventListener('click', function (e) {
    const btn = e.target.closest('[data-dock]');
    if (!btn) return;
    const which = btn.getAttribute('data-dock');
    if (which === 'home') {
      closeLayer();
      if (window.scrollY > 140) window.scrollTo({ top: 0, behavior: 'smooth' });
      else scrollToCatalog();
    } else if (state.layer === which) {
      closeLayer();
    } else {
      openLayer(which);
    }
  });

  el.overlay.addEventListener('click', closeLayer);
  el.settings.addEventListener('click', function (e) { if (e.target === el.settings) closeLayer(); });
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) closeLayer();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeLayer();
  });

  // swipe the sheet handle / header down to close the cart drawer
  (function enableDrawerSwipe() {
    let startY = 0;
    let dy = 0;
    let dragging = false;
    function start(e) {
      if (state.layer !== 'cart') return;
      startY = e.touches[0].clientY;
      dy = 0;
      dragging = true;
      el.drawer.style.transition = 'none';
    }
    function move(e) {
      if (!dragging) return;
      dy = Math.max(0, e.touches[0].clientY - startY);
      el.drawer.style.transform = 'translate(-50%, ' + dy + 'px)';
    }
    function end() {
      if (!dragging) return;
      dragging = false;
      el.drawer.style.transition = '';
      el.drawer.style.transform = '';
      if (dy > 110) closeLayer();
      dy = 0;
    }
    [el.drawerHandle, el.drawerHead].forEach(function (node) {
      node.addEventListener('touchstart', start, { passive: true });
      node.addEventListener('touchmove', move, { passive: true });
      node.addEventListener('touchend', end);
      node.addEventListener('touchcancel', end);
    });
  })();

  /* ---------------------------------------------------------------------------
     6. COUPON + FORM STATE HELPERS
     --------------------------------------------------------------------------- */
  function couponName() {
    const c = S.getCustomer();
    return state.form.name || (c ? c.name : '');
  }

  function refreshCoupon() {
    if (!state.coupon) return;
    const r = S.validateCoupon(state.coupon.code, couponName());
    if (r.ok) {
      state.coupon = r.coupon;
      state.welcome = r.welcome;
    } else {
      state.coupon = null;
      state.welcome = '';
      state.couponMsg = { type: 'err', text: r.message };
    }
  }

  function prefillForm(force) {
    const c = S.getCustomer();
    if (!c) return;
    if (force || !state.form.name) state.form.name = c.name;
    if (force || !state.form.phone) state.form.phone = c.phone;
    if ((force || !state.form.address) && c.address) state.form.address = c.address;
  }

  function setCheckoutError(message) {
    state.checkoutError = message || '';
    const node = $('#checkoutError');
    if (!node) return;
    node.textContent = state.checkoutError;
    node.classList.toggle('hidden', !state.checkoutError);
  }

  function isTypingInDrawer() {
    const a = document.activeElement;
    return !!(a && el.drawer.contains(a) && (a.hasAttribute('data-form') || a.id === 'couponInput'));
  }

  /* ---------------------------------------------------------------------------
     7. BILL RENDERING
     --------------------------------------------------------------------------- */
  function billFromCart(bill) {
    return {
      subtotal: bill.subtotal,
      itemCount: bill.itemCount,
      discount: bill.discount,
      couponCode: bill.coupon ? bill.coupon.code : '',
      gstEnabled: bill.gstEnabled,
      gstPercent: bill.gstPercent,
      gst: bill.gst,
      delivery: bill.delivery,
      deliveryFree: bill.deliveryFree,
      total: bill.total,
      savings: bill.totalSavings
    };
  }

  function billFromOrder(order) {
    const b = order.bill;
    let itemCount = 0;
    let mrpSave = 0;
    order.items.forEach(function (it) {
      itemCount += it.qty;
      mrpSave += Math.max(0, (it.mrp - it.price) * it.qty);
    });
    return {
      subtotal: b.subtotal,
      itemCount: itemCount,
      discount: b.discount,
      couponCode: b.couponCode,
      gstEnabled: b.gstEnabled,
      gstPercent: b.gstPercent,
      gst: b.gst,
      delivery: b.delivery,
      deliveryFree: b.deliveryFree,
      total: b.total,
      savings: Math.round((mrpSave + b.discount) * 100) / 100
    };
  }

  function billRow(label, value, cls) {
    return '<div class="bill-row' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><span class="val">' + value + '</span></div>';
  }

  function billHTML(b) {
    let rows = billRow('Subtotal' + (b.itemCount ? ' (' + b.itemCount + (b.itemCount > 1 ? ' items' : ' item') + ')' : ''), inr(b.subtotal));
    if (b.discount > 0) {
      rows += billRow('VIP Discount' + (b.couponCode ? ' (' + esc(b.couponCode) + ')' : ''), '&minus;' + inr(b.discount), 'discount');
    }
    if (b.gstEnabled) rows += billRow('GST (' + b.gstPercent + '%)', inr(b.gst));
    rows += billRow('Delivery', b.deliveryFree ? 'FREE' : inr(b.delivery), b.deliveryFree ? 'free' : '');
    rows += billRow('Total', inr(b.total), 'total');
    return '<div class="bill">' + rows + '</div>' +
      (b.savings > 0 ? '<div class="bill-note mt-1">You are saving ' + inr(b.savings) + ' on this order</div>' : '');
  }

  function shipNudgeHTML(bill) {
    if (bill.freeDeliveryRemaining > 0) {
      const pct = Math.max(4, Math.min(100, Math.round((bill.taxable / bill.freeDeliveryAbove) * 100)));
      return '<div class="ship-nudge"><span>Add <b>' + inr(bill.freeDeliveryRemaining) + '</b> more to unlock <b>free delivery</b></span>' +
        '<div class="progress"><div class="progress-bar" style="width:' + pct + '%"></div></div></div>';
    }
    if (bill.freeDeliveryAbove > 0 && bill.deliveryCharge > 0 && bill.deliveryFree) {
      return '<div class="ship-nudge"><span>&#10003; Free delivery unlocked on this order</span>' +
        '<div class="progress"><div class="progress-bar" style="width:100%"></div></div></div>';
    }
    return '';
  }

  function couponBlockHTML() {
    const customer = S.getCustomer();
    let inner = '';
    if (state.coupon) {
      if (state.welcome) {
        inner += '<div class="vip-banner">' + ico('sparkle', 26) + '<span>' + esc(state.welcome) + '</span></div>';
      }
      inner += '<div class="row-between mt-1"><strong class="text-success">Coupon ' + esc(state.coupon.code) + ' applied</strong>' +
        '<button class="btn btn-ghost btn-sm" type="button" data-act="remove-coupon">Remove</button></div>';
    } else {
      if (!customer) {
        inner += '<div class="field mb-1"><label for="couponName">Your Name (for personalised VIP coupons)</label>' +
          '<input id="couponName" type="text" data-form="name" autocomplete="name" placeholder="Full name" value="' + esc(state.form.name) + '"></div>';
      }
      inner += '<div class="coupon-row"><input id="couponInput" type="text" maxlength="24" autocomplete="off" autocapitalize="characters" placeholder="ENTER CODE" value="' + esc(state.couponCode) + '">' +
        '<button class="btn btn-primary" type="button" data-act="apply-coupon">Apply</button></div>';
      if (state.couponMsg) {
        inner += '<p class="coupon-msg ' + state.couponMsg.type + '">' + esc(state.couponMsg.text) + '</p>';
      }
    }
    return '<div><p class="block-title">VIP Coupon</p><div class="coupon-box">' + inner + '</div></div>';
  }

  /* ---------------------------------------------------------------------------
     8. CART DRAWER VIEWS
     --------------------------------------------------------------------------- */
  function setFoot(html) {
    el.cartFoot.innerHTML = html;
    el.cartFoot.classList.toggle('hidden', !html);
  }

  function renderCartView() {
    el.cartTitle.textContent = 'Your Cart';
    const lines = S.getCartLines();
    if (!lines.length) {
      el.cartBody.innerHTML = '<div class="empty">' + ico('bag', 54) +
        '<div class="empty-title">Your cart is empty</div><p>Discover a candle worth lighting.</p>' +
        '<button class="btn btn-primary mt-1" type="button" data-act="explore">Explore Collection</button></div>';
      setFoot('');
      return;
    }

    refreshCoupon();
    const bill = S.calculateBill(state.coupon);

    const items = lines.map(function (l) {
      return '<div class="cart-item' + (l.inStock ? '' : ' is-oos') + '">' +
        '<img class="cart-thumb" src="' + esc(l.image) + '" alt="' + esc(l.name) + '">' +
        '<div class="cart-info">' +
          '<div class="cart-name">' + esc(l.name) + '</div>' +
          '<div class="cart-price">' + inr(l.price) + ' &times; ' + l.qty + ' = <b>' + inr(l.lineTotal) + '</b></div>' +
          (l.inStock ? '' : '<div class="cart-warn">Out of stock. Please remove.</div>') +
        '</div>' +
        '<div class="cart-side">' +
          '<div class="qty">' +
            '<button type="button" data-act="qty-dec" data-id="' + esc(l.id) + '" aria-label="Decrease quantity">&minus;</button>' +
            '<span>' + l.qty + '</span>' +
            '<button type="button" data-act="qty-inc" data-id="' + esc(l.id) + '" aria-label="Increase quantity"' + ((l.qty >= S.maxQty || !l.inStock) ? ' disabled' : '') + '>+</button>' +
          '</div>' +
          '<button class="cart-remove" type="button" data-act="remove" data-id="' + esc(l.id) + '">Remove</button>' +
        '</div>' +
      '</div>';
    }).join('');

    el.cartBody.innerHTML =
      '<div class="cart-list">' + items + '</div>' +
      (bill.hasUnavailable ? '<p class="coupon-msg err">Some candles are out of stock. Please remove them to continue.</p>' : '') +
      shipNudgeHTML(bill) +
      couponBlockHTML() +
      '<div><p class="block-title">Order Summary</p>' + billHTML(billFromCart(bill)) + '</div>';

    const blocked = !bill.itemCount || bill.hasUnavailable;
    setFoot(
      '<button class="btn btn-primary btn-lg btn-block" type="button" data-act="to-checkout"' + (blocked ? ' disabled' : '') + '>Proceed to Checkout &middot; ' + inr(bill.total) + '</button>' +
      '<button class="btn btn-ghost btn-block" type="button" data-close>Continue Shopping</button>'
    );
  }

  function renderCheckout() {
    el.cartTitle.textContent = 'Checkout';
    prefillForm(false);
    refreshCoupon();

    const s = S.getSettings();
    const bill = S.calculateBill(state.coupon);
    const upiOK = S.isValidUpiId(s.upiId);
    const codOK = !!s.codEnabled;
    const canPay = upiOK || codOK;
    if (state.payMethod === 'UPI' && !upiOK && codOK) state.payMethod = 'COD';
    if (state.payMethod === 'COD' && !codOK && upiOK) state.payMethod = 'UPI';

    const vip = state.welcome
      ? '<div class="vip-banner">' + ico('sparkle', 26) + '<span>' + esc(state.welcome) + '</span></div>'
      : '';

    const details =
      '<div class="stack"><p class="block-title">Delivery Details</p>' +
        '<div class="field"><label for="fName">Full Name</label><input id="fName" type="text" data-form="name" autocomplete="name" placeholder="Your full name" value="' + esc(state.form.name) + '"></div>' +
        '<div class="field"><label for="fPhone">Mobile Number</label><input id="fPhone" type="tel" inputmode="numeric" maxlength="10" data-form="phone" autocomplete="tel-national" placeholder="10-digit mobile number" value="' + esc(state.form.phone) + '"></div>' +
        '<div class="field"><label for="fAddress">Delivery Address</label><textarea id="fAddress" data-form="address" autocomplete="street-address" placeholder="House no., street, area, city, PIN code">' + esc(state.form.address) + '</textarea></div>' +
      '</div>';

    const payOptions =
      '<div><p class="block-title">Payment Method</p><div class="pay-options">' +
        '<label class="pay-option' + (state.payMethod === 'UPI' ? ' selected' : '') + (upiOK ? '' : ' disabled') + '">' +
          '<input type="radio" name="paymethod" value="UPI"' + (state.payMethod === 'UPI' ? ' checked' : '') + (upiOK ? '' : ' disabled') + '>' +
          '<span class="pay-title">UPI / QR</span>' +
          '<span class="pay-sub">' + (upiOK ? 'Scan, pay and enter UTR' : 'Currently unavailable') + '</span>' +
        '</label>' +
        '<label class="pay-option' + (state.payMethod === 'COD' ? ' selected' : '') + (codOK ? '' : ' disabled') + '">' +
          '<input type="radio" name="paymethod" value="COD"' + (state.payMethod === 'COD' ? ' checked' : '') + (codOK ? '' : ' disabled') + '>' +
          '<span class="pay-title">Cash on Delivery</span>' +
          '<span class="pay-sub">' + (codOK ? 'Pay when it arrives' : 'Currently unavailable') + '</span>' +
        '</label>' +
      '</div></div>';

    let payPanel = '';
    if (!canPay) {
      payPanel = '<p class="coupon-msg err">Checkout is temporarily unavailable. Please try again shortly.</p>';
    } else if (state.payMethod === 'UPI') {
      const link = S.buildUpiLink(bill.total, 'LEGEND Order');
      const qr = S.buildUpiQrUrl(link, 260);
      payPanel =
        '<div class="upi-box">' +
          '<div class="upi-amount">' + inr(bill.total) + '</div>' +
          '<div class="upi-qr"><img src="' + esc(qr) + '" alt="UPI payment QR code" width="188" height="188"></div>' +
          '<div class="upi-id">' + esc(s.upiId) + '</div>' +
          '<a class="btn btn-primary btn-block" href="' + esc(link) + '">' + ico('phone', 18) + 'Pay with UPI App</a>' +
          '<button class="btn btn-outline btn-sm" type="button" data-act="copy-upi">' + ico('copy', 16) + 'Copy UPI ID</button>' +
          '<p class="upi-steps">Scan the QR or tap the button, complete the payment, then enter the UTR / Transaction ID from your payment app below.</p>' +
        '</div>' +
        '<div class="field"><label for="fUtr">UTR / Transaction ID</label>' +
          '<input id="fUtr" type="text" data-form="utr" maxlength="22" autocomplete="off" autocapitalize="characters" placeholder="e.g. 412345678901" value="' + esc(state.form.utr) + '"></div>';
    } else {
      payPanel = '<div class="ship-nudge"><span>Please keep <b>' + inr(bill.total) + '</b> ready. You pay in cash when your order arrives at your doorstep.</span></div>';
    }

    el.cartBody.innerHTML =
      vip +
      details +
      payOptions +
      '<div class="stack">' + payPanel + '</div>' +
      '<div><p class="block-title">Order Summary</p>' + billHTML(billFromCart(bill)) + '</div>';

    setFoot(
      '<p class="coupon-msg err' + (state.checkoutError ? '' : ' hidden') + '" id="checkoutError" role="alert">' + esc(state.checkoutError) + '</p>' +
      '<button class="btn btn-primary btn-lg btn-block" type="button" data-act="place-order"' + (canPay ? '' : ' disabled') + '>Place Order &middot; ' + inr(bill.total) + '</button>' +
      '<button class="btn btn-ghost btn-block" type="button" data-act="to-cart">' + ico('arrow-left', 18) + 'Back to Cart</button>'
    );
  }

  function renderSuccess() {
    const o = state.lastOrder;
    if (!o) {
      state.view = 'cart';
      renderCartView();
      return;
    }
    el.cartTitle.textContent = 'Order Placed';
    const first = esc(o.customer.name.split(' ')[0]);
    const payLine = o.payment.method === 'UPI'
      ? 'Payment reference <b>' + esc(o.payment.utr) + '</b> received. We will verify it and confirm your order shortly.'
      : 'Please keep <b>' + inr(o.bill.total) + '</b> ready. You pay in cash on delivery.';

    el.cartBody.innerHTML =
      '<div class="success-card">' +
        '<div class="success-icon">' + ico('check', 36) + '</div>' +
        '<h3 class="success-title">Thank you, ' + first + '</h3>' +
        '<div class="success-id">' + esc(o.id) + '</div>' +
        '<p class="text-soft">' + payLine + '</p>' +
      '</div>' +
      '<div><p class="block-title">Order Summary</p>' + billHTML(billFromOrder(o)) + '</div>' +
      '<div class="bill">' +
        billRow('Name', esc(o.customer.name)) +
        billRow('Mobile', '+91 ' + esc(o.customer.phone)) +
        billRow('Payment', o.payment.method === 'UPI' ? 'UPI' : 'Cash on Delivery') +
      '</div>' +
      '<p class="hint text-center">Delivering to: ' + esc(o.customer.address) + '</p>';

    setFoot(
      '<button class="btn btn-primary btn-lg btn-block" type="button" data-close>Continue Shopping</button>' +
      '<button class="btn btn-ghost btn-block" type="button" data-act="copy-order">' + ico('copy', 16) + 'Copy Order ID</button>'
    );
  }

  function renderDrawer() {
    const lines = S.getCartLines();
    if (state.view !== 'success' && !lines.length) state.view = 'cart';
    if (state.view === 'checkout') {
      const check = S.calculateBill(null);
      if (check.hasUnavailable || !check.itemCount) state.view = 'cart';
    }
    const keep = lastRenderedView === state.view ? el.cartBody.scrollTop : 0;
    if (state.view === 'success') renderSuccess();
    else if (state.view === 'checkout') renderCheckout();
    else renderCartView();
    lastRenderedView = state.view;
    el.cartBody.scrollTop = keep;
  }

  /* ---------------------------------------------------------------------------
     9. PLACE ORDER
     --------------------------------------------------------------------------- */
  function placeOrderNow() {
    if (state.placing) return;
    state.placing = true;
    const res = S.placeOrder({
      customer: { name: state.form.name, phone: state.form.phone, address: state.form.address },
      method: state.payMethod,
      utr: state.form.utr,
      couponCode: state.coupon ? state.coupon.code : ''
    });
    state.placing = false;

    if (!res.ok) {
      setCheckoutError(res.message);
      toast(res.message, 'error');
      return;
    }
    state.lastOrder = res.order;
    state.coupon = null;
    state.couponCode = '';
    state.couponMsg = null;
    state.welcome = '';
    state.form.utr = '';
    state.checkoutError = '';
    state.view = 'success';
    updateBadge(false);
    renderDrawer();
    el.cartBody.scrollTop = 0;
    toast('Order placed successfully', 'success');
  }

  /* ---------------------------------------------------------------------------
     10. DRAWER EVENTS (delegated)
     --------------------------------------------------------------------------- */
  function applyCouponNow() {
    const input = $('#couponInput');
    if (input) state.couponCode = input.value.trim().toUpperCase();
    const r = S.validateCoupon(state.couponCode, couponName());
    if (r.ok) {
      state.coupon = r.coupon;
      state.welcome = r.welcome;
      state.couponMsg = null;
      state.couponCode = '';
      toast(r.welcome || r.message, 'success');
    } else {
      state.coupon = null;
      state.welcome = '';
      state.couponMsg = { type: 'err', text: r.message };
    }
    renderDrawer();
  }

  el.drawer.addEventListener('click', function (e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.getAttribute('data-act');
    const id = t.getAttribute('data-id');

    if (act === 'qty-inc' || act === 'qty-dec') {
      const line = S.getCartLines().find(function (l) { return l.id === id; });
      if (!line) return;
      const res = S.setCartQty(id, line.qty + (act === 'qty-inc' ? 1 : -1));
      if (!res.ok) toast(res.message, 'error');
    } else if (act === 'remove') {
      S.removeFromCart(id);
    } else if (act === 'apply-coupon') {
      applyCouponNow();
    } else if (act === 'remove-coupon') {
      state.coupon = null;
      state.welcome = '';
      state.couponMsg = null;
      renderDrawer();
    } else if (act === 'to-checkout') {
      state.view = 'checkout';
      state.checkoutError = '';
      renderDrawer();
      el.cartBody.scrollTop = 0;
    } else if (act === 'to-cart') {
      state.view = 'cart';
      renderDrawer();
      el.cartBody.scrollTop = 0;
    } else if (act === 'place-order') {
      placeOrderNow();
    } else if (act === 'copy-upi') {
      copyText(S.getSettings().upiId, 'UPI ID copied');
    } else if (act === 'copy-order') {
      if (state.lastOrder) copyText(state.lastOrder.id, 'Order ID copied');
    } else if (act === 'explore') {
      closeLayer();
      scrollToCatalog();
    }
  });

  el.drawer.addEventListener('input', function (e) {
    const t = e.target;
    const key = t.getAttribute ? t.getAttribute('data-form') : null;
    if (key) {
      let v = t.value;
      if (key === 'phone') {
        const c = v.replace(/\D/g, '').slice(0, 10);
        if (c !== v) t.value = c;
        v = c;
      } else if (key === 'utr') {
        const c = v.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 22);
        if (c !== v) t.value = c;
        v = c;
      }
      state.form[key] = v;
      if (state.checkoutError) setCheckoutError('');
    } else if (t.id === 'couponInput') {
      state.couponCode = t.value.toUpperCase();
    }
  });

  el.drawer.addEventListener('change', function (e) {
    if (e.target && e.target.name === 'paymethod') {
      state.payMethod = e.target.value === 'COD' ? 'COD' : 'UPI';
      state.checkoutError = '';
      renderDrawer();
    }
  });

  el.drawer.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'couponInput') {
      e.preventDefault();
      applyCouponNow();
    }
  });

  // images that fail to load fall back gracefully (QR hides, others use artwork)
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
     11. SETTINGS: THEME, LOGIN, ADMIN ACCESS
     --------------------------------------------------------------------------- */
  function syncThemeSwitch() {
    const light = S.getTheme() === 'light';
    el.themeSwitch.checked = light;
    el.themeDesc.textContent = light ? 'Light mode is on' : 'Obsidian dark mode is on';
  }

  el.themeSwitch.addEventListener('change', function () {
    S.setTheme(el.themeSwitch.checked ? 'light' : 'dark');
    syncThemeSwitch();
  });

  function renderLogin() {
    const c = S.getCustomer();
    if (c) {
      el.loginArea.innerHTML =
        '<div class="login-state">' +
          '<div class="avatar">' + esc(c.name.charAt(0).toUpperCase()) + '</div>' +
          '<div class="grow"><div class="login-name">' + esc(c.name) + '</div><div class="login-phone">+91 ' + esc(c.phone) + '</div></div>' +
          '<button class="btn btn-sm" type="button" data-act="logout">Logout</button>' +
        '</div>';
    } else {
      el.loginArea.innerHTML =
        '<form class="stack" id="loginForm" novalidate>' +
          '<div class="field"><label for="loginName">Your Name</label><input id="loginName" type="text" autocomplete="name" placeholder="Full name"></div>' +
          '<div class="field"><label for="loginPhone">Mobile Number</label><input id="loginPhone" type="tel" inputmode="numeric" maxlength="10" autocomplete="tel-national" placeholder="10-digit mobile number"></div>' +
          '<p class="coupon-msg err hidden" id="loginError" role="alert"></p>' +
          '<button class="btn btn-primary btn-block" type="submit">Quick Login</button>' +
        '</form>';
    }
  }

  el.loginArea.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'loginPhone') {
      const c = e.target.value.replace(/\D/g, '').slice(0, 10);
      if (c !== e.target.value) e.target.value = c;
    }
  });

  el.loginArea.addEventListener('submit', function (e) {
    e.preventDefault();
    const res = S.loginCustomer({ name: $('#loginName').value, phone: $('#loginPhone').value });
    const err = $('#loginError');
    if (!res.ok) {
      err.textContent = res.message;
      err.classList.remove('hidden');
      return;
    }
    prefillForm(true);
    renderLogin();
    toast('Welcome, ' + res.customer.name, 'success');
  });

  el.loginArea.addEventListener('click', function (e) {
    if (e.target.closest('[data-act="logout"]')) {
      S.logoutCustomer();
      state.form = { name: '', phone: '', address: '', utr: '' };
      renderLogin();
      toast('You have been logged out', '');
    }
  });

  el.adminToggle.addEventListener('click', function () {
    el.pinBox.classList.toggle('hidden');
    if (!el.pinBox.classList.contains('hidden')) {
      setTimeout(function () { el.pinInput.focus(); }, 60);
    }
  });

  function submitPin() {
    const now = Date.now();
    if (now < pinLockUntil) {
      el.pinError.textContent = 'Too many attempts. Try again in ' + Math.ceil((pinLockUntil - now) / 1000) + 's.';
      return;
    }
    if (S.verifyAdminPin(el.pinInput.value)) {
      el.pinError.textContent = '';
      pinFails = 0;
      window.location.href = 'admin.html';
      return;
    }
    pinFails += 1;
    el.pinInput.value = '';
    if (pinFails >= 5) {
      pinFails = 0;
      pinLockUntil = Date.now() + 30000;
      el.pinError.textContent = 'Too many attempts. Locked for 30 seconds.';
    } else {
      el.pinError.textContent = 'Incorrect PIN. Please try again.';
    }
  }

  el.pinSubmit.addEventListener('click', submitPin);
  el.pinInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); submitPin(); }
  });
  el.pinInput.addEventListener('input', function () {
    const c = el.pinInput.value.replace(/\D/g, '').slice(0, 4);
    if (c !== el.pinInput.value) el.pinInput.value = c;
    el.pinError.textContent = '';
  });

  /* ---------------------------------------------------------------------------
     12. HEADER BEHAVIOUR
     --------------------------------------------------------------------------- */
  let headerCompact = false;
  window.addEventListener('scroll', function () {
    const compact = window.scrollY > 40;
    if (compact !== headerCompact) {
      headerCompact = compact;
      el.header.classList.toggle('compact', compact);
    }
  }, { passive: true });

  /* ---------------------------------------------------------------------------
     13. LIVE SYNC WITH THE STORE (admin changes, other tabs, cart updates)
     --------------------------------------------------------------------------- */
  S.subscribe(function (scope) {
    if (scope === 'theme') {
      syncThemeSwitch();
      return;
    }
    if (scope === 'cart' || scope === 'products' || scope === 'all') updateBadge(scope === 'cart');
    if (scope === 'products' || scope === 'all') renderCatalog();
    if ((scope === 'customer' || scope === 'all') && state.layer === 'settings') renderLogin();

    if (state.layer !== 'cart' || state.placing) return;
    if (scope === 'cart') {
      renderDrawer();
    } else if (scope === 'products' || scope === 'settings' || scope === 'coupons' || scope === 'customer' || scope === 'all') {
      if (!isTypingInDrawer()) renderDrawer();
    }
  });

  /* ---------------------------------------------------------------------------
     14. BOOT
     --------------------------------------------------------------------------- */
  syncThemeSwitch();
  renderLogin();
  renderCatalog();
  updateBadge(false);
})();
