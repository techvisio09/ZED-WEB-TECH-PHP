// UCODE SOFTTECH Store - shared JS (theme, cart, chat, checkout)

/* ---------- Dark mode ---------- */
(function () {
  const saved = localStorage.getItem('uc_theme') || 'light';
  document.documentElement.setAttribute('data-bs-theme', saved);
})();
function toggleTheme() {
  const html = document.documentElement;
  const next = html.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-bs-theme', next);
  localStorage.setItem('uc_theme', next);
  syncThemeIcon();
}
function syncThemeIcon() {
  const icon = document.getElementById('theme-icon');
  if (icon) icon.className = document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'bi bi-sun' : 'bi bi-moon';
}
document.addEventListener('DOMContentLoaded', syncThemeIcon);

/* ---------- Toast ---------- */
function showToast(msg) {
  let wrap = document.getElementById('toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toast-wrap';
    wrap.className = 'toast-container position-fixed top-0 end-0 p-3';
    wrap.style.zIndex = 2000;
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = 'toast align-items-center text-bg-dark border-0 show';
  el.innerHTML = '<div class="d-flex"><div class="toast-body">' + msg + '</div></div>';
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

/* ---------- Cart ---------- */
async function cartAction(payload) {
  const res = await fetch('ajax/cart.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

function updateCartBadge(count) {
  document.querySelectorAll('.cart-count-badge').forEach((b) => {
    b.textContent = count;
    b.classList.toggle('d-none', count === 0);
    // brief bounce so the cart is noticed (especially on mobile)
    b.classList.remove('cart-bump');
    void b.offsetWidth;
    b.classList.add('cart-bump');
  });
}

/* Added-to-cart button state */
function markAdded(btn) {
  btn.classList.add('added');
  btn.dataset.added = '1';
  const big = btn.classList.contains('btn-lg');
  btn.innerHTML = '<i class="bi bi-check2-circle me-1"></i>' + (big ? 'Added to Cart — View' : 'Added');
  btn.title = 'Already in your cart — click to view';
}

document.addEventListener('DOMContentLoaded', () => {
  const inCart = window.CART_SLUGS || [];
  document.querySelectorAll('.add-to-cart-btn').forEach((b) => {
    if (inCart.includes(b.dataset.slug)) markAdded(b);
  });
});

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.add-to-cart-btn');
  if (btn) {
    e.preventDefault();
    if (btn.dataset.added) { window.location.href = 'cart.php'; return; }
    const qty = parseInt(btn.dataset.qty || document.getElementById('pd-qty')?.value || '1', 10);
    // Loading state on button
    btn.classList.add('is-loading');
    const data = await cartAction({ action: 'add', slug: btn.dataset.slug, qty });
    btn.classList.remove('is-loading');
    updateCartBadge(data.count);
    flyToCart(btn);
    markAdded(btn);
    if (window.CART_SLUGS && !window.CART_SLUGS.includes(btn.dataset.slug)) window.CART_SLUGS.push(btn.dataset.slug);
    showCartPopup(data);
    return;
  }
  const buy = e.target.closest('.buy-now-btn');
  if (buy) {
    e.preventDefault();
    const qty = parseInt(document.getElementById('pd-qty')?.value || '1', 10);
    await cartAction({ action: 'add', slug: buy.dataset.slug, qty });
    window.location.href = 'cart.php';
  }
});

/* ---------- Cart popup (slide-in mini-cart on add) ---------- */
function showCartPopup(data) {
  if (!data || !data.product) return;
  let pop = document.getElementById('cart-popup');
  if (pop) pop.remove();
  pop = document.createElement('div');
  pop.id = 'cart-popup';
  pop.className = 'cart-popup';
  pop.setAttribute('data-testid', 'cart-popup');
  const p = data.product;
  pop.innerHTML = `
    <div class="cart-popup-head">
      <span class="cart-popup-tick"><i class="bi bi-check-lg"></i></span>
      <div class="lh-sm">
        <div class="cart-popup-title">Added to your cart</div>
        <small class="text-secondary">${data.item_count} item${data.item_count !== 1 ? 's' : ''} · ${data.count} total qty</small>
      </div>
      <button type="button" class="cart-popup-close" aria-label="Close" onclick="closeCartPopup()" data-testid="cart-popup-close">&times;</button>
    </div>
    <div class="cart-popup-item">
      <div class="cart-popup-thumb"><img src="${p.image}" alt="${p.name}"></div>
      <div class="flex-grow-1 min-w-0">
        <div class="cart-popup-name" data-testid="cart-popup-name">${p.name}</div>
        <small class="text-secondary">Qty ${p.qty_in_cart} · $${p.price.toFixed(2)}</small>
      </div>
    </div>
    <div class="cart-popup-total">
      <span class="text-secondary small">Subtotal</span>
      <span class="cart-popup-amount" data-testid="cart-popup-subtotal">${data.subtotal_formatted}</span>
    </div>
    <div class="cart-popup-actions">
      <a href="cart.php" class="cart-popup-btn ghost" data-testid="cart-popup-view">View Cart</a>
      <a href="checkout.php" class="cart-popup-btn primary" data-testid="cart-popup-checkout">Checkout <i class="bi bi-arrow-right"></i></a>
    </div>
    <div class="cart-popup-meta">
      <i class="bi bi-lightning-charge-fill"></i> Instant digital delivery · 15-30 min
    </div>
  `;
  document.body.appendChild(pop);
  // trigger slide-in
  requestAnimationFrame(() => pop.classList.add('show'));
  clearTimeout(window.__cartPopTimer);
  window.__cartPopTimer = setTimeout(closeCartPopup, 6500);
}
function closeCartPopup() {
  const pop = document.getElementById('cart-popup');
  if (!pop) return;
  pop.classList.remove('show');
  setTimeout(() => pop.remove(), 320);
}

/* Fly-to-cart micro-animation: clones the product image from the card and animates it into the cart icon */
function flyToCart(btn) {
  try {
    const card = btn.closest('.product-card, .card, .product-3d, .col, .v3-card') || btn.parentElement;
    const img = (card && (card.querySelector('.product-3d-stage > img') || card.querySelector('img'))) || null;
    const cartIcon = document.querySelector('[data-testid="cart-button"] i, [data-testid="cart-button-mobile"] i');
    if (!img || !cartIcon) return;
    const a = img.getBoundingClientRect();
    const b = cartIcon.getBoundingClientRect();
    const clone = img.cloneNode(true);
    clone.style.cssText = `position:fixed;left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;
      object-fit:contain;z-index:3000;border-radius:12px;transition:all .85s cubic-bezier(.5,-.1,.7,1.4);
      background:#fff;padding:6px;box-shadow:0 12px 30px rgba(15,23,42,.25);pointer-events:none;`;
    document.body.appendChild(clone);
    requestAnimationFrame(() => {
      clone.style.left = (b.left + b.width/2 - 14) + 'px';
      clone.style.top = (b.top + b.height/2 - 14) + 'px';
      clone.style.width = '28px';
      clone.style.height = '28px';
      clone.style.opacity = '0';
      clone.style.transform = 'rotate(220deg) scale(.4)';
    });
    setTimeout(() => clone.remove(), 900);
  } catch (e) { /* no-op */ }
}

// Cart page qty / remove
document.addEventListener('click', async (e) => {
  const qbtn = e.target.closest('[data-cart-qty]');
  if (qbtn) {
    const data = await cartAction({ action: 'update', slug: qbtn.dataset.slug, qty: parseInt(qbtn.dataset.cartQty, 10) });
    updateCartBadge(data.count);
    location.reload();
    return;
  }
  const rbtn = e.target.closest('[data-cart-remove]');
  if (rbtn) {
    const data = await cartAction({ action: 'remove', slug: rbtn.dataset.cartRemove });
    updateCartBadge(data.count);
    location.reload();
  }
});

/* ---------- Newsletter + coupon ---------- */
function subscribeNewsletter(ev) {
  ev.preventDefault();
  const input = ev.target.querySelector('input[type="email"]');
  if (!input || !input.value) return;
  showToast('<i class="bi bi-check-circle me-1"></i> Subscribed! You\'ll receive exclusive deals soon.');
  input.value = '';
}

async function applyCoupon(code) {
  const data = await cartAction({ action: 'coupon', code: code || '' });
  if (data.ok) {
    showToast(data.coupon ? '<i class="bi bi-tag-fill me-1"></i> Coupon applied — ' + (data.pct || '') + '% off!' : 'Coupon removed.');
    location.reload();
  } else {
    showToast('<i class="bi bi-x-circle me-1"></i> ' + (data.error || 'Invalid coupon code'));
  }
}

/* ---------- Bootstrap tooltips + coupon Enter-key guard ---------- */
document.addEventListener('DOMContentLoaded', () => {
  if (window.bootstrap) {
    document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => new bootstrap.Tooltip(el));
  }
  // Coupon input lives inside the checkout form — Enter must apply the coupon,
  // not submit the whole checkout form silently.
  const couponInput = document.getElementById('coupon-input');
  if (couponInput) {
    couponInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyCoupon(couponInput.value);
      }
    });
  }
});

/* ---------- Checkout payment method toggle ---------- */
function syncPhoneFlag(sel) {
  const flag = document.getElementById('phone-flag');
  const opt = sel.options[sel.selectedIndex];
  if (flag && opt) flag.textContent = opt.dataset.flag || '🇺🇸';
}

/* Card field formatting: number groups of 4, MM/YY expiry, numeric CVV + live brand detect */
function detectCardBrand(digits) {
  if (digits.startsWith('4')) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'mastercard';
  if (/^3[47]/.test(digits)) return 'amex';
  if (/^(6011|65|64[4-9])/.test(digits)) return 'discover';
  return '';
}

/* Mark a v3 field as valid / invalid / pending */
function markField(field, state) {
  if (!field) return;
  field.classList.remove('valid', 'invalid');
  if (state) field.classList.add(state);
}

document.addEventListener('input', (e) => {
  if (e.target.id === 'card-number') {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 16);
    e.target.value = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
    const brand = digits.length ? detectCardBrand(digits) : '';
    document.querySelectorAll('#card-brands img').forEach((i) => {
      i.classList.toggle('active', i.dataset.brand === brand);
    });
    const expected = brand === 'amex' ? 15 : 16;
    const field = document.getElementById('cf-number');
    if (digits.length === 0) markField(field, null);
    else if (digits.length === expected) markField(field, 'valid');
    else if (digits.length >= expected || (digits.length >= 13 && brand)) markField(field, digits.length === expected ? 'valid' : 'invalid');
    else markField(field, null);
  } else if (e.target.id === 'card-exp') {
    let v = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
    e.target.value = v;
    const field = document.getElementById('cf-exp');
    if (v.length === 0) markField(field, null);
    else if (v.length === 5) {
      const [m, y] = v.split('/').map(Number);
      const now = new Date();
      const curYear = now.getFullYear() % 100;
      const curMonth = now.getMonth() + 1;
      const valid = m >= 1 && m <= 12 && (y > curYear || (y === curYear && m >= curMonth));
      markField(field, valid ? 'valid' : 'invalid');
    } else markField(field, null);
  } else if (e.target.id === 'card-cvv') {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    const brandImg = document.querySelector('#card-brands img.active');
    const expected = brandImg && brandImg.dataset.brand === 'amex' ? 4 : 3;
    const field = document.getElementById('cf-cvv');
    if (e.target.value.length === 0) markField(field, null);
    else if (e.target.value.length === expected || e.target.value.length === 4) markField(field, 'valid');
    else markField(field, null);
  }
});

function selectPayMethod(method) {
  document.querySelectorAll('.pay-option, .v3-pay-tile').forEach((o) => o.classList.remove('active'));
  const opt = document.getElementById('pay-' + method);
  if (opt) opt.classList.add('active');
  const cardRadio = document.querySelector('#pay-card input[type=radio]');
  const ppRadio = document.querySelector('#pay-paypal input[type=radio]');
  if (cardRadio) cardRadio.checked = method === 'card';
  if (ppRadio) ppRadio.checked = method === 'paypal';
  const cardForm = document.getElementById('card-form');
  const paypalInfo = document.getElementById('paypal-info');
  const cardBtn = document.getElementById('btn-pay-card');
  const ppBtn = document.getElementById('btn-pay-paypal');
  const input = document.getElementById('payment-method-input');
  if (input) input.value = method;
  if (cardForm) cardForm.classList.toggle('d-none', method !== 'card');
  if (paypalInfo) paypalInfo.classList.toggle('d-none', method !== 'paypal');
  if (cardBtn) cardBtn.classList.toggle('d-none', method !== 'card');
  if (ppBtn) ppBtn.classList.toggle('d-none', method !== 'paypal');
}

/* ---------- Ask AI chat widget ---------- */
function toggleChat() {
  const panel = document.getElementById('chat-panel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open') && !localStorage.getItem('uc_lead_done')) {
    const form = document.getElementById('chat-lead-form');
    if (form) form.style.display = 'block';
  }
}

function leadValues() {
  return {
    name: document.getElementById('lead-name').value.trim(),
    email: document.getElementById('lead-email').value.trim(),
    phone: document.getElementById('lead-phone').value.trim(),
  };
}

async function submitLead(callback) {
  const v = leadValues();
  if (!v.name || !/\S+@\S+\.\S+/.test(v.email) || v.phone.length < 7) {
    showToast('Please fill in your name, email and phone.');
    return;
  }
  let sid = localStorage.getItem('uc_chat_session');
  if (!sid) { sid = 's' + Date.now() + Math.random().toString(36).slice(2, 8); localStorage.setItem('uc_chat_session', sid); }
  try {
    await fetch('ajax/lead.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sid, callback_requested: !!callback, ...v }),
    });
  } catch (e) { /* best-effort */ }
  localStorage.setItem('uc_lead_done', '1');
  document.getElementById('chat-lead-form').style.display = 'none';
  if (callback) {
    chatAppend('user', 'Name: ' + v.name + '\nEmail: ' + v.email + '\nPhone: ' + v.phone + '\n→ Requested a callback');
    chatAppend('bot', '✅ You\'re now connected with our live support team.');
    chatAppend('bot', '📞 Our agent is going to call you shortly — please be near your phone (' + v.phone + ').\n\nIn the meantime, I can help you right here with purchase assistance or the installation guide. What do you need?');
  } else {
    chatAppend('bot', 'Great, ' + v.name.split(' ')[0] + '! Call us now at ' + (window.SITE_PHONE || '') + ' and our team will assist you right away. I\'m also here if you\'d like to chat.');
  }
}

function skipLead() {
  localStorage.setItem('uc_lead_done', '1');
  document.getElementById('chat-lead-form').style.display = 'none';
  chatAppend('bot', 'No problem! Ask me anything — products, pricing, installation, activation… I\'m here to help. 😊');
}

function chatAppend(role, text) {
  const body = document.getElementById('chat-body');
  const div = document.createElement('div');
  div.className = 'chat-msg ' + role;
  div.textContent = text;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
  return div;
}

function quickAsk(text) {
  const chips = document.getElementById('chat-chips');
  if (chips) chips.remove();
  const input = document.getElementById('chat-input');
  input.value = text;
  sendChat(new Event('submit'));
}

async function sendChat(ev) {
  ev.preventDefault();
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  chatAppend('user', msg);
  const typing = chatAppend('bot', '');
  typing.classList.add('typing');
  typing.innerHTML = '<span></span><span></span><span></span>';
  let sid = localStorage.getItem('uc_chat_session');
  if (!sid) { sid = 's' + Date.now() + Math.random().toString(36).slice(2, 8); localStorage.setItem('uc_chat_session', sid); }
  try {
    const res = await fetch('ajax/chat.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, session_id: sid }),
    });
    const data = await res.json();
    typing.classList.remove('typing');
    typing.textContent = data.reply;
  } catch (err) {
    typing.classList.remove('typing');
    typing.textContent = 'Sorry, something went wrong. Call us at ' + (window.SITE_PHONE || '1-888-632-9902') + ' or email us.';
  }
}

/* ---------- Scroll reveal (staggered entrance animations) ---------- */
(() => {
  if (!('IntersectionObserver' in window) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cols = document.querySelectorAll('section .row > [class*="col-"], .accordion-item');
  cols.forEach((el) => {
    const idx = Array.prototype.indexOf.call(el.parentElement.children, el);
    el.classList.add('reveal');
    el.style.transitionDelay = `${Math.min(idx, 5) * 70}ms`;
  });
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.06, rootMargin: '0px 0px -30px 0px' });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
})();

/* ---------- Hero image rotator — one image at a time, every 10s ---------- */
(() => {
  const slides = document.querySelectorAll('.hero-slide');
  const dots = document.querySelectorAll('.hero-dot');
  if (slides.length < 2) return;
  let idx = 0;
  let timer = null;
  const show = (n) => {
    idx = (n + slides.length) % slides.length;
    slides.forEach((s, i) => s.classList.toggle('active', i === idx));
    // Keep the hero photo linking to the product currently shown in the glass card
    const photoLink = document.getElementById('hero-photo-link');
    if (photoLink && slides[idx].getAttribute('href')) {
      photoLink.setAttribute('href', slides[idx].getAttribute('href'));
      photoLink.setAttribute('aria-label', slides[idx].getAttribute('aria-label') || slides[idx].dataset.name || '');
      photoLink.setAttribute('title', slides[idx].dataset.name || '');
    }
    // Swap the floating product image + name + price
    const floatImg = document.getElementById('hero-float-img');
    const floatName = document.getElementById('hero-float-name');
    const floatPrice = document.getElementById('hero-float-price');
    if (floatImg && slides[idx].dataset.img) {
      floatImg.classList.add('swapping');
      setTimeout(() => {
        floatImg.src = slides[idx].dataset.img;
        floatImg.alt = slides[idx].dataset.name || '';
        if (floatName) floatName.textContent = slides[idx].dataset.name || '';
        if (floatPrice) floatPrice.textContent = slides[idx].dataset.price || '';
        floatImg.classList.remove('swapping');
      }, 180);
    }
    dots.forEach((d, i) => {
      d.classList.remove('active');
      if (i === idx) {
        void d.offsetWidth; // restart the 10s progress animation
        d.classList.add('active');
      }
    });
  };
  const start = () => {
    clearInterval(timer);
    timer = setInterval(() => show(idx + 1), 10000);
  };
  dots.forEach((d) => d.addEventListener('click', () => { show(+d.dataset.slide); start(); }));
  start();
})();



/* ---------- 360° product viewer — drag to spin ---------- */
(function () {
  function attachSpin(wrap) {
    if (wrap.dataset.spinReady) return;
    wrap.dataset.spinReady = '1';
    const img = wrap.querySelector('.product-3d-stage > img');
    if (!img) return;
    let dragging = false, startX = 0, startAngle = 0, angle = 0, lastTimer = null;
    const apply = () => { img.style.transform = 'rotateY(' + angle + 'deg) rotateX(3deg)'; };
    const onDown = (e) => {
      dragging = true;
      wrap.classList.add('dragging');
      startX = (e.touches ? e.touches[0].clientX : e.clientX);
      startAngle = angle;
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const x = (e.touches ? e.touches[0].clientX : e.clientX);
      angle = startAngle + (x - startX) * 0.5;
      apply();
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      // resume auto-rotation after a brief pause
      clearTimeout(lastTimer);
      lastTimer = setTimeout(() => {
        wrap.classList.remove('dragging');
        img.style.transform = '';
      }, 1400);
    };
    wrap.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    wrap.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
  }
  const init = () => document.querySelectorAll('[data-product-3d]').forEach(attachSpin);
  document.addEventListener('DOMContentLoaded', init);
  // re-attach if products are inserted dynamically
  const mo = new MutationObserver(init);
  document.addEventListener('DOMContentLoaded', () => mo.observe(document.body, { childList: true, subtree: true }));
})();
