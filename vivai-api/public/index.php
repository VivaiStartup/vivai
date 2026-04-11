<?php
// vivai-api/public/index.php
$sessionPath = __DIR__ . '/sessions';
if (!is_dir($sessionPath)) {
    mkdir($sessionPath, 0775, true);
}
ini_set('session.save_path', $sessionPath);

session_set_cookie_params([
  'lifetime' => 0,
  'path' => '/',
  'httponly' => true,
  'samesite' => 'Lax',
  'secure' => false, // locale http
]);




session_start();
require_once __DIR__ . '/../src/myPlants.php';




// mette questo *prima* di usare getenv()
$envPath = __DIR__ . '/../.env';
if (file_exists($envPath)) {
  foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
    if (str_starts_with(trim($line), '#')) continue;
    [$k, $v] = array_pad(explode('=', $line, 2), 2, '');
    $k = trim($k);
    $v = trim($v);
    if ($k !== '' && getenv($k) === false) {
      putenv("$k=$v");
      $_ENV[$k] = $v;
    }
  }
}

$appEnv = getenv('APP_ENV') ?: 'production';
$isLocal = ($appEnv === 'local');

session_set_cookie_params([
  'lifetime' => 0,
  'path' => '/',
  'httponly' => true,
  'samesite' => 'Lax',
  'secure' => !$isLocal,
]);

$frontendUrl = $isLocal
    ? 'http://localhost:40001'
    : 'https://viv-ai.it';

$apiCallbackUrl = $isLocal
    ? 'http://localhost:8000/api/auth/google/callback'
    : 'https://viv-ai.it/api/auth/google/callback';

// ===== DEV CORS (opzionale) =====
// Se poi userai un proxy dal frontend, puoi togliere tutto questo blocco.
$allowedOrigin  = $frontendUrl;// cambia se il tuo frontend gira su altra porta (es. 5173)
header("Access-Control-Allow-Origin: {$allowedOrigin}");
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, PATCH, PUT, DELETE, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}


// ===============================

ini_set('display_errors', $isLocal ? '1' : '0');
error_reporting(E_ALL);


function json_ok($data, int $code = 200): void {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function json_error(string $message, int $code): void {
    header('Content-Type: application/json; charset=utf-8');
    http_response_code($code);
    echo json_encode(['error' => $message], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

// in alto: helper per leggere JSON
function read_json_body(): array {
  $raw = file_get_contents('php://input');
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';

// Normalizza: se chiami /api/..., togli /api
$path = preg_replace('#^/api#', '', $path);

// Per ora user fisso (v1). Dopo lo leghi ad auth/sessione.
$userId = 1;
$vivaioId = 1;  
try {

if ($method === 'GET' && $path === '/auth/google/start') {
  
    $clientId = getenv('GOOGLE_CLIENT_ID');
    if (!$clientId) json_error('Missing GOOGLE_CLIENT_ID', 500);

    $redirectUri = $apiCallbackUrl;

    // state anti-CSRF
    $state = bin2hex(random_bytes(16));
    
    $_SESSION['oauth_state'] = $state;
    error_log("START session_id=" . session_id());
    error_log("START oauth_state=" . $_SESSION['oauth_state']);
    $params = http_build_query([
        'client_id' => $clientId,
        'redirect_uri' => $redirectUri,
        'response_type' => 'code',
        'scope' => 'openid email profile',
        'state' => $state,
        'prompt' => 'select_account',
    ]);

    header('Location: https://accounts.google.com/o/oauth2/v2/auth?' . $params);
    exit;
}

if ($method === 'GET' && $path === '/auth/google/callback') {
  error_log("CALLBACK session_id=" . session_id());
  error_log("CALLBACK query_state=" . ($_GET['state'] ?? 'NULL'));
  error_log("CALLBACK session_state=" . ($_SESSION['oauth_state'] ?? 'NULL'));
    $clientId = getenv('GOOGLE_CLIENT_ID');
    $clientSecret = getenv('GOOGLE_CLIENT_SECRET');
    if (!$clientId || !$clientSecret) json_error('Missing GOOGLE_CLIENT_ID/SECRET', 500);

    $redirectUri = $apiCallbackUrl;

    $code = $_GET['code'] ?? null;
    $state = $_GET['state'] ?? null;

    if (!$code) json_error('Missing code', 400);

    // check state
    
  $sessionState = $_SESSION['oauth_state'] ?? null;
if (!$sessionState || !$state || !hash_equals($sessionState, $state)) {
  json_error('Invalid state', 400);
}
unset($_SESSION['oauth_state']);

    // exchange code for tokens
    $tokenUrl = 'https://oauth2.googleapis.com/token';
    $post = http_build_query([
        'code' => $code,
        'client_id' => $clientId,
        'client_secret' => $clientSecret,
        'redirect_uri' => $redirectUri,
        'grant_type' => 'authorization_code',
    ]);

    $ch = curl_init($tokenUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $post,
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_TIMEOUT => 15,
    ]);
    $raw = curl_exec($ch);
    $http = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($raw === false) json_error('Token request failed: ' . $err, 500);
    if ($http >= 400) json_error('Token error: ' . $raw, 500);

    $token = json_decode($raw, true);
    $accessToken = $token['access_token'] ?? null;
    if (!$accessToken) json_error('Missing access_token', 500);

    // fetch userinfo
    $ch = curl_init('https://www.googleapis.com/oauth2/v3/userinfo');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $accessToken],
        CURLOPT_TIMEOUT => 15,
    ]);
    $rawUser = curl_exec($ch);
    $httpUser = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($rawUser === false || $httpUser >= 400) json_error('Userinfo error: ' . $rawUser, 500);
    $u = json_decode($rawUser, true);

    // TODO: QUI farai find-or-create utente in DB + creazione sessione (cookie sid)
    // Per ora: log e redirect al frontend
    error_log('Google user: ' . json_encode($u));
require_once __DIR__ . '/../src/auth.php';

$sub = $u['sub'] ?? null;
$email = $u['email'] ?? null;
$name = $u['name'] ?? null;

if (!$sub) json_error('Missing sub', 500);

$userId = find_or_create_user_google($sub, $email, $name);
$sid = create_session($userId);
set_sid_cookie($sid);


    header('Location: '.$frontendUrl.'/');
    exit;
}
if ($method === 'GET' && $path === '/auth/me') {
  require_once __DIR__ . '/../src/auth.php';
  $u = auth_me_from_sid();
  json_ok(['user' => $u]);
}

if ($method === 'POST' && $path === '/auth/logout') {
  require_once __DIR__ . '/../src/auth.php';
  revoke_sid();
  json_ok(['ok' => true]);
}

if ($method === 'GET' && $path === '/invoices') {
  require_once __DIR__ . '/../src/invoices.php';
  $flowType = $_GET['flow_type'] ?? 'ALL';
  json_ok(list_invoices($vivaioId, $flowType));
}

if ($method === 'POST' && $path === '/invoices/extract') {
  require_once __DIR__ . '/../src/invoices.php';
  $res = handle_invoice_extract($vivaioId);
  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 201);
}

    // GET /my-plants?limit=6
    if ($method === 'GET' && $path === '/my-plants') {
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 6;
        $plants = list_my_plants($userId, $limit);
        json_ok($plants);
    }

    // GET /my-plants/{id}
    if ($method === 'GET' && preg_match('#^/my-plants/(\d+)$#', $path, $m)) {
        $id = (int)$m[1];
        $plant = get_my_plant($id, $userId);
        if (!$plant) json_error('Not found', 404);
        json_ok($plant);
    }

    if ($method === 'GET' && $path === '/products') {
  require_once __DIR__ . '/../src/products.php';
  $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 50;
  json_ok(list_products($vivaioId, $limit));
    }


    if ($method === 'GET' && $path === '/locations') {
    require_once __DIR__ . '/../src/locations.php';
    json_ok(list_locations($userId));
}



if ($method === 'GET' && $path === '/events') {
  require_once __DIR__ . '/../src/plantEvents.php';
  json_ok(list_plant_events_for_user($userId, $_GET));
}

if ($method === 'GET' && preg_match('#^/plants/(\d+)/events$#', $path, $m)) {
  require_once __DIR__ . '/../src/plantEvents.php';
  $plantId = (int) $m[1];
  json_ok(list_events_for_plant($userId, $plantId, $_GET));
}

if ($method === 'POST' && preg_match('#^/plants/(\d+)/events$#', $path, $m)) {
  require_once __DIR__ . '/../src/plantEvents.php';
  $plantId = (int) $m[1];
  $body = read_json_body();
  $res = create_plant_event($userId, $plantId, $body);
  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 201);
}

if ($method === 'GET' && $path === '/agenda') {
  require_once __DIR__ . '/../src/agenda.php';
  json_ok(list_agenda_tasks_for_user($userId, $_GET));
}

if ($method === 'POST' && $path === '/agenda/generate') {
  require_once __DIR__ . '/../src/agenda.php';
  $body = read_json_body();
  $periodDays = isset($body['period_days']) ? (int)$body['period_days'] : 7;
  $context = is_array($body['context'] ?? null) ? $body['context'] : [];
  $res = generate_agenda_tasks_for_user($userId, $periodDays, $context);
  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 200);
}

if ($method === 'POST' && preg_match('#^/agenda/tasks/(\d+)/complete$#', $path, $m)) {
  require_once __DIR__ . '/../src/agenda.php';
  $taskId = (int) $m[1];
  $body = read_json_body();
  $res = complete_agenda_task($userId, $taskId, $body);
  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 200);
}

if ($method === 'POST' && preg_match('#^/agenda/tasks/(\d+)/skip$#', $path, $m)) {
  require_once __DIR__ . '/../src/agenda.php';
  $taskId = (int) $m[1];
  $body = read_json_body();
  $res = skip_agenda_task($userId, $taskId, $body);
  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 200);
}

if ($method === 'POST' && preg_match('#^/agenda/tasks/(\d+)/snooze$#', $path, $m)) {
  require_once __DIR__ . '/../src/agenda.php';
  $taskId = (int) $m[1];
  $body = read_json_body();
  $res = snooze_agenda_task($userId, $taskId, $body);
  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 200);
}
// POST /my-plants
if ($method === 'POST' && $path === '/my-plants') {
    $body = read_json_body();
    $res = create_my_plant($userId, $body);

    if (isset($res['error'])) {
        json_error($res['error'], $res['code'] ?? 400);
    }

    json_ok($res, 201);
}



    // carrello
    if ($method === 'GET' && $path === '/cart') {
    require_once __DIR__ . '/../src/cart.php';
    json_ok(get_cart($vivaioId, $userId));
    }

if ($method === 'POST' && $path === '/orders') {
  require_once __DIR__ . '/../src/orders.php';
  $body = read_json_body();
  $res = create_order_from_open_cart($vivaioId, $userId, $body);
  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 201);
}

if ($method === 'GET' && $path === '/orders/my') {
  require_once __DIR__ . '/../src/orders.php';
  json_ok(list_orders_for_user($userId, $_GET));
}

if ($method === 'GET' && preg_match('#^/orders/my/(\d+)$#', $path, $m)) {
  require_once __DIR__ . '/../src/orders.php';
  $orderId = (int)$m[1];
  $order = get_order_for_user($userId, $orderId);
  if (!$order) json_error('Order not found', 404);
  json_ok($order);
}

if ($method === 'PATCH' && preg_match('#^/nursery/listings/(\d+)/status$#', $path, $m)) {
  require_once __DIR__ . '/../src/nurseryCatalog.php';

  $listingId = (int)$m[1];
  $body = read_json_body();

  $res = update_listing_status($vivaioId, $listingId, $body['status'] ?? null);

  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 200);
}

if ($method === 'GET' && $path === '/nursery/orders') {
  require_once __DIR__ . '/../src/orders.php';
  json_ok(list_orders_for_nursery($vivaioId));
}

if ($method === 'GET' && preg_match('#^/nursery/orders/(\d+)$#', $path, $m)) {
  require_once __DIR__ . '/../src/orders.php';
  $orderId = (int)$m[1];
  $order = get_order_for_nursery($vivaioId, $orderId);
  if (!$order) json_error('Order not found', 404);
  json_ok($order);
}

if ($method === 'PATCH' && preg_match('#^/api/nursery/listings/(\d+)/status$#', $path, $m)) {
  $listingId = (int)$m[1];
  $body = json_decode(file_get_contents('php://input'), true) ?: [];

  $result = update_listing_status($vivaioId, $listingId, $body['status'] ?? null);

  http_response_code($result['code'] ?? 200);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($result);
  exit;
}

if ($method === 'POST' && $path === '/orders') {
  require_once __DIR__ . '/../src/orders.php';
  $body = read_json_body();
  $res = create_order_from_open_cart($vivaioId, $userId, $body);
  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 201);
}

if ($method === 'GET' && $path === '/nursery/orders') {
  require_once __DIR__ . '/../src/orders.php';
  json_ok(list_orders_for_nursery($vivaioId, $_GET));
}

if ($method === 'GET' && preg_match('#^/nursery/orders/(\d+)$#', $path, $m)) {
  require_once __DIR__ . '/../src/orders.php';
  $orderId = (int)$m[1];
  $order = get_order_for_nursery($vivaioId, $orderId);
  if (!$order) json_error('Order not found', 404);
  json_ok($order);
}

if ($method === 'PATCH' && preg_match('#^/nursery/orders/(\d+)/status$#', $path, $m)) {
  require_once __DIR__ . '/../src/orders.php';
  $orderId = (int)$m[1];
  $body = read_json_body();
  $status = (string)($body['status'] ?? '');
  $res = update_order_status_for_nursery($vivaioId, $orderId, $status);
  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 200);
}

if ($method === 'GET' && $path === '/weather') {
  require_once __DIR__ . '/../src/weather.php';

  if (!isset($_GET['lat'], $_GET['lon'])) {
    json_error('lat e lon sono obbligatori', 400);
  }

  $lat = (float) $_GET['lat'];
  $lon = (float) $_GET['lon'];

  $res = get_weather_snapshot($lat, $lon);

  if (isset($res['error'])) {
    json_error($res['error'], $res['code'] ?? 400);
  }

  json_ok($res);
}



if ($method === 'GET' && $path === '/nursery/plant-species/search') {
  require_once __DIR__ . '/../src/nurseryCatalog.php';
  $q = $_GET['q'] ?? '';
  $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 8;
  json_ok(search_plant_species_for_nursery($q, $limit));
}

if ($method === 'GET' && $path === '/nursery/listings') {
  require_once __DIR__ . '/../src/nurseryCatalog.php';
  $type = $_GET['type'] ?? 'ALL';
  json_ok(list_listings($vivaioId, $type));
}

if ($method === 'POST' && $path === '/nursery/listings') {
  require_once __DIR__ . '/../src/nurseryCatalog.php';
  $body = read_json_body();
  $res = create_listing($vivaioId, $body);
  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 201);
}

if ($method === 'PUT' && preg_match('#^/nursery/listings/(\d+)$#', $path, $m)) {
  require_once __DIR__ . '/../src/nurseryCatalog.php';
  $listingId = (int)$m[1];
  $body = read_json_body();
  $res = update_listing($vivaioId, $listingId, $body);
  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 200);
}

if ($method === 'PATCH' && preg_match('#^/nursery/variants/(\d+)$#', $path, $m)) {
  require_once __DIR__ . '/../src/nurseryCatalog.php';
  $variantId = (int)$m[1];
  $body = read_json_body();
  $res = update_variant($vivaioId, $variantId, $body);
  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 200);
}


if ($method === 'GET' && $path === '/nursery/listings') {
  require_once __DIR__ . '/../src/nurseryCatalog.php';
  $type = $_GET['type'] ?? 'ALL';
  json_ok(list_listings($vivaioId, $type));
}
if ($method === 'POST' && $path === '/nursery/listings') {
  require_once __DIR__ . '/../src/nurseryCatalog.php';
  $body = read_json_body();
  $res = create_listing($vivaioId, $body);
  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 201);
}
if ($method === 'PATCH' && preg_match('#^/nursery/variants/(\d+)$#', $path, $m)) {
  require_once __DIR__ . '/../src/nurseryCatalog.php';
  $variantId = (int)$m[1];
  $body = read_json_body();
  $res = update_variant($vivaioId, $variantId, $body);
  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 200);
}
if ($method === 'GET' && $path === '/nursery/listings') {
  require_once __DIR__ . '/../src/nurseryCatalog.php';
  $type = $_GET['type'] ?? 'ALL';
  json_ok(list_listings($vivaioId, $type));
}

if ($method === 'POST' && $path === '/nursery/listings') {
  require_once __DIR__ . '/../src/nurseryCatalog.php';
  $body = read_json_body();
  $res = create_listing($vivaioId, $body);
  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 201);
}

if ($method === 'PATCH' && preg_match('#^/nursery/variants/(\d+)$#', $path, $m)) {
  require_once __DIR__ . '/../src/nurseryCatalog.php';
  $variantId = (int)$m[1];
  $body = read_json_body();
  $res = update_variant($vivaioId, $variantId, $body);
  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 200);
}
if ($method === 'PATCH' && $path === '/cart/items') {
  require_once __DIR__ . '/../src/cart.php';

  $body = read_json_body();
  $productId = isset($body['productId']) ? (int)$body['productId'] : 0;
  $delta = isset($body['delta']) ? (int)$body['delta'] : 0;

  if ($productId <= 0) json_error('productId required', 400);
  if ($delta === 0) json_error('delta required', 400);

  $res = change_item_qty($vivaioId, $userId, $productId, $delta);
  if (isset($res['error'])) {
    echo json_encode($res);
    exit;
  }
  json_ok($res, 200);
}

if ($method === 'GET' && $path === '/discover/categories') {
  require_once __DIR__ . '/../src/discover.php';
  json_ok(list_discover_categories());
}

if ($method === 'GET' && $path === '/discover/plants') {
  require_once __DIR__ . '/../src/discover.php';
  $filters = [
    'q' => $_GET['q'] ?? '',
    'category_slug' => $_GET['category_slug'] ?? '',
    'limit' => isset($_GET['limit']) ? (int)$_GET['limit'] : 12,
    'offset' => isset($_GET['offset']) ? (int)$_GET['offset'] : 0,
  ];
  json_ok(list_discover_plants($filters));
}

if ($method === 'GET' && preg_match('#^/discover/plants/(\d+)$#', $path, $m)) {
  require_once __DIR__ . '/../src/discover.php';
  $plantId = (int)$m[1];
  $plant = get_discover_plant($plantId);
  if (!$plant) json_error('Plant not found', 404);
  json_ok($plant);
}

if ($method === 'POST' && $path === '/discover/match') {
  require_once __DIR__ . '/../src/discover.php';
  $body = read_json_body();
  $scenario = is_array($body['scenario'] ?? null) ? $body['scenario'] : [];
  $limit = isset($body['limit']) ? (int)$body['limit'] : 8;
  json_ok(match_discover_plants($scenario, $limit));
}

if ($method === 'GET' && $path === '/discover/search') {
  require_once __DIR__ . '/../src/trefle.php';
  $q = $_GET['q'] ?? '';
  $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
  if (strlen($q) < 2) json_error('q too short', 400);

  $data = trefle_get('/species/search', ['q' => $q, 'page' => $page]);
  json_ok($data);
}

if ($method === 'POST' && $path === '/uploads') {
  require_once __DIR__ . '/../src/uploads.php';
  $res = handle_upload_main_image();
  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 201);
}
if ($method === 'PUT' && preg_match('#^/nursery/listings/(\d+)$#', $path, $m)) {
  require_once __DIR__ . '/../src/nurseryCatalog.php';
  $listingId = (int)$m[1];
  $body = read_json_body();
  $res = update_listing($vivaioId, $listingId, $body);
  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 200);
}

if ($method === 'GET' && preg_match('#^/discover/species/(\d+)$#', $path, $m)) {
  require_once __DIR__ . '/../src/trefle.php';
  $id = (int)$m[1];
if ($method === 'GET' && preg_match('#^/plants/(\d+)/events$#', $path, $m)) {
  require_once __DIR__ . '/../src/plantEvents.php';
  $plantId = (int) $m[1];
  json_ok(list_events_for_plant($userId, $plantId, $_GET));
}

if ($method === 'POST' && preg_match('#^/plants/(\d+)/events$#', $path, $m)) {
  require_once __DIR__ . '/../src/plantEvents.php';
  $plantId = (int) $m[1];
  $body = read_json_body();
  $res = create_plant_event($userId, $plantId, $body);
  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 201);
}

if ($method === 'GET' && $path === '/agenda') {
  require_once __DIR__ . '/../src/agenda.php';
  json_ok(list_agenda_tasks_for_user($userId, $_GET));
}

if ($method === 'POST' && preg_match('#^/agenda/tasks/(\d+)/complete$#', $path, $m)) {
  require_once __DIR__ . '/../src/agenda.php';
  $taskId = (int) $m[1];
  $body = read_json_body();
  $res = complete_agenda_task($userId, $taskId, $body);
  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 200);
}

if ($method === 'POST' && preg_match('#^/agenda/tasks/(\d+)/skip$#', $path, $m)) {
  require_once __DIR__ . '/../src/agenda.php';
  $taskId = (int) $m[1];
  $body = read_json_body();
  $res = skip_agenda_task($userId, $taskId, $body);
  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 200);
}

if ($method === 'POST' && preg_match('#^/agenda/tasks/(\d+)/snooze$#', $path, $m)) {
  require_once __DIR__ . '/../src/agenda.php';
  $taskId = (int) $m[1];
  $body = read_json_body();
  $res = snooze_agenda_task($userId, $taskId, $body);
  if (isset($res['error'])) json_error($res['error'], $res['code'] ?? 400);
  json_ok($res, 200);
}

if ($method === 'POST' && $path === '/agenda/generate') {
  require_once __DIR__ . '/../src/agenda.php';
  $body = read_json_body();

  $periodDays = isset($body['period_days']) ? (int)$body['period_days'] : 7;
  $context = is_array($body['context'] ?? null) ? $body['context'] : [];

  $res = generate_agenda_tasks_for_user($userId, $periodDays, $context);
  json_ok($res, 200);
}

if ($method === 'GET' && $path === '/events') {
  require_once __DIR__ . '/../src/plantEvents.php';
  json_ok(list_plant_events_for_user($userId, $_GET));
}



  try {
    $data = trefle_get("/species/{$id}");
    json_ok($data);
  } catch (Throwable $e) {
    // Log server-side e risposta leggibile in dev
    error_log("Trefle species error id={$id}: " . $e->getMessage());
    json_error('Trefle error: ' . $e->getMessage(), 502);

  


  }
}

    if ($method === 'POST' && $path === '/cart/items') {
    require_once __DIR__ . '/../src/cart.php';
    $body = read_json_body();
    $productId = isset($body['productId']) ? (int)$body['productId'] : 0;
    $qty = isset($body['qty']) ? (int)$body['qty'] : 1;
    if ($productId <= 0) json_error('productId required', 400);
    $res = add_item_to_cart($vivaioId, $userId, $productId, $qty);
    if (isset($res['error'])) {
        // add_item_to_cart ha già settato http_response_code in alcuni casi
        echo json_encode($res);
        exit;
    }
    json_ok($res, 201);
    }

    json_error('Route not found', 404);

} catch (Throwable $e) {
    // In dev è utile vedere il messaggio; in prod lo nasconderesti.
    
    error_log("SERVER ERROR: " . $e->getMessage());
  error_log($e->getTraceAsString());
  json_error('Server error: ' . $e->getMessage(), 500);
 
}

