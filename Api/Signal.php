<?php
// EmojiSurvivors 3D co-op signaling — a tiny room mailbox for the WebRTC
// handshake (SDP offers/answers + ICE candidates). Polled only while a lobby is
// open; once peers connect, gameplay traffic is pure P2P and never touches this.
//   POST {a:"create"}                          -> { ok, room }
//   POST {a:"join", room, v:2}                 -> { ok, peer, token }
//   POST {a:"confirm", room, peers:[ID]}      -> { ok } (host only)
//   POST {a:"leave", room, peer:ID}           -> { ok } (self or host)
//   POST {a:"msg", room, from, to, p}          -> { ok, i }
//   GET  ?a=poll&room=R&for=ID&after=N         -> { ok, msgs:[{i,from,p}], cursor }
// Peer tokens authorize mailbox access. Caps and TTL bound pending admissions.
// Api/.htaccess denies the data file; flock serializes store mutations.
ini_set("display_errors", "0");
ini_set("log_errors", "1");
error_reporting(E_ALL);
umask(0077);

header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");

const DATA = __DIR__ . "/SignalData.json";
const ROOM_TTL = 1800; // 30 min
const ROOM_MAX_LIFE = 7200; // hard ceiling regardless of keep-alive pings (2h)
const MAX_ROOMS = 40;
const MAX_PENDING = 12;
const MAX_PENDING_PER_IP = 3;
const MAX_GUESTS = 3;
const PENDING_TTL = 45; // guests cannot renew an unaccepted admission
const ACCEPTED_TTL = 90; // renewed only by the host while the lobby is open
const MAX_JOIN_IPS = 5000;
const MAX_MSGS = 400; // per room (trickle ICE is chatty)
const MAX_BODY = 65536; // SDP blobs run ~5-10KB
const MAX_P = 24576; // per-message payload cap (SDP/ICE ~5-10KB; headroom)
const MAX_ROOM_BYTES = 524288; // per-room msgs budget — bounds the shared store
const CREATE_COOLDOWN = 10; // seconds between room creates per IP
const ROOMS_PER_IP = 3; // live rooms a single IP may hold
const IP_TTL = 3600; // prune create-stamps older than this
// Salts live in the gitignored Api/Secret.php (copy Api/Secret.example.php).
// IP_SALT hashes client IPs at rest (server-only).
$__secret = __DIR__ . "/Secret.php";
if (!is_file($__secret)) {
    out(["ok" => false, "error" => "config"], 500);
}
require $__secret;

function out($obj, $code = 200)
{
    http_response_code($code);
    echo json_encode($obj, JSON_UNESCAPED_UNICODE);
    exit();
}

function defaults($j)
{
    if (!is_array($j)) {
        $j = [];
    }
    if (!isset($j["rooms"]) || !is_array($j["rooms"])) {
        $j["rooms"] = [];
    }
    if (!isset($j["ips"]) || !is_array($j["ips"])) {
        $j["ips"] = [];
    }
    return $j;
}

function ipKey()
{
    return substr(hash("sha256", ($_SERVER["REMOTE_ADDR"] ?? "?") . IP_SALT), 0, 32);
}

function removePeer(&$r, $id)
{
    unset($r["peers"][$id], $r["peerState"][$id]);
    $r["msgs"] = array_values(array_filter($r["msgs"] ?? [],
        fn($m) => $m["from"] !== $id && $m["to"] !== $id));
}

function prune(&$data)
{
    $now = time();
    foreach ($data["rooms"] as $code => $r) {
        $idle = $now - ($r["t"] ?? 0) > ROOM_TTL;
        $old = $now - ($r["c"] ?? ($r["t"] ?? 0)) > ROOM_MAX_LIFE;
        if ($idle || $old || !isset($r["peers"])) {
            unset($data["rooms"][$code]);
            continue;
        }
        foreach ($r["peers"] as $id => $_hash) {
            if ($id === "host") continue;
            // Retain existing room tokens when upgrading the store in place.
            $r["peerState"][$id] ??= ["expires" => $now + PENDING_TTL, "accepted" => false, "ip" => "legacy"];
            if ($r["peerState"][$id]["expires"] <= $now) removePeer($r, $id);
        }
        $data["rooms"][$code] = $r;
    }
    foreach ($data["joins"] ?? [] as $k => $entry) {
        if ($now - $entry["t"] > 60) unset($data["joins"][$k]);
    }
    foreach ($data["ips"] ?? [] as $k => $t) {
        if ($now - $t > IP_TTL) {
            unset($data["ips"][$k]);
        }
    }
}

function withStore($write, $fn)
{
    $fp = fopen(DATA, "c+");
    if (!$fp) {
        out(["ok" => false, "error" => "store"], 500);
    }
    $locked = false;
    for ($try = 0; $try < 6; $try++) {
        if (flock($fp, ($write ? LOCK_EX : LOCK_SH) | LOCK_NB)) {
            $locked = true;
            break;
        }
        usleep(40000);
    }
    if (!$locked) {
        fclose($fp);
        out(["ok" => false, "error" => "busy"], 503);
    }
    $before = (string) stream_get_contents($fp);
    $decoded = json_decode($before, true);
    if ($before !== "" && !is_array($decoded)) out(["ok" => false, "error" => "corrupt"], 500);
    $data = defaults($decoded);
    prune($data);
    $result = $fn($data);
    if ($write) {
        prune($data);
        $json = json_encode($data, JSON_UNESCAPED_UNICODE);
        if ($json !== false) {
            ftruncate($fp, 0);
            rewind($fp);
            $written = fwrite($fp, $json);
            fflush($fp);
            if ($written !== strlen($json)) {
                ftruncate($fp, 0); rewind($fp); fwrite($fp, $before); fflush($fp);
                out(["ok" => false, "error" => "write"], 500);
            }
        }
    }
    flock($fp, LOCK_UN);
    fclose($fp);
    return $result;
}

$idRe = '/^[a-zA-Z0-9_-]{1,32}$/';
$roomRe = '/^[A-Z2-9]{6}$/';

function liveRoom($r) {
    return is_array($r) && isset($r['peers']) && time() - $r['t'] <= ROOM_TTL && time() - $r['c'] <= ROOM_MAX_LIFE;
}

function authenticatedPeer($r) {
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer ([a-f0-9]{64})$/', $header, $m)) return null;
    $hash = hash('sha256', $m[1]);
    foreach ($r['peers'] ?? [] as $id => $expected) {
        if (hash_equals($expected, $hash)) return $id;
    }
    return null;
}


if ($_SERVER["REQUEST_METHOD"] === "GET") {
    if (($_GET["a"] ?? "") !== "poll") {
        out(["ok" => false, "error" => "action"], 400);
    }
    $room = $_GET["room"] ?? "";
    $for = $_GET["for"] ?? "";
    $after = (int) ($_GET["after"] ?? 0);
    if (!is_string($room) || !is_string($for) || !preg_match($roomRe, $room) || !preg_match($idRe, $for)) {
        out(["ok" => false, "error" => "params"], 400);
    }
    $res = withStore(false, function ($data) use ($room, $for, $after) {
        $r = $data["rooms"][$room] ?? null;
        if (!liveRoom($r)) {
            return ["ok" => false, "error" => "no room"];
        }
        if (authenticatedPeer($r) !== $for) return ["ok" => false, "error" => "unauthorized"];
        $msgs = [];
        $cursor = $after;
        foreach ($r["msgs"] ?? [] as $m) {
            if ($m["i"] > $after && $m["to"] === $for) {
                $msgs[] = ["i" => $m["i"], "from" => $m["from"], "p" => $m["p"]];
            }
            if ($m["i"] > $cursor) {
                $cursor = $m["i"];
            }
        }
        return ["ok" => true, "msgs" => $msgs, "cursor" => $cursor];
    });
    out($res, empty($res["ok"]) ? (($res["error"] ?? "") === "unauthorized" ? 403 : 404) : 200);
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    out(["ok" => false, "error" => "method"], 405);
}
if ((int) ($_SERVER["CONTENT_LENGTH"] ?? 0) > MAX_BODY) {
    out(["ok" => false, "error" => "too large"], 413);
}
// Don't trust the header alone (chunked transfer omits it); bound the read.
$raw = file_get_contents("php://input", false, null, 0, MAX_BODY + 1);
if (strlen($raw) > MAX_BODY) {
    out(["ok" => false, "error" => "too large"], 413);
}
$body = json_decode($raw, true);
if (!is_array($body)) {
    out(["ok" => false, "error" => "bad body"], 400);
}
$a = $body["a"] ?? "";
if (in_array($a, ["create", "join"], true) && ($body["v"] ?? null) !== 2) out(["ok" => false, "error" => "Reload the game to update multiplayer."], 426);

if ($a === "create") {
    $ip = ipKey();
    $res = withStore(true, function (&$data) use ($ip) {
        prune($data);
        $now = time();
        // Per-IP throttle: a single host can't grab/refresh all 40 slots.
        if (isset($data["ips"][$ip]) && $now - $data["ips"][$ip] < CREATE_COOLDOWN) {
            return ["ok" => false, "error" => "rate"];
        }
        $mine = 0;
        foreach ($data["rooms"] as $r) {
            if (($r["ip"] ?? "") === $ip) {
                $mine++;
            }
        }
        if ($mine >= ROOMS_PER_IP) {
            return ["ok" => false, "error" => "limit"];
        }
        if (count($data["rooms"]) >= MAX_ROOMS) {
            return ["ok" => false, "error" => "full"];
        }
        // Unambiguous alphabet (no 0/O/1/I) — read over voice chat.
        $alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        do {
            $code = "";
            for ($i = 0; $i < 6; $i++) {
                $code .= $alpha[random_int(0, strlen($alpha) - 1)];
            }
        } while (isset($data["rooms"][$code]));
        $token = bin2hex(random_bytes(32));
        $data["rooms"][$code] = [
            "t" => $now,
            "c" => $now,
            "n" => 0,
            "ip" => $ip,
            "msgs" => [],
            "peers" => ["host" => hash("sha256", $token)],
        ];
        if (count($data["ips"]) >= MAX_JOIN_IPS && !isset($data["ips"][$ip])) {
            asort($data["ips"]); $data["ips"] = array_slice($data["ips"], -MAX_JOIN_IPS + 1, null, true);
        }
        $data["ips"][$ip] = $now;
        return ["ok" => true, "room" => $code, "peer" => "host", "token" => $token];
    });
    $status = empty($res["ok"])
        ? ($res["error"] === "rate" || $res["error"] === "limit" ? 429 : 503)
        : 200;
    out($res, $status);
}

if (!is_string($body["room"] ?? "")) out(["ok" => false, "error" => "room"], 400);
$room = strtoupper($body["room"] ?? "");
if (!preg_match($roomRe, $room)) {
    out(["ok" => false, "error" => "room"], 400);
}

if ($a === "join") {
    $res = withStore(true, function (&$data) use ($room) {
        $ip = ipKey(); $now = time();
        if (!liveRoom($data["rooms"][$room] ?? null)) return ["ok" => false, "error" => "no room"];
        $r = &$data["rooms"][$room];
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if ($header !== '') {
            $id = authenticatedPeer($r);
            if ($id === null || $id === "host") return ["ok" => false, "error" => "unauthorized"];
            return ["ok" => true, "peer" => $id, "token" => substr($header, 7)];
        }
        $entry = $data["joins"][$ip] ?? ["t" => $now, "n" => 0];
        if ($entry["n"] >= 20) return ["ok" => false, "error" => "rate"];
        if (!isset($data["joins"][$ip]) && count($data["joins"] ?? []) >= MAX_JOIN_IPS) return ["ok" => false, "error" => "busy"];
        $entry["n"]++; $data["joins"][$ip] = $entry;
        $pending = 0; $mine = 0;
        foreach ($r["peerState"] ?? [] as $state) {
            if ($state["accepted"]) continue;
            $pending++;
            if ($state["ip"] === $ip) $mine++;
        }
        if ($pending >= MAX_PENDING || $mine >= MAX_PENDING_PER_IP) return ["ok" => false, "error" => "rate"];
        $id = bin2hex(random_bytes(12)); $token = bin2hex(random_bytes(32));
        $r["peers"][$id] = hash("sha256", $token);
        $r["peerState"][$id] = ["expires" => $now + PENDING_TTL, "accepted" => false, "ip" => $ip];
        return ["ok" => true, "peer" => $id, "token" => $token];
    });
    out($res, empty($res["ok"]) ? (["rate" => 429, "busy" => 503, "unauthorized" => 403][$res["error"]] ?? 404) : 200);
}

if ($a === "confirm") {
    $peers = $body["peers"] ?? null;
    if (!is_array($peers) || !array_is_list($peers) || count($peers) > MAX_GUESTS) out(["ok" => false, "error" => "peers"], 400);
    foreach ($peers as $id) {
        if (!is_string($id) || $id === "host" || !preg_match($idRe, $id)) out(["ok" => false, "error" => "peers"], 400);
    }
    if (count(array_unique($peers)) !== count($peers)) out(["ok" => false, "error" => "peers"], 400);
    $res = withStore(true, function (&$data) use ($room, $peers) {
        if (!liveRoom($data["rooms"][$room] ?? null)) return ["ok" => false, "error" => "no room"];
        $r = &$data["rooms"][$room];
        if (authenticatedPeer($r) !== "host") return ["ok" => false, "error" => "unauthorized"];
        $accepted = [];
        foreach ($r["peerState"] ?? [] as $id => $state) if ($state["accepted"]) $accepted[$id] = true;
        foreach ($peers as $id) {
            if (!isset($r["peers"][$id])) return ["ok" => false, "error" => "peer"];
            $accepted[$id] = true;
        }
        if (count($accepted) > MAX_GUESTS) return ["ok" => false, "error" => "full"];
        foreach ($peers as $id) {
            $r["peerState"][$id]["accepted"] = true;
            $r["peerState"][$id]["expires"] = time() + ACCEPTED_TTL;
        }
        $r["t"] = time();
        return ["ok" => true];
    });
    out($res, empty($res["ok"]) ? (["unauthorized" => 403, "peer" => 400, "full" => 409][$res["error"]] ?? 404) : 200);
}

if ($a === "leave") {
    $peer = $body["peer"] ?? null;
    if (!is_string($peer) || !preg_match($idRe, $peer)) out(["ok" => false, "error" => "peer"], 400);
    $res = withStore(true, function (&$data) use ($room, $peer) {
        if (!liveRoom($data["rooms"][$room] ?? null)) return ["ok" => false, "error" => "no room"];
        $r = &$data["rooms"][$room];
        $actor = authenticatedPeer($r);
        if ($actor === null || ($actor !== "host" && $actor !== $peer)) return ["ok" => false, "error" => "unauthorized"];
        if ($peer === "host") unset($data["rooms"][$room]);
        else removePeer($r, $peer);
        return ["ok" => true];
    });
    out($res, empty($res["ok"]) ? ($res["error"] === "unauthorized" ? 403 : 404) : 200);
}

if ($a === "msg") {
    $from = $body["from"] ?? "";
    $to = $body["to"] ?? "";
    $p = $body["p"] ?? null;
    // p is a structured signal ({t:"sdp",d} / {t:"ice",c}) — keep it as-is, but
    // cap its serialized size so one peer can't bloat the shared store.
    if (
        !is_string($from) || !is_string($to) ||
        !preg_match($idRe, $from) ||
        !preg_match($idRe, $to) ||
        $p === null ||
        strlen(json_encode($p)) > MAX_P
    ) {
        out(["ok" => false, "error" => "params"], 400);
    }
    $res = withStore(true, function (&$data) use ($room, $from, $to, $p) {
        if (!liveRoom($data["rooms"][$room] ?? null)) {
            return ["ok" => false, "error" => "no room"];
        }
        $r = &$data["rooms"][$room];
        if (authenticatedPeer($r) !== $from || !isset($r["peers"][$to]) || ($from !== "host" && $to !== "host")) {
            return ["ok" => false, "error" => "unauthorized"];
        }
        if ($from === "host") $r["t"] = time();
        $r["n"] = ($r["n"] ?? 0) + 1;
        $r["msgs"][] = [
            "i" => $r["n"],
            "from" => $from,
            "to" => $to,
            "p" => $p,
        ];
        if (count($r["msgs"]) > MAX_MSGS) {
            $r["msgs"] = array_slice($r["msgs"], -MAX_MSGS);
        }
        // Byte budget: drop oldest until the room's msgs fit MAX_ROOM_BYTES.
        while (
            count($r["msgs"]) > 1 &&
            strlen(json_encode($r["msgs"])) > MAX_ROOM_BYTES
        ) {
            array_shift($r["msgs"]);
        }
        return ["ok" => true, "i" => $r["n"]];
    });
    out($res, empty($res["ok"]) ? (($res["error"] ?? "") === "unauthorized" ? 403 : 404) : 200);
}

out(["ok" => false, "error" => "action"], 400);
