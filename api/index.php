<?php
// Simple PHP API for admin (projects + content)
// Supports Supabase REST proxy when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set
// Protects write endpoints using an ADMIN_PASSWORD header (X-Admin-Pass or Authorization: Bearer <pass>)

header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Admin-Pass");
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$SUPABASE_URL = getenv('SUPABASE_URL') ?: getenv('NEXT_PUBLIC_SUPABASE_URL');
$SUPABASE_SERVICE_ROLE_KEY = getenv('SUPABASE_SERVICE_ROLE_KEY') ?: getenv('SUPABASE_SERVICE_KEY');
$ADMIN_PASSWORD = getenv('ADMIN_PASSWORD') ?: 'admin';

$uri = $_SERVER['REQUEST_URI'];
$method = $_SERVER['REQUEST_METHOD'];

// Simple router: look for /api/content or /api/projects
$path = parse_url($uri, PHP_URL_PATH);

function getBearer() {
    $h = getallheaders();
    if (isset($h['X-Admin-Pass'])) return $h['X-Admin-Pass'];
    if (isset($h['x-admin-pass'])) return $h['x-admin-pass'];
    if (isset($h['Authorization'])) {
        if (preg_match('/Bearer\s+(.*)$/i', $h['Authorization'], $m)) return $m[1];
    }
    return null;
}

function proxyRequest($method, $url, $body = null, $extraHeaders = []) {
    $ch = curl_init($url);
    $headers = ["Content-Type: application/json"];
    foreach ($extraHeaders as $k => $v) $headers[] = "$k: $v";
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $res = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    if ($err) return ['error' => $err, 'status' => 500];
    return ['status' => $status, 'body' => $res];
}

function readJsonBody() {
    $raw = file_get_contents('php://input');
    if (!$raw) return null;
    $d = json_decode($raw, true);
    return $d;
}

// Ping
if ($path === '/api/ping' || $path === '/api.php' && isset($_GET['action']) && $_GET['action'] === 'ping') {
    echo json_encode(['ok' => true]); exit;
}

// CONTENT
if ($path === '/api/content' || ($path === '/api.php' && (isset($_GET['action']) && $_GET['action'] === 'content'))) {
    if ($method === 'GET') {
        if ($SUPABASE_URL && $SUPABASE_SERVICE_ROLE_KEY) {
            $url = rtrim($SUPABASE_URL, '/') . '/rest/v1/site_content?select=value&key=eq.site_content';
            $res = proxyRequest('GET', $url, null, ['apikey' => $SUPABASE_SERVICE_ROLE_KEY, 'Authorization' => 'Bearer ' . $SUPABASE_SERVICE_ROLE_KEY]);
            if (isset($res['error'])) { http_response_code(500); echo json_encode(['error' => $res['error']]); exit; }
            if ($res['status'] >= 400) { http_response_code($res['status']); echo $res['body']; exit; }
            $arr = json_decode($res['body'], true);
            if (is_array($arr) && isset($arr[0]['value'])) {
                echo json_encode($arr[0]['value']); exit;
            }
            echo json_encode(new stdClass()); exit;
        }
        // Local fallback
        $f = __DIR__ . '/../assets/misc/content.json';
        if (file_exists($f)) {
            header('Content-Type: application/json');
            echo file_get_contents($f); exit;
        }
        echo json_encode(new stdClass()); exit;
    }

    if ($method === 'POST' || $method === 'PUT') {
        $pass = getBearer();
        if (!$pass || $pass !== $ADMIN_PASSWORD) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); exit; }
        $data = readJsonBody();

        // Handle possible base64-uploaded brochure PDF fields: brochure1_file, brochure1_file_name, brochure2_file, brochure2_file_name
        foreach (['brochure1','brochure2'] as $b) {
            $fileKey = $b . '_file';
            $nameKey = $b . '_file_name';
            if (!empty($data[$fileKey]) && !empty($data[$nameKey])) {
                $fname = preg_replace('/[^a-zA-Z0-9.\-_]/', '_', basename($data[$nameKey]));
                $outDir = __DIR__ . '/../assets/brochures';
                if (!is_dir($outDir)) @mkdir($outDir, 0755, true);
                $outPath = $outDir . '/' . time() . '_' . $fname;
                $b64 = preg_replace('#^data:.*;base64,#', '', $data[$fileKey]);
                file_put_contents($outPath, base64_decode($b64));
                $webPath = 'assets/brochures/' . basename($outPath);
                // set the pdf path in content
                $data[$b . '.pdf_path'] = $webPath;
                unset($data[$fileKey]); unset($data[$nameKey]);
            }
        }

        if ($SUPABASE_URL && $SUPABASE_SERVICE_ROLE_KEY) {
            // try PATCH first
            $url = rtrim($SUPABASE_URL, '/') . "/rest/v1/site_content?key=eq.site_content";
            $payload = ['value' => $data];
            $res = proxyRequest('PATCH', $url, $payload, ['apikey' => $SUPABASE_SERVICE_ROLE_KEY, 'Authorization' => 'Bearer ' . $SUPABASE_SERVICE_ROLE_KEY, 'Prefer' => 'return=representation']);
            if (isset($res['error'])) { http_response_code(500); echo json_encode(['error' => $res['error']]); exit; }
            if ($res['status'] >= 400) {
                // try insert
                $url2 = rtrim($SUPABASE_URL, '/') . '/rest/v1/site_content';
                $res2 = proxyRequest('POST', $url2, ['key' => 'site_content', 'value' => $data], ['apikey' => $SUPABASE_SERVICE_ROLE_KEY, 'Authorization' => 'Bearer ' . $SUPABASE_SERVICE_ROLE_KEY, 'Prefer' => 'return=representation']);
                if (isset($res2['error'])) { http_response_code(500); echo json_encode(['error' => $res2['error']]); exit; }
                if ($res2['status'] >= 200 && $res2['status'] < 300) { header('Content-Type: application/json'); echo $res2['body']; exit; }
                http_response_code($res2['status']); echo $res2['body']; exit;
            }
            if ($res['status'] >= 200 && $res['status'] < 300) { header('Content-Type: application/json'); echo $res['body']; exit; }
            http_response_code($res['status']); echo $res['body']; exit;
        }
        // local fallback: write to assets/misc/content.json and return content
        $f = __DIR__ . '/../assets/misc/content.json';
        if (!is_dir(dirname($f))) @mkdir(dirname($f), 0755, true);
        file_put_contents($f, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        header('Content-Type: application/json'); echo json_encode($data); exit;
    }
}

// PROJECTS
if ($path === '/api/projects' || ($path === '/api.php' && isset($_GET['action']) && $_GET['action'] === 'projects')) {
    if ($method === 'GET') {
        if ($SUPABASE_URL && $SUPABASE_SERVICE_ROLE_KEY) {
            $url = rtrim($SUPABASE_URL, '/') . '/rest/v1/projects?select=*&order=id.desc';
            $res = proxyRequest('GET', $url, null, ['apikey' => $SUPABASE_SERVICE_ROLE_KEY, 'Authorization' => 'Bearer ' . $SUPABASE_SERVICE_ROLE_KEY]);
            if (isset($res['error'])) { http_response_code(500); echo json_encode(['error' => $res['error']]); exit; }
            if ($res['status'] >= 400) { http_response_code($res['status']); echo $res['body']; exit; }
            echo $res['body']; exit;
        }
        $f = __DIR__ . '/../js/projects-data.json';
        if (file_exists($f)) { echo file_get_contents($f); exit; }
        echo json_encode([]); exit;
    }

    if ($method === 'POST' || $method === 'PUT') {
        $pass = getBearer();
        if (!$pass || $pass !== $ADMIN_PASSWORD) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); exit; }
        $data = readJsonBody();
        // handle imageBase64
        if (!empty($data['imageBase64']) && !empty($data['imageFilename'])) {
            $filename = preg_replace('/[^a-zA-Z0-9.\-_]/', '_', basename($data['imageFilename']));
            $filename = time() . '_' . $filename;
            $outDir = __DIR__ . '/../assets/images/different categories/projects';
            if (!is_dir($outDir)) @mkdir($outDir, 0755, true);
            $outPath = $outDir . '/' . $filename;
            $b64 = preg_replace('#^data:.*;base64,#', '', $data['imageBase64']);
            file_put_contents($outPath, base64_decode($b64));
            $data['image'] = "assets/images/different categories/projects/" . $filename;
            unset($data['imageBase64']); unset($data['imageFilename']);
        }
        if ($SUPABASE_URL && $SUPABASE_SERVICE_ROLE_KEY) {
            if (!empty($data['id'])) {
                $id = intval($data['id']); unset($data['id']);
                $url = rtrim($SUPABASE_URL, '/') . "/rest/v1/projects?id=eq.$id";
                $res = proxyRequest('PATCH', $url, $data, ['apikey' => $SUPABASE_SERVICE_ROLE_KEY, 'Authorization' => 'Bearer ' . $SUPABASE_SERVICE_ROLE_KEY, 'Prefer' => 'return=representation']);
                if (isset($res['error'])) { http_response_code(500); echo json_encode(['error' => $res['error']]); exit; }
                http_response_code($res['status']); echo $res['body']; exit;
            } else {
                $url = rtrim($SUPABASE_URL, '/') . '/rest/v1/projects';
                $res = proxyRequest('POST', $url, $data, ['apikey' => $SUPABASE_SERVICE_ROLE_KEY, 'Authorization' => 'Bearer ' . $SUPABASE_SERVICE_ROLE_KEY, 'Prefer' => 'return=representation']);
                if (isset($res['error'])) { http_response_code(500); echo json_encode(['error' => $res['error']]); exit; }
                http_response_code($res['status']); echo $res['body']; exit;
            }
        }
        // local fallback
        $f = __DIR__ . '/../js/projects-data.json';
        $arr = file_exists($f) ? json_decode(file_get_contents($f), true) : [];
        if (!empty($data['id'])) {
            $id = intval($data['id']);
            foreach ($arr as &$item) { if ($item['id'] == $id) { $item = array_merge($item, $data); break; } }
            file_put_contents($f, json_encode($arr, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
            echo json_encode(['ok' => true, 'item' => $data]); exit;
        } else {
            $id = time(); $data['id'] = $id; $arr[] = $data; file_put_contents($f, json_encode($arr, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)); echo json_encode($data); exit;
        }
    }

    if ($method === 'DELETE') {
        $pass = getBearer();
        if (!$pass || $pass !== $ADMIN_PASSWORD) { http_response_code(401); echo json_encode(['error' => 'Unauthorized']); exit; }
        $id = isset($_GET['id']) ? intval($_GET['id']) : null;
        if (!$id) { http_response_code(400); echo json_encode(['error' => 'Missing id']); exit; }
        if ($SUPABASE_URL && $SUPABASE_SERVICE_ROLE_KEY) {
            $url = rtrim($SUPABASE_URL, '/') . "/rest/v1/projects?id=eq.$id";
            $res = proxyRequest('DELETE', $url, null, ['apikey' => $SUPABASE_SERVICE_ROLE_KEY, 'Authorization' => 'Bearer ' . $SUPABASE_SERVICE_ROLE_KEY]);
            if (isset($res['error'])) { http_response_code(500); echo json_encode(['error' => $res['error']]); exit; }
            http_response_code($res['status']); echo $res['body']; exit;
        }
        $f = __DIR__ . '/../js/projects-data.json';
        $arr = file_exists($f) ? json_decode(file_get_contents($f), true) : [];
        $new = array_filter($arr, function($r) use ($id){ return $r['id'] != $id; });
        file_put_contents($f, json_encode(array_values($new), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        echo json_encode(['ok' => true]); exit;
    }
}

// Fallback 404
http_response_code(404); echo json_encode(['error' => 'Not found']); exit;
