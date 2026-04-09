<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/myPlants.php';
require_once __DIR__ . '/plantEvents.php';

/**
 * =========================================================
 * CONFIG
 * =========================================================
 */

function agenda_tasks_table(): string
{
    return 'agenda_tasks';
}

/**
 * Se in utenti_piante la FK verso plant_species
 * ha un nome diverso, cambia solo questa funzione.
 */
function agenda_user_plant_species_fk_column(): string
{
    return 'plant_species_id';
}

/**
 * =========================================================
 * ENUMS / NORMALIZATION
 * =========================================================
 */

function agenda_allowed_task_types(): array
{
    return [
        'CHECK_WATER',
        'FERTILIZE',
        'CHECK_HEALTH',
        'TREAT',
        'PRUNE',
        'REPOT',
        'MANUAL',
    ];
}

function agenda_allowed_statuses(): array
{
    return [
        'TODO',
        'DONE',
        'SKIPPED',
        'SNOOZED',
    ];
}

function agenda_normalize_task_type(?string $value): ?string
{
    if ($value === null) {
        return null;
    }

    $value = strtoupper(trim($value));
    return in_array($value, agenda_allowed_task_types(), true) ? $value : null;
}

function agenda_normalize_status(?string $value): ?string
{
    if ($value === null) {
        return null;
    }

    $value = strtoupper(trim($value));
    return in_array($value, agenda_allowed_statuses(), true) ? $value : null;
}

function agenda_now_sql(): string
{
    return date('Y-m-d H:i:s');
}

function agenda_days_between(string $fromDate, ?string $toDate = null): int
{
    $fromTs = strtotime($fromDate);
    $toTs = strtotime($toDate ?? agenda_now_sql());

    if ($fromTs === false || $toTs === false) {
        return 0;
    }

    return (int) floor(($toTs - $fromTs) / 86400);
}

function agenda_date_plus_days(string $fromDate, int $days): string
{
    $ts = strtotime($fromDate);
    if ($ts === false) {
        $ts = time();
    }

    return date('Y-m-d H:i:s', strtotime("+{$days} days", $ts));
}

function agenda_month_in_window(int $month, ?int $startMonth, ?int $endMonth): bool
{
    if (!$startMonth || !$endMonth) {
        return false;
    }

    if ($startMonth <= $endMonth) {
        return $month >= $startMonth && $month <= $endMonth;
    }

    // finestra che attraversa fine anno, es. 10 -> 3
    return $month >= $startMonth || $month <= $endMonth;
}

function agenda_is_species_dormant(array $species, int $month): bool
{
    return agenda_month_in_window(
        $month,
        isset($species['dormancy_month_start']) ? (int) $species['dormancy_month_start'] : null,
        isset($species['dormancy_month_end']) ? (int) $species['dormancy_month_end'] : null
    );
}

/**
 * =========================================================
 * READ PLANTS + SPECIES DEFAULTS
 * =========================================================
 */

function agenda_list_user_plants_with_species(int $userId): array
{
    $pdo = db();

    $speciesFk = agenda_user_plant_species_fk_column();

    $sql = "
        SELECT
            up.pkid AS user_plant_id,
            up.id_utente AS user_id,
            up.nickname AS plant_name,
            up.image_url AS plant_image,
            up.`{$speciesFk}` AS plant_species_id,

            ps.id AS species_id,
            ps.common_name,
            ps.scientific_name,

            ps.watering_strategy,
            ps.watering_days_min,
            ps.watering_days_max,
            ps.watering_days_min_dormant,
            ps.watering_days_max_dormant,
            ps.watering_check_frequency_days,
            ps.watering_trigger_note,
            ps.watering_warning_note,

            ps.fertilizing_enabled,
            ps.fertilizing_month_start,
            ps.fertilizing_month_end,
            ps.fertilizing_days_min,
            ps.fertilizing_days_max,
            ps.fertilizing_type_note,
            ps.fertilizing_warning_note,

            ps.health_check_frequency_days,
            ps.common_issue_note,
            ps.seasonal_attention_note,

            ps.growth_month_start,
            ps.growth_month_end,
            ps.dormancy_month_start,
            ps.dormancy_month_end

        FROM " . MYPLANTS_TABLE . " up
        LEFT JOIN plant_species ps
            ON ps.id = up.`{$speciesFk}`
        WHERE up.id_utente = ?
        ORDER BY up.pkid DESC
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$userId]);

    return $stmt->fetchAll();
}

/**
 * =========================================================
 * TASK EXISTS / FETCH
 * =========================================================
 */

function agenda_find_open_task(
    int $userId,
    int $plantId,
    string $taskType,
    string $sourceType = 'SPECIES_DEFAULT',
    ?int $sourceRuleId = null
): ?array {
    $pdo = db();

    $sql = "
        SELECT *
        FROM " . agenda_tasks_table() . "
        WHERE user_id = ?
          AND user_plant_id = ?
          AND task_type = ?
          AND source_type = ?
          AND (
            (source_rule_id IS NULL AND ? IS NULL)
            OR source_rule_id = ?
          )
          AND status IN ('TODO', 'SNOOZED')
        ORDER BY id DESC
        LIMIT 1
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        $userId,
        $plantId,
        $taskType,
        $sourceType,
        $sourceRuleId,
        $sourceRuleId,
    ]);

    $row = $stmt->fetch();
    return $row ?: null;
}

function agenda_get_task_for_user(int $userId, int $taskId): ?array
{
    $pdo = db();

    $sql = "
        SELECT
            t.*,
            p.nickname AS plant_name,
            p.image_url AS plant_image
        FROM " . agenda_tasks_table() . " t
        INNER JOIN " . MYPLANTS_TABLE . " p
            ON p.pkid = t.user_plant_id
        WHERE t.id = ?
          AND t.user_id = ?
          AND p.id_utente = ?
        LIMIT 1
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$taskId, $userId, $userId]);

    $row = $stmt->fetch();
    return $row ?: null;
}

/**
 * =========================================================
 * TASK INSERT
 * =========================================================
 */

function agenda_create_task(array $payload): int
{
    $pdo = db();

    $stmt = $pdo->prepare("
        INSERT INTO " . agenda_tasks_table() . "
        (
            user_id,
            user_plant_id,
            plant_species_id,
            task_type,
            title,
            reason,
            status,
            priority_level,
            due_date,
            snoozed_until,
            source_type,
            source_rule_id,
            completed_event_id
        )
        VALUES
        (
            :user_id,
            :user_plant_id,
            :plant_species_id,
            :task_type,
            :title,
            :reason,
            :status,
            :priority_level,
            :due_date,
            :snoozed_until,
            :source_type,
            :source_rule_id,
            :completed_event_id
        )
    ");

    $stmt->execute([
        ':user_id' => $payload['user_id'],
        ':user_plant_id' => $payload['user_plant_id'],
        ':plant_species_id' => $payload['plant_species_id'] ?? null,
        ':task_type' => $payload['task_type'],
        ':title' => $payload['title'],
        ':reason' => $payload['reason'] ?? null,
        ':status' => $payload['status'] ?? 'TODO',
        ':priority_level' => $payload['priority_level'] ?? 3,
        ':due_date' => $payload['due_date'] ?? agenda_now_sql(),
        ':snoozed_until' => $payload['snoozed_until'] ?? null,
        ':source_type' => $payload['source_type'] ?? 'SPECIES_DEFAULT',
        ':source_rule_id' => $payload['source_rule_id'] ?? null,
        ':completed_event_id' => $payload['completed_event_id'] ?? null,
    ]);

    return (int) $pdo->lastInsertId();
}

/**
 * =========================================================
 * REASONS / MAPPERS
 * =========================================================
 */

function agenda_reason_for_water(array $plant, ?array $lastWatered): string
{
    if ($lastWatered) {
        $days = agenda_days_between($lastWatered['event_date']);
        return "Ultima annaffiatura {$days} giorni fa.";
    }

    if (!empty($plant['watering_trigger_note'])) {
        return (string) $plant['watering_trigger_note'];
    }

    return "È il momento di controllare il terriccio.";
}

function agenda_reason_for_fertilize(array $plant, ?array $lastFertilized): string
{
    if ($lastFertilized) {
        $days = agenda_days_between($lastFertilized['event_date']);
        return "Ultima concimazione {$days} giorni fa.";
    }

    return "Periodo di concimazione attivo e nessuna concimazione recente registrata.";
}

function agenda_reason_for_health_check(array $plant, ?array $lastChecked): string
{
    if ($lastChecked) {
        $days = agenda_days_between($lastChecked['event_date']);
        return "Ultimo controllo {$days} giorni fa.";
    }

    if (!empty($plant['seasonal_attention_note'])) {
        return (string) $plant['seasonal_attention_note'];
    }

    return "Controllo periodico della pianta consigliato.";
}

function agenda_default_resolution_for_task(string $taskType): ?string
{
    return match ($taskType) {
        'CHECK_WATER' => 'WATERED',
        'FERTILIZE' => 'FERTILIZED',
        'CHECK_HEALTH' => 'CHECKED',
        'TREAT' => 'TREATED',
        'PRUNE' => 'PRUNED',
        'REPOT' => 'REPOTTED',
        default => null,
    };
}

/**
 * =========================================================
 * GENERATION LOGIC
 * =========================================================
 */

function generate_agenda_tasks_for_user(int $userId, int $periodDays = 7, array $context = []): array
{
    $periodDays = agenda_normalize_period_days($periodDays);
    $plants = agenda_list_user_plants_with_species($userId);

    $created = 0;
    $skipped = 0;
    $details = [];

    $today = agenda_now_sql();
    $currentMonth = (int)date('n');

    foreach ($plants as $plant) {
        $plantId = (int)($plant['user_plant_id'] ?? 0);
        $speciesId = isset($plant['species_id']) ? (int)$plant['species_id'] : 0;
        $plantName = (string)($plant['plant_name'] ?? 'Pianta');

        if ($plantId <= 0 || $speciesId <= 0) {
            $details[] = [
                'plant_id' => $plantId,
                'plant_name' => $plantName,
                'created' => 0,
                'skipped' => 0,
                'note' => 'Pianta senza specie collegata: nessuna generazione automatica.',
            ];
            continue;
        }

        $plantCreated = 0;
        $plantSkipped = 0;

        /**
         * -------------------------------------------------
         * 1) CHECK_WATER
         * -------------------------------------------------
         */
        $waterFreq = agenda_effective_watering_frequency_days($plant, $currentMonth, $context);

        if ($waterFreq > 0) {
            $lastWatered = get_last_event_for_plant_by_type($plantId, 'WATERED');
            $startDate = $lastWatered
                ? agenda_date_plus_days($lastWatered['event_date'], $waterFreq)
                : $today;

            $occurrences = agenda_build_occurrences($startDate, $waterFreq, $periodDays);

            foreach ($occurrences as $dueDate) {
                if (agenda_task_exists_for_due_date($userId, $plantId, 'CHECK_WATER', $dueDate)) {
                    $plantSkipped++;
                    $skipped++;
                    continue;
                }

                agenda_create_task([
                    'user_id' => $userId,
                    'user_plant_id' => $plantId,
                    'plant_species_id' => $speciesId,
                    'task_type' => 'CHECK_WATER',
                    'title' => 'Controlla il terriccio',
                    'reason' => !empty($plant['watering_trigger_note'])
                        ? (string)$plant['watering_trigger_note']
                        : 'Controllo programmato in base alla specie, stagione e condizioni della pianta.',
                    'status' => 'TODO',
                    'priority_level' => 2,
                    'due_date' => $dueDate,
                    'source_type' => 'SPECIES_DEFAULT',
                ]);

                $plantCreated++;
                $created++;
            }
        }

        /**
         * -------------------------------------------------
         * 2) FERTILIZE
         * -------------------------------------------------
         */
        if ((int)($plant['fertilizing_enabled'] ?? 0) === 1) {
            $fertFreq = (int)($plant['fertilizing_days_min'] ?: 0);

            if ($fertFreq > 0) {
                $lastFertilized = get_last_event_for_plant_by_type($plantId, 'FERTILIZED');
                $startDate = $lastFertilized
                    ? agenda_date_plus_days($lastFertilized['event_date'], $fertFreq)
                    : $today;

                $occurrences = agenda_build_occurrences($startDate, $fertFreq, $periodDays);

                foreach ($occurrences as $dueDate) {
                    $month = (int)date('n', strtotime($dueDate));

                    if (!agenda_month_in_window(
                        $month,
                        isset($plant['fertilizing_month_start']) ? (int)$plant['fertilizing_month_start'] : null,
                        isset($plant['fertilizing_month_end']) ? (int)$plant['fertilizing_month_end'] : null
                    )) {
                        continue;
                    }

                    if (agenda_task_exists_for_due_date($userId, $plantId, 'FERTILIZE', $dueDate)) {
                        $plantSkipped++;
                        $skipped++;
                        continue;
                    }

                    $reason = 'Finestra di concimazione attiva per la specie.';
                    if (!empty($plant['fertilizing_type_note'])) {
                        $reason .= ' Tipo consigliato: ' . $plant['fertilizing_type_note'] . '.';
                    }

                    agenda_create_task([
                        'user_id' => $userId,
                        'user_plant_id' => $plantId,
                        'plant_species_id' => $speciesId,
                        'task_type' => 'FERTILIZE',
                        'title' => 'Concima',
                        'reason' => $reason,
                        'status' => 'TODO',
                        'priority_level' => 3,
                        'due_date' => $dueDate,
                        'source_type' => 'SPECIES_DEFAULT',
                    ]);

                    $plantCreated++;
                    $created++;
                }
            }
        }

        /**
         * -------------------------------------------------
         * 3) CHECK_HEALTH
         * -------------------------------------------------
         */
        $healthFreq = (int)($plant['health_check_frequency_days'] ?: 0);

        if ($healthFreq > 0) {
            $lastChecked = get_last_event_for_plant_by_type($plantId, 'CHECKED');
            $startDate = $lastChecked
                ? agenda_date_plus_days($lastChecked['event_date'], $healthFreq)
                : $today;

            $occurrences = agenda_build_occurrences($startDate, $healthFreq, $periodDays);

            foreach ($occurrences as $dueDate) {
                if (agenda_task_exists_for_due_date($userId, $plantId, 'CHECK_HEALTH', $dueDate)) {
                    $plantSkipped++;
                    $skipped++;
                    continue;
                }

                $reason = !empty($plant['seasonal_attention_note'])
                    ? (string)$plant['seasonal_attention_note']
                    : 'Controllo periodico di foglie, vigore e stato generale.';

                agenda_create_task([
                    'user_id' => $userId,
                    'user_plant_id' => $plantId,
                    'plant_species_id' => $speciesId,
                    'task_type' => 'CHECK_HEALTH',
                    'title' => 'Controlla foglie e stato generale',
                    'reason' => $reason,
                    'status' => 'TODO',
                    'priority_level' => 3,
                    'due_date' => $dueDate,
                    'source_type' => 'SPECIES_DEFAULT',
                ]);

                $plantCreated++;
                $created++;
            }
        }

        $details[] = [
            'plant_id' => $plantId,
            'plant_name' => $plantName,
            'created' => $plantCreated,
            'skipped' => $plantSkipped,
        ];
    }

    return [
        'period_days' => $periodDays,
        'created' => $created,
        'skipped' => $skipped,
        'details' => $details,
    ];
}

function agenda_maybe_create_water_task(int $userId, array $plant, int $currentMonth): void
{
    $plantId = (int) $plant['user_plant_id'];
    $speciesId = isset($plant['species_id']) ? (int) $plant['species_id'] : null;

    if (!$plantId || !$speciesId) {
        return;
    }

    if (agenda_find_open_task($userId, $plantId, 'CHECK_WATER')) {
        return;
    }

    $isDormant = agenda_is_species_dormant($plant, $currentMonth);

    $frequencyDays = $isDormant
        ? (int) ($plant['watering_days_min_dormant'] ?: 0)
        : (int) ($plant['watering_check_frequency_days'] ?: 0);

    if ($frequencyDays <= 0) {
        $frequencyDays = $isDormant
            ? (int) ($plant['watering_days_min_dormant'] ?: 0)
            : (int) ($plant['watering_days_min'] ?: 0);
    }

    if ($frequencyDays <= 0) {
        return;
    }

    $lastWatered = get_last_event_for_plant_by_type($plantId, 'WATERED');

    $isDue = false;
    $dueDate = agenda_now_sql();

    if ($lastWatered) {
        $nextDue = agenda_date_plus_days($lastWatered['event_date'], $frequencyDays);
        $dueDate = $nextDue;
        $isDue = strtotime($nextDue) <= time();
    } else {
        $isDue = true;
    }

    if (!$isDue) {
        return;
    }

    agenda_create_task([
        'user_id' => $userId,
        'user_plant_id' => $plantId,
        'plant_species_id' => $speciesId,
        'task_type' => 'CHECK_WATER',
        'title' => 'Controlla il terriccio',
        'reason' => agenda_reason_for_water($plant, $lastWatered),
        'status' => 'TODO',
        'priority_level' => 2,
        'due_date' => $dueDate,
        'source_type' => 'SPECIES_DEFAULT',
    ]);
}

function agenda_maybe_create_fertilize_task(int $userId, array $plant, int $currentMonth): void
{
    $plantId = (int) $plant['user_plant_id'];
    $speciesId = isset($plant['species_id']) ? (int) $plant['species_id'] : null;

    if (!$plantId || !$speciesId) {
        return;
    }

    if ((int) ($plant['fertilizing_enabled'] ?? 0) !== 1) {
        return;
    }

    if (!agenda_month_in_window(
        $currentMonth,
        isset($plant['fertilizing_month_start']) ? (int) $plant['fertilizing_month_start'] : null,
        isset($plant['fertilizing_month_end']) ? (int) $plant['fertilizing_month_end'] : null
    )) {
        return;
    }

    if (agenda_find_open_task($userId, $plantId, 'FERTILIZE')) {
        return;
    }

    $frequencyDays = (int) ($plant['fertilizing_days_min'] ?: 0);
    if ($frequencyDays <= 0) {
        return;
    }

    $lastFertilized = get_last_event_for_plant_by_type($plantId, 'FERTILIZED');

    $isDue = false;
    $dueDate = agenda_now_sql();

    if ($lastFertilized) {
        $nextDue = agenda_date_plus_days($lastFertilized['event_date'], $frequencyDays);
        $dueDate = $nextDue;
        $isDue = strtotime($nextDue) <= time();
    } else {
        $isDue = true;
    }

    if (!$isDue) {
        return;
    }

    agenda_create_task([
        'user_id' => $userId,
        'user_plant_id' => $plantId,
        'plant_species_id' => $speciesId,
        'task_type' => 'FERTILIZE',
        'title' => 'Concima',
        'reason' => agenda_reason_for_fertilize($plant, $lastFertilized),
        'status' => 'TODO',
        'priority_level' => 3,
        'due_date' => $dueDate,
        'source_type' => 'SPECIES_DEFAULT',
    ]);
}

function agenda_maybe_create_health_check_task(int $userId, array $plant): void
{
    $plantId = (int) $plant['user_plant_id'];
    $speciesId = isset($plant['species_id']) ? (int) $plant['species_id'] : null;

    if (!$plantId || !$speciesId) {
        return;
    }

    if (agenda_find_open_task($userId, $plantId, 'CHECK_HEALTH')) {
        return;
    }

    $frequencyDays = (int) ($plant['health_check_frequency_days'] ?: 0);
    if ($frequencyDays <= 0) {
        return;
    }

    $lastChecked = get_last_event_for_plant_by_type($plantId, 'CHECKED');

    $isDue = false;
    $dueDate = agenda_now_sql();

    if ($lastChecked) {
        $nextDue = agenda_date_plus_days($lastChecked['event_date'], $frequencyDays);
        $dueDate = $nextDue;
        $isDue = strtotime($nextDue) <= time();
    } else {
        $isDue = true;
    }

    if (!$isDue) {
        return;
    }

    agenda_create_task([
        'user_id' => $userId,
        'user_plant_id' => $plantId,
        'plant_species_id' => $speciesId,
        'task_type' => 'CHECK_HEALTH',
        'title' => 'Controlla foglie e stato generale',
        'reason' => agenda_reason_for_health_check($plant, $lastChecked),
        'status' => 'TODO',
        'priority_level' => 3,
        'due_date' => $dueDate,
        'source_type' => 'SPECIES_DEFAULT',
    ]);
}

function ensure_agenda_tasks_for_user(int $userId): void
{
    $plants = agenda_list_user_plants_with_species($userId);
    $currentMonth = (int) date('n');

    foreach ($plants as $plant) {
        // senza species collegata, niente agenda automatica
        if (empty($plant['species_id'])) {
            continue;
        }

        agenda_maybe_create_water_task($userId, $plant, $currentMonth);
        agenda_maybe_create_fertilize_task($userId, $plant, $currentMonth);
        agenda_maybe_create_health_check_task($userId, $plant);
    }
}

/**
 * =========================================================
 * LIST
 * =========================================================
 */

function list_agenda_tasks_for_user(int $userId, array $filters = []): array
{
    ensure_agenda_tasks_for_user($userId);

    $pdo = db();
    $limit = isset($filters['limit']) ? max(1, min(200, (int) $filters['limit'])) : 100;
    $status = agenda_normalize_status($filters['status'] ?? null);
    $plantId = isset($filters['plant_id']) ? (int) $filters['plant_id'] : 0;
    $scope = isset($filters['scope']) ? strtolower(trim((string) $filters['scope'])) : 'open';

    $sql = "
        SELECT
            t.id,
            t.user_id,
            t.user_plant_id,
            t.plant_species_id,
            t.task_type,
            t.title,
            t.reason,
            t.status,
            t.priority_level,
            t.due_date,
            t.snoozed_until,
            t.source_type,
            t.source_rule_id,
            t.completed_event_id,
            t.created_at,
            t.updated_at,
            p.nickname AS plant_name,
            p.image_url AS plant_image
        FROM " . agenda_tasks_table() . " t
        INNER JOIN " . MYPLANTS_TABLE . " p
            ON p.pkid = t.user_plant_id
        WHERE t.user_id = ?
          AND p.id_utente = ?
    ";

    $params = [$userId, $userId];

    if ($status !== null) {
        $sql .= " AND t.status = ? ";
        $params[] = $status;
    } else {
        if ($scope === 'history') {
            $sql .= " AND t.status IN ('DONE', 'SKIPPED') ";
        } else {
            $sql .= " AND t.status IN ('TODO', 'SNOOZED') ";
        }
    }

    if ($plantId > 0) {
        $sql .= " AND t.user_plant_id = ? ";
        $params[] = $plantId;
    }

    if ($scope === 'today') {
        $sql .= " AND DATE(COALESCE(t.snoozed_until, t.due_date)) <= CURDATE() ";
    } elseif ($scope === 'week') {
        $sql .= " AND DATE(COALESCE(t.snoozed_until, t.due_date)) <= DATE_ADD(CURDATE(), INTERVAL 7 DAY) ";
    }

    $sql .= "
        ORDER BY
            CASE t.status
                WHEN 'TODO' THEN 1
                WHEN 'SNOOZED' THEN 2
                WHEN 'DONE' THEN 3
                WHEN 'SKIPPED' THEN 4
                ELSE 9
            END,
            t.priority_level ASC,
            COALESCE(t.snoozed_until, t.due_date) ASC,
            t.id DESC
        LIMIT {$limit}
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    return $stmt->fetchAll();
}

/**
 * =========================================================
 * ACTIONS
 * =========================================================
 */

function complete_agenda_task(int $userId, int $taskId, array $body): array
{
    $task = agenda_get_task_for_user($userId, $taskId);
    if (!$task) {
        return ['error' => 'Task not found', 'code' => 404];
    }

    if ($task['status'] === 'DONE') {
        return ['task' => $task];
    }

    $taskType = (string) $task['task_type'];
    $resolution = plant_events_normalize_type($body['resolution'] ?? null);

    if ($resolution === null) {
        $resolution = agenda_default_resolution_for_task($taskType);
    }

    if ($resolution === null) {
        return ['error' => 'Invalid resolution', 'code' => 400];
    }

    $eventBody = [
        'event_type' => $resolution,
        'event_date' => $body['event_date'] ?? agenda_now_sql(),
        'product_name' => $body['product_name'] ?? null,
        'notes' => $body['notes'] ?? null,
        'agenda_task_id' => $taskId,
    ];

    $eventRes = create_plant_event($userId, (int) $task['user_plant_id'], $eventBody);
    if (isset($eventRes['error'])) {
        return $eventRes;
    }

    $eventId = (int) ($eventRes['event']['id'] ?? 0);

    $pdo = db();
    $stmt = $pdo->prepare("
        UPDATE " . agenda_tasks_table() . "
        SET
            status = 'DONE',
            completed_event_id = ?,
            snoozed_until = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND user_id = ?
        LIMIT 1
    ");
    $stmt->execute([$eventId ?: null, $taskId, $userId]);

    $updated = agenda_get_task_for_user($userId, $taskId);

    return [
        'task' => $updated,
        'event' => $eventRes['event'] ?? null,
    ];
}

function skip_agenda_task(int $userId, int $taskId, array $body = []): array
{
    $task = agenda_get_task_for_user($userId, $taskId);
    if (!$task) {
        return ['error' => 'Task not found', 'code' => 404];
    }

    $pdo = db();
    $stmt = $pdo->prepare("
        UPDATE " . agenda_tasks_table() . "
        SET
            status = 'SKIPPED',
            snoozed_until = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND user_id = ?
        LIMIT 1
    ");
    $stmt->execute([$taskId, $userId]);

    $updated = agenda_get_task_for_user($userId, $taskId);

    return [
        'task' => $updated,
    ];
}

function agenda_normalize_period_days($value): int
{
    $value = (int) $value;
    return in_array($value, [7, 30, 90], true) ? $value : 7;
}

function agenda_effective_watering_frequency_days(array $plant, int $currentMonth, array $context = []): int
{
    $isDormant = agenda_is_species_dormant($plant, $currentMonth);

    $base = 0;

    if ($isDormant) {
        $base = (int)($plant['watering_days_min_dormant'] ?: 0);
    }

    if ($base <= 0) {
        $base = (int)($plant['watering_check_frequency_days'] ?: 0);
    }

    if ($base <= 0) {
        $base = (int)($plant['watering_days_min'] ?: 0);
    }

    if ($base <= 0) {
        return 0;
    }

    $indoorOutdoor = strtoupper((string)($plant['indoor_outdoor'] ?? ''));

    // Correttivo leggero basato sul meteo solo per task acqua
    // e solo se la pianta è outdoor.
    if ($indoorOutdoor === 'OUTDOOR') {
        $temp = isset($context['current_temperature_c']) ? (float)$context['current_temperature_c'] : null;
        $humidity = isset($context['current_humidity']) ? (int)$context['current_humidity'] : null;
        $weatherCode = isset($context['weather_code']) ? (int)$context['weather_code'] : null;

        // caldo secco = anticipa un po'
        if ($temp !== null && $temp >= 28 && $humidity !== null && $humidity <= 40) {
            $base -= 1;
        }

        // pioggia / fresco umido = ritarda un po'
        if (($weatherCode !== null && in_array($weatherCode, [61, 63, 65, 80, 81, 82], true))
            || ($temp !== null && $temp <= 12 && $humidity !== null && $humidity >= 75)
        ) {
            $base += 1;
        }
    }

    // piccola correzione per vasi molto piccoli
    $pot = isset($plant['pot_diameter_cm']) ? (int)$plant['pot_diameter_cm'] : 0;
    if ($pot > 0 && $pot <= 14) {
        $base -= 1;
    }

    return max(1, $base);
}

function agenda_task_exists_for_due_date(
    int $userId,
    int $plantId,
    string $taskType,
    string $dueDate,
    string $sourceType = 'SPECIES_DEFAULT',
    ?int $sourceRuleId = null
): bool {
    $pdo = db();

    $sql = "
        SELECT id
        FROM " . agenda_tasks_table() . "
        WHERE user_id = ?
          AND user_plant_id = ?
          AND task_type = ?
          AND source_type = ?
          AND (
            (source_rule_id IS NULL AND ? IS NULL)
            OR source_rule_id = ?
          )
          AND DATE(due_date) = DATE(?)
        LIMIT 1
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        $userId,
        $plantId,
        $taskType,
        $sourceType,
        $sourceRuleId,
        $sourceRuleId,
        $dueDate,
    ]);

    return (bool)$stmt->fetchColumn();
}

function agenda_build_occurrences(
    string $startDate,
    int $frequencyDays,
    int $periodDays
): array {
    $dates = [];

    if ($frequencyDays <= 0) {
        return $dates;
    }

    $cursor = strtotime($startDate);
    $endTs = strtotime("+{$periodDays} days");

    if ($cursor === false || $endTs === false) {
        return $dates;
    }

    while ($cursor <= $endTs) {
        $dates[] = date('Y-m-d H:i:s', $cursor);
        $cursor = strtotime("+{$frequencyDays} days", $cursor);
        if ($cursor === false) {
            break;
        }
    }

    return $dates;
}

function agenda_month_label_it(int $month): string
{
    $labels = [
        1 => 'gennaio',
        2 => 'febbraio',
        3 => 'marzo',
        4 => 'aprile',
        5 => 'maggio',
        6 => 'giugno',
        7 => 'luglio',
        8 => 'agosto',
        9 => 'settembre',
        10 => 'ottobre',
        11 => 'novembre',
        12 => 'dicembre',
    ];

    return $labels[$month] ?? (string)$month;
}

function snooze_agenda_task(int $userId, int $taskId, array $body = []): array
{
    $task = agenda_get_task_for_user($userId, $taskId);
    if (!$task) {
        return ['error' => 'Task not found', 'code' => 404];
    }

    $days = isset($body['days']) ? max(1, min(30, (int) $body['days'])) : 2;
    $snoozedUntil = date('Y-m-d H:i:s', strtotime("+{$days} days"));

    $pdo = db();
    $stmt = $pdo->prepare("
        UPDATE " . agenda_tasks_table() . "
        SET
            status = 'SNOOZED',
            snoozed_until = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND user_id = ?
        LIMIT 1
    ");
    $stmt->execute([$snoozedUntil, $taskId, $userId]);

    $updated = agenda_get_task_for_user($userId, $taskId);

    return [
        'task' => $updated,
    ];
}