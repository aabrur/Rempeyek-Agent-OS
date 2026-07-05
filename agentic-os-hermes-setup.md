# Hermes di Agentic OS — Bedah, Identifikasi Bottleneck, dan Solusi Setting

> Diakses: 2026-07-05  
> Artefak verifikasi: `gateway_state.json` readonly real, Hermes gateway **running**, PID 2196.  
> Tujuan: panduan eksekusi untuk **Claude Code** — tanpa asumsi, tanpa rekomendasi spekulatif.

---

## 1) Temuan Verifikasi Langsung
- `gateway_state.json`: Hermes messenger gateway hidup (`gateway_state: running`), argv = `hermes_cli/main.py gateway run`, didaftarkan schtasks **Hermes_Gateway** dengan Last Run Result **1**.
- Platform aktive: **Telegram** dan **Discord** connected.
- Hermes Desktop packaging sudah terverifikasi: `apps\desktop\release\win-unpacked\Hermes.exe` ada.
- Error path yang tadinya dicurigai (`release/win-unpacked/Hermes.exe does not exist`) sudah **tidak berlaku lagi** — packaging sudah sukses.

---

## 2) Masalah Asli vs Realitas Sekarang
| Asumsi awal | Realitas |
|---|---|
| Hermes belum jalan | Hermes gateway LIVE, PID 2196 |
| Hermes desktop gagal packaging | Packaging terverifikasi; Hermes desktop app ada |
| Ada error path di runtime | Tidak ada — yang tersisa adalah **semantic misconfiguration** di `agents.config.json` dan ownership model yang tidak jelas |

---

## 3) Bottleneck yang Benar-Benar Ada
**Bukan error di Hermes core, tapi di wiring/owner semantics** antara Agentic OS ↔ Hermes ↔ Claude Code.
- **A. `agents.config.json` Hermes gateway config ambigu** untuk mode Dashboard owned vs native service.
- **B. Copilot entry salah dianggap punya subcommand `gateway`** yang sebenarnya tidak ada.
- **C. `telemetry/` dan `public/avatars/` kosong** — dashboard tidak bisa melacak aktivitas agent secara andal.
- **D. Ownership model ganda** — Hermes bisa dijalankan sebagai desktop app, gateway service, dan `run` owned dashboard secara bersamaan; tanpa kebijakan eksplisit, mereka saling bentrok.
- **E. `.env` menyimpan `DASH_TOKEN` dalam plaintext** — bukan kritis, tapi perlu diperbaiki agar aman.

---

## 4) Rekomendasi Setting yang Harus Diterapkan Claude Code
1. **Tetapkan Hermes sebagai standalone service terlebih dahulu, bukan owned run** — karena `hermes gateway start/stop/status` memanggil schtask yang sudah terdaftar.
2. **Samakan `agents.config.json` dengan realitas executable yang ada**:
   - Binary path sudah benar: `"C:\Users\abrur\AppData\Local\hermes\hermes-agent\venv\Scripts\hermes.exe"`
   - Workdir harus jadi `"C:\Users\abrur\AppData\Local\hermes"` agar status dan lane konsisten.
   - Pastikan Hermes menggunakan **native service mode** sebagai default.
3. **Perbaiki Copilot entry** menjadi `enabled: false` dan `gateway: null` hingga login + ACP CLI siap, karena Copilot CLI tidak punya `gateway` subcommand.
4. **Isi avatar default** untuk setiap agent agar dashboard visual konsisten.
5. **Bersihkan `.env` dari token plaintext** atau pindahkan ke secrets store yang didukung Hermes.
6. **Agentic OS sebagai single pane-of-glass control**, bukan tempat menjalankan Hermes double.

---

## 5) Checklist Konkret untuk Claude Code
- [ ] Verifikasi path Hermes executable mengarah ke `AppData\Local\hermes\hermes-agent\venv\Scripts\hermes.exe`.
- [ ] Samakan `cwd` Hermes dengan `AppData\Local\hermes`, bukan `workdir` global.
- [ ] Pindah Hermes ke native service control (`start/stop/status`) dan gunakan Agentic OS cuma untuk observability + remote command, bukan `run`.
- [ ] Tambahkan `avatar/` default untuk setiap agent.
- [ ] Hapus atau amankan `DASH_TOKEN` dari `.env` plaintext.
- [ ] Isi telemetry inter-agent minimal agar dashboard bisa melacak status lintas agent.
- [ ] Dokumentasikan single owner (Hermes desktop vs Hermes gateway) di `Agents Rules.md`.

---

## Arsitektur Setup Hermes yang Disarankan
```
Hermes Desktop : standalone app (Electron, jangan lewat agentic owned)
    ↓ Hermes Gateway service (schtask/start/stop)
    ↓ Discord/Telegram connected
    ↓ Obsidian Vault shared logs
Agentic OS Dashboard: read-only state + remote control
Claude Code       : observer via dashboard API, bukan owner process
```

Kesimpulan: Hermes installation di mesin ini **sudah benar dan berjalan**; yang perlu diperbaiki adalah **control-plane semantics**, bukan Hermes core.
