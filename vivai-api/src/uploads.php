<?php
// vivai-api/src/uploads.php

function handle_upload_main_image(): array {
  // nome campo file dal frontend: "file"
  if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
    return ['error' => 'Missing file', 'code' => 400];
  }

  $f = $_FILES['file'];
  if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    return ['error' => 'Upload error: ' . ($f['error'] ?? 'unknown'), 'code' => 400];
  }

  // Limite dimensione (es: 5MB)
  $maxBytes = 5 * 1024 * 1024;
  if (($f['size'] ?? 0) > $maxBytes) {
    return ['error' => 'File too large (max 5MB)', 'code' => 413];
  }

  $tmp = $f['tmp_name'] ?? '';
  if (!$tmp || !is_uploaded_file($tmp)) {
    return ['error' => 'Invalid upload', 'code' => 400];
  }

  // Rileva MIME reale (richiede ext fileinfo, spesso già attiva)
  $finfo = finfo_open(FILEINFO_MIME_TYPE);
  $mime = $finfo ? finfo_file($finfo, $tmp) : null;
  if ($finfo) finfo_close($finfo);

  $allowed = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/webp' => 'webp',
  ];
  if (!$mime || !isset($allowed[$mime])) {
    return ['error' => 'Unsupported file type', 'code' => 415];
  }
  $ext = $allowed[$mime];

  // Dove salvare: public/uploads
  $uploadsDir = __DIR__ . '/../public/uploads';
  if (!is_dir($uploadsDir)) {
    // prova a creare
    if (!mkdir($uploadsDir, 0775, true)) {
      return ['error' => 'Uploads dir not found and cannot be created', 'code' => 500];
    }
  }

  // Nome file sicuro
  $name = 'img_' . date('Ymd_His') . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
  $dest = $uploadsDir . DIRECTORY_SEPARATOR . $name;

  if (!move_uploaded_file($tmp, $dest)) {
    return ['error' => 'Failed to move uploaded file', 'code' => 500];
  }

  // URL relativo servito dal PHP built-in (-t public)
  $url = '/uploads/' . $name;

  return [
    'ok' => true,
    'url' => $url,
    'mime' => $mime,
    'size' => (int)($f['size'] ?? 0),
  ];
}