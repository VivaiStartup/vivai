<?php
// vivai-api/src/db.php

declare(strict_types=1);

function load_env(string $path): void
{
    static $loaded = false;

    if ($loaded) {
        return;
    }

    if (!file_exists($path)) {
        $loaded = true;
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        $loaded = true;
        return;
    }

    foreach ($lines as $line) {
        $line = trim($line);

        // salta commenti e righe vuote
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }

        // salta righe non valide
        if (!str_contains($line, '=')) {
            continue;
        }

        [$name, $value] = explode('=', $line, 2);

        $name = trim($name);
        $value = trim($value);

        // rimuove eventuali apici o doppi apici
        if (
            (str_starts_with($value, '"') && str_ends_with($value, '"')) ||
            (str_starts_with($value, "'") && str_ends_with($value, "'"))
        ) {
            $value = substr($value, 1, -1);
        }

        // non sovrascrivere se già definita nell'ambiente
        if (getenv($name) === false) {
            putenv("$name=$value");
            $_ENV[$name] = $value;
            $_SERVER[$name] = $value;
        }
    }

    $loaded = true;
}

function env(string $key, mixed $default = null): mixed
{
    $value = getenv($key);

    if ($value === false) {
        return $default;
    }

    return $value;
}

function db(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    // Cerca il file .env nella root del backend: vivai-api/.env
    load_env(dirname(__DIR__) . '/.env');

    $host    = (string) env('DB_HOST', '127.0.0.1');
    $port    = (int) env('DB_PORT', 3306);
    $dbname  = (string) env('DB_NAME', 'vivai');
    $user    = (string) env('DB_USER', 'root');
    $pass    = (string) env('DB_PASS', '');
    $charset = (string) env('DB_CHARSET', 'utf8mb4');

    $appEnv = (string) env('APP_ENV', 'production');

    $dsn = "mysql:host={$host};port={$port};dbname={$dbname};charset={$charset}";

    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];

    try {
        $pdo = new PDO($dsn, $user, $pass, $options);
        return $pdo;
    } catch (PDOException $e) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');

        $response = [
            'error' => 'DB connection failed',
        ];

        // Mostra dettaglio solo in locale/dev
        if ($appEnv !== 'production') {
            $response['detail'] = $e->getMessage();
        }

        echo json_encode($response, JSON_UNESCAPED_UNICODE);
        exit;
    }
}