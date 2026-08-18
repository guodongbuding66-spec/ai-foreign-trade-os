# Free-plan password KDF note

Cloudflare Workers Free has a strict CPU-time budget. The authentication implementation therefore uses a server-side pepper derived from `SESSION_SECRET`, a per-user random salt, and PBKDF2-SHA256 with an iteration count selected to stay within the free-plan execution budget.

If the project moves to Workers Paid, increase the PBKDF2 iteration count after benchmarking in production.
