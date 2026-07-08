# Agentic OS — Roadmap Pengembangan

> Prinsip: **fitur harus bayar sewa** — kepakai buat keputusan/operasi. Yang cuma
> dipandangin = hiasan, buang. YAGNI: jangan bangun buat masalah yang belum ada.

## 🔴 Tier 1 — nutup lubang nyata (prioritas) — ✅ SELESAI 2026-07-08

> #1, #2, #3 terpasang & terverifikasi (Claude Code). Detail per-item di bawah.

### 1. ✅ Alert waktu agent mati
- **Masalah:** Hermes/OpenClaw 24/7. Kalau tumbang jam 3 pagi, baru ketahuan pas buka
  dashboard. Status di-poll tiap 45s, deteksi via regex teks (`detectRunning`) — rapuh.
- **Solusi:** saat status `running → down` atau `run` exit non-zero → tulis 1 baris ke
  `Inbox/` vault (muncul di Needs Review) + notifikasi desktop Windows. Opsional push HP.
- **Nilai:** inti dari klaim "24/7 ops". Tanpa ini observability setengah.

### 2. ✅ Riwayat uptime + wire daily-bridge
- **Masalah:** dashboard cuma tahu status **sekarang**. Nggak bisa jawab "Hermes nyala
  full semalam?". `scripts/hermes-daily-bridge.cjs` **ada tapi nggak dijalanin** scheduler.
- **Solusi:** server catat tiap poll ke `telemetry/uptime.jsonl` (ts + status) → strip
  uptime 24 jam di kartu agent. Jalanin daily-bridge tiap jam dari server.
- **Nilai:** "status now" → "status sepanjang waktu" = monitoring beneran.

### 3. ✅ Telemetry gampang diisi (fix akar panel kosong)
- **Masalah:** panel Sesi/Subagent/Telemetry kosong (Copilot/OpenClaw) karena agent harus
  nulis JSONL manual — jarang kejadian.
- **Solusi:** helper 1-baris (`report.cmd "task" 50` atau fungsi kecil) yang agent tinggal
  panggil. Friksi turun → panel keisi.
- **Nilai:** observability jadi nyata, bukan teater kosong.

## 🟡 Tier 2 — solid, bukan darurat — ✅ SELESAI 2026-07-08

### 4. ✅ Log gateway disimpan ke disk
- Log `run` sekarang cuma di memori (800 baris, `pushLog`) → **hilang saat restart**.
  Append ke file per-agent (rotasi) biar selamat dari restart & bisa di-scroll balik.
- **Selesai:** `pushLog` append JSONL ke `telemetry/logs/<id>.log` (rotasi naif 1 MB),
  detail agent fallback ke disk pasca-restart (`readDiskLog`).

### 5. ✅ Kirim task ke agent dari dashboard
- Sekarang dashboard cuma **baca + kontrol gateway**. Tambah kotak "kasih task" → tulis ke
  `Tasks/`/`Inbox/` vault + tag agent → muncul di Needs Review, agent ambil sendiri.
  Dashboard: **pasif → bisa nyuruh**. Sesuai model vault-sebagai-papan-tugas.
- **Selesai:** form di panel Needs Review → `POST /api/task` → checkbox ke
  `Tasks/Inbox Tasks.md` (`createTask`) → langsung nongol di Needs Review.

## 🟢 Tier 3 — ide tambahan yang berguna (lanjutan) — ✅ SELESAI 2026-07-08

### 6. ✅ Watchdog auto-restart untuk agent 24/7
- **Masalah:** lanjutan #1 — tahu agent mati aja nggak cukup, sering solusinya "restart".
- **Solusi:** opsional per agent, kalau native-service tumbang → auto `restart` dengan
  backoff (mis. maks 3x/jam biar nggak loop) + tetap kirim alert.
- **Nilai:** downtime turun tanpa lu harus melek. **Hati-hati:** wajib ada batas anti-loop.
- **Selesai:** `maybeWatchdog()` — opt-in per agent (`gateway.watchdog: true`, default **false**),
  hard-limit 3 restart/jam (`restartLog`), tetap kirim alert tiap percobaan. Dipicu dari transisi
  running→down (probe & status poll). **Default OFF** — nyalain manual di config kalau siap.

### 7. ✅ Health probe asli (bukan cocok-cocokan teks)
- **Masalah:** status ditebak dari output `<bin> status` via regex (`detectRunning`) — bisa
  salah. OpenClaw jalan di port 18789.
- **Solusi:** untuk yang punya port, probe HTTP ke portnya (mis. `GET :18789/health`).
  Hidup beneran = 200, bukan sekadar schtask "running".
- **Nilai:** status jujur — nggak ada "hijau padahal mati".
- **Selesai:** `probePort()` TCP-connect ke `gateway.probe {host,port}` (OpenClaw `:18789`).
  Connect sukses = hidup. **Deviasi dari rencana:** pakai TCP-connect, bukan `GET /health` —
  lebih robust (nggak asumsi ada route `/health`), tetap membuktikan proses listening di port.

### 8. ✅ Panel jadwal (scheduled tasks)
- **Masalah:** Hermes (schtask `Hermes_Gateway`) & OpenClaw (Scheduled Task) jalan via
  Windows scheduler, tapi dashboard nggak nunjukin **apa yang bakal jalan & kapan**.
- **Solusi:** baca `schtasks` agent → panel "Jadwal": next run, last result. Jawab
  "apa yang jalan malam ini?".
- **Nilai:** sesuai konsep command center ("what is scheduled") — real ops.
- **Selesai:** `/api/schedule` baca `schtasks /query` per agent (`gateway.schtask`) → panel
  "JADWAL" (next/last run + last result, hijau kalau result 0). Config: Hermes `Hermes_Gateway`,
  OpenClaw `OpenClaw Gateway`.

### 9. ✅ Panel keamanan vault (anti kehilangan otak)
- **Masalah:** vault = otak seluruh ekosistem. Kalau korup/kehapus, semua ilang. Konstitusi
  nyebut git init + script backup, tapi dashboard nggak nunjukin statusnya.
- **Solusi:** panel kecil: umur commit git vault terakhir + backup terakhir. Merah kalau
  udah lama nggak di-backup.
- **Nilai:** cegah data-loss — nilai tertinggi buat sistem yang datanya = aset.
- **Selesai:** `/api/vault-health` → umur commit git vault (`git log -1 %cI`, merah kalau >48 jam)
  + umur backup via env `BACKUP_PATH` (opsional). Panel "VAULT HEALTH" di Command Center.
  › **TODO kecil:** set `BACKUP_PATH` di `.env` biar baris backup hidup.

### 10. ✅ Guard konfirmasi untuk aksi merusak (native-service)
- **Masalah:** Hermes singleton; `run --replace` / stop bisa ganggu service 24/7 yang lagi
  jalan. Config udah ada `note` peringatan, tapi tombol tetap langsung eksekusi.
- **Solusi:** konfirmasi 1x sebelum stop/run pada agent `owner: native-service`.
- **Nilai:** cegah nggak sengaja matiin agent 24/7. Kecil, tapi nyelametin.
- **Selesai:** guard `confirm()` di `app.js` sebelum stop/restart/run pada agent
  `owner: native-service` (Hermes, OpenClaw).

### 11. ✅ Config tahan-banting
- **Masalah:** `agents.config.json` diedit manual; kalau JSON rusak, endpoint `/api/state`
  bisa 500 → dashboard blank tanpa alasan jelas.
- **Solusi:** kalau parse config gagal, tampilin banner error jelas (baris/pesan) bukan
  layar kosong. Tombol "reload config".
- **Nilai:** robust — salah ketik nggak bikin panik.
- **Selesai:** `loadConfig()` simpan `configError`, dikirim di `/api/state`, `app.js` tampilkan
  banner kuning di atas dashboard (isi pesan parse error). Reload otomatis by-mtime — nggak
  perlu tombol reload manual (YAGNI).

## ✅ Bonus (dua-arah, di luar roadmap awal)
- **Tandai task selesai dari dashboard** — tombol "✓ selesai" di Needs Review → `POST /api/task/done`
  ubah `- [ ]` jadi `- [x]` di file vault. Melengkapi loop dua-arah #5 (dashboard bukan cuma
  nyuruh, tapi juga nutup task). Guard: cuma boleh nyentuh path di dalam `Tasks/`.

## 💡 Ide lanjutan (belum dibangun — nunggu kebutuhan nyata)
- **Backup otomatis vault** — schtask harian `git -C vault commit` + salin ke `BACKUP_PATH`.
  Panel #9 udah siap nampilin umurnya; tinggal bikin yang ngisi. (Konstitusi: jatah Hermes.)
- **Push notif HP** saat alert (lanjutan #1) — via ntfy.sh/Telegram, kalau lu sering jauh dari meja.
- **Watchdog buat OpenClaw** — schtask "OpenClaw Gateway" `last result 1` (gagal) padahal probe
  OPEN. Layak diselidiki: kenapa schtask exit 1 tapi service tetap listening?
- **Filter/search di Needs Review** kalau task numpuk >20 (sekarang belum perlu — YAGNI).

## ⚫ Ditolak (hiasan — jangan dibangun)
- Tema/animasi/graf 3D/avatar-efek tambahan — dashboard udah cukup, nol nilai operasi.
- Multi-user/cloud/login rumit — single-user lokal, over-engineering. (Baru relevan kalau
  akses dari HP/luar, ada tim/klien, atau dijual ke klien — pun mulai dari yang minimal.)
- Chart yang nggak ngarahin tindakan. Tes: "kalau angkanya X vs Y, gue ngapain beda?"
  Nggak ada jawaban → buang.

---

**Urutan mulai (rekomendasi):** #1 (alert mati) → #3 (telemetry gampang) → #2 (uptime) →
#7 (health probe) → sisanya sesuai kebutuhan.

**Status: Tier 1–3 (#1–#11) + bonus dua-arah SELESAI & terverifikasi 2026-07-08 (Claude Code).**
Sisa cuma "ide lanjutan" yang sengaja ditunda sampai ada kebutuhan nyata (YAGNI).

*Dibuat: 2026-07-07 · Tier 1–3 tuntas 2026-07-08. Update file ini kalau prioritas berubah.*
