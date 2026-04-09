<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

function discover_pdo(): PDO {
    return db();
}

function discover_status_filter(): string {
    // In questa fase includo anche DRAFT per facilitare test e popolamento iniziale.
    return "ps.status IN ('PUBLISHED', 'DRAFT')";
}

function discover_int(mixed $value): ?int {
    if ($value === null || $value === '') return null;
    return (int)$value;
}

function discover_float(mixed $value): ?float {
    if ($value === null || $value === '') return null;
    return (float)$value;
}

function discover_bool(mixed $value): int {
    return (int)(($value === true) || $value === 1 || $value === '1');
}

function normalize_discover_plant_row(array $row): array {
    return [
        'id' => (int)$row['id'],
        'slug' => $row['slug'],
        'scientific_name' => $row['scientific_name'],
        'common_name' => $row['common_name'],
        'commercial_name' => $row['commercial_name'],
        'genus' => $row['genus'],
        'family' => $row['family'],
        'short_description' => $row['short_description'],
        'long_description' => $row['long_description'],
        'indoor_outdoor' => $row['indoor_outdoor'],
        'plant_type' => $row['plant_type'],
        'growth_habit' => $row['growth_habit'],
        'light_min' => discover_int($row['light_min']),
        'light_max' => discover_int($row['light_max']),
        'care_level' => discover_int($row['care_level']),
        'size_level' => discover_int($row['size_level']),
        'pet_safe' => (int)$row['pet_safe'],
        'toxicity_note' => $row['toxicity_note'],
        'temperature_min_c' => discover_float($row['temperature_min_c']),
        'temperature_max_c' => discover_float($row['temperature_max_c']),
        'watering_level' => discover_int($row['watering_level']),
        'humidity_level' => discover_int($row['humidity_level']),
        'maintenance_level' => discover_int($row['maintenance_level']),
        'flowering' => (int)$row['flowering'],
        'evergreen' => (int)$row['evergreen'],
        'seasonality_note' => $row['seasonality_note'],
        'main_image_url' => $row['main_image_url'],
        'status' => $row['status'],
        'categories' => $row['categories'] ? explode(',', (string)$row['categories']) : [],
    ];
}

function list_discover_categories(): array {
    $pdo = discover_pdo();

    $sql = "
        SELECT
            id,
            slug,
            name,
            icon,
            category_type,
            sort_order
        FROM discover_categories
        WHERE is_active = 1
        ORDER BY sort_order ASC, name ASC
    ";

    $rows = $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
    return array_map(static fn(array $row): array => [
        'id' => (int)$row['id'],
        'slug' => $row['slug'],
        'name' => $row['name'],
        'icon' => $row['icon'],
        'category_type' => $row['category_type'],
        'sort_order' => (int)$row['sort_order'],
    ], $rows);
}

function list_discover_plants(array $filters = []): array {
    $pdo = discover_pdo();

    $limit = max(1, min(100, (int)($filters['limit'] ?? 12)));
    $offset = max(0, (int)($filters['offset'] ?? 0));
    $q = trim((string)($filters['q'] ?? ''));
    $categorySlug = trim((string)($filters['category_slug'] ?? ''));

    $where = [discover_status_filter()];
    $params = [];

    if ($q !== '') {
        $where[] = "(
            ps.scientific_name LIKE :q
            OR COALESCE(ps.common_name, '') LIKE :q
            OR COALESCE(ps.commercial_name, '') LIKE :q
            OR COALESCE(ps.short_description, '') LIKE :q
        )";
        $params[':q'] = '%' . $q . '%';
    }

    if ($categorySlug !== '') {
        $where[] = "EXISTS (
            SELECT 1
            FROM plant_species_categories psc2
            INNER JOIN discover_categories dc2 ON dc2.id = psc2.category_id
            WHERE psc2.plant_species_id = ps.id
              AND dc2.slug = :category_slug
              AND dc2.is_active = 1
        )";
        $params[':category_slug'] = $categorySlug;
    }

    $sql = "
        SELECT
            ps.*,
            GROUP_CONCAT(DISTINCT dc.slug ORDER BY dc.sort_order ASC SEPARATOR ',') AS categories
        FROM plant_species ps
        LEFT JOIN plant_species_categories psc ON psc.plant_species_id = ps.id
        LEFT JOIN discover_categories dc ON dc.id = psc.category_id AND dc.is_active = 1
        WHERE " . implode(' AND ', $where) . "
        GROUP BY ps.id
        ORDER BY
            COALESCE(ps.common_name, ps.scientific_name) ASC,
            ps.scientific_name ASC
        LIMIT :limit OFFSET :offset
    ";

    $stmt = $pdo->prepare($sql);
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value, PDO::PARAM_STR);
    }
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return array_map('normalize_discover_plant_row', $rows);
}

function get_discover_plant(int $id): ?array {
    $pdo = discover_pdo();

    $sql = "
        SELECT
            ps.*,
            GROUP_CONCAT(DISTINCT dc.slug ORDER BY dc.sort_order ASC SEPARATOR ',') AS categories
        FROM plant_species ps
        LEFT JOIN plant_species_categories psc ON psc.plant_species_id = ps.id
        LEFT JOIN discover_categories dc ON dc.id = psc.category_id AND dc.is_active = 1
        WHERE " . discover_status_filter() . "
          AND ps.id = :id
        GROUP BY ps.id
        LIMIT 1
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->bindValue(':id', $id, PDO::PARAM_INT);
    $stmt->execute();

    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) return null;

    return normalize_discover_plant_row($row);
}

function scenario_light_value(string $light): ?int {
    return match ($light) {
        'Bassa' => 1,
        'Media' => 2,
        'Alta' => 3,
        default => null,
    };
}

function scenario_care_value(string $difficulty): ?int {
    return match ($difficulty) {
        'Facile' => 1,
        'Media' => 2,
        'Esperta' => 3,
        default => null,
    };
}

function scenario_size_value(string $size): ?int {
    return match ($size) {
        'Piccola' => 1,
        'Media' => 2,
        'Grande' => 3,
        default => null,
    };
}

function light_label_from_range(?int $min, ?int $max): ?string {
    $labels = [1 => 'Bassa', 2 => 'Media', 3 => 'Alta'];
    if ($min === null && $max === null) return null;
    if ($min !== null && $max !== null && $min === $max && isset($labels[$min])) {
        return $labels[$min];
    }
    if ($min !== null && $max !== null && isset($labels[$min]) && isset($labels[$max])) {
        return $labels[$min] . '-' . $labels[$max];
    }
    if ($max !== null && isset($labels[$max])) return $labels[$max];
    if ($min !== null && isset($labels[$min])) return $labels[$min];
    return null;
}

function build_discover_match(array $plant, array $scenario): array {
    $score = 100;
    $breakdown = [];

    $lightPref = scenario_light_value((string)($scenario['light'] ?? ''));
    $carePref = scenario_care_value((string)($scenario['difficulty'] ?? ''));
    $sizePref = scenario_size_value((string)($scenario['size'] ?? ''));
    $pets = (string)($scenario['pets'] ?? 'Non importa');
    $room = (string)($scenario['room'] ?? 'spazio');

    if ($lightPref !== null && $lightPref > 0) {
        $min = discover_int($plant['light_min']);
        $max = discover_int($plant['light_max']);

        if ($min === null && $max === null) {
            $breakdown[] = ['label' => 'Luce', 'status' => 'OK'];
        } else {
            $nearest = $lightPref;
            if ($min !== null && $lightPref < $min) $nearest = $min;
            if ($max !== null && $lightPref > $max) $nearest = $max;
            $diff = abs($nearest - $lightPref);

            if ($diff === 1) $score -= 18;
            if ($diff >= 2) $score -= 35;

            $hint = $diff > 0 ? ('Preferisce: ' . (light_label_from_range($min, $max) ?? 'valore diverso')) : null;
            $breakdown[] = [
                'label' => 'Luce',
                'status' => $diff === 0 ? 'OK' : ($diff === 1 ? 'WARN' : 'BAD'),
                'hint' => $hint,
            ];
        }
    } else {
        $breakdown[] = ['label' => 'Luce', 'status' => 'OK'];
    }

    if ($pets === 'Sì' && !(bool)$plant['pet_safe']) {
        $score -= 45;
        $breakdown[] = [
            'label' => 'Pet Safe',
            'status' => 'BAD',
            'hint' => $plant['toxicity_note'] ?: 'Nota: tossica se ingerita',
        ];
    } else {
        $breakdown[] = ['label' => 'Pet Safe', 'status' => 'OK'];
    }

    if ($carePref !== null && discover_int($plant['care_level']) !== null) {
        $plantCare = (int)$plant['care_level'];
        if ($plantCare > $carePref) {
            $score -= ($plantCare - $carePref) * 15;
            $breakdown[] = [
                'label' => 'Impegno',
                'status' => 'WARN',
                'hint' => 'Richiede cure più costanti',
            ];
        } else {
            $breakdown[] = ['label' => 'Impegno', 'status' => 'OK'];
        }
    } else {
        $breakdown[] = ['label' => 'Impegno', 'status' => 'OK'];
    }

    if ($sizePref !== null && discover_int($plant['size_level']) !== null) {
        $diff = abs((int)$plant['size_level'] - $sizePref);
        if ($diff > 0) $score -= 10 * $diff;
        $breakdown[] = [
            'label' => 'Spazio',
            'status' => $diff === 0 ? 'OK' : 'WARN',
        ];
    } else {
        $breakdown[] = ['label' => 'Spazio', 'status' => 'OK'];
    }

    $score = max(1, min(100, $score));
    $label = $score >= 80 ? 'Ottima' : ($score >= 55 ? 'Buona' : 'Ok');
    $leaves = max(1, min(5, (int)ceil($score / 20)));

    $badFactors = array_values(array_filter($breakdown, static fn(array $item): bool => $item['status'] !== 'OK'));
    $note = (!empty($badFactors) && !empty($badFactors[0]['hint']))
        ? ('Nota: ' . $badFactors[0]['hint'])
        : ('Compatibile con il tuo ' . $room);

    return [
        'entry' => $plant,
        'score' => $score,
        'label' => $label,
        'leaves' => $leaves,
        'note' => $note,
        'breakdown' => $breakdown,
    ];
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

function match_discover_plants(array $scenario, int $limit = 8): array {
    $plants = list_discover_plants([
        'limit' => 100,
        'offset' => 0,
    ]);

    $matches = array_map(
        static fn(array $plant): array => build_discover_match($plant, $scenario),
        $plants
    );

    usort($matches, static function (array $a, array $b): int {
        return $b['score'] <=> $a['score'];
    });

    return array_slice($matches, 0, max(1, min(20, $limit)));
}
