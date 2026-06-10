<?php
// EmojiSurvivors 3D co-op signaling — a tiny room mailbox for the WebRTC
// handshake (SDP offers/answers + ICE candidates). Polled only while a lobby is
// open; once peers connect, gameplay traffic is pure P2P and never touches this.
//   POST {a:"create"}                          -> { ok, room }
//   POST {a:"join", room}                      -> { ok }
//   POST {a:"msg", room, from, to, p}          -> { ok, i }
//   GET  ?a=poll&room=R&for=ID&after=N         -> { ok, msgs:[{i,from,p}], cursor }
// No secrets here; abuse is bounded by caps + TTL. Data file is denied by
// Api/.htaccess. Same single-file flock pattern as Leaderboard.php.
ini_set("display_errors", "0");
ini_set("log_errors", "1");
error_reporting(E_ALL);

header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");

const DATA = __DIR__ . "/SignalData.json";
const ROOM_TTL = 1800; // 30 min
const MAX_ROOMS = 40;
const MAX_MSGS = 400; // per room (trickle ICE is chatty)
const MAX_BODY = 65536; // SDP blobs run ~5-10KB

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
    return $j;
}

function prune(&$data)
{
    $now = time();
    foreach ($data["rooms"] as $code => $r) {
        if ($now - ($r["t"] ?? 0) > ROOM_TTL) {
            unset($data["rooms"][$code]);
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
    $data = defaults(json_decode((string) stream_get_contents($fp), true));
    $result = $fn($data);
    if ($write) {
        prune($data);
        $json = json_encode($data, JSON_UNESCAPED_UNICODE);
        if ($json !== false) {
            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, $json);
            fflush($fp);
        }
    }
    flock($fp, LOCK_UN);
    fclose($fp);
    return $result;
}

$idRe = '/^[a-zA-Z0-9_-]{1,32}$/';
$roomRe = '/^[A-Z2-9]{4}$/';

if ($_SERVER["REQUEST_METHOD"] === "GET") {
    if (($_GET["a"] ?? "") !== "poll") {
        out(["ok" => false, "error" => "action"], 400);
    }
    $room = $_GET["room"] ?? "";
    $for = $_GET["for"] ?? "";
    $after = (int) ($_GET["after"] ?? 0);
    if (!preg_match($roomRe, $room) || !preg_match($idRe, $for)) {
        out(["ok" => false, "error" => "params"], 400);
    }
    $res = withStore(false, function ($data) use ($room, $for, $after) {
        $r = $data["rooms"][$room] ?? null;
        if (!$r) {
            return ["ok" => false, "error" => "no room"];
        }
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
    out($res, empty($res["ok"]) ? 404 : 200);
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    out(["ok" => false, "error" => "method"], 405);
}
if ((int) ($_SERVER["CONTENT_LENGTH"] ?? 0) > MAX_BODY) {
    out(["ok" => false, "error" => "too large"], 413);
}
$body = json_decode((string) file_get_contents("php://input"), true);
if (!is_array($body)) {
    out(["ok" => false, "error" => "bad body"], 400);
}
$a = $body["a"] ?? "";

if ($a === "create") {
    $res = withStore(true, function (&$data) {
        prune($data);
        if (count($data["rooms"]) >= MAX_ROOMS) {
            return ["ok" => false, "error" => "full"];
        }
        // Unambiguous alphabet (no 0/O/1/I) — read over voice chat.
        $alpha = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        do {
            $code = "";
            for ($i = 0; $i < 4; $i++) {
                $code .= $alpha[random_int(0, strlen($alpha) - 1)];
            }
        } while (isset($data["rooms"][$code]));
        $data["rooms"][$code] = ["t" => time(), "n" => 0, "msgs" => []];
        return ["ok" => true, "room" => $code];
    });
    out($res, empty($res["ok"]) ? 503 : 200);
}

$room = strtoupper((string) ($body["room"] ?? ""));
if (!preg_match($roomRe, $room)) {
    out(["ok" => false, "error" => "room"], 400);
}

if ($a === "join") {
    $res = withStore(true, function (&$data) use ($room) {
        if (!isset($data["rooms"][$room])) {
            return ["ok" => false, "error" => "no room"];
        }
        $data["rooms"][$room]["t"] = time(); // keep a joined room alive
        return ["ok" => true];
    });
    out($res, empty($res["ok"]) ? 404 : 200);
}

if ($a === "msg") {
    $from = $body["from"] ?? "";
    $to = $body["to"] ?? "";
    $p = $body["p"] ?? null;
    if (!preg_match($idRe, $from) || !preg_match($idRe, $to) || $p === null) {
        out(["ok" => false, "error" => "params"], 400);
    }
    $res = withStore(true, function (&$data) use ($room, $from, $to, $p) {
        if (!isset($data["rooms"][$room])) {
            return ["ok" => false, "error" => "no room"];
        }
        $r = &$data["rooms"][$room];
        $r["t"] = time();
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
        return ["ok" => true, "i" => $r["n"]];
    });
    out($res, empty($res["ok"]) ? 404 : 200);
}

out(["ok" => false, "error" => "action"], 400);
