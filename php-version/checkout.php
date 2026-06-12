<?php
require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/includes/email.php';
require_once __DIR__ . '/includes/stripe.php';
$pageTitle = 'Secure Checkout | ' . SITE_BRAND;

$items = cart_items();
if (!$items) {
    header('Location: cart.php');
    exit;
}

$proAssist = ($_GET['pro'] ?? ($_POST['pro'] ?? '')) === '1';
$subtotal = cart_subtotal();
// Savings from list prices
$savings = 0;
foreach ($items as $i) {
    if ($i['original_price'] && $i['original_price'] > $i['price']) {
        $savings += ($i['original_price'] - $i['price']) * $i['qty'];
    }
}
// Coupon (set via ajax/cart.php action=coupon): percent comes from the coupons() map
$couponCode = $_SESSION['coupon'] ?? null;
$couponPct = $couponCode ? (int)($_SESSION['coupon_pct'] ?? (coupons()[$couponCode] ?? 20)) : 0;
$discount = $couponCode ? round($subtotal * $couponPct / 100, 2) : 0.0;
$total = $subtotal - $discount + ($proAssist ? PRO_ASSIST_PRICE : 0);
$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $required = ['email', 'first_name', 'last_name', 'phone', 'address', 'city', 'state', 'zip'];
    foreach ($required as $f) {
        if (trim($_POST[$f] ?? '') === '') $errors[] = ucwords(str_replace('_', ' ', $f)) . ' is required.';
    }
    if (!filter_var($_POST['email'] ?? '', FILTER_VALIDATE_EMAIL)) $errors[] = 'Valid email is required.';
    $method = ($_POST['payment_method'] ?? 'card') === 'paypal' ? 'paypal' : 'card';

    if (!$errors) {
        $pdo = db();
        $orderNumber = generate_order_number();
        $user = current_user();
        $phoneFull = trim(($_POST['phone_code'] ?? '+1') . ' ' . trim($_POST['phone']));
        $stmt = $pdo->prepare('INSERT INTO orders (order_number, email, first_name, last_name, phone, address, address2, country, city, state, zip, payment_method, currency, subtotal, total, pro_assist, user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        $stmt->execute([
            $orderNumber, trim($_POST['email']), trim($_POST['first_name']), trim($_POST['last_name']),
            $phoneFull, trim($_POST['address']), trim($_POST['address2'] ?? ''),
            substr(trim($_POST['country'] ?? 'US'), 0, 5), trim($_POST['city']), trim($_POST['state']), trim($_POST['zip']),
            $method, current_currency()['code'], $subtotal, $total, $proAssist ? 1 : 0, $user['id'] ?? null,
        ]);
        $orderId = (int)$pdo->lastInsertId();
        $itemStmt = $pdo->prepare('INSERT INTO order_items (order_id, product_slug, name, price, qty) VALUES (?,?,?,?,?)');
        foreach ($items as $i) {
            $itemStmt->execute([$orderId, $i['slug'], $i['name'], $i['price'], $i['qty']]);
        }
        if ($proAssist) {
            $itemStmt->execute([$orderId, 'proassist-premium', 'ProAssist Premium Installation', PRO_ASSIST_PRICE, 1]);
        }
        $_SESSION['cart'] = [];
        unset($_SESSION['coupon']);

        if (stripe_enabled()) {
            // Real payment: redirect to Stripe hosted checkout
            $proto = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            $baseUrl = $proto . '://' . $_SERVER['HTTP_HOST'] . rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/';
            try {
                $orderStmt = $pdo->prepare('SELECT * FROM orders WHERE id = ?');
                $orderStmt->execute([$orderId]);
                $orderRow = $orderStmt->fetch();
                $session = stripe_create_session($orderRow, $baseUrl);
                $pdo->prepare('UPDATE orders SET stripe_session_id = ? WHERE id = ?')->execute([$session['id'], $orderId]);
                header('Location: ' . $session['url']);
                exit;
            } catch (RuntimeException $e) {
                $errors[] = 'Payment error: ' . $e->getMessage();
            }
        } else {
            // DEMO MODE (no Stripe key): mark paid + fulfill immediately
            $pdo->prepare('UPDATE orders SET status = "paid" WHERE id = ?')->execute([$orderId]);
            fulfill_order($orderId);
            header('Location: order-success.php?order=' . urlencode($orderNumber));
            exit;
        }
    }
}

$checkoutHeader = true;
include __DIR__ . '/includes/header.php';
?>
<div class="checkout-v3">
<div class="container py-3 py-lg-4">

  <?php if ($errors): ?>
    <div class="alert alert-danger py-2 mb-3"><ul class="mb-0 small"><?php foreach ($errors as $e): ?><li><?= esc($e) ?></li><?php endforeach; ?></ul></div>
  <?php endif; ?>

  <form method="post" class="v3-grid" data-testid="checkout-form">
    <input type="hidden" name="pro" value="<?= $proAssist ? '1' : '0' ?>">
    <input type="hidden" name="payment_method" id="payment-method-input" value="card">

    <!-- LEFT: contact + billing + payment (compact) -->
    <div>
      <!-- 1) Contact -->
      <div class="v3-card" data-testid="co-banner-contact">
        <h6><span class="v3-num">1</span>Contact</h6>
        <div class="v3-field">
          <label>Email *</label>
          <input type="email" name="email" required class="form-control" placeholder="your@email.com" value="<?= esc($_POST['email'] ?? '') ?>" data-testid="checkout-email">
        </div>
      </div>

      <!-- 2) Billing -->
      <div class="v3-card" data-testid="co-banner-billing">
        <h6><span class="v3-num">2</span>Billing Address</h6>
        <div class="v3-row-2">
          <div class="v3-field"><label>First Name *</label><input name="first_name" required class="form-control" placeholder="John" value="<?= esc($_POST['first_name'] ?? '') ?>"></div>
          <div class="v3-field"><label>Last Name *</label><input name="last_name" required class="form-control" placeholder="Doe" value="<?= esc($_POST['last_name'] ?? '') ?>"></div>
        </div>
        <div class="v3-field">
          <label>Phone *</label>
          <?php
          $phoneFlags = ['+1' => '🇺🇸', '+44' => '🇬🇧', '+61' => '🇦🇺', '+49' => '🇩🇪', '+33' => '🇫🇷', '+34' => '🇪🇸', '+39' => '🇮🇹', '+31' => '🇳🇱', '+91' => '🇮🇳', '+971' => '🇦🇪', '+64' => '🇳🇿'];
          $selCode = $_POST['phone_code'] ?? '+1';
          ?>
          <div class="input-group input-group-sm">
            <span class="input-group-text" id="phone-flag" data-testid="phone-flag"><?= $phoneFlags[$selCode] ?? '🇺🇸' ?></span>
            <select name="phone_code" id="phone-code" class="form-select" style="max-width:90px;" onchange="syncPhoneFlag(this)" data-testid="phone-code-select">
              <?php foreach ($phoneFlags as $code => $flag): ?>
                <option value="<?= $code ?>" data-flag="<?= $flag ?>" <?= $selCode === $code ? 'selected' : '' ?>><?= $code ?></option>
              <?php endforeach; ?>
            </select>
            <input name="phone" required class="form-control" placeholder="555 123 4567" value="<?= esc($_POST['phone'] ?? '') ?>" data-testid="phone-number-input">
          </div>
        </div>
        <div class="v3-field"><label>Address *</label><input name="address" required class="form-control" placeholder="123 Main Street" value="<?= esc($_POST['address'] ?? '') ?>"></div>
        <div class="v3-row-3">
          <div class="v3-field"><label>City *</label><input name="city" required class="form-control" placeholder="New York" value="<?= esc($_POST['city'] ?? '') ?>"></div>
          <div class="v3-field">
            <label>State *</label>
            <select name="state" required class="form-select" data-testid="state-select">
              <option value="">—</option>
              <?php foreach (['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','Other'] as $st): ?>
                <option value="<?= $st ?>" <?= ($_POST['state'] ?? '') === $st ? 'selected' : '' ?>><?= $st ?></option>
              <?php endforeach; ?>
            </select>
          </div>
          <div class="v3-field"><label>ZIP *</label><input name="zip" required class="form-control" placeholder="10001" value="<?= esc($_POST['zip'] ?? '') ?>"></div>
        </div>
        <input type="hidden" name="country" value="<?= esc($_POST['country'] ?? 'US') ?>">
        <input type="hidden" name="address2" value="<?= esc($_POST['address2'] ?? '') ?>">
      </div>

      <!-- 3) Payment -->
      <div class="v3-card" data-testid="co-banner-payment">
        <h6><span class="v3-num">3</span>Payment</h6>
        <div class="v3-pay-tiles">
          <div id="pay-card" class="v3-pay-tile active" onclick="selectPayMethod('card')" data-testid="pay-method-card">
            <input type="radio" class="form-check-input mt-0" name="pm_radio" checked>
            <i class="bi bi-credit-card-2-front text-primary"></i>
            <span>Card</span>
            <span class="ms-auto v3-pay-icons">
              <img src="assets/images/payments/visa.svg" alt="Visa">
              <img src="assets/images/payments/mastercard.svg" alt="Mastercard">
              <img src="assets/images/payments/amex.svg" alt="Amex">
            </span>
          </div>
          <div id="pay-paypal" class="v3-pay-tile" onclick="selectPayMethod('paypal')" data-testid="pay-method-paypal">
            <input type="radio" class="form-check-input mt-0" name="pm_radio">
            <img src="assets/images/payments/paypal.svg" alt="PayPal" style="height:18px;">
            <span><span class="fst-italic" style="color:#003087">Pay</span><span class="fst-italic" style="color:#0070BA">Pal</span></span>
          </div>
        </div>
        <button id="btn-pay-card" type="submit" class="v3-pay-btn" data-testid="checkout-pay-button">
          <i class="bi bi-lock-fill"></i> Pay Securely · <?= format_price($total) ?>
        </button>
        <button id="btn-pay-paypal" type="submit" class="v3-pay-btn paypal d-none" data-testid="checkout-paypal-button">
          <span class="fst-italic" style="color:#003087">Pay</span><span class="fst-italic" style="color:#0070BA">Pal</span> · Continue <?= format_price($total) ?>
        </button>
        <div class="v3-trust-row">
          <i class="bi bi-shield-lock-fill text-success"></i>
          <span>256-bit SSL</span><span>·</span>
          <span>Powered by Stripe</span><span>·</span>
          <span class="v3-pay-icons">
            <img src="assets/images/payments/visa.svg" alt="Visa">
            <img src="assets/images/payments/mastercard.svg" alt="Mastercard">
            <img src="assets/images/payments/amex.svg" alt="Amex">
            <img src="assets/images/payments/discover.svg" alt="Discover">
          </span>
        </div>
        <div class="text-center text-secondary" style="font-size:.66rem; margin-top:6px;">
          By placing your order, you agree to our <a href="page.php?slug=terms-of-service">Terms</a> &amp; <a href="page.php?slug=privacy-policy">Privacy</a>.
        </div>
      </div>
    </div>

    <!-- RIGHT: order summary (sticky) -->
    <aside>
      <div class="v3-summary" data-testid="co-banner-summary">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <h6 class="m-0" style="font-size:.72rem; letter-spacing:.14em; text-transform:uppercase; color:var(--bs-secondary-color);">Order Summary</h6>
          <a href="cart.php" class="small text-decoration-none" data-testid="back-to-cart"><i class="bi bi-pencil-square"></i></a>
        </div>
        <?php foreach ($items as $i): ?>
          <div class="v3-sum-item" data-testid="summary-item-<?= esc($i['slug']) ?>">
            <img class="thumb bg-body-tertiary rounded p-1" src="<?= esc($i['image']) ?>" alt="<?= esc($i['name']) ?>" style="object-fit:contain;">
            <div class="flex-grow-1 min-w-0">
              <div class="name text-truncate"><?= esc($i['name']) ?></div>
              <div class="meta">Qty <?= (int)$i['qty'] ?></div>
            </div>
            <div class="price"><?= format_price($i['price'] * $i['qty']) ?></div>
          </div>
        <?php endforeach; ?>
        <?php if ($proAssist): ?>
          <div class="v3-sum-item">
            <span class="thumb d-inline-flex align-items-center justify-content-center bg-body-tertiary rounded" style="width:38px;height:38px;"><i class="bi bi-headset text-primary"></i></span>
            <div class="flex-grow-1 min-w-0">
              <div class="name">ProAssist Installation</div>
              <div class="meta">Qty 1</div>
            </div>
            <div class="price"><?= format_price(PRO_ASSIST_PRICE) ?></div>
          </div>
        <?php endif; ?>

        <!-- Coupon (compact) -->
        <div class="mt-2">
          <?php if ($couponCode): ?>
            <div class="d-flex justify-content-between align-items-center small text-success" data-testid="coupon-applied">
              <span><i class="bi bi-tag-fill me-1"></i><strong><?= esc($couponCode) ?></strong> · <?= $couponPct ?>% off</span>
              <button type="button" class="btn btn-sm btn-link text-danger p-0" onclick="applyCoupon('')" data-testid="coupon-remove">Remove</button>
            </div>
          <?php else: ?>
            <div class="input-group input-group-sm">
              <input id="coupon-input" class="form-control" placeholder="Coupon code" data-testid="coupon-input">
              <button type="button" class="btn btn-outline-primary" onclick="applyCoupon(document.getElementById('coupon-input').value)" data-testid="coupon-apply">Apply</button>
            </div>
          <?php endif; ?>
        </div>

        <div class="small d-flex justify-content-between mt-2"><span class="text-secondary">Subtotal</span><span><?= format_price($subtotal) ?></span></div>
        <?php if ($savings > 0): ?>
          <div class="small d-flex justify-content-between text-success"><span>You Save</span><span data-testid="checkout-savings">-<?= format_price($savings) ?></span></div>
        <?php endif; ?>
        <?php if ($discount > 0): ?>
          <div class="small d-flex justify-content-between text-success"><span>Coupon</span><span data-testid="checkout-discount">-<?= format_price($discount) ?></span></div>
        <?php endif; ?>

        <div class="v3-sum-total">
          <span class="fw-bold">Total</span>
          <span class="v3-total-num" data-testid="checkout-total"><?= format_price($total) ?></span>
        </div>

        <div class="small text-secondary mt-2 d-flex align-items-center gap-2">
          <i class="bi bi-lightning-charge-fill text-warning"></i>
          <span>Instant digital delivery in 15–30 min</span>
        </div>
      </div>
    </aside>
  </form>
</div>
</div>
<?php include __DIR__ . '/includes/footer.php'; ?>
