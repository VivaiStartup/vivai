<?php
// vivai-api/src/trefle.php

function trefle_token(): string {
  $t = 'usr-5p0q-LOJGu8lceZG3rDaxnuA9lMGKlIOrWVKK7DnJ3U';
  if (!$t) throw new Exception("Missing TREFLE_TOKEN env var");
  return $t;
}

function trefle_get(string $path, array $query = []): array {
  $base = "https://trefle.io/api/v1";
  $query["token"] = trefle_token();
  $url = $base . $path . "?" . http_build_query($query);

  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 15,
  ]);

  $raw = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  $err  = curl_error($ch);
  curl_close($ch);

  if ($raw === false) throw new Exception("Trefle curl error: " . $err);

  $json = json_decode($raw, true);
  if ($code >= 400) {
    throw new Exception("Trefle HTTP $code: " . (is_array($json) ? json_encode($json) : $raw));
  }
  return is_array($json) ? $json : [];
}