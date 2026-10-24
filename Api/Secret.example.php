<?php
// TEMPLATE — copy to Secret.php (gitignored) on the server and set real values.
// Co-op signaling requires Secret.php; without it it returns {"ok":false,"error":"config"}.
//
//   IP_SALT — salt for hashing client IPs at rest (server-only — keep private).
// Existing secrets and historical ranking data can stay in place after retirement.
define("IP_SALT", "your-ip-hash-salt-here");
