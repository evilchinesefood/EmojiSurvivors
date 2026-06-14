<?php
// TEMPLATE — copy to Secret.php (gitignored) on the server and set real values.
// Both Api endpoints require Secret.php; without it they return {"ok":false,"error":"config"}.
//
//   LB_SALT — leaderboard signature salt. MUST match the SALT constant in
//             Shared/Meta/OnlineBoard.js. The client necessarily ships this value,
//             so it is a forgery speed-bump, NOT a real secret.
//   IP_SALT — salt for hashing client IPs at rest (server-only — keep private).
define("LB_SALT", "your-leaderboard-salt-here");
define("IP_SALT", "your-ip-hash-salt-here");
