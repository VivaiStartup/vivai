<?php
require_once __DIR__ . '/db.php';

function list_locations(int $userId): array {
    $pdo = db();

    $stmt = $pdo->prepare("
        SELECT
            pkid AS id,
            name,
            icon
        FROM locations
        WHERE id_utente = ?
        ORDER BY name ASC
    ");
    $stmt->execute([$userId]);

    return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
}