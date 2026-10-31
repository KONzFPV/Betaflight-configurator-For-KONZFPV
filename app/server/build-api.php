<?php
declare(strict_types=1);

// Same-origin PHP gateway. The build toolchain runs on Betaflight's cloud service.
const BUILD_UPSTREAM = 'https://build.betaflight.com';
const MAX_REQUEST_BYTES = 32768;
const MAX_RESPONSE_BYTES = 12582912;

function failRequest(int $status, string $message): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    failRequest(405, 'Only GET and POST are supported.');
}

// Incoming URLs cannot choose an upstream host, port, query string or traversal path.
$path = $_GET['path'] ?? '';
if (!is_string($path) || strlen($path) > 512 ||
    !preg_match('~^/api/[A-Za-z0-9_./-]+$~D', $path) || strpos($path, '..') !== false) {
    failRequest(400, 'Invalid build API path.');
}

$readAllowed = preg_match('~^/api/(?:targets(?:/[A-Za-z0-9_.-]+){0,2}|builds/[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+){0,2}|options/[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)?|releases/[A-Za-z0-9_.-]+/commits|app/(?:releases/[A-Za-z0-9_.-]+|devices|sponsors/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)|support/commands)$~D', $path);
if (($method === 'GET' && !$readAllowed) ||
    ($method === 'POST' && !in_array($path, ['/api/builds', '/api/support'], true))) {
    failRequest(404, 'Unsupported build API endpoint.');
}

if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') {
    failRequest(403, 'Open this endpoint from the configurator on the same website.');
}
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    $originParts = parse_url($origin);
    $originAuthority = is_array($originParts) ? ($originParts['host'] ?? '') : '';
    if (isset($originParts['port'])) {
        $originAuthority .= ':' . $originParts['port'];
    }
    if (strcasecmp($originAuthority, $_SERVER['HTTP_HOST'] ?? '') !== 0) {
        failRequest(403, 'Cross-origin requests are not supported.');
    }
}

$headers = ['Accept: application/json, text/plain, application/octet-stream'];
$version = $_SERVER['HTTP_X_CFG_VER'] ?? '2026.6.2';
if (!preg_match('/^[A-Za-z0-9_.()+ -]{1,64}$/D', $version)) {
    failRequest(400, 'Invalid configurator version.');
}
$headers[] = 'X-CFG-VER: ' . $version;
$token = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (preg_match('/^Bearer [A-Za-z0-9_.~-]{1,8192}$/D', $token)) {
    $headers[] = 'Authorization: ' . $token;
}

$body = '';
if ($method === 'POST') {
    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) {
        failRequest(415, 'Expected application/json.');
    }
    $body = file_get_contents('php://input', false, null, 0, MAX_REQUEST_BYTES + 1);
    if (!is_string($body) || strlen($body) > MAX_REQUEST_BYTES) {
        failRequest(413, 'Request body is too large.');
    }
    $request = json_decode($body, true);
    if (!is_array($request) || json_last_error() !== JSON_ERROR_NONE) {
        failRequest(400, 'Invalid JSON request.');
    }
    if ($path === '/api/builds') {
        foreach (['target', 'release'] as $field) {
            if (!is_string($request[$field] ?? null) ||
                !preg_match('/^[A-Za-z0-9_.-]{1,128}$/D', $request[$field])) {
                failRequest(400, 'Invalid build target or release.');
            }
        }
        if (!is_array($request['options'] ?? null) || !array_is_list($request['options']) || count($request['options']) > 256) {
            failRequest(400, 'Build options must be a flat array.');
        }
        foreach ($request['options'] as $option) {
            if (!is_string($option) || strlen($option) > 256 || preg_match('/[\x00-\x1F\x7F]/', $option)) {
                failRequest(400, 'Invalid build option.');
            }
        }
    }
    $headers[] = 'Content-Type: application/json';
}

if (!function_exists('curl_init')) {
    failRequest(503, 'PHP cURL is unavailable on this server. Enable cURL in your hosting panel.');
}

$curl = curl_init(BUILD_UPSTREAM . $path);
$responseBody = '';
$tooLarge = false;
curl_setopt_array($curl, [
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_CONNECTTIMEOUT => 6,
    // Each request only submits, polls or downloads. Compilation continues upstream between polls.
    CURLOPT_TIMEOUT => 18,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
    CURLOPT_ENCODING => '',
    CURLOPT_USERAGENT => 'Betaflight-Configurator/2026.6.2-PHP-Gateway',
    CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$responseBody, &$tooLarge): int {
        if (strlen($responseBody) + strlen($chunk) > MAX_RESPONSE_BYTES) {
            $tooLarge = true;
            return 0;
        }
        $responseBody .= $chunk;
        return strlen($chunk);
    },
]);
if ($method === 'POST') {
    curl_setopt($curl, CURLOPT_POSTFIELDS, $body);
}

$ok = curl_exec($curl);
$curlError = curl_errno($curl);
$status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
$contentType = (string) curl_getinfo($curl, CURLINFO_CONTENT_TYPE);
curl_close($curl);

if ($ok === false) {
    failRequest(502, $tooLarge ? 'Upstream response is too large.' :
        '服务器无法连接官方编译服务，请检查主机出站 HTTPS 网络。cURL code: ' . $curlError);
}
if ($status < 200 || ($status >= 300 && $status < 400)) {
    failRequest(502, 'Unexpected response from the build service: HTTP ' . $status);
}
if (stripos($contentType, 'text/html') !== false && $status < 400) {
    failRequest(502, 'The build service returned HTML instead of build data.');
}

http_response_code($status);
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Betaflight-Build-Route: server');
// Do not forward upstream cookies, redirect targets or CORS headers to the browser.
if (preg_match('~^(?:application/(?:json|octet-stream|x-binary|binary)|text/plain)(?:;[^\r\n]*)?$~iD', $contentType)) {
    header('Content-Type: ' . $contentType);
} else {
    header('Content-Type: application/octet-stream');
}
echo $responseBody;
