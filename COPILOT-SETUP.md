# Copilot CLI — catatan status (sementara)

Copilot CLI = **Node-12** di [[Our Family]] (ikon ⬜, path `C:\Users\abrur\.copilot`).
Per konstitusi ekosistem: Copilot **tidak punya subcommand `gateway`** (cuma
`login/mcp/plugin/skill/update/--acp`) — dipakai **manual di CLI-nya**, bukan
dikontrol dashboard. Jadi di dashboard Copilot **tidak** punya Start/Stop/Status gateway.

## Yang sudah dipasang (sementara)
- **Kartu Copilot** muncul untuk observability + tombol **⧉ Panggil** → buka Windows
  Terminal admin di `.copilot` lalu auto-run `copilot`.
- **Avatar sementara**: `public/avatars/copilot.svg` (mark `>_`). Ganti dengan foto
  asli lewat tombol ✎ di kartu detail (upload PNG/JPG akan menimpa placeholder ini).
- **Status dot** sekarang jujur: hijau hanya kalau gateway benar-benar running.
  Copilot (tanpa gateway) tampil idle sampai ada telemetry.

## Yang bisa diisi Copilot sendiri nanti
1. Lapor aktivitas via telemetry → `telemetry\copilot.jsonl` (lihat `telemetry\README.md`,
   type `task_start/progress/done`, `subagent_start/done`) supaya Sesi/Subagent/Telemetry keisi.
2. Buat lane `Brains/Copilot/` di vault saat orchestration diaktifkan (sekarang manual CLI).
3. Ganti avatar sementara dengan yang asli.

Jangan tambahkan aksi gateway palsu (start/stop/status) — Copilot memang tidak punya.
