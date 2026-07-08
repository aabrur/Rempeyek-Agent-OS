# AGENTIC//OS — Neural Command Deck

Satu dashboard untuk semua agent: apa yang bisa dikerjakan, apa yang sedang jalan,
dan hasil terbarunya — semua dari satu layar. Data live dibaca dari Obsidian Vault
(`C:\Users\abrur\Obsidian Vault`) sebagai memory layer, dengan daily log per-agent di
`Brains/<Lane>/`.

## Jalankan

```powershell
npm run dev            # http://localhost:4321
```

Port dipakai? `set PORT=4322` lalu `npm run dev`. Kalau ada node nyangkut di 4321,
matikan dulu prosesnya (`netstat -ano | findstr :4321` → `taskkill /PID <pid> /F`).

Auth opsional: set `DASH_TOKEN` di `.env` → dashboard minta header `x-dash-token`
(localhost selalu dibolehkan).

## Agents & gateway

Dikonfigurasi di `agents.config.json` (`agency`, `workdir`, lalu array `agents`).
Tiap agent punya blok `gateway`:

| field | fungsi |
|-------|--------|
| `bin` | command gateway (start/stop/restart/status headless) |
| `cwd` | folder tempat command gateway dijalankan |
| `home` | folder default untuk **Open terminal · panggil agent** |
| `trigger` | perintah yang di-auto-run di terminal saat "panggil agent" |
| `runCmd` | override command untuk `run` (foreground / terminal) |
| `actions` | subset dari `start,stop,restart,status,run` |

### Tombol Start (split dropdown)

- **▶ Start** (klik utama) → buka **Windows Terminal admin** di `home`, auto-run `trigger`.
- **▾ → Gateway start · terminal** → terminal admin di `cwd`, jalankan `<bin> start`.
- **▾ → Gateway run · terminal** → terminal admin di `cwd`, jalankan `runCmd`.
- **▾ → Start headless (background)** → jalankan `<bin> start` tanpa jendela (observability).

Terminal yang dibuka **tidak** di-own dashboard, jadi **Stop / Stop Semua** menghentikan
gateway headless/owned tapi **tidak menutup** terminal CLI/TUI yang kamu buka sendiri.

## Detail agent

Klik kartu agent: **Sesi/Aktivitas**, **Subagent/Task**, **Telemetry**, dan
**Lane vault — Brains/**. Claude Code dibaca dari transcript `.claude\projects\`;
agent lain lapor via `telemetry\<id>.jsonl` (lihat `telemetry\README.md`).

## Neural Vault

Tab **Neural Vault** = force-graph `[[wikilink]]` dari vault. Tombol **⧉ OPEN VAULT**
(dan **✳ Open Neural Vault** di sidebar) membuka vault langsung di Obsidian.
# Rempeyek-AgentOS
