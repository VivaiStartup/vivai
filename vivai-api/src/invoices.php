<?php

declare(strict_types=1);

require_once __DIR__ . '/db.php';

/**
 * =========================================================
 * HELPERS
 * =========================================================
 */

function invoices_pdo(): PDO {
    return db();
}

function invoices_now_iso(): string {
    return date('c');
}

function invoices_storage_dir(): string {
    $dir = __DIR__ . '/../public/uploads/invoices';
    if (!is_dir($dir)) {
        if (!mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException('Impossibile creare cartella uploads/invoices');
        }
    }
    return $dir;
}

function invoices_public_path(string $basename): string {
    return '/uploads/invoices/' . $basename;
}

function invoices_allowed_mime_types(): array {
    return [
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/pdf',
    ];
}

function invoices_detect_mime(string $tmpPath): string {
    $mime = mime_content_type($tmpPath);
    return is_string($mime) && $mime !== '' ? $mime : 'application/octet-stream';
}

function invoices_safe_extension_from_mime(string $mime): string {
    return match ($mime) {
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'application/pdf' => 'pdf',
        default => 'bin',
    };
}

function invoices_random_filename(string $mime): string {
    return 'inv_' . date('Ymd_His') . '_' . bin2hex(random_bytes(6)) . '.' . invoices_safe_extension_from_mime($mime);
}

function invoices_normalize_string(mixed $value): ?string {
    if ($value === null) return null;
    $v = trim((string)$value);
    return $v === '' ? null : $v;
}

function invoices_normalize_float(mixed $value): ?float {
    if ($value === null || $value === '') return null;
    if (is_numeric($value)) return (float)$value;

    $v = trim((string)$value);
    if ($v === '') return null;

    // normalizzazione base formati italiani/europei
    $v = str_replace(["€", "EUR", " "], '', $v);

    // caso 1.234,56 -> 1234.56
    if (preg_match('/^\d{1,3}(\.\d{3})*,\d+$/', $v)) {
        $v = str_replace('.', '', $v);
        $v = str_replace(',', '.', $v);
    } else {
        // caso 1234,56 -> 1234.56
        $v = str_replace(',', '.', $v);
    }

    return is_numeric($v) ? (float)$v : null;
}

function invoices_normalize_date(mixed $value): ?string {
    if ($value === null || $value === '') return null;

    $v = trim((string)$value);
    if ($v === '') return null;

    // già ISO
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) {
        return $v;
    }

    // formato dd/mm/yyyy o dd-mm-yyyy
    if (preg_match('/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/', $v, $m)) {
        return "{$m[3]}-{$m[2]}-{$m[1]}";
    }

    $ts = strtotime($v);
    if ($ts === false) return null;

    return date('Y-m-d', $ts);
}

function invoices_strip_markdown_code_fences(string $text): string {
    $text = trim($text);
    $text = preg_replace('/^\xEF\xBB\xBF/', '', $text);

    if (preg_match('/^```(?:json)?\s*(.*?)\s*```$/is', $text, $m)) {
        return trim($m[1]);
    }

    return $text;
}

function invoices_json_decode_strict(?string $json): array {
    if (!$json) {
        throw new RuntimeException('Risposta vuota da OpenAI');
    }

    $json = invoices_strip_markdown_code_fences($json);

    $decoded = json_decode($json, true);

    if (!is_array($decoded)) {
        throw new RuntimeException('JSON OpenAI non valido: ' . $json);
    }

    return $decoded;
}

function invoices_extract_text_from_responses_payload(array $payload): ?string {
    // prova 1: output_text aggregato
    if (!empty($payload['output_text']) && is_string($payload['output_text'])) {
        return $payload['output_text'];
    }

    // prova 2: scan output/content
    if (!empty($payload['output']) && is_array($payload['output'])) {
        foreach ($payload['output'] as $item) {
            if (!isset($item['content']) || !is_array($item['content'])) continue;
            foreach ($item['content'] as $content) {
                if (($content['type'] ?? null) === 'output_text' && isset($content['text']) && is_string($content['text'])) {
                    return $content['text'];
                }
            }
        }
    }

    return null;
}

function invoices_build_data_url(string $filePath, string $mime): string {
    $bin = file_get_contents($filePath);
    if ($bin === false) {
        throw new RuntimeException('Impossibile leggere file immagine');
    }
    return 'data:' . $mime . ';base64,' . base64_encode($bin);
}

function invoices_is_supported_mime(string $mime): bool {
    return in_array($mime, invoices_allowed_mime_types(), true);
}

function invoices_infer_status(array $normalized): string {
    $hasCore =
        !empty($normalized['invoice_number']) ||
        !empty($normalized['invoice_date']) ||
        !empty($normalized['total_amount']);

    return $hasCore ? 'EXTRACTED' : 'REVIEW_NEEDED';
}

function invoices_normalize_line_items(array $items): array {
    $out = [];

    foreach ($items as $idx => $item) {
        if (!is_array($item)) continue;

        $out[] = [
            'line_no'     => isset($item['line_no']) && is_numeric($item['line_no'])
                ? (int)$item['line_no']
                : ($idx + 1),
            'description' => invoices_normalize_string($item['description'] ?? null),
            'sku'         => invoices_normalize_string($item['sku'] ?? null),
            'quantity'    => invoices_normalize_float($item['quantity'] ?? null),
            'unit'        => invoices_normalize_string($item['unit'] ?? null),
            'unit_price'  => invoices_normalize_float($item['unit_price'] ?? null),
            'vat_rate'    => invoices_normalize_float($item['vat_rate'] ?? null),
            'line_total'  => invoices_normalize_float($item['line_total'] ?? null),
            'notes'       => invoices_normalize_string($item['notes'] ?? null),
        ];
    }

    return $out;
}

function invoices_normalize_openai_result(array $raw, ?string $fallbackFlowType = null): array {
    $flowType = strtoupper((string)($raw['flow_type'] ?? ''));
    if (!in_array($flowType, ['ACQUISTO', 'VENDITA'], true)) {
        $flowType = $fallbackFlowType;
    }

    $normalized = [
        'document_type'   => invoices_normalize_string($raw['document_type'] ?? 'FATTURA'),
        'flow_type'       => $flowType,
        'invoice_number'  => invoices_normalize_string($raw['invoice_number'] ?? null),
        'invoice_date'    => invoices_normalize_date($raw['invoice_date'] ?? null),
        'supplier_name'   => invoices_normalize_string($raw['supplier_name'] ?? null),
        'supplier_vat'    => invoices_normalize_string($raw['supplier_vat'] ?? null),
        'customer_name'   => invoices_normalize_string($raw['customer_name'] ?? null),
        'customer_vat'    => invoices_normalize_string($raw['customer_vat'] ?? null),
        'taxable_amount'  => invoices_normalize_float($raw['taxable_amount'] ?? null),
        'vat_amount'      => invoices_normalize_float($raw['vat_amount'] ?? null),
        'total_amount'    => invoices_normalize_float($raw['total_amount'] ?? null),
        'currency'        => invoices_normalize_string($raw['currency'] ?? 'EUR') ?? 'EUR',
        'notes'           => invoices_normalize_string($raw['notes'] ?? null),
        'line_items'      => invoices_normalize_line_items(
            isset($raw['line_items']) && is_array($raw['line_items']) ? $raw['line_items'] : []
        ),
    ];

    $normalized['extraction_status'] = invoices_infer_status($normalized);

    return $normalized;
}

function invoices_guess_flow_type(array $normalized, ?string $forced = null): ?string {
    if (in_array($forced, ['ACQUISTO', 'VENDITA'], true)) {
        return $forced;
    }

    if (in_array($normalized['flow_type'] ?? null, ['ACQUISTO', 'VENDITA'], true)) {
        return $normalized['flow_type'];
    }

    // default prudente per v1: se non si capisce, acquisto
    return 'ACQUISTO';
}

/**
 * =========================================================
 * OPENAI
 * =========================================================
 */

function invoices_openai_api_key(): string {
    $key = getenv('OPENAI_API_KEY');
    if (!$key) {
        throw new RuntimeException('OPENAI_API_KEY mancante nel .env');
    }
    return $key;
}

function invoices_call_openai_from_image(string $filePath, string $mime, ?string $forcedFlowType = null): array {
    $apiKey = invoices_openai_api_key();
    $imageDataUrl = invoices_build_data_url($filePath, $mime);

    $flowHint = $forcedFlowType ? "Il tipo documento atteso lato gestionale è {$forcedFlowType}." : "Se possibile inferisci se è ACQUISTO o VENDITA.";

    $prompt = <<<TXT
                Analizza il documento fiscale mostrato in immagine e restituisci esclusivamente JSON valido.

                IMPORTANTE:
                - Non usare markdown
                - Non racchiudere la risposta in ```json
                - Non aggiungere testo prima o dopo il JSON

                Campi richiesti:
                - document_type
                - flow_type
                - invoice_number
                - invoice_date
                - supplier_name
                - supplier_vat
                - customer_name
                - customer_vat
                - taxable_amount
                - vat_amount
                - total_amount
                - currency
                - notes
                - line_items

                line_items deve essere un array di oggetti. Ogni oggetto può contenere:
                - line_no
                - description
                - sku
                - quantity
                - unit
                - unit_price
                - vat_rate
                - line_total
                - notes

                Regole:
                - Nessun testo fuori dal JSON
                - Se un campo non è leggibile usa null
                - Gli importi devono essere numeri, non stringhe
                - invoice_date in formato YYYY-MM-DD
                - flow_type può essere solo ACQUISTO, VENDITA o null
                - currency usa EUR se il documento è chiaramente italiano e la valuta non è esplicitata
                - Se non trovi righe articolo, restituisci "line_items": []
                - Le righe devono corrispondere alla tabella del documento, senza inventare articoli
                - Se una descrizione è spezzata su più righe, prova a ricomporla nello stesso item
                - Non trattare subtotali, totale documento, contributi generali o testo di cortesia come articoli, a meno che siano chiaramente righe economiche della tabella

                {$flowHint}
                TXT;

    $payload = [
    'model' => 'gpt-4.1-mini',
    'input' => [
        [
            'role' => 'user',
            'content' => [
                [
                    'type' => 'input_text',
                    'text' => $prompt,
                ],
                [
                    'type' => 'input_image',
                    'image_url' => $imageDataUrl,
                    'detail' => 'high',
                ],
            ],
        ],
    ],
];

    $ch = curl_init('https://api.openai.com/v1/responses');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $apiKey,
        ],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        CURLOPT_TIMEOUT => 90,
    ]);

    $raw = curl_exec($ch);
    $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);

    if ($raw === false) {
        throw new RuntimeException('Errore cURL OpenAI: ' . $curlErr);
    }

    if ($http >= 400) {
        throw new RuntimeException('Errore OpenAI HTTP ' . $http . ': ' . $raw);
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        throw new RuntimeException('Risposta OpenAI non decodificabile');
    }

    $text = invoices_extract_text_from_responses_payload($decoded);
    $json = invoices_json_decode_strict($text);

    return [
        'raw_openai_response' => $decoded,
        'parsed_json' => $json,
    ];
}

/**
 * =========================================================
 * FILE STORAGE
 * =========================================================
 */

function invoices_store_uploaded_file(array $file): array {
    $tmpPath = $file['tmp_name'] ?? null;
    $originalName = $file['name'] ?? 'document';
    $size = isset($file['size']) ? (int)$file['size'] : 0;

    if (!$tmpPath || !is_uploaded_file($tmpPath)) {
        throw new RuntimeException('Upload non valido');
    }

    if ($size <= 0) {
        throw new RuntimeException('File vuoto');
    }

    if ($size > 10 * 1024 * 1024) {
        throw new RuntimeException('File troppo grande: max 10MB');
    }

    $mime = invoices_detect_mime($tmpPath);
    if (!invoices_is_supported_mime($mime)) {
        throw new RuntimeException('Formato non supportato. Usa JPG, PNG, WEBP o PDF');
    }

    $dir = invoices_storage_dir();
    $basename = invoices_random_filename($mime);
    $dest = $dir . DIRECTORY_SEPARATOR . $basename;

    if (!move_uploaded_file($tmpPath, $dest)) {
        throw new RuntimeException('Impossibile salvare il file caricato');
    }

    return [
        'original_filename' => $originalName,
        'stored_filename'   => $basename,
        'stored_abs_path'   => $dest,
        'stored_path'       => invoices_public_path($basename),
        'mime_type'         => $mime,
        'size_bytes'        => $size,
    ];
}

/**
 * =========================================================
 * DB
 * =========================================================
 */

function invoice_items_insert(PDO $pdo, int $invoiceId, array $items): void {
    if (!$items) return;

    $stmt = $pdo->prepare("
        INSERT INTO invoice_items (
            invoice_id,
            line_no,
            description,
            sku,
            quantity,
            unit,
            unit_price,
            vat_rate,
            line_total,
            notes
        ) VALUES (
            :invoice_id,
            :line_no,
            :description,
            :sku,
            :quantity,
            :unit,
            :unit_price,
            :vat_rate,
            :line_total,
            :notes
        )
    ");

    foreach ($items as $item) {
        $stmt->execute([
            ':invoice_id'  => $invoiceId,
            ':line_no'     => $item['line_no'],
            ':description' => $item['description'],
            ':sku'         => $item['sku'],
            ':quantity'    => $item['quantity'],
            ':unit'        => $item['unit'],
            ':unit_price'  => $item['unit_price'],
            ':vat_rate'    => $item['vat_rate'],
            ':line_total'  => $item['line_total'],
            ':notes'       => $item['notes'],
        ]);
    }
}

function invoice_items_list(PDO $pdo, int $invoiceId): array {
    $stmt = $pdo->prepare("
        SELECT
            id,
            invoice_id,
            line_no,
            description,
            sku,
            quantity,
            unit,
            unit_price,
            vat_rate,
            line_total,
            notes
        FROM invoice_items
        WHERE invoice_id = :invoice_id
        ORDER BY line_no ASC, id ASC
    ");
    $stmt->execute([':invoice_id' => $invoiceId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function invoices_insert(PDO $pdo, int $nurseryId, array $doc, array $fileMeta, array $rawPayload = []): int {
    $sql = "
        INSERT INTO invoices (
            nursery_id,
            flow_type,
            document_type,
            invoice_number,
            invoice_date,
            supplier_name,
            supplier_vat,
            customer_name,
            customer_vat,
            taxable_amount,
            vat_amount,
            total_amount,
            currency,
            original_filename,
            stored_path,
            mime_type,
            extraction_status,
            extraction_raw_json,
            notes,
            created_at,
            updated_at
        ) VALUES (
            :nursery_id,
            :flow_type,
            :document_type,
            :invoice_number,
            :invoice_date,
            :supplier_name,
            :supplier_vat,
            :customer_name,
            :customer_vat,
            :taxable_amount,
            :vat_amount,
            :total_amount,
            :currency,
            :original_filename,
            :stored_path,
            :mime_type,
            :extraction_status,
            :extraction_raw_json,
            :notes,
            NOW(),
            NOW()
        )
    ";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':nursery_id'         => $nurseryId,
        ':flow_type'          => $doc['flow_type'],
        ':document_type'      => $doc['document_type'] ?? 'FATTURA',
        ':invoice_number'     => $doc['invoice_number'],
        ':invoice_date'       => $doc['invoice_date'],
        ':supplier_name'      => $doc['supplier_name'],
        ':supplier_vat'       => $doc['supplier_vat'],
        ':customer_name'      => $doc['customer_name'],
        ':customer_vat'       => $doc['customer_vat'],
        ':taxable_amount'     => $doc['taxable_amount'],
        ':vat_amount'         => $doc['vat_amount'],
        ':total_amount'       => $doc['total_amount'],
        ':currency'           => $doc['currency'] ?? 'EUR',
        ':original_filename'  => $fileMeta['original_filename'] ?? null,
        ':stored_path'        => $fileMeta['stored_path'] ?? null,
        ':mime_type'          => $fileMeta['mime_type'] ?? null,
        ':extraction_status'  => $doc['extraction_status'] ?? 'EXTRACTED',
        ':extraction_raw_json'=> json_encode($rawPayload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        ':notes'              => $doc['notes'],
    ]);

    return (int)$pdo->lastInsertId();
}

function invoices_get_by_id(PDO $pdo, int $nurseryId, int $invoiceId): ?array {
    $stmt = $pdo->prepare("
        SELECT *
        FROM invoices
        WHERE id = :id
          AND nursery_id = :nursery_id
        LIMIT 1
    ");
    $stmt->execute([
        ':id' => $invoiceId,
        ':nursery_id' => $nurseryId,
    ]);

    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!is_array($row)) return null;

    $row['items'] = invoice_items_list($pdo, $invoiceId);

    return $row;
}

function list_invoices(int $nurseryId, string $flowType = 'ALL'): array {
    $pdo = invoices_pdo();

    $sql = "
        SELECT
            id,
            nursery_id,
            flow_type,
            document_type,
            invoice_number,
            invoice_date,
            supplier_name,
            supplier_vat,
            customer_name,
            customer_vat,
            taxable_amount,
            vat_amount,
            total_amount,
            currency,
            original_filename,
            stored_path,
            mime_type,
            extraction_status,
            notes,
            created_at,
            updated_at
        FROM invoices
        WHERE nursery_id = :nursery_id
    ";

    $params = [':nursery_id' => $nurseryId];

    if (in_array($flowType, ['ACQUISTO', 'VENDITA'], true)) {
        $sql .= " AND flow_type = :flow_type";
        $params[':flow_type'] = $flowType;
    }

    $sql .= " ORDER BY COALESCE(invoice_date, DATE(created_at)) DESC, id DESC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rows as &$row) {
        $row['items'] = invoice_items_list($pdo, (int)$row['id']);
    }
    unset($row);

    return $rows;
}

/**
 * =========================================================
 * PUBLIC HANDLERS
 * =========================================================
 */

function handle_invoice_extract(int $nurseryId): array {

    set_time_limit(120);

    if (!isset($_FILES['invoice'])) {
        return ['error' => 'File invoice mancante', 'code' => 400];
    }

    $file = $_FILES['invoice'];
    $uploadError = $file['error'] ?? UPLOAD_ERR_NO_FILE;

    if ($uploadError !== UPLOAD_ERR_OK) {
        return ['error' => 'Errore upload file', 'code' => 400];
    }

    try {
        $fileMeta = invoices_store_uploaded_file($file);

        $forcedFlowType = null;
        if (isset($_POST['flow_type'])) {
            $candidate = strtoupper(trim((string)$_POST['flow_type']));
            if (in_array($candidate, ['ACQUISTO', 'VENDITA'], true)) {
                $forcedFlowType = $candidate;
            }
        }

        $mime = $fileMeta['mime_type'];

        // V1: PDF mock controllato
        if ($mime === 'application/pdf') {
            $normalized = [
                            'document_type'      => 'FATTURA',
                            'flow_type'          => $forcedFlowType ?? 'ACQUISTO',
                            'invoice_number'     => null,
                            'invoice_date'       => null,
                            'supplier_name'      => null,
                            'supplier_vat'       => null,
                            'customer_name'      => null,
                            'customer_vat'       => null,
                            'taxable_amount'     => null,
                            'vat_amount'         => null,
                            'total_amount'       => null,
                            'currency'           => 'EUR',
                            'notes'              => 'PDF ricevuto correttamente. Parsing PDF non ancora implementato in questa versione.',
                            'extraction_status'  => 'REVIEW_NEEDED',
                            'line_items'         => [],
                        ];

            $pdo = invoices_pdo();
            $invoiceId = invoices_insert($pdo, $nurseryId, $normalized, $fileMeta, [
                'mode' => 'pdf_mock',
                'uploaded_at' => invoices_now_iso(),
            ]);

            $saved = invoices_get_by_id($pdo, $nurseryId, $invoiceId);

            return [
                'ok' => true,
                'mock' => true,
                'message' => 'PDF caricato e registrato. Parsing PDF ancora da implementare.',
                'invoice' => $saved,
            ];
        }

        $openai = invoices_call_openai_from_image($fileMeta['stored_abs_path'], $mime, $forcedFlowType);
        $normalized = invoices_normalize_openai_result($openai['parsed_json'], $forcedFlowType);
        $normalized['flow_type'] = invoices_guess_flow_type($normalized, $forcedFlowType);

        $pdo = invoices_pdo();
        $pdo->beginTransaction();

        try {
            $invoiceId = invoices_insert($pdo, $nurseryId, $normalized, $fileMeta, [
                'mode' => 'image_openai',
                'uploaded_at' => invoices_now_iso(),
                'openai' => $openai,
            ]);

            invoice_items_insert($pdo, $invoiceId, $normalized['line_items'] ?? []);

            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        $saved = invoices_get_by_id($pdo, $nurseryId, $invoiceId);
        return [
            'ok' => true,
            'mock' => false,
            'message' => 'Fattura elaborata con successo',
            'invoice' => $saved,
        ];

    } catch (Throwable $e) {
        error_log('Invoice extract error: ' . $e->getMessage());

        return [
            'error' => 'Errore estrazione fattura: ' . $e->getMessage(),
            'code' => 500,
        ];
    }
}