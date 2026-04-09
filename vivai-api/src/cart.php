<?php
require_once __DIR__ . '/db.php';

function get_or_create_open_cart(int $vivaioId, int $userId): int {
  $pdo = db();

  // prova a prendere carrello open
  $stmt = $pdo->prepare("SELECT id FROM carts WHERE id_vivaio=? AND user_id=? AND status='OPEN' LIMIT 1");
  $stmt->execute([$vivaioId, $userId]);
  $row = $stmt->fetch(PDO::FETCH_ASSOC);
  if ($row) return (int)$row['id'];

  // crea
  $stmt = $pdo->prepare("INSERT INTO carts (id_vivaio, user_id, status) VALUES (?, ?, 'OPEN')");
  $stmt->execute([$vivaioId, $userId]);
  return (int)$pdo->lastInsertId();
}

function add_item_to_cart(int $vivaioId, int $userId, int $productId, int $qty = 1): array {
  $pdo = db();
  $qty = max(1, min(999, $qty));

  $pdo->beginTransaction();
  try {
    $cartId = get_or_create_open_cart($vivaioId, $userId);

    // prendi prezzo prodotto
    $stmt = $pdo->prepare("
  SELECT MIN(v.price) AS price
  FROM listings l
  JOIN listing_variants v ON v.listing_id = l.id
  WHERE l.id = ? AND l.id_vivaio = ? AND l.status = 'ACTIVE'
  LIMIT 1
");
$stmt->execute([$productId, $vivaioId]);
$prod = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$prod || $prod['price'] === null) {
  $pdo->rollBack();
  http_response_code(404);
  return ['error' => 'Product not found'];
}
$price = (float)$prod['price'];

    // upsert item (se già c’è, incrementa qty)
    $sql = "INSERT INTO cart_items (cart_id, product_id, qty, unit_price)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty), unit_price = VALUES(unit_price)";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$cartId, $productId, $qty, $price]);

    $pdo->commit();
    return ['cartId' => $cartId, 'productId' => $productId, 'qtyAdded' => $qty];
  } catch (Throwable $e) {
    $pdo->rollBack();
    http_response_code(500);
    return ['error' => 'Server error', 'detail' => $e->getMessage()];
  }
}

function get_cart(int $vivaioId, int $userId): array {
  $pdo = db();
  $stmt = $pdo->prepare("SELECT id FROM carts WHERE id_vivaio=? AND user_id=? AND status='OPEN' LIMIT 1");
  $stmt->execute([$vivaioId, $userId]);
  $cart = $stmt->fetch(PDO::FETCH_ASSOC);
  if (!$cart) return ['id' => null, 'items' => [], 'total' => 0];

  $cartId = (int)$cart['id'];
  $stmt = $pdo->prepare("
    SELECT
    ci.product_id AS productId,
    ci.qty,
    ci.unit_price AS unitPrice,
    l.title AS name,
    l.main_image AS image
  FROM cart_items ci
  JOIN listings l ON l.id = ci.product_id
  WHERE ci.cart_id = ?
  ORDER BY ci.id DESC
  ");
  $stmt->execute([$cartId]);
  $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

  $total = 0.0;
  foreach ($items as &$it) {
    $it['productId'] = (int)$it['productId'];
    $it['qty'] = (int)$it['qty'];
    $it['unitPrice'] = (float)$it['unitPrice'];
    $total += $it['qty'] * $it['unitPrice'];
  }

    return ['id' => $cartId, 'items' => $items, 'total' => $total];
} // <-- CHIUDE get_cart()

function change_item_qty(int $vivaioId, int $userId, int $productId, int $delta): array {
  $pdo = db();
  $delta = (int)$delta;
  if ($delta === 0) return ['error' => 'delta required'];

  $pdo->beginTransaction();
  try {
    $cartId = get_or_create_open_cart($vivaioId, $userId);

    // delta > 0: inserisci o incrementa
    if ($delta > 0) {
      $stmt = $pdo->prepare("
  SELECT MIN(v.price) AS price
  FROM listings l
  JOIN listing_variants v ON v.listing_id = l.id
  WHERE l.id = ? AND l.id_vivaio = ? AND l.status = 'ACTIVE'
  LIMIT 1
");
$stmt->execute([$productId, $vivaioId]);
$prod = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$prod || $prod['price'] === null) {
  $pdo->rollBack();
  http_response_code(404);
  return ['error' => 'Product not found'];
}
$price = (float)$prod['price'];

      $sql = "INSERT INTO cart_items (cart_id, product_id, qty, unit_price)
              VALUES (?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty), unit_price = VALUES(unit_price)";
      $stmt = $pdo->prepare($sql);
      $stmt->execute([$cartId, $productId, $delta, $price]);

      $pdo->commit();
      return ['ok' => true];
    }

    // delta < 0: decrementa e se qty <= 0 cancella
    $stmt = $pdo->prepare("SELECT qty FROM cart_items WHERE cart_id=? AND product_id=? LIMIT 1");
    $stmt->execute([$cartId, $productId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
      $pdo->commit();
      return ['ok' => true];
    }

    $newQty = ((int)$row['qty']) + $delta; // delta negativo
    if ($newQty <= 0) {
      $stmt = $pdo->prepare("DELETE FROM cart_items WHERE cart_id=? AND product_id=?");
      $stmt->execute([$cartId, $productId]);
    } else {
      $stmt = $pdo->prepare("UPDATE cart_items SET qty=? WHERE cart_id=? AND product_id=?");
      $stmt->execute([$newQty, $cartId, $productId]);
    }

    $pdo->commit();
    return ['ok' => true];
  } catch (Throwable $e) {
    $pdo->rollBack();
    http_response_code(500);
    return ['error' => 'Server error', 'detail' => $e->getMessage()];
  }
}