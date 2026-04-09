<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

function orders_pdo(): PDO {
    return db();
}

function orders_now(): string {
    return date('Y-m-d H:i:s');
}

function orders_make_public_code(): string {
    return 'ORD-' . date('Ymd') . '-' . strtoupper(substr(bin2hex(random_bytes(6)), 0, 10));
}

function orders_nullable_string(mixed $value): ?string {
    $v = trim((string)($value ?? ''));
    return $v === '' ? null : $v;
}

function orders_validate_status(string $status): bool {
    return in_array($status, ['NEW', 'CONFIRMED', 'READY_FOR_PICKUP', 'COMPLETED', 'CANCELLED'], true);
}

function orders_find_open_cart_id(PDO $pdo, int $vivaioId, int $userId): ?int {
    $stmt = $pdo->prepare("
        SELECT id
        FROM carts
        WHERE id_vivaio = ? AND user_id = ? AND status = 'OPEN'
        LIMIT 1
    ");
    $stmt->execute([$vivaioId, $userId]);
    $id = $stmt->fetchColumn();

    return $id !== false ? (int)$id : null;
}

function orders_get_cart_items(PDO $pdo, int $cartId): array {
    $stmt = $pdo->prepare("
        SELECT
            ci.id,
            ci.product_id,
            ci.qty,
            ci.unit_price,
            l.title AS listing_title,
            l.main_image AS listing_image
        FROM cart_items ci
        LEFT JOIN listings l ON l.id = ci.product_id
        WHERE ci.cart_id = ?
        ORDER BY ci.id ASC
    ");
    $stmt->execute([$cartId]);

    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (!$items) {
        return [];
    }

    $normalized = [];
    foreach ($items as $row) {
        $productId = (int)$row['product_id'];
        $qty = (int)$row['qty'];
        $unitPrice = (float)$row['unit_price'];

        if ($qty <= 0) {
            continue;
        }

        $name = trim((string)($row['listing_title'] ?? ''));
        if ($name === '') {
            $name = 'Prodotto #' . $productId;
        }

        $normalized[] = [
            'product_id' => $productId,
            'qty' => $qty,
            'unit_price' => $unitPrice,
            'name' => $name,
            'image' => $row['listing_image'] ?? null,
            'line_total' => $qty * $unitPrice,
        ];
    }

    return $normalized;
}

function create_order_from_open_cart(int $vivaioId, int $userId, array $body): array {
    $pdo = orders_pdo();

    $customerName = orders_nullable_string($body['customerName'] ?? null);
    $customerPhone = trim((string)($body['customerPhone'] ?? ''));
    $customerEmail = orders_nullable_string($body['customerEmail'] ?? null);
    $notes = orders_nullable_string($body['notes'] ?? null);

    $fulfillmentMethod = (string)($body['fulfillmentMethod'] ?? 'PICKUP_IN_STORE');
    $paymentMethod = (string)($body['paymentMethod'] ?? 'PAY_ON_PICKUP');

    if ($customerPhone === '') {
        return ['error' => 'Il numero di telefono è obbligatorio', 'code' => 422];
    }

    if ($customerEmail !== null && !filter_var($customerEmail, FILTER_VALIDATE_EMAIL)) {
        return ['error' => 'Email non valida', 'code' => 422];
    }

    if ($fulfillmentMethod !== 'PICKUP_IN_STORE') {
        return ['error' => 'fulfillmentMethod non valido', 'code' => 422];
    }

    if (!in_array($paymentMethod, ['PAY_ON_PICKUP', 'ONLINE'], true)) {
        return ['error' => 'paymentMethod non valido', 'code' => 422];
    }

    $cartId = orders_find_open_cart_id($pdo, $vivaioId, $userId);
    if ($cartId === null) {
        return ['error' => 'Carrello non trovato', 'code' => 404];
    }

    $items = orders_get_cart_items($pdo, $cartId);
    if (!$items) {
        return ['error' => 'Il carrello è vuoto', 'code' => 422];
    }

    $totalAmount = 0.0;
    foreach ($items as $item) {
        $totalAmount += (float)$item['line_total'];
    }

    $publicCode = orders_make_public_code();

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare("
            INSERT INTO orders (
                public_code,
                id_vivaio,
                user_id,
                status,
                fulfillment_method,
                payment_method,
                payment_status,
                customer_name,
                customer_phone,
                customer_email,
                notes,
                total_amount,
                created_at,
                updated_at
            ) VALUES (
                ?, ?, ?, 'NEW', ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?
            )
        ");

        $now = orders_now();

        $stmt->execute([
            $publicCode,
            $vivaioId,
            $userId,
            $fulfillmentMethod,
            $paymentMethod,
            $customerName,
            $customerPhone,
            $customerEmail,
            $notes,
            number_format($totalAmount, 2, '.', ''),
            $now,
            $now,
        ]);

        $orderId = (int)$pdo->lastInsertId();

        $stmtItem = $pdo->prepare("
            INSERT INTO order_items (
                order_id,
                product_id,
                product_name_snapshot,
                unit_price,
                qty,
                line_total,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ");

        foreach ($items as $item) {
            $stmtItem->execute([
                $orderId,
                (int)$item['product_id'],
                (string)$item['name'],
                number_format((float)$item['unit_price'], 2, '.', ''),
                (int)$item['qty'],
                number_format((float)$item['line_total'], 2, '.', ''),
                $now,
            ]);
        }

        $stmt = $pdo->prepare("
            UPDATE carts
            SET status = 'CONVERTED'
            WHERE id = ?
        ");
        $stmt->execute([$cartId]);

        $pdo->commit();

        return [
            'ok' => true,
            'order' => [
                'id' => $orderId,
                'code' => $publicCode,
                'status' => 'NEW',
                'fulfillmentMethod' => $fulfillmentMethod,
                'paymentMethod' => $paymentMethod,
                'paymentStatus' => 'PENDING',
                'customerName' => $customerName,
                'customerPhone' => $customerPhone,
                'customerEmail' => $customerEmail,
                'notes' => $notes,
                'totalAmount' => round($totalAmount, 2),
                'itemsCount' => count($items),
            ],
        ];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }

        return [
            'error' => 'Errore creazione ordine: ' . $e->getMessage(),
            'code' => 500,
        ];
    }
}

function list_orders_for_user(int $userId, array $filters = []): array {
    $pdo = orders_pdo();

    $where = ['o.user_id = ?'];
    $params = [$userId];

    $status = trim((string)($filters['status'] ?? ''));
    if ($status !== '') {
        if (!orders_validate_status($status)) {
            return [];
        }
        $where[] = 'o.status = ?';
        $params[] = $status;
    }

    $limit = isset($filters['limit']) ? (int)$filters['limit'] : 100;
    $limit = max(1, min(200, $limit));

    $sql = "
        SELECT
            o.id,
            o.public_code,
            o.status,
            o.fulfillment_method,
            o.payment_method,
            o.payment_status,
            o.customer_name,
            o.customer_phone,
            o.customer_email,
            o.notes,
            o.total_amount,
            o.created_at,
            COUNT(oi.id) AS items_count
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE " . implode(' AND ', $where) . "
        GROUP BY
            o.id,
            o.public_code,
            o.status,
            o.fulfillment_method,
            o.payment_method,
            o.payment_status,
            o.customer_name,
            o.customer_phone,
            o.customer_email,
            o.notes,
            o.total_amount,
            o.created_at
        ORDER BY o.created_at DESC
        LIMIT {$limit}
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    foreach ($rows as &$row) {
        $row['id'] = (int)$row['id'];
        $row['items_count'] = (int)$row['items_count'];
        $row['total_amount'] = (float)$row['total_amount'];
    }

    return $rows;
}

function get_order_for_user(int $userId, int $orderId): ?array {
    $pdo = orders_pdo();

    $stmt = $pdo->prepare("
        SELECT
            o.id,
            o.public_code,
            o.id_vivaio,
            o.user_id,
            o.status,
            o.fulfillment_method,
            o.payment_method,
            o.payment_status,
            o.customer_name,
            o.customer_phone,
            o.customer_email,
            o.notes,
            o.total_amount,
            o.created_at,
            o.updated_at
        FROM orders o
        WHERE o.user_id = ? AND o.id = ?
        LIMIT 1
    ");
    $stmt->execute([$userId, $orderId]);
    $order = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$order) {
        return null;
    }

    $stmt = $pdo->prepare("
        SELECT
            id,
            product_id,
            product_name_snapshot,
            unit_price,
            qty,
            line_total,
            created_at
        FROM order_items
        WHERE order_id = ?
        ORDER BY id ASC
    ");
    $stmt->execute([$orderId]);
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    foreach ($items as &$item) {
        $item['id'] = (int)$item['id'];
        $item['product_id'] = (int)$item['product_id'];
        $item['qty'] = (int)$item['qty'];
        $item['unit_price'] = (float)$item['unit_price'];
        $item['line_total'] = (float)$item['line_total'];
    }

    $order['id'] = (int)$order['id'];
    $order['id_vivaio'] = (int)$order['id_vivaio'];
    $order['user_id'] = $order['user_id'] !== null ? (int)$order['user_id'] : null;
    $order['total_amount'] = (float)$order['total_amount'];
    $order['items'] = $items;

    return $order;
}

function list_orders_for_nursery(int $vivaioId, array $filters = []): array {
    $pdo = orders_pdo();

    $where = ['o.id_vivaio = ?'];
    $params = [$vivaioId];

    $status = trim((string)($filters['status'] ?? ''));
    if ($status !== '') {
        if (!orders_validate_status($status)) {
            return [];
        }
        $where[] = 'o.status = ?';
        $params[] = $status;
    }

    $limit = isset($filters['limit']) ? (int)$filters['limit'] : 100;
    $limit = max(1, min(500, $limit));

    $sql = "
        SELECT
            o.id,
            o.public_code,
            o.status,
            o.fulfillment_method,
            o.payment_method,
            o.payment_status,
            o.customer_name,
            o.customer_phone,
            o.customer_email,
            o.notes,
            o.total_amount,
            o.created_at,
            COUNT(oi.id) AS items_count
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE " . implode(' AND ', $where) . "
        GROUP BY
            o.id,
            o.public_code,
            o.status,
            o.fulfillment_method,
            o.payment_method,
            o.payment_status,
            o.customer_name,
            o.customer_phone,
            o.customer_email,
            o.notes,
            o.total_amount,
            o.created_at
        ORDER BY o.created_at DESC
        LIMIT {$limit}
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    foreach ($rows as &$row) {
        $row['id'] = (int)$row['id'];
        $row['items_count'] = (int)$row['items_count'];
        $row['total_amount'] = (float)$row['total_amount'];
    }

    return $rows;
}

function get_order_for_nursery(int $vivaioId, int $orderId): ?array {
    $pdo = orders_pdo();

    $stmt = $pdo->prepare("
        SELECT
            o.id,
            o.public_code,
            o.id_vivaio,
            o.user_id,
            o.status,
            o.fulfillment_method,
            o.payment_method,
            o.payment_status,
            o.customer_name,
            o.customer_phone,
            o.customer_email,
            o.notes,
            o.total_amount,
            o.created_at,
            o.updated_at
        FROM orders o
        WHERE o.id_vivaio = ? AND o.id = ?
        LIMIT 1
    ");
    $stmt->execute([$vivaioId, $orderId]);
    $order = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$order) {
        return null;
    }

    $stmt = $pdo->prepare("
        SELECT
            id,
            product_id,
            product_name_snapshot,
            unit_price,
            qty,
            line_total,
            created_at
        FROM order_items
        WHERE order_id = ?
        ORDER BY id ASC
    ");
    $stmt->execute([$orderId]);
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    foreach ($items as &$item) {
        $item['id'] = (int)$item['id'];
        $item['product_id'] = (int)$item['product_id'];
        $item['qty'] = (int)$item['qty'];
        $item['unit_price'] = (float)$item['unit_price'];
        $item['line_total'] = (float)$item['line_total'];
    }

    $order['id'] = (int)$order['id'];
    $order['id_vivaio'] = (int)$order['id_vivaio'];
    $order['user_id'] = $order['user_id'] !== null ? (int)$order['user_id'] : null;
    $order['total_amount'] = (float)$order['total_amount'];
    $order['items'] = $items;

    return $order;
}

function update_order_status_for_nursery(int $vivaioId, int $orderId, string $status): array {
    $pdo = orders_pdo();

    $status = trim($status);
    if (!orders_validate_status($status)) {
        return ['error' => 'Status non valido', 'code' => 422];
    }

    $stmt = $pdo->prepare("
        UPDATE orders
        SET status = ?, updated_at = ?
        WHERE id_vivaio = ? AND id = ?
    ");
    $stmt->execute([$status, orders_now(), $vivaioId, $orderId]);

    if ($stmt->rowCount() === 0) {
        return ['error' => 'Order not found', 'code' => 404];
    }

    return [
        'ok' => true,
        'order' => [
            'id' => $orderId,
            'status' => $status,
        ],
    ];
}