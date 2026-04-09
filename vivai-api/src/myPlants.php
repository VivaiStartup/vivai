<?php
// vivai-api/src/myPlants.php

declare(strict_types=1);

require_once __DIR__ . '/db.php';

const MYPLANTS_TABLE = 'utenti_piante';

function normalize_nullable_string($value): ?string
{
    if ($value === null) return null;
    $value = trim((string)$value);
    return $value === '' ? null : $value;
}

function normalize_nullable_int($value): ?int
{
    if ($value === null || $value === '') return null;
    return (int)$value;
}

function normalize_nullable_date($value): ?string
{
    if ($value === null || $value === '') return null;
    return (string)$value;
}



function create_my_plant(int $userId, array $body): array {
    $pdo = db();

    $plantSpeciesId = isset($body['plant_species_id']) ? (int)$body['plant_species_id'] : 0;
    $nickname = trim((string)($body['nickname'] ?? ''));
    $locationId = isset($body['location_id']) ? (int)$body['location_id'] : 0;
    $indoorOutdoor = strtoupper(trim((string)($body['indoor_outdoor'] ?? '')));
    $potDiameterCm = isset($body['pot_diameter_cm']) && $body['pot_diameter_cm'] !== ''
        ? (int)$body['pot_diameter_cm']
        : null;
    $purchaseDate = trim((string)($body['purchase_date'] ?? '')) ?: null;
    $userNotes = trim((string)($body['user_notes'] ?? '')) ?: null;

    if ($plantSpeciesId <= 0) {
        return ['error' => 'plant_species_id obbligatorio', 'code' => 422];
    }

    if ($nickname === '') {
        return ['error' => 'nickname obbligatorio', 'code' => 422];
    }

    if ($locationId <= 0) {
        return ['error' => 'location_id obbligatorio', 'code' => 422];
    }

    if (!in_array($indoorOutdoor, ['INDOOR', 'OUTDOOR'], true)) {
        return ['error' => 'indoor_outdoor non valido', 'code' => 422];
    }

    // valida specie
    $stmt = $pdo->prepare("
        SELECT id, scientific_name, common_name, main_image_url, indoor_outdoor, status
        FROM plant_species
        WHERE id = ?
        LIMIT 1
    ");
    $stmt->execute([$plantSpeciesId]);
    $species = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$species) {
        return ['error' => 'Specie non trovata', 'code' => 404];
    }

    if (($species['status'] ?? '') === 'ARCHIVED') {
        return ['error' => 'Specie non selezionabile', 'code' => 422];
    }

    // valida location utente
    $stmt = $pdo->prepare("
        SELECT pkid, name
        FROM locations
        WHERE pkid = ? AND id_utente = ?
        LIMIT 1
    ");
    $stmt->execute([$locationId, $userId]);
    $location = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$location) {
        return ['error' => 'Stanza non valida per questo utente', 'code' => 422];
    }

    $stmt = $pdo->prepare("
        INSERT INTO utenti_piante (
            nickname,
            image_url,
            id_utente,
            plant_species_id,
            location_id,
            indoor_outdoor,
            pot_diameter_cm,
            purchase_date,
            status,
            user_notes
        ) VALUES (
            :nickname,
            :image_url,
            :id_utente,
            :plant_species_id,
            :location_id,
            :indoor_outdoor,
            :pot_diameter_cm,
            :purchase_date,
            'ACTIVE',
            :user_notes
        )
    ");

    $stmt->execute([
        ':nickname' => $nickname,
        ':image_url' => $species['main_image_url'] ?: null,
        ':id_utente' => $userId,
        ':plant_species_id' => $plantSpeciesId,
        ':location_id' => $locationId,
        ':indoor_outdoor' => $indoorOutdoor,
        ':pot_diameter_cm' => $potDiameterCm,
        ':purchase_date' => $purchaseDate,
        ':user_notes' => $userNotes,
    ]);

    $newId = (int)$pdo->lastInsertId();

    $created = get_my_plant($newId, $userId);
    if (!$created) {
        return ['id' => $newId];
    }

    return $created;
}

/**
 * Lista piante utente per overview / collection
 * Compatibile con l'uso attuale, ma con qualche dato in più.
 */
function list_my_plants(int $userId = 1, int $limit = 6): array
{
    $pdo = db();
    $limit = max(1, min(100, (int)$limit));

    $sql = "
        SELECT
            up.pkid,
            up.nickname,
            up.image_url,
            up.id_utente,
            up.plant_species_id,
            up.location_id,
            up.indoor_outdoor,
            up.pot_diameter_cm,
            up.status,

            loc.name AS location_name,
            loc.icon AS location_icon,

            ps.common_name,
            ps.scientific_name
        FROM " . MYPLANTS_TABLE . " up
        LEFT JOIN locations loc
            ON loc.pkid = up.location_id
           AND (loc.id_utente = up.id_utente OR loc.id_utente IS NULL)
        LEFT JOIN plant_species ps
            ON ps.id = up.plant_species_id
        WHERE up.id_utente = ?
        ORDER BY up.pkid DESC
        LIMIT {$limit}
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll();

    $out = [];
    foreach ($rows as $r) {
        $out[] = [
            'id' => (int)$r['pkid'],
            'nickname' => (string)$r['nickname'],
            'image' => (string)($r['image_url'] ?? ''),
            'user_id' => (int)$r['id_utente'],
            'plant_species_id' => normalize_nullable_int($r['plant_species_id'] ?? null),
            'location_id' => normalize_nullable_int($r['location_id'] ?? null),
            'location_name' => normalize_nullable_string($r['location_name'] ?? null),
            'location_icon' => normalize_nullable_string($r['location_icon'] ?? null),
            'indoor_outdoor' => normalize_nullable_string($r['indoor_outdoor'] ?? null),
            'pot_diameter_cm' => normalize_nullable_int($r['pot_diameter_cm'] ?? null),
            'status' => normalize_nullable_string($r['status'] ?? null),
            'common_name' => normalize_nullable_string($r['common_name'] ?? null),
            'scientific_name' => normalize_nullable_string($r['scientific_name'] ?? null),
        ];
    }

    return $out;
}

/**
 * Dettaglio completo di una pianta utente
 */
function get_my_plant(int $id, int $userId = 1): ?array
{
    $pdo = db();

    $sql = "
        SELECT
            up.pkid,
            up.nickname,
            up.image_url,
            up.id_utente,
            up.plant_species_id,
            up.location_id,
            up.indoor_outdoor,
            up.pot_diameter_cm,
            up.purchase_date,
            up.last_repot_date,
            up.status,
            up.user_notes,
            up.last_watered_at,
            up.last_fertilized_at,
            up.last_checked_at,
            up.created_at,
            up.updated_at,

            loc.pkid AS loc_pkid,
            loc.name AS location_name,
            loc.icon AS location_icon,

            ps.id AS species_id,
            ps.common_name,
            ps.scientific_name,
            ps.commercial_name,
            ps.family,
            ps.genus,
            ps.short_description,
            ps.indoor_outdoor AS species_indoor_outdoor,
            ps.light_min,
            ps.light_max,
            ps.temperature_min_c,
            ps.temperature_max_c,
            ps.watering_strategy,
            ps.watering_trigger_note,
            ps.watering_warning_note,
            ps.fertilizing_enabled,
            ps.fertilizing_month_start,
            ps.fertilizing_month_end,
            ps.fertilizing_type_note,
            ps.fertilizing_warning_note,
            ps.health_check_frequency_days,
            ps.common_issue_note,
            ps.seasonal_attention_note,
            ps.main_image_url
        FROM " . MYPLANTS_TABLE . " up
        LEFT JOIN locations loc
            ON loc.pkid = up.location_id
           AND (loc.id_utente = up.id_utente OR loc.id_utente IS NULL)
        LEFT JOIN plant_species ps
            ON ps.id = up.plant_species_id
        WHERE up.pkid = ?
          AND up.id_utente = ?
        LIMIT 1
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$id, $userId]);

    $r = $stmt->fetch();
    if (!$r) return null;

    return [
        'id' => (int)$r['pkid'],
        'nickname' => (string)$r['nickname'],
        'image' => normalize_nullable_string($r['image_url'] ?? null)
            ?? normalize_nullable_string($r['main_image_url'] ?? null),
        'user_id' => (int)$r['id_utente'],
        'plant_species_id' => normalize_nullable_int($r['plant_species_id'] ?? null),
        'location_id' => normalize_nullable_int($r['location_id'] ?? null),
        'indoor_outdoor' => normalize_nullable_string($r['indoor_outdoor'] ?? null),
        'pot_diameter_cm' => normalize_nullable_int($r['pot_diameter_cm'] ?? null),
        'purchase_date' => normalize_nullable_date($r['purchase_date'] ?? null),
        'last_repot_date' => normalize_nullable_date($r['last_repot_date'] ?? null),
        'status' => normalize_nullable_string($r['status'] ?? null),
        'user_notes' => normalize_nullable_string($r['user_notes'] ?? null),
        'last_watered_at' => normalize_nullable_date($r['last_watered_at'] ?? null),
        'last_fertilized_at' => normalize_nullable_date($r['last_fertilized_at'] ?? null),
        'last_checked_at' => normalize_nullable_date($r['last_checked_at'] ?? null),
        'created_at' => normalize_nullable_date($r['created_at'] ?? null),
        'updated_at' => normalize_nullable_date($r['updated_at'] ?? null),

        'location' => $r['loc_pkid'] ? [
            'id' => (int)$r['loc_pkid'],
            'name' => (string)$r['location_name'],
            'icon' => (string)$r['location_icon'],
        ] : null,

        'species' => $r['species_id'] ? [
            'id' => (int)$r['species_id'],
            'common_name' => normalize_nullable_string($r['common_name'] ?? null),
            'scientific_name' => normalize_nullable_string($r['scientific_name'] ?? null),
            'commercial_name' => normalize_nullable_string($r['commercial_name'] ?? null),
            'family' => normalize_nullable_string($r['family'] ?? null),
            'genus' => normalize_nullable_string($r['genus'] ?? null),
            'short_description' => normalize_nullable_string($r['short_description'] ?? null),
            'indoor_outdoor' => normalize_nullable_string($r['species_indoor_outdoor'] ?? null),
            'light_min' => normalize_nullable_int($r['light_min'] ?? null),
            'light_max' => normalize_nullable_int($r['light_max'] ?? null),
            'temperature_min_c' => $r['temperature_min_c'] !== null ? (float)$r['temperature_min_c'] : null,
            'temperature_max_c' => $r['temperature_max_c'] !== null ? (float)$r['temperature_max_c'] : null,
            'watering_strategy' => normalize_nullable_string($r['watering_strategy'] ?? null),
            'watering_trigger_note' => normalize_nullable_string($r['watering_trigger_note'] ?? null),
            'watering_warning_note' => normalize_nullable_string($r['watering_warning_note'] ?? null),
            'fertilizing_enabled' => isset($r['fertilizing_enabled']) ? (bool)$r['fertilizing_enabled'] : null,
            'fertilizing_month_start' => normalize_nullable_int($r['fertilizing_month_start'] ?? null),
            'fertilizing_month_end' => normalize_nullable_int($r['fertilizing_month_end'] ?? null),
            'fertilizing_type_note' => normalize_nullable_string($r['fertilizing_type_note'] ?? null),
            'fertilizing_warning_note' => normalize_nullable_string($r['fertilizing_warning_note'] ?? null),
            'health_check_frequency_days' => normalize_nullable_int($r['health_check_frequency_days'] ?? null),
            'common_issue_note' => normalize_nullable_string($r['common_issue_note'] ?? null),
            'seasonal_attention_note' => normalize_nullable_string($r['seasonal_attention_note'] ?? null),
        ] : null,
    ];
}