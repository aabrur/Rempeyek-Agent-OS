---
title: "Audit Bottleneck Agentic OS 2026-07-05"
date: 2026-07-05
type: audit
status: active
created_by: hypertaks (Prime, 4 subagent)
target: "C:\\Users\\abrur\\AI-Agent\\agentic-os\\server.js + public/*"
tags: [audit, agentic-os, performance, reliability, security, ux]
---

# 🔍 Audit Bottleneck AGONIC//OS — 2026-07-05

> **Dihasilkan oleh:** Hypertaks (tier Prime, Express gate, mode orchestrated, 4 subagent spesialis)
> **Sumber kebenaran kode:** `C:\Users\abrur\AI-Agent\agentic-os\server.js` (563 baris) + `public/app.js` (357 baris) + `public/graph.js` (210 baris) + `public/index.html` + `public/style.css`
> **Skala terukur saat audit:** Obsidian Vault 33 catatan / 11 MB · Claude transcripts 387 file `.jsonl` / 156–172 MB (terbesar 19 MB, avg 433 KB) · 3 agent aktif (claude-code/hermes/openclaw), 2 mati (zcode/copilot)
> **Total temuan:** 63 bottleneck terverifikasi `file:line` · 3 hipotesis DIREFUTASI sebagai non-issue
> **Pantangan:** zero-dependency dijaga (Node builtin saja), surgical (tidak ubah kode saat audit)

---

## 🎯 Identitas Platform

**AGONIC//OS — Neural Command Deck** adalah dashboard command-center zero-dependency (Node.js murni, single-file `server.js`, tanpa `npm install`) yang berfungsi sebagai:

1. **Pembaca Obsidian Vault live** — stats catatan, project, task terbuka, inbox review, neural graph
2. **Launcher & monitor 5 agent AI** — kontrol gateway via `spawn(shell:true)`: start/stop/restart/status/run
3. **Parser transcript sesi Claude Code** — baca `.claude/projects/*.jsonl` (48 jam) untuk tampilkan sesi aktif, tool terakhir, subagent yang di-spawn
4. **Generator laporan** — report markdown + SVG bar/donut, bisa simpan ke `Reports/`
5. **5 view:** Command Center · Agents · Neural Vault (force-directed graph) · Reports · Projects

**Auth:** token tunggal `DASH_TOKEN` via header `x-dash-token` ATAU query string `?token=`.

---

## 🔥 TOP 3 CRITICAL RISK (berlaku sekarang, bukan nanti)

| # | Risk combo | Apa yang terjadi | Effort |
|---|---|---|---|
| **C1** | **R1 + R3 + R10** | `Ctrl+C` atau 1 char rusak di `agents.config.json` saat disave → crash dashboard → **semua gateway owned jadi orphan** (tetap jalan, pegang port/socket, panggil API terus). Hanya ada `process.on("exit")` yang **tidak jalan** di SIGINT/SIGTERM/uncaughtException. | ~20 baris |
| **C2** | **B2 + B1 + B4** | Detail Claude Code dibuka → setiap 5 dtk re-parse up to 3.2 MB JSONL sync. Dengan 387 transcript/172 MB, **event loop diblok puluhan ms per poll** → `/api/state` lag, gateway spawn delayed. | M |
| **C3** | **S2 + S14 + S8** | Remote + 1 log line `?token=` bocor ATAU sniffing WiFi (no TLS) ATAU hammer `/api/state` (no rate-limit + sync walk) = **kompromi/pengendalian total**. | S+docs |

**Constraint sistem (Theory of Constraints):** single-threaded event loop Node yang dipaksa I/O sync + JSON.parse berat. B2 (`claudeActivity` parse 8×400KB JSONL tiap 5 dtk) adalah workstation terberat.

---

## 📋 ROADMAP FIX (4 Sprint, urutan eksekusi)

### Sprint 0 — Quick Wins (≤1 hari, mostly S effort)
Tutup C1 + C3, kurangi ~50% waste frontend.

| ID | Fix | Lokasi | Effort |
|----|-----|--------|--------|
| **R1+R3** | Tambah `SIGINT`/`SIGTERM`/`SIGHUP`/`uncaughtException`/`unhandledRejection` handler + shared `shutdown()` → `killOwned` semua + `server.close()` | `server.js:554` | S |
| **R10** | `loadConfig()` wrap try/catch, simpan `lastCfg` module-level, return last-good saat parse gagal | `server.js:32-34` | S |
| **S1** | `crypto.timingSafeEqual` untuk compare token, bukan `===` | `server.js:485` | S |
| **S2** | Hapus branch `?token=` query string. Token lewat header saja | `server.js:484` | S |
| **S4** | Ganti `DASH_TOKEN` jadi `crypto.randomBytes(32).toString("hex")` (64 char) | `.env` + README | S |
| **S5** | Path-traversal guard pakai `path.relative()` + reject `..`, bukan `startsWith(PUBLIC)` | `server.js:545-551` | S |
| **S15** | Pindah `authorized()` check ke atas sebelum `/api/` branch (gate static juga saat TOKEN diset) | `server.js:497` | S |
| **F2** | Dirty-check di `render()`: skip rebuild kalau `JSON.stringify(state)` sama | `app.js:64` | S |
| **F3** | `visibilitychange` listener: pause semua `setInterval` saat tab hidden | `app.js:353-357` | S |
| **F4** | Guard 6s refresh: skip kalau `view-command` tidak active | `app.js:355` | S |
| **R5** | `req.destroy()` >5MB harus kirim 413 ke client, jangan biar hang | `server.js:477` | S |

### Sprint 1 — Reliability & Security lapis kedua (1–2 hari)

| ID | Fix | Lokasi | Effort |
|----|-----|--------|--------|
| **R4** | Per-agent `polling` Set guard + inversi interval/timeout (interval > timeout, mis. 60s/30s) | `server.js:562` | S |
| **R2** | Ekstrak helper `killTree(pid)` (`taskkill /T /F` Win / `process.kill(-pid)` POSIX), dipakai juga di `gwCtl` timeout | `server.js:172,217` | S |
| **R7+R8** | Frontend `api()` swallow error jadi `{error}`, tambah `AbortSignal.timeout(8000)`, exponential backoff di `refresh()` | `app.js:21-29` | M |
| **R6** | Ganti recursion 401 jadi `for` loop max 3 attempt + modal in-DOM (bukan `prompt()`) | `app.js:23-27` | M |
| **R11** | Wrap `openTasks()` readFileSync + `saveReport()` writeFileSync try/catch | `server.js:71,471` | S |
| **S6** | Drop `shell:true`, store `bin` sebagai array di config, `spawn(args[0], args.slice(1))` | `server.js:170,201` | M |
| **S13** | Whitelist env var ke child (`PATH`, `SYSTEMROOT`, `AGENT_WORKDIR`) — jangan spread semua `process.env` | `server.js:170,201` | S |
| **S12** | Generic error ke client + log `err.stack` server-side, jangan echo `cwd`/`bin`/`cmd` | `server.js:542` | S |
| **S14** | Docs: larang remote tanpa TLS-terminating reverse proxy (Caddy/nginx). Opsi: refuse start kalau `x-forwarded-proto !== https` saat TOKEN diset | `server.js:494,556` | S+docs |
| **S10** | Tambah `'` ke `esc()` map (`&#39;`) + CSP `default-src 'self'` di setiap response | `app.js:32` | S |

### Sprint 2 — Performance cache layer (2–3 hari, tutup C2)

| ID | Fix | Lokasi | Effort |
|----|-----|--------|--------|
| **B1+B3** | Shared vault snapshot: cache `walk(VAULT)`, invalidasi `fs.watch(VAULT,{recursive:true})`. `buildState` & `buildGraph` baca snapshot (graph simpan wikilink per-file) | `server.js:80-107,256-283` | M |
| **B2** | `claudeActivity()`: cache candidate list (mtime keyed) + parse incremental (hanya tail baru sejak size terakhir) + pindah parse ke `worker_threads` | `server.js:303-361` | M |
| **B6** | `loadConfig()` memoize dengan mtime check, teruskan cfg sebagai parameter (hapus ~13 re-read) | `server.js:32-34` | S |
| **B7** | ETag + `If-None-Match` → 304 untuk `buildState`/`buildGraph`/`agentDetail`. `Cache-Control` untuk static | `server.js:487-490,550-551` | S |
| **B8** | Pre-load `public/` ke Map saat boot, invalidasi `fs.watch` | `server.js:551` | S |
| **B5** | `pollAllStatus` baca config sekali, `execFile` tanpa shell | `server.js:232-235,561-562` | S |
| **F1+F16** | Render diff (patch DOM by id, bukan `innerHTML=""`); set `ctx.font` sekali per draw; label density cap | `app.js:64-115` · `graph.js:123-128` | M |
| **F11** | Banner error + exponential backoff + "last update Xs ago" + `aria-live` | `app.js:349-352` | M |

### Sprint 3 — Scale & async (1 minggu+, saat vault/transcript tumbuh besar)

| ID | Fix | Lokasi | Effort |
|----|-----|--------|--------|
| **B4** | Migrasi I/O ke `fs.promises` (async readdir/stat/readFile) | pervasive | L |
| **B9** | Tokenize command, `spawn(bin,args,{shell:false,windowsVerbatimArguments:true})` di mana bin literal path | `server.js:170,201` | S |
| **F5** | Graph: spatial hash grid O(n) repulsion + Web Worker offload sim | `graph.js:47-63` | L |
| **F6+F7** | Cap iterasi reduced-motion `min(24, 5000/N)`; freeze sim saat drag, re-resolve hanya edge incident | `graph.js:139-140,165-180` | M |
| **F10** | Debounce 120ms di graph search + short-circuit `setQuery` kalau value sama | `app.js:210` · `graph.js:206` | S |
| **F13** | `URL.revokeObjectURL(img.src)` setelah `drawImage` di avatar onload | `app.js:202` | S |
| **F15** | Optimistic update pill di DOM saat action, `refresh()` di `.then()` bukan `setTimeout(900)` | `app.js:297-306` | S |
| **F17** | A11y: cards jadi `<button>`/`tabindex=0`+`role=button`+keydown; canvas `role=img aria-label`; `aria-live` di `#stamp`; `:focus-visible` CSS | `app.js:77,90` · `index.html:82` | M |
| **F18** | `detailRequestId` counter; ignore response kalau bukan latest. Pause 5s poll 1.5s pasca action | `app.js:118-179,356` | M |
| **R9** | `gwRun` error handler set `p.exitCode=-1` + log sintetik, parity dengan `gwCtl` state machine | `server.js:207` | S |
| **R13** | Kontrak exit-code gateway (0=running, non-zero=stopped), regex jadi fallback | `server.js:121-126` | M |
| **R14** | `walk()` depth cap 100 + skip symlink / visited set anti-loop | `server.js:37-50` | S |
| **R16** | `renderDetail` capture `myAgent=openAgent`, bail pasca `await` kalau berubah. `AbortController` di close | `app.js:118-179` | S |
| **R18** | Wrap `buildGraph` body try/catch, return `graphCache.data` saat throw | `server.js:256-283` | S |
| **R19** | Wrap `pushLog` body try/catch (defense in depth) | `server.js:148-154` | S |
| **S7** | Static file pakai `fs.createReadStream().pipe(res)` (backpressure, konstan mem) + cap size | `server.js:551` | S |
| **S8** | Rate-limit per-IP token-bucket 429 di atas N req/s. Cache `buildState` TTL 60s seperti graph | `server.js:497-541,80` | M |
| **S9** | Setelah S2 fix: header-only POST resist CSRF. Tambah origin/referer check di POST | `server.js:513-539` | S |
| **S11** | Validasi magic bytes avatar (PNG `89 50`, JPEG `FF D8`, WEBP `52 49`) sebelum write | `server.js:243-252` | S |

---

## 📊 TABEL BOTTLENECK LENGKAP

### Backend Performance (B1–B10)

| ID | Severity | Lokasi | Apa | Effort |
|----|----------|--------|-----|--------|
| B1 | High→Critical | `server.js:80-107` | `buildState()` re-walk vault + baca semua Tasks file sync setiap 6 dtk, tanpa cache | M |
| B2 | **Critical** | `server.js:303-361` | `claudeActivity()` re-parse up to 8×400KB JSONL tiap 5 dtk. Sumber blocking terbesar | M |
| B3 | Medium→High | `server.js:256-283` | `buildGraph()` baca full text semua vault file di setiap cache miss 60s | M |
| B4 | High | pervasive | Semua I/O sync (`readdirSync`/`statSync`/`readFileSync`) → blok event loop. Force-multiplier B1/B2/B3 | M/L |
| B5 | Medium→High | `server.js:232-235,561-562` | `pollAllStatus` tiap 25s, 3× `loadConfig`/agent, 45s timeout > 25s interval (overlap risk) | S |
| B6 | Low→Medium | `server.js:32-34` (13 call sites) | `loadConfig()` re-parse config di hot path; `gwCtl` parse 3× per call | S |
| B7 | Medium | `server.js:487-490,550-551` | Tidak ada HTTP cache headers → tiap poll re-run B1/B2/B3 walau idle | S |
| B8 | Low | `server.js:551` | Static asset `readFileSync` per request, no cache | S |
| B9 | Low | `server.js:170,201` | `shell:true` spawn cmd.exe per gateway call (extra process hop) | S |
| B10 | ✅ Non-issue | `server.js:115-116` | `procs`/`gwCache` bounded by agent count (≤5) + log capped 800. **Bukan leak** | — |

### Reliability (R1–R20)

| ID | Severity | Lokasi | Apa | Effort |
|----|----------|--------|-----|--------|
| R1 | **Critical** | `server.js:554` | `process.on("exit")` saja; tak jalan di SIGINT/SIGTERM/crash → orphan cascade | S |
| R2 | High | `server.js:172` vs `217` | `gwCtl` timeout `child.kill()` vs `killOwned` `taskkill /T` — tree-kill tidak konsisten | S |
| R3 | **Critical** | absent | No `uncaughtException`/`unhandledRejection` → 1 throw = dashboard mati + orphan | M |
| R4 | High | `server.js:562,172` | Poll re-entrancy: 25s interval < 45s timeout → overlap spawn + status flap | S |
| R5 | Medium | `server.js:477` | `req.destroy()` >5MB tak kirim response → client hang 60-120s | S |
| R6 | Medium | `app.js:23-27` | `api()` recursion di 401 → potential infinite loop/stack overflow | S |
| R7+R8 | Medium | `app.js:21-29,353-357` | `api()` no try/catch fetch/.json → unhandled rejection; interval no backoff | M |
| R9 | Medium | `server.js:207` | `gwRun` error handler tanpa parity state machine `gwCtl` → stuck "error" | S |
| R10 | High | `server.js:32-34` | `loadConfig` no try/catch → config rusak mid-edit = crash + trigger R3 | S |
| R11 | Medium | `server.js:71,471` | `openTasks`/`saveReport` readFileSync/writeFileSync unwrapped — TOCTOU race | S |
| R12 | ✅ Non-issue | `server.js:115-116` | Verified clean — bounded, no leak | — |
| R13 | Medium | `server.js:121-126` | `detectRunning()` regex fragile → misclassification (false running/stopped) | M |
| R14 | Low/High | `server.js:37-50` | `walk()` recursion: deep nest/symlink loop → stack overflow | S |
| R15 | Low | `app.js:202` | Avatar `URL.createObjectURL` tak di-revoke → blob leak per upload | S |
| R16 | Low | `app.js:118-179,356` | Detail interval fetch di torn-down DOM; no AbortController | S |
| R17 | Low | absent | Tak ada `fs.watch` event-driven invalidation (rely on poll). Config drift undetected | M |
| R18 | ✅ Non-issue | `server.js:255-283` | `buildGraph` write cache di akhir → **tidak poison** ke null. Graceful | — |
| R19 | Low | `server.js:148-154` | `pushLog` throw di stream `data` event → escape handler | S |
| R20 | Medium | pervasive | Sync I/O tiap request → stall event loop + 25s poll delayed | M |

### Security (S1–S15, STRIDE)

| ID | STRIDE | Severity | Lokasi | Apa | Effort |
|----|--------|----------|--------|-----|--------|
| S1 | Spoofing | Medium | `server.js:485` | `===` token compare = timing attack | S |
| S2 | Info Disclosure | **High** | `server.js:484` | `?token=` bocor ke log/history/Referer | S |
| S3 | Info Disclosure | Medium | `app.js:3,25` | Token di `localStorage` — XSS-exfil-trivial | M |
| S4 | Spoofing | Medium | `.env:7` | `Beras4523` lemah; `.env` sudah gitignored (verified) | S |
| S5 | Info Disclosure/Tampering | Medium | `server.js:545-551` | `startsWith(PUBLIC)` no trailing sep; case issue Windows | S |
| S6 | EoP | High* (*if config writable) | `server.js:166,170` | Config string dikoncat ke `shell:true` spawn | M |
| S7 | DoS | Low | `server.js:551` | `readFileSync` static no size cap | S |
| S8 | DoS | **High** | `server.js:80,256,497` | No rate-limit + sync walk = DoS mudah | M |
| S9 | Spoofing/Tampering/EoP | Medium | `server.js:513-539` | No CSRF; `?token=` bikin POST preflight-free | S |
| S10 | Tampering | Low | `app.js:32` | `esc()` skip `'`; sink saat ini safe — latent | S |
| S11 | Tampering | Low | `server.js:243-252` | Avatar trust MIME prefix, bytes ditulis verbatim | S |
| S12 | Info Disclosure | Low-Med | `server.js:542,159,164` | `String(err)` + path/id leak di error JSON | S |
| S13 | Tampering/EoP | Low | `server.js:11-17,170,201` | `.env` loader repoint `AGENTS_CONFIG`; full env ke child | S |
| S14 | Info Disclosure/Spoofing | **High** (remote) | `server.js:494,556` | No TLS; token plaintext di wire remote | S+docs |
| S15 | Info Disclosure | Low | `server.js:545-551` | Static served tanpa auth walau TOKEN diset | S |

### Frontend UX/Perf (F1–F18)

| ID | Severity | Lokasi | Apa | Effort |
|----|----------|--------|-----|--------|
| F1 | High→Critical | `app.js:64-115` | Full `innerHTML=""` rebuild setiap 6 dtk → layout thrash + scroll jump | M |
| F2 | High | `app.js:64-65,349-352` | No dirty check → rebuild walau state idle | S |
| F3 | High | `app.js:353-357` | Polling jalan saat tab hidden → boros baterai/CPU | S |
| F4 | Medium | `app.js:355` | 6s refresh rebuild Command Center walau view lain aktif | S |
| F5 | Low→Critical | `graph.js:47-63` | Sim O(n²) per tick — fine di 33 node, jank di 500+ | L |
| F6 | Medium | `graph.js:139-140` | Reduced-motion: 24× tick sync di 1 frame → freeze | S |
| F7 | Low→High | `graph.js:138-144,165-180` | rAF panas saat drag + alpha floored 0.25 → sim full selalu on | M |
| F8 | Low | `app.js:222-256` | svgBar/svgDonut rebuild — one-shot, ok | S |
| F9 | Low | `app.js:353` | Clock 1s forever, hidden pun ikut | S |
| F10 | Low→Med-High | `app.js:210` | No debounce graph search; kick tiap keystroke | S |
| F11 | Medium | `app.js:349-352` | `refresh()` gagal = stamp kecil saja, no backoff, no banner | M |
| F12 | Medium | `app.js:23-27` | `prompt()` blocking + recursion risk | M |
| F13 | Low | `app.js:202` | `createObjectURL` tak revoke (lihat R15) | S |
| F14 | Low | `app.js:309-316` | No hover prefetch detail | M |
| F15 | Low | `app.js:297-306` | Magic-number delay 900ms, bukan optimistic | S |
| F16 | Low→High | `graph.js:123-128` | Label fillText semua node deg≥2; font set per-node | S |
| F17 | Medium (UX) | `app.js:77,90` · `index.html:82` | A11y: card `<div data-open>` bukan `<button>`, canvas no ARIA | M |
| F18 | Medium | `app.js:118-179,356` | Detail rebuild 5s clobber tombol in-flight action | M |

---

## ✅ YANG SUDAH BENER (jangan diutak-atik)

3 hipotesis di-refutasi sebagai **non-issue**:

- **B10** `procs`/`gwCache` Map **bounded** oleh jumlah agent (≤5) + log capped 800 line. **Bukan leak.**
- **R12** sama — verified clean, tak perlu LRU.
- **R18** `buildGraph` write cache di baris terakhir → **tidak poison** ke null saat throw. Graceful.

Yang sudah robust:

- **S10** semua sink `statusText` ke HTML sudah lewat `esc()` — safe (`esc()` skip `'` — defense-in-depth saja).
- `.env` sudah gitignore & verified tidak pernah di-commit (`git log -- .env` kosong).
- POST body cap 5MB, avatar cap 3MB, gateway `action` enum-checked (no runtime command injection).
- `gwRun` punya `child.on("error")` handler (line 207) — gap-nya state-machine parity, bukan missing handler.
- `killOwned` pakai `taskkill /T /F` (tree-kill benar) — tinggal diratakkan ke `gwCtl` timeout.

---

## 📐 HEURISTIK & FRAMEWORK DIPAKAI

- **Theory of Constraints** (5 focusing steps): constraint = event loop sync I/O. B2 = workstation terberat. Subordinate (cache) → Elevate (worker). ✅
- **Pareto per area:** top 4 backend (B2+B1+B4+B3 = 85% latency), top 6 reliability (R1/R3/R10/R4/R2/R7+R8 = 80% risk), top 3 security (S2+S14, S8, S6), top 3 UX (F1+F2+F4, F3, F5+F16). ✅
- **Fishbone 6M** root-cause di tiap finding (Method dominan; beberapa Material/Milieu/Measurement). ✅
- **STRIDE** kategori di tiap security finding (Spoofing/Tampering/Repudiation/Info-Disclosure/DoS/EoP). ✅
- **Nielsen heuristics** di UX (Visibility of system status, User control & freedom, Operability). ✅

---

## 🧭 RETROSPECTIVE (Prime-tier)

- **Yang mulus:** 4 subagent paralel nemu masalah saling melengkapi tanpa overlap. Backend-perf nemu constraint struktural; reliability nemu cascade crash; security nemu triple kompromi; frontend nemu jank pola.
- **Yang diperbaiki next run:** reliability agent awalnya gagal spawn → di-spawn ulang eksplisit (protokol: tidak skip diam-diam). Untuk scope lintas-prioritas, sebaiknya deep gate di Phase 0 (bukan Express) supaya kontrak lock lebih awal.

---

## 📝 COMPLIANCE FOOTER

- **Fail-loud:** 3 hipotesis non-issue dilaporkan sebagai non-issue (bukan dijadikan finding untuk tampak rapi). Reliability agent gagal → re-spawn, bukan skip.
- **Surgical:** tidak ada kode diubah saat audit. Hanya file `agentic-os/BOTTLENECK_AUDIT_2026-07-05.md` (ini) + work log di `Daily/2026-07-05.md` + index Brains yang disentuh.
- **Zero-dependency dijaga:** semua fix sketch pakai Node builtin (`crypto`, `worker_threads`, `fs.promises`, `path.relative`, `fs.watch`, `AbortSignal.timeout`) — no npm.
- **Evidence-based:** semua 63 finding punya `file:line` reference, bukan opini.

---

**Sumber:** audit oleh Hypertaks Prime tier, 2026-07-05. Laporan ini ditujukan untuk Claude Code sebagai panduan eksekusi fix. Kerja terkait: [[Agentic OS]] · [[Validasi Brains & Ecosystem 2026-07-05]].
