<?php
// EmojiSurvivors online leaderboard — single-file JSON store, same-origin only.
//   GET  ?board=KEY           -> { entries: [top 10] }
//   POST { entry, name, sig } -> { ok, placed }
// Sanity caps + a payload signature keep out the laziest forgeries; the store is
// pruned to BOARD_CAP per board. Data file is denied by Api/.htaccess and must be
// excluded from the rsync --delete deploy.
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");

const DATA = __DIR__ . "/LeaderboardData.json";
const SALT = "es-ldr-2026-9f3a7c2e-spectral-tally";
const BOARD_CAP = 25;
const SHOW = 10;
const RATE_SECONDS = 8;

function out($obj, $code = 200)
{
    http_response_code($code);
    echo json_encode($obj, JSON_UNESCAPED_UNICODE);
    exit();
}

// Mirrors OnlineBoard.js fnv(): FNV-1a 32-bit over an ASCII canonical string.
function fnv($s)
{
    $h = 0x811c9dc5;
    $s .= SALT;
    $len = strlen($s);
    for ($i = 0; $i < $len; $i++) {
        $h ^= ord($s[$i]);
        $h = ($h * 0x01000193) & 0xffffffff;
    }
    return dechex($h);
}

function boardKey($e)
{
    return $e["runLength"] .
        ":" .
        ($e["endless"] ? "endless" : "standard") .
        ":" .
        ($e["hard"] ? "hard" : "normal");
}

// Mirrors Records.js compareEntries().
function cmpEntries($a, $b)
{
    if (!empty($a["endless"]) || !empty($b["endless"])) {
        $d = ($b["score"] ?? 0) - ($a["score"] ?? 0);
        return $d !== 0 ? $d : ($b["time"] ?? 0) - ($a["time"] ?? 0);
    }
    $aw = !empty($a["won"]);
    $bw = !empty($b["won"]);
    if ($aw !== $bw) {
        return $aw ? -1 : 1;
    }
    $d = ($b["kills"] ?? 0) - ($a["kills"] ?? 0);
    if ($d !== 0) {
        return $d;
    }
    return $aw
        ? ($a["time"] ?? 0) - ($b["time"] ?? 0)
        : ($b["time"] ?? 0) - ($a["time"] ?? 0);
}

function defaults($j)
{
    if (!is_array($j)) {
        $j = [];
    }
    if (!isset($j["boards"]) || !is_array($j["boards"])) {
        $j["boards"] = [];
    }
    if (!isset($j["ips"]) || !is_array($j["ips"])) {
        $j["ips"] = [];
    }
    return $j;
}

$validKey = '/^(300|600|900):(standard|endless):(normal|hard)$/';

if ($_SERVER["REQUEST_METHOD"] === "GET") {
    $key = $_GET["board"] ?? "";
    if (!preg_match($validKey, $key)) {
        out(["ok" => false, "error" => "bad board"], 400);
    }
    $data = defaults(
        file_exists(DATA)
            ? json_decode((string) file_get_contents(DATA), true)
            : null,
    );
    $entries = $data["boards"][$key] ?? [];
    out(["ok" => true, "entries" => array_slice($entries, 0, SHOW)]);
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    out(["ok" => false, "error" => "method"], 405);
}

$body = json_decode((string) file_get_contents("php://input"), true);
$e = is_array($body) && isset($body["entry"]) ? $body["entry"] : null;
if (!is_array($e)) {
    out(["ok" => false, "error" => "bad body"], 400);
}

$rl = (int) ($e["runLength"] ?? 0);
$endless = !empty($e["endless"]);
$hard = !empty($e["hard"]);
$won = !empty($e["won"]);
$time = (int) ($e["time"] ?? -1);
$kills = (int) ($e["kills"] ?? -1);
$level = (int) ($e["level"] ?? 0);
$score = (int) ($e["score"] ?? 0);
$char = is_string($e["character"] ?? null) ? $e["character"] : "";

// Sanity caps — reject the impossible rather than trust the client.
if (!in_array($rl, [300, 600, 900], true)) {
    out(["ok" => false, "error" => "runLength"], 400);
}
if ($time < 0 || $kills < 0 || $level < 1 || $level > 200) {
    out(["ok" => false, "error" => "range"], 400);
}
if ($kills > $time * 60 + 100) {
    out(["ok" => false, "error" => "kills"], 400);
}
if (!preg_match('/^[a-zA-Z]{1,24}$/', $char)) {
    out(["ok" => false, "error" => "character"], 400);
}
if ($endless) {
    if ($time > 14400 || $won || $score !== $kills + $time) {
        out(["ok" => false, "error" => "endless"], 400);
    }
} else {
    if ($time > $rl + 180 || $score !== 0 || ($won && $time < $rl)) {
        out(["ok" => false, "error" => "standard"], 400);
    }
}

$canon = implode("|", [
    $rl,
    $endless ? 1 : 0,
    $hard ? 1 : 0,
    $won ? 1 : 0,
    $score,
    $time,
    $kills,
    $level,
    $char,
]);
if (($body["sig"] ?? "") !== fnv($canon)) {
    out(["ok" => false, "error" => "sig"], 400);
}

$name = is_string($body["name"] ?? null) ? $body["name"] : "";
$name = trim(preg_replace('/[\x00-\x1f<>]/u', "", $name));
if (function_exists("mb_substr")) {
    $name = mb_substr($name, 0, 24, "UTF-8");
} else {
    $name = substr($name, 0, 48);
}
if ($name === "") {
    $name = "Anonymous 👻";
}

$mods = [];
if (isset($e["mods"]) && is_array($e["mods"])) {
    foreach ($e["mods"] as $m) {
        if (is_string($m) && preg_match('/^[a-zA-Z]{1,24}$/', $m)) {
            $mods[] = $m;
        }
        if (count($mods) >= 24) {
            break;
        }
    }
}

$fp = fopen(DATA, "c+");
if (!$fp || !flock($fp, LOCK_EX)) {
    out(["ok" => false, "error" => "busy"], 503);
}
$data = defaults(json_decode((string) stream_get_contents($fp), true));

// Per-IP cooldown (also prunes stale stamps).
$ip = $_SERVER["REMOTE_ADDR"] ?? "?";
$now = time();
foreach ($data["ips"] as $k => $t) {
    if ($now - $t > 3600) {
        unset($data["ips"][$k]);
    }
}
if (isset($data["ips"][$ip]) && $now - $data["ips"][$ip] < RATE_SECONDS) {
    flock($fp, LOCK_UN);
    fclose($fp);
    out(["ok" => false, "error" => "rate"], 429);
}
$data["ips"][$ip] = $now;

$key = boardKey([
    "runLength" => $rl,
    "endless" => $endless,
    "hard" => $hard,
]);
$entry = [
    "n" => $name,
    "runLength" => $rl,
    "endless" => $endless,
    "hard" => $hard,
    "won" => $won,
    "score" => $score,
    "time" => $time,
    "kills" => $kills,
    "level" => $level,
    "character" => $char,
    "mods" => $mods,
    "date" => $now * 1000,
];
$board = $data["boards"][$key] ?? [];
$board[] = $entry;
usort($board, "cmpEntries");
$board = array_slice($board, 0, BOARD_CAP);
$data["boards"][$key] = $board;

ftruncate($fp, 0);
rewind($fp);
fwrite($fp, json_encode($data, JSON_UNESCAPED_UNICODE));
fflush($fp);
flock($fp, LOCK_UN);
fclose($fp);

out(["ok" => true, "placed" => in_array($entry, $board, true)]);
