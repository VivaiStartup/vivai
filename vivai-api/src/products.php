<?php
require_once __DIR__ . '/db.php';

/**
 * Restituisce ProductCard per lo shop B2C (id, name, price, image)
 * Ora prende i dati dal catalogo vivaio (listings + listing_variants).
 *
 * $vivaioId: id del vivaio (non userId)
 */
function list_products(int $vivaioId = 1, int $limit = 50): array {
  $pdo = db();
  $limit = max(1, min(200, (int)$limit));

  // autodetect: qty o stock in listing_variants
  $cols = $pdo->query("SHOW COLUMNS FROM listing_variants")->fetchAll(PDO::FETCH_ASSOC);
  $fields = array_map(fn($r) => $r['Field'], $cols);
  $qtyCol = in_array('qty', $fields, true) ? 'qty' : (in_array('stock', $fields, true) ? 'stock' : null);
  if (!$qtyCol) {
    throw new Exception("listing_variants must have qty or stock column");
  }

  // Prezzo: minimo tra le varianti (così hai "prezzo a partire da")
  $sql = "
    SELECT
      l.id AS id,
      l.title AS name,
      COALESCE(l.main_image, '') AS image,
      COALESCE(MIN(v.price), 0) AS price,
      COALESCE(SUM(v.$qtyCol), 0) AS stockTotal
    FROM listings l
    LEFT JOIN listing_variants v ON v.listing_id = l.id
    WHERE l.id_vivaio = ?
      AND l.status = 'ACTIVE'
    GROUP BY l.id
    ORDER BY l.updated_at DESC
    LIMIT {$limit}
  ";

  $stmt = $pdo->prepare($sql);
  
  $stmt->execute([$vivaioId]);
  $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

  // normalizza tipi + se vuoi, puoi filtrare solo stock > 0
  $out = [];
  foreach ($rows as $r) {
    $id = (int)$r['id'];
    $price = (float)$r['price'];
    $name = (string)$r['name'];
    $image = (string)$r['image'];
    $stockTotal = (int)$r['stockTotal'];

    // opzionale: se vuoi nascondere prodotti esauriti nello shop:
    // if ($stockTotal <= 0) continue;

    $out[] = [
      'id' => $id,
      'name' => $name,
      'price' => $price,
      'image' => $image,
      // opzionale: se vuoi usarlo nel frontend
      // 'stockTotal' => $stockTotal,
    ];
  }

  return $out;
}