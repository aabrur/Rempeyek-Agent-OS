# Agentic OS — Hardening Sprint (2026-07-05)

> Eksekusi fix dari 3 catatan audit: `agentic-os-hermes-setup.md`, `AUDIT-2026-07-05.md`, `BOTTLENECK_AUDIT_2026-07-05.md`.
> **Zero-dependency dijaga** (Node builtin saja). Semua diverifikasi: `node --check` + live smoke-test.
> Tier Prime (eksekusi), Express gate, Founder-led + QA verifier subagent.

## ✅ Diterapkan

### Reliability (tutup Critical Risk C1)
| ID | Fix | Lokasi |
|----|-----|--------|
| R10 | `loadConfig()` try/catch + memoize mtime → return **last-good** saat config rusak mid-edit | `server.js` |
| R1+R3 | Handler `SIGINT`/`SIGTERM`/`SIGHUP` + `uncaughtException`/`unhandledRejection` → `shutdown()` (killOwned semua + `server.close`) | `server.js` |
| R2 | Helper `killTree(pid,child)` (tree-kill konsisten Win/POSIX) dipakai di `gwCtl` timeout & `killOwned` | `server.js` |
| R4 | `pollAllStatus` in-flight `Set` guard + interval 45s > timeout 30s (dulu 25s < 45s = overlap) | `server.js` |
| R5 | `readBody` balas **413** saat body >5MB (dulu `req.destroy()` diam → client hang) | `server.js` |
| R9 | `gwRun` error handler set `exitCode=-1` (parity state machine) | `server.js` |
| R11 | `openTasks`/`saveReport` I/O dibungkus try/catch | `server.js` |
| R14 | `walk()` depth-cap 100 + skip symlink/junction (cegah loop/stack overflow) | `server.js` |
| R18 | `buildGraph()` try/catch → return cache lama saat throw (tak poison ke null) | `server.js` |
| R19 | `pushLog` try/catch (throw di event `data` tak escape handler) | `server.js` |

### Security (tutup Critical Risk C3)
| ID | Fix | Lokasi |
|----|-----|--------|
| S1 | Token compare `crypto.timingSafeEqual` (anti timing attack) | `server.js` |
| S2 | **Hapus** branch `?token=` query string — token via header `x-dash-token` saja | `server.js` |
| S5 | Path-traversal guard `path.relative()` + reject `..`/absolute + `decodeURIComponent` | `server.js` |
| S10 | `esc()` frontend tambah `'` → `&#39;` | `app.js` |
| S12 | Error 500 generic ke client (`"internal error"`), stack di-log server-side (tak bocor cwd/bin/cmd) | `server.js` |

### Performance (kurangi Constraint C2)
| ID | Fix | Lokasi |
|----|-----|--------|
| B1+B3 | `walkVault()` snapshot ber-TTL 3s → dedupe re-walk lintas endpoint/tab dalam 1 tick | `server.js` |
| B6 | `loadConfig()` memoize by mtime (hapus re-parse tiap request) | `server.js` |

### Frontend UX/Reliability
| ID | Fix | Lokasi |
|----|-----|--------|
| R6+R7+R8/F12 | `api()` try/catch + `AbortSignal.timeout(8000)` + retry 401 terbatas (max 2, bukan rekursi) → selalu balik objek | `app.js` |
| F2 | `render()` dirty-check (skip rebuild DOM berat kalau data tak berubah; jam stamp tetap update) | `app.js` |
| F3 | `visibilitychange` — pause semua `setInterval` saat tab hidden | `app.js` |
| F13/R15 | Avatar `URL.revokeObjectURL` di onload/onerror | `app.js` |
| — | `refresh()`/`loadGraph()` guard hasil `{error}` (tak crash saat server 500) | `app.js` |

### Data / Config
| ID | Fix | Lokasi |
|----|-----|--------|
| D-3 | Laporan `gwRunning` hitung service-mode juga (dulu owned-only → headline salah) | `server.js` |
| D-7 | Nama file laporan resolusi **detik** (anti-timpa 2 simpan/menit) | `server.js` |
| R13 | `detectRunning` regex `\bpid[:\s#]*\d` (fix false-positive "pid file not found") | `server.js` |

## ⏸️ Ditunda (di-flag ke Boss — butuh keputusan/lebih berisiko)

| Item | Alasan tunda |
|------|--------------|
| **B2** worker_threads offload parse transcript | Arsitektural besar (Sprint-2/3). Butuh refactor `claudeActivity` + worker. Risiko goyang server zero-dep yang jalan. |
| **B4** migrasi `fs.promises` (async I/O pervasive) | Sprint-3 "L effort", pervasive. Ditunda sampai vault/transcript benar-benar besar. |
| **F5** graph spatial-hash O(n) repulsion | Sprint-3, fine di 63 node; baru perlu di 500+ node. |
| **S6** drop `shell:true`, tokenize command | Hermes bin = path ter-quote dengan spasi, `openclaw gateway` = 2 token. Tokenizing berisiko memecah command yang sudah teruji jalan. Action sudah enum-checked (audit sendiri: "no runtime command injection"). |
| **S13** whitelist env var ke child | Hermes venv Python mungkin butuh env spesifik; over-restrict bisa mematikan gateway 24/7. Risiko > manfaat (Low). |
| **S15** gate static di belakang token | Akan mem-deadlock bootstrap browser (index.html perlu dimuat tanpa token dulu untuk memunculkan prompt). Static = shell app, tak ada data vault; semua data sensitif sudah di belakang `/api/` auth. Desain SPA standar. |
| **S14** refuse remote tanpa TLS | Butuh reverse-proxy (Caddy/nginx) — keputusan deployment Boss. |
| **S4** rotate `DASH_TOKEN` ke random 64-char | Keputusan Boss (token sekarang aman lokal, tak di git). |

## Verifikasi
- `node --check` server.js / app.js / graph.js → **lolos**.
- Live smoke-test (port throwaway): state 200 (header), 401 (no token), **401 (`?token=` query — S2)**, path-traversal **403 (S5)**, graph 63 node/65 edge, telemetry+avatar muncul, static shell 200.
- **C1 proof**: config dirusak mid-run → server tetap **200 (last-good), tidak crash**, log `[config] last-good` muncul.
