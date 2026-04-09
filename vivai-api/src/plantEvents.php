<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/myPlants.php';

/**
 * =========================================================
 * ENUM / NORMALIZATION
 * =========================================================
 */

function plant_events_allowed_types(): array
{
    return [
        'WATERED',
        'FERTILIZED',
        'CHECKED',
        'TREATED',
        'PRUNED',
        'REPOTTED',
        'SKIPPED_TASK',
    ];
}

function plant_events_normalize_type(?string $value): ?string
{
    if ($value === null) {
        return null;
    }

    $value = strtoupper(trim($value));
    return in_array($value, plant_events_allowed_types(), true) ? $value : null;
}

function plant_events_normalize_date(?string $value): string
{
    if (!$value) {
        return date('Y-m-d H:i:s');
    }

    $ts = strtotime($value);
    if ($ts === false) {
        return date('Y-m-d H:i:s');
    }

    return date('Y-m-d H:i:s', $ts);
}

/**
 * =========================================================
 * OWNERSHIP
 * =========================================================
 *
 * utenti_piante:
 * - pkid = id pianta utente
 * - id_utente = proprietario
 */
function plant_events_assert_user_owns_plant(int $userId, int $plantId): bool
{
    $pdo = db();

    $sql = "SELECT pkid
            FROM " . MYPLANTS_TABLE . "
            WHERE pkid = ? AND id_utente = ?
            LIMIT 1";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$plantId, $userId]);

    return (bool) $stmt->fetchColumn();
}

/**
 * =========================================================
 * READ
 * =========================================================
 */

function list_events_for_plant(int $userId, int $plantId, array $filters = []): array
{
    if (!plant_events_assert_user_owns_plant($userId, $plantId)) {
        return [];
    }

    $pdo = db();

    $limit = isset($filters['limit']) ? max(1, min(200, (int) $filters['limit'])) : 50;
    $eventType = plant_events_normalize_type($filters['event_type'] ?? null);

    $sql = "
        SELECT
            e.id,
            e.user_id,
            e.user_plant_id,
            e.agenda_task_id,
            e.event_type,
            e.event_date,
            e.product_name,
            e.notes,
            e.created_at,
            p.nickname AS plant_name,
            p.image_url AS plant_image
        FROM plant_events e
        INNER JOIN " . MYPLANTS_TABLE . " p
            ON p.pkid = e.user_plant_id
        WHERE e.user_id = ?
          AND e.user_plant_id = ?
    ";

    $params = [$userId, $plantId];

    if ($eventType !== null) {
        $sql .= " AND e.event_type = ? ";
        $params[] = $eventType;
    }

    $sql .= " ORDER BY e.event_date DESC, e.id DESC LIMIT {$limit} ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    return $stmt->fetchAll();
}

function list_plant_events_for_user(int $userId, array $filters = []): array
{
    $pdo = db();

    $limit = isset($filters['limit']) ? max(1, min(200, (int) $filters['limit'])) : 100;
    $eventType = plant_events_normalize_type($filters['event_type'] ?? null);
    $plantId = isset($filters['plant_id']) ? (int) $filters['plant_id'] : 0;
    $onlyAgenda = isset($filters['only_agenda']) ? (int)$filters['only_agenda'] === 1 : false;

    $sql = "
        SELECT
            e.id,
            e.user_id,
            e.user_plant_id,
            e.agenda_task_id,
            e.event_type,
            e.event_date,
            e.product_name,
            e.notes,
            e.created_at,
            p.nickname AS plant_name,
            p.image_url AS plant_image
        FROM plant_events e
        INNER JOIN " . MYPLANTS_TABLE . " p
            ON p.pkid = e.user_plant_id
        WHERE e.user_id = ?
          AND p.id_utente = ?
    ";

    $params = [$userId, $userId];

    if ($onlyAgenda) {
        $sql .= " AND e.agenda_task_id IS NOT NULL ";
    }

    if ($eventType !== null) {
        $sql .= " AND e.event_type = ? ";
        $params[] = $eventType;
    }

    if ($plantId > 0) {
        $sql .= " AND e.user_plant_id = ? ";
        $params[] = $plantId;
    }

    $sql .= " ORDER BY e.event_date DESC, e.id DESC LIMIT {$limit} ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    return $stmt->fetchAll();
}

function get_last_event_for_plant_by_type(int $plantId, string $eventType): ?array
{
    $pdo = db();

    $eventType = plant_events_normalize_type($eventType);
    if ($eventType === null) {
        return null;
    }

    $stmt = $pdo->prepare("
        SELECT
            id,
            user_id,
            user_plant_id,
            agenda_task_id,
            event_type,
            event_date,
            product_name,
            notes,
            created_at
        FROM plant_events
        WHERE user_plant_id = ?
          AND event_type = ?
        ORDER BY event_date DESC, id DESC
        LIMIT 1
    ");
    $stmt->execute([$plantId, $eventType]);

    $row = $stmt->fetch();
    return $row ?: null;
}

/**
 * =========================================================
 * WRITE
 * =========================================================
 */

function create_plant_event(int $userId, int $plantId, array $body): array
{
    if (!plant_events_assert_user_owns_plant($userId, $plantId)) {
        return [
            'error' => 'Plant not found',
            'code' => 404,
        ];
    }

    $eventType = plant_events_normalize_type($body['event_type'] ?? null);
    if ($eventType === null) {
        return [
            'error' => 'Invalid event_type',
            'code' => 400,
        ];
    }

    $eventDate = plant_events_normalize_date($body['event_date'] ?? null);
    $productName = isset($body['product_name']) ? trim((string) $body['product_name']) : null;
    $notes = isset($body['notes']) ? trim((string) $body['notes']) : null;
    $agendaTaskId = isset($body['agenda_task_id']) ? (int) $body['agenda_task_id'] : null;

    if ($productName === '') {
        $productName = null;
    }

    if ($notes === '') {
        $notes = null;
    }

    $pdo = db();

    $stmt = $pdo->prepare("
        INSERT INTO plant_events
        (
            user_id,
            user_plant_id,
            agenda_task_id,
            event_type,
            event_date,
            product_name,
            notes
        )
        VALUES
        (
            :user_id,
            :user_plant_id,
            :agenda_task_id,
            :event_type,
            :event_date,
            :product_name,
            :notes
        )
    ");

    $stmt->execute([
        ':user_id' => $userId,
        ':user_plant_id' => $plantId,
        ':agenda_task_id' => $agendaTaskId,
        ':event_type' => $eventType,
        ':event_date' => $eventDate,
        ':product_name' => $productName,
        ':notes' => $notes,
    ]);

    $id = (int) $pdo->lastInsertId();

    $read = $pdo->prepare("
        SELECT
            e.id,
            e.user_id,
            e.user_plant_id,
            e.agenda_task_id,
            e.event_type,
            e.event_date,
            e.product_name,
            e.notes,
            e.created_at,
            p.nickname AS plant_name,
            p.image_url AS plant_image
        FROM plant_events e
        INNER JOIN " . MYPLANTS_TABLE . " p
            ON p.pkid = e.user_plant_id
        WHERE e.id = ?
          AND p.id_utente = ?
        LIMIT 1
    ");
    $read->execute([$id, $userId]);

    $row = $read->fetch();

    return [
        'event' => $row ?: [
            'id' => $id,
            'user_id' => $userId,
            'user_plant_id' => $plantId,
            'agenda_task_id' => $agendaTaskId,
            'event_type' => $eventType,
            'event_date' => $eventDate,
            'product_name' => $productName,
            'notes' => $notes,
        ],
    ];
}