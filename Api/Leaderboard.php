<?php
// Keep this response for old clients without opening historical records or secrets.
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");
http_response_code(410);
echo json_encode([
    "ok" => false,
    "retired" => true,
    "error" => "Public rankings retired. Personal records remain on this device.",
]);
