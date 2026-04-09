<?php

function weather_http_json(string $url): array
{
    $ch = curl_init($url);

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);

    $raw = curl_exec($ch);
    $err = curl_error($ch);
    $http = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);

    curl_close($ch);

    if ($raw === false) {
        throw new RuntimeException($err ?: 'Weather upstream request failed');
    }

    $data = json_decode($raw, true);

    if (!is_array($data)) {
        throw new RuntimeException('Weather upstream returned invalid JSON');
    }

    if ($http >= 400) {
        $message = $data['reason'] ?? $data['error'] ?? 'Weather upstream error';
        throw new RuntimeException(is_string($message) ? $message : 'Weather upstream error');
    }

    return $data;
}

function weather_label_from_code(?int $code): string
{
    return match ($code) {
        0 => 'Sereno',
        1 => 'Prevalentemente sereno',
        2 => 'Parzialmente nuvoloso',
        3 => 'Coperto',
        45, 48 => 'Nebbia',
        51, 53, 55, 56, 57 => 'Pioviggine',
        61, 63, 65, 66, 67, 80, 81, 82 => 'Pioggia',
        71, 73, 75, 77, 85, 86 => 'Neve',
        95, 96, 99 => 'Temporale',
        default => 'Meteo aggiornato',
    };
}

function get_weather_snapshot(float $lat, float $lon): array
{
    if ($lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
        return [
            'error' => 'Coordinate non valide',
            'code' => 400,
        ];
    }

    $url = 'https://api.open-meteo.com/v1/forecast?' . http_build_query([
        'latitude' => $lat,
        'longitude' => $lon,
        'current' => 'temperature_2m,weather_code,is_day',
        'timezone' => 'auto',
        'forecast_days' => 1,
    ]);

    try {
        $data = weather_http_json($url);
        $current = $data['current'] ?? [];

        $temperature = isset($current['temperature_2m']) ? (float) $current['temperature_2m'] : null;
        $weatherCode = isset($current['weather_code']) ? (int) $current['weather_code'] : null;
        $isDay = array_key_exists('is_day', $current) ? (bool) $current['is_day'] : null;

        return [
            'latitude' => $lat,
            'longitude' => $lon,
            'temperatureC' => $temperature,
            'weatherCode' => $weatherCode,
            'weatherLabel' => weather_label_from_code($weatherCode),
            'isDay' => $isDay,
            'fetchedAtISO' => gmdate('c'),
        ];
    } catch (Throwable $e) {
        return [
            'error' => 'Errore recupero meteo: ' . $e->getMessage(),
            'code' => 502,
        ];
    }
}