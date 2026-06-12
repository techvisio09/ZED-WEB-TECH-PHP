<?php
// Cart AJAX API: add / update / remove / count
require_once __DIR__ . '/../includes/functions.php';

header('Content-Type: application/json');
$in = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $in['action'] ?? '';
$slug = $in['slug'] ?? '';

if (!isset($_SESSION['cart'])) $_SESSION['cart'] = [];

if ($action === 'add' && $slug && get_product($slug)) {
    $qty = max(1, (int)($in['qty'] ?? 1));
    $_SESSION['cart'][$slug] = ($_SESSION['cart'][$slug] ?? 0) + $qty;
    $p = get_product($slug);
    $sub = cart_subtotal();
    echo json_encode([
        'ok' => true,
        'count' => cart_count(),
        'item_count' => count($_SESSION['cart']),
        'product' => [
            'slug' => $p['slug'],
            'name' => $p['name'],
            'image' => $p['image'],
            'price' => (float)$p['price'],
            'qty_in_cart' => $_SESSION['cart'][$slug],
        ],
        'subtotal' => $sub,
        'subtotal_formatted' => format_price($sub),
    ]);
    exit;
} elseif ($action === 'update' && $slug && isset($_SESSION['cart'][$slug])) {
    $qty = (int)($in['qty'] ?? 1);
    if ($qty <= 0) unset($_SESSION['cart'][$slug]);
    else $_SESSION['cart'][$slug] = $qty;
} elseif ($action === 'remove' && $slug) {
    unset($_SESSION['cart'][$slug]);
} elseif ($action === 'coupon') {
    $code = strtoupper(trim($in['code'] ?? ''));
    if ($code === '') {
        unset($_SESSION['coupon'], $_SESSION['coupon_pct']);
        echo json_encode(['ok' => true, 'coupon' => null, 'count' => cart_count()]);
        exit;
    }
    $valid = coupons();
    if (isset($valid[$code])) {
        $_SESSION['coupon'] = $code;
        $_SESSION['coupon_pct'] = $valid[$code];
        echo json_encode(['ok' => true, 'coupon' => $code, 'pct' => $valid[$code], 'count' => cart_count()]);
    } else {
        echo json_encode(['ok' => false, 'error' => 'Invalid coupon code', 'count' => cart_count()]);
    }
    exit;
}

echo json_encode(['ok' => true, 'count' => cart_count()]);
