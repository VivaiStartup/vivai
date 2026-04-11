<?php
require_once __DIR__ . '/db.php';

function create_session(int $userId): string {
  $pdo = db();
  $sid = bin2hex(random_bytes(32)); // 64 chars
  $stmt = $pdo->prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY))");
  $stmt->execute([$sid, $userId]);
  return $sid;
}

function set_sid_cookie(string $sid): void {
  $isLocal = (getenv('APP_ENV') ?: 'production') === 'local';

  setcookie('sid', $sid, [
    'expires' => time() + 60*60*24*7,
    'path' => '/',
    'httponly' => true,
    'samesite' => 'Lax',
    'secure' => !$isLocal,
  ]);
}

function find_or_create_user_google(string $sub, ?string $email, ?string $name): int {
  $pdo = db();

  // 1) identity già esistente?
  $stmt = $pdo->prepare("SELECT user_id FROM user_identities WHERE provider='google' AND provider_user_id=? LIMIT 1");
  $stmt->execute([$sub]);
  $row = $stmt->fetch(PDO::FETCH_ASSOC);
  if ($row) return (int)$row['user_id'];

  // 2) se email esiste, prova a linkare user esistente
  $userId = null;
  if ($email) {
    $stmt = $pdo->prepare("SELECT id FROM users WHERE email=? LIMIT 1");
    $stmt->execute([$email]);
    $u = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($u) $userId = (int)$u['id'];
  }

  // 3) altrimenti crea user
  if (!$userId) {
    $stmt = $pdo->prepare("INSERT INTO users (email, name) VALUES (?, ?)");
    $stmt->execute([$email, $name]);
    $userId = (int)$pdo->lastInsertId();
  }

  // 4) crea identity
  $stmt = $pdo->prepare("INSERT INTO user_identities (user_id, provider, provider_user_id, email) VALUES (?, 'google', ?, ?)");
  $stmt->execute([$userId, $sub, $email]);

  return $userId;
}

function auth_me_from_sid(): ?array {
  $sid = $_COOKIE['sid'] ?? null;
  if (!$sid) return null;

  $pdo = db();
  $stmt = $pdo->prepare("
    SELECT u.id, u.email, u.name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id=? AND s.revoked_at IS NULL AND s.expires_at > NOW()
    LIMIT 1
  ");
  $stmt->execute([$sid]);
  $u = $stmt->fetch(PDO::FETCH_ASSOC);
  return $u ?: null;
}

function revoke_sid(): void {
  $sid = $_COOKIE['sid'] ?? null;
  if (!$sid) return;
  $pdo = db();
  $stmt = $pdo->prepare("UPDATE sessions SET revoked_at=NOW() WHERE id=?");
  $stmt->execute([$sid]);
  setcookie('sid', '', ['expires' => time() - 3600, 'path' => '/']);
}