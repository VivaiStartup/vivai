<?php
// vivai-api/src/nurseryCatalog.php
require_once __DIR__ . '/db.php';

/**
 * Helpers
 */
function nc_db(): PDO {
  return db();
}

function nc_table_columns(string $table): array {
  static $cache = [];

  if (isset($cache[$table])) return $cache[$table];

  $pdo = nc_db();
  $rows = $pdo->query("SHOW COLUMNS FROM `{$table}`")->fetchAll(PDO::FETCH_ASSOC);
  $cache[$table] = array_map(fn($r) => (string)$r['Field'], $rows);

  return $cache[$table];
}

function nc_has_column(string $table, string $column): bool {
  return in_array($column, nc_table_columns($table), true);
}

function nc_find_listing(int $listingId, int $vivaioId): ?array {
  $pdo = nc_db();
  $stmt = $pdo->prepare("SELECT id, id_vivaio FROM listings WHERE id = ? AND id_vivaio = ? LIMIT 1");
  $stmt->execute([$listingId, $vivaioId]);
  $row = $stmt->fetch(PDO::FETCH_ASSOC);

  return $row ?: null;
}

function nc_validate_species_id(?int $speciesId): ?int {
  if (!$speciesId || $speciesId <= 0) return null;
  if (!nc_has_column('listings', 'plant_species_id')) return null;

  $pdo = nc_db();
  $stmt = $pdo->prepare("SELECT id FROM plant_species WHERE id = ? LIMIT 1");
  $stmt->execute([$speciesId]);
  $row = $stmt->fetch(PDO::FETCH_ASSOC);

  return $row ? $speciesId : null;
}

function nc_normalize_image_mode($value): string {
  $value = strtoupper(trim((string)$value));
  return in_array($value, ['CUSTOM', 'SPECIES'], true) ? $value : 'CUSTOM';
}

function nc_variant_columns_meta(): array {
  $cols = nc_table_columns('listing_variants');

  $has = fn(string $c) => in_array($c, $cols, true);

  $qtyCol = $has('qty') ? 'qty' : ($has('stock') ? 'stock' : null);
  $labelCol = $has('label') ? 'label' : ($has('name') ? 'name' : null);
  $priceCol = $has('price') ? 'price' : null;
  $thresholdCol = $has('low_stock_threshold') ? 'low_stock_threshold' : null;
  $shortCol = $has('short_description') ? 'short_description' : null;
  $skuCol = $has('sku') ? 'sku' : null;

  return [
    'qty' => $qtyCol,
    'label' => $labelCol,
    'price' => $priceCol,
    'low_stock_threshold' => $thresholdCol,
    'short_description' => $shortCol,
    'sku' => $skuCol,
  ];
}

function nc_validate_listing_payload(array $payload): array {
  $type = strtoupper(trim((string)($payload['type'] ?? '')));
  $title = trim((string)($payload['title'] ?? ''));
  $category = trim((string)($payload['category'] ?? ''));
  $status = strtoupper(trim((string)($payload['status'] ?? 'DRAFT')));

  if (!in_array($type, ['PLANT', 'PRODUCT'], true)) {
    return ['error' => 'type must be PLANT or PRODUCT', 'code' => 400];
  }
  if ($title === '') {
    return ['error' => 'title required', 'code' => 400];
  }
  if ($category === '') {
    return ['error' => 'category required', 'code' => 400];
  }
  if (!in_array($status, ['ACTIVE', 'DRAFT', 'OUT_OF_STOCK'], true)) {
    $status = 'DRAFT';
  }

  $brand = isset($payload['brand']) ? trim((string)$payload['brand']) : null;
  $mainImage = isset($payload['mainImage']) ? trim((string)$payload['mainImage']) : null;
  $short = isset($payload['shortDescription']) ? trim((string)$payload['shortDescription']) : null;
  $long = isset($payload['longDescription']) ? trim((string)$payload['longDescription']) : null;

  $attrs = $payload['attributes'] ?? null;
  $attrsJson = $attrs !== null
    ? json_encode($attrs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
    : null;

  $variants = $payload['variants'] ?? [];
  if (!is_array($variants) || count($variants) === 0) {
    return ['error' => 'variants required (at least 1)', 'code' => 400];
  }

  $speciesId = null;
  if (array_key_exists('plantSpeciesId', $payload)) {
    $speciesId = nc_validate_species_id((int)$payload['plantSpeciesId']);
    if ((int)$payload['plantSpeciesId'] > 0 && $speciesId === null && nc_has_column('listings', 'plant_species_id')) {
      return ['error' => 'plantSpeciesId not found', 'code' => 400];
    }
  }

  $imageMode = nc_normalize_image_mode($payload['imageMode'] ?? 'CUSTOM');

  return [
    'ok' => true,
    'data' => [
      'type' => $type,
      'title' => $title,
      'category' => $category,
      'status' => $status,
      'brand' => $brand ?: null,
      'mainImage' => $mainImage ?: null,
      'shortDescription' => $short ?: null,
      'longDescription' => $long ?: null,
      'attributesJson' => $attrsJson,
      'variants' => $variants,
      'plantSpeciesId' => $speciesId,
      'imageMode' => $imageMode,
    ]
  ];
}

function nc_prepare_variant_insert(): array {
  $meta = nc_variant_columns_meta();

  if (!$meta['qty']) {
    return ['error' => 'listing_variants must have qty or stock column', 'code' => 500];
  }
  if (!$meta['label']) {
    return ['error' => 'listing_variants must have label or name column', 'code' => 500];
  }
  if (!$meta['price']) {
    return ['error' => 'listing_variants must have price column', 'code' => 500];
  }

  $cols = ['listing_id', $meta['label'], $meta['price'], $meta['qty']];
  if ($meta['low_stock_threshold']) $cols[] = $meta['low_stock_threshold'];
  if ($meta['short_description']) $cols[] = $meta['short_description'];
  if ($meta['sku']) $cols[] = $meta['sku'];

  $placeholders = implode(', ', array_fill(0, count($cols), '?'));
  $sql = "INSERT INTO listing_variants (" . implode(', ', $cols) . ") VALUES ($placeholders)";

  return [
    'ok' => true,
    'meta' => $meta,
    'sql' => $sql,
  ];
}

function nc_insert_variants(PDO $pdo, int $listingId, array $variants): array {
  $prep = nc_prepare_variant_insert();
  if (!empty($prep['error'])) return $prep;

  $meta = $prep['meta'];
  $stmt = $pdo->prepare($prep['sql']);

  foreach ($variants as $v) {
    $label = trim((string)($v['label'] ?? $v['name'] ?? ''));
    $price = (float)($v['price'] ?? 0);
    $qty = (int)($v['qty'] ?? $v['stock'] ?? 0);
    $threshold = (int)($v['low_stock_threshold'] ?? 0);
    $short = isset($v['shortDescription']) ? trim((string)$v['shortDescription']) : null;
    $sku = isset($v['sku']) ? trim((string)$v['sku']) : null;

    if ($label === '') {
      return ['error' => 'variant label required', 'code' => 400];
    }
    if ($price < 0) $price = 0;
    if ($qty < 0) $qty = 0;
    if ($threshold < 0) $threshold = 0;

    $vals = [$listingId, $label, $price, $qty];
    if ($meta['low_stock_threshold']) $vals[] = $threshold;
    if ($meta['short_description']) $vals[] = $short ?: null;
    if ($meta['sku']) $vals[] = $sku ?: null;

    $stmt->execute($vals);
  }

  return ['ok' => true];
}

/**
 * Ritorna tutti i listings del vivaio, con varianti annidate.
 * Supporta opzionalmente:
 * - listings.plant_species_id
 * - listings.image_mode
 * - plant_species.main_image_url
 */
function list_listings(int $vivaioId, string $type = 'ALL'): array {
  $pdo = nc_db();

  $type = strtoupper(trim($type));
  $params = [$vivaioId];

  $where = "WHERE l.id_vivaio = ?";
  if ($type === 'PLANT' || $type === 'PRODUCT') {
    $where .= " AND l.type = ?";
    $params[] = $type;
  }

  $listingHasSpecies = nc_has_column('listings', 'plant_species_id');
  $listingHasImageMode = nc_has_column('listings', 'image_mode');
  $variantMeta = nc_variant_columns_meta();

  $speciesSelect = $listingHasSpecies ? ",
      l.plant_species_id AS plant_species_id,
      ps.slug AS species_slug,
      ps.scientific_name AS species_scientific_name,
      ps.common_name AS species_common_name,
      ps.commercial_name AS species_commercial_name,
      ps.main_image_url AS species_main_image_url
  " : ",
      NULL AS plant_species_id,
      NULL AS species_slug,
      NULL AS species_scientific_name,
      NULL AS species_common_name,
      NULL AS species_commercial_name,
      NULL AS species_main_image_url
  ";

  $imageModeSelect = $listingHasImageMode
    ? ", l.image_mode AS image_mode"
    : ", 'CUSTOM' AS image_mode";

  $variantSkuSelect = $variantMeta['sku']
    ? ", v.{$variantMeta['sku']} AS variant_sku"
    : ", NULL AS variant_sku";

  $variantThresholdSelect = $variantMeta['low_stock_threshold']
    ? ", v.{$variantMeta['low_stock_threshold']} AS low_stock_threshold"
    : ", 0 AS low_stock_threshold";

  $variantShortSelect = $variantMeta['short_description']
    ? ", v.{$variantMeta['short_description']} AS variant_short_description"
    : ", NULL AS variant_short_description";

  $variantLabelExpr = "v.{$variantMeta['label']}";
  $variantQtyExpr = "v.{$variantMeta['qty']}";
  $variantPriceExpr = "v.{$variantMeta['price']}";

  $joinSpecies = $listingHasSpecies
    ? "LEFT JOIN plant_species ps ON ps.id = l.plant_species_id"
    : "";

  $sql = "
    SELECT
      l.id                AS listing_id,
      l.id_vivaio         AS id_vivaio,
      l.type              AS type,
      l.title             AS title,
      l.category          AS category,
      l.brand             AS brand,
      l.status            AS status,
      l.main_image        AS main_image,
      l.short_description AS short_description,
      l.long_description  AS long_description,
      l.attributes_json   AS attributes_json
      {$imageModeSelect}
      {$speciesSelect},

      v.id                AS variant_id,
      {$variantLabelExpr} AS variant_label,
      {$variantQtyExpr}   AS qty,
      {$variantPriceExpr} AS price
      {$variantSkuSelect}
      {$variantThresholdSelect}
      {$variantShortSelect}
    FROM listings l
    LEFT JOIN listing_variants v ON v.listing_id = l.id
    {$joinSpecies}
    {$where}
    ORDER BY l.updated_at DESC, v.id ASC
  ";

  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);
  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

  $out = [];
  foreach ($rows as $r) {
    $lid = (int)$r['listing_id'];

    if (!isset($out[$lid])) {
      $attrs = [];
      if (!empty($r['attributes_json'])) {
        $decoded = json_decode($r['attributes_json'], true);
        if (is_array($decoded)) $attrs = $decoded;
      }

      $imageMode = $r['image_mode'] ?: 'CUSTOM';
      $mainImage = $r['main_image'] ?: null;
      $speciesImage = $r['species_main_image_url'] ?: null;

      $effectiveMainImage = $mainImage;
      if ($imageMode === 'SPECIES' && $speciesImage) {
        $effectiveMainImage = $speciesImage;
      } elseif (!$effectiveMainImage && $speciesImage) {
        $effectiveMainImage = $speciesImage;
      }

      $plantSpecies = null;
      if (!empty($r['plant_species_id'])) {
        $plantSpecies = [
          'id' => (int)$r['plant_species_id'],
          'slug' => $r['species_slug'],
          'scientificName' => $r['species_scientific_name'],
          'commonName' => $r['species_common_name'],
          'commercialName' => $r['species_commercial_name'],
          'mainImageUrl' => $speciesImage,
        ];
      }

      $out[$lid] = [
        'id' => (string)$lid,
        'nursery_id' => (string)$r['id_vivaio'],
        'type' => $r['type'],
        'title' => $r['title'],
        'category' => $r['category'],
        'brand' => $r['brand'],
        'status' => $r['status'],
        'mainImage' => $mainImage,
        'effectiveMainImage' => $effectiveMainImage,
        'imageMode' => $imageMode,
        'shortDescription' => $r['short_description'],
        'longDescription' => $r['long_description'],
        'attributes' => $attrs,
        'sellerImages' => [],
        'plantSpeciesId' => !empty($r['plant_species_id']) ? (int)$r['plant_species_id'] : null,
        'plantSpecies' => $plantSpecies,
        'stockTotal' => 0,
        'variants' => [],
      ];
    }

    if (!empty($r['variant_id'])) {
      $qty = (int)$r['qty'];
      $threshold = isset($r['low_stock_threshold']) ? (int)$r['low_stock_threshold'] : 0;

      $out[$lid]['variants'][] = [
        'id' => (string)(int)$r['variant_id'],
        'sku' => $r['variant_sku'] ?: null,
        'label' => $r['variant_label'],
        'name' => $r['variant_label'], // backward compatibility
        'qty' => $qty,
        'stock' => $qty, // backward compatibility
        'price' => (float)$r['price'],
        'low_stock_threshold' => $threshold,
        'shortDescription' => $r['variant_short_description'] ?: null,
      ];
      $out[$lid]['stockTotal'] += $qty;
    }
  }

  return array_values($out);
}

function nc_normalize_listing_status($value): ?string {
  $value = strtoupper(trim((string)$value));
  return in_array($value, ['ACTIVE', 'DRAFT', 'OUT_OF_STOCK'], true) ? $value : null;
}

function update_listing_status(int $vivaioId, int $listingId, $status): array {
  $pdo = nc_db();

  if (!nc_find_listing($listingId, $vivaioId)) {
    return ['error' => 'Listing not found', 'code' => 404];
  }

  $normalized = nc_normalize_listing_status($status);
  if ($normalized === null) {
    return ['error' => 'Invalid status', 'code' => 400];
  }

  $stmt = $pdo->prepare("
    UPDATE listings
    SET status = ?
    WHERE id = ? AND id_vivaio = ?
  ");
  $stmt->execute([$normalized, $listingId, $vivaioId]);

  return [
    'ok' => true,
    'listingId' => $listingId,
    'status' => $normalized,
  ];
}

function search_plant_species_for_nursery(string $query, int $limit = 8): array {
  $pdo = nc_db();
  $limit = max(1, min(20, $limit));
  $q = trim($query);

  if ($q === '') {
    $stmt = $pdo->prepare("
      SELECT id, slug, scientific_name, common_name, commercial_name, family, genus, main_image_url
      FROM plant_species
      WHERE status IN ('DRAFT', 'PUBLISHED')
      ORDER BY common_name IS NULL, common_name ASC, scientific_name ASC
      LIMIT :limit
    ");
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
  }

  $like = '%' . $q . '%';
  $prefix = $q . '%';

  $sql = "
    SELECT id, slug, scientific_name, common_name, commercial_name, family, genus, main_image_url
    FROM plant_species
    WHERE status IN ('DRAFT', 'PUBLISHED')
      AND (
        scientific_name LIKE :like1 OR
        common_name LIKE :like2 OR
        commercial_name LIKE :like3 OR
        slug LIKE :like4
      )
    ORDER BY
      CASE
        WHEN scientific_name LIKE :prefix1 THEN 0
        WHEN common_name LIKE :prefix2 THEN 1
        WHEN commercial_name LIKE :prefix3 THEN 2
        ELSE 3
      END,
      common_name IS NULL,
      common_name ASC,
      scientific_name ASC
    LIMIT :limit
  ";

  $stmt = $pdo->prepare($sql);
  $stmt->bindValue(':like1', $like, PDO::PARAM_STR);
  $stmt->bindValue(':like2', $like, PDO::PARAM_STR);
  $stmt->bindValue(':like3', $like, PDO::PARAM_STR);
  $stmt->bindValue(':like4', $like, PDO::PARAM_STR);
  $stmt->bindValue(':prefix1', $prefix, PDO::PARAM_STR);
  $stmt->bindValue(':prefix2', $prefix, PDO::PARAM_STR);
  $stmt->bindValue(':prefix3', $prefix, PDO::PARAM_STR);
  $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
  $stmt->execute();

  return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

function create_listing(int $vivaioId, array $payload): array {
  $pdo = nc_db();

  $validated = nc_validate_listing_payload($payload);
  if (!empty($validated['error'])) return $validated;
  $data = $validated['data'];

  $pdo->beginTransaction();
  try {
    $cols = [
      'id_vivaio',
      'type',
      'title',
      'category',
      'brand',
      'status',
      'main_image',
      'short_description',
      'long_description',
      'attributes_json',
    ];
    $vals = [
      $vivaioId,
      $data['type'],
      $data['title'],
      $data['category'],
      $data['brand'],
      $data['status'],
      $data['mainImage'],
      $data['shortDescription'],
      $data['longDescription'],
      $data['attributesJson'],
    ];

    if (nc_has_column('listings', 'plant_species_id')) {
      $cols[] = 'plant_species_id';
      $vals[] = $data['plantSpeciesId'];
    }
    if (nc_has_column('listings', 'image_mode')) {
      $cols[] = 'image_mode';
      $vals[] = $data['imageMode'];
    }

    $placeholders = implode(', ', array_fill(0, count($cols), '?'));
    $sql = "INSERT INTO listings (" . implode(', ', $cols) . ") VALUES ({$placeholders})";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($vals);

    $listingId = (int)$pdo->lastInsertId();

    $variantsRes = nc_insert_variants($pdo, $listingId, $data['variants']);
    if (!empty($variantsRes['error'])) {
      $pdo->rollBack();
      return $variantsRes;
    }

    $pdo->commit();
    return ['ok' => true, 'listingId' => $listingId];
  } catch (Throwable $e) {
    $pdo->rollBack();
    return ['error' => 'Server error', 'code' => 500, 'detail' => $e->getMessage()];
  }
}

function update_listing(int $vivaioId, int $listingId, array $payload): array {
  $pdo = nc_db();

  if (!nc_find_listing($listingId, $vivaioId)) {
    return ['error' => 'Listing not found', 'code' => 404];
  }

  $validated = nc_validate_listing_payload($payload);
  if (!empty($validated['error'])) return $validated;
  $data = $validated['data'];

  $pdo->beginTransaction();
  try {
    $sets = [
      'type = ?',
      'title = ?',
      'category = ?',
      'brand = ?',
      'status = ?',
      'main_image = ?',
      'short_description = ?',
      'long_description = ?',
      'attributes_json = ?',
    ];
    $vals = [
      $data['type'],
      $data['title'],
      $data['category'],
      $data['brand'],
      $data['status'],
      $data['mainImage'],
      $data['shortDescription'],
      $data['longDescription'],
      $data['attributesJson'],
    ];

    if (nc_has_column('listings', 'plant_species_id')) {
      $sets[] = 'plant_species_id = ?';
      $vals[] = $data['plantSpeciesId'];
    }
    if (nc_has_column('listings', 'image_mode')) {
      $sets[] = 'image_mode = ?';
      $vals[] = $data['imageMode'];
    }

    $vals[] = $listingId;
    $vals[] = $vivaioId;

    $sql = "UPDATE listings SET " . implode(', ', $sets) . " WHERE id = ? AND id_vivaio = ?";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($vals);

    $pdo->prepare("DELETE FROM listing_variants WHERE listing_id = ?")->execute([$listingId]);

    $variantsRes = nc_insert_variants($pdo, $listingId, $data['variants']);
    if (!empty($variantsRes['error'])) {
      $pdo->rollBack();
      return $variantsRes;
    }

    $pdo->commit();
    return ['ok' => true, 'listingId' => $listingId];
  } catch (Throwable $e) {
    $pdo->rollBack();
    return ['error' => 'Server error', 'code' => 500, 'detail' => $e->getMessage()];
  }
}

/**
 * Patch di una variante (qty e/o price).
 * Accetta qty dal backend e stock dal frontend, ma salva sulla colonna reale.
 */
function update_variant(int $vivaioId, int $variantId, array $patch): array {
  $pdo = nc_db();

  $stmt = $pdo->prepare("
    SELECT v.id
    FROM listing_variants v
    JOIN listings l ON l.id = v.listing_id
    WHERE v.id = ? AND l.id_vivaio = ?
    LIMIT 1
  ");
  $stmt->execute([$variantId, $vivaioId]);
  $row = $stmt->fetch(PDO::FETCH_ASSOC);
  if (!$row) return ['error' => 'Variant not found', 'code' => 404];

  $meta = nc_variant_columns_meta();
  $fields = [];
  $params = [];

  if (array_key_exists('qty', $patch) || array_key_exists('stock', $patch)) {
    $qty = array_key_exists('qty', $patch) ? (int)$patch['qty'] : (int)$patch['stock'];
    if ($qty < 0) $qty = 0;
    $fields[] = "{$meta['qty']} = ?";
    $params[] = $qty;
  }

  if (array_key_exists('price', $patch)) {
    $price = (float)$patch['price'];
    if ($price < 0) $price = 0;
    $fields[] = "price = ?";
    $params[] = $price;
  }

  if (!$fields) return ['error' => 'Nothing to update', 'code' => 400];

  $params[] = $variantId;

  $sql = "UPDATE listing_variants SET " . implode(', ', $fields) . " WHERE id = ?";
  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);

  return ['ok' => true];
}