# Rempeyek Agent OS — Release QA Report

Tanggal verifikasi: 2026-07-13

Scope: `EXECUTION-ROADMAP-CONTINUATION.md`, Plan B

## Hasil

Release candidate memenuhi workflow utama roadmap: pengguna dapat melanjutkan project dari Today, membuka enam area Project Workspace, memilih empat tema struktural, membaca graph nyata dari Obsidian Vault, melihat Agent Map tanpa relasi palsu, serta membuka kontrol summon/gateway tiap agent. Copilot CLI telah digantikan oleh Codex pada registry dan kontrak summon.

## Data yang diverifikasi

- Obsidian Vault dibaca read-only dari path yang dikonfigurasi.
- Snapshot browser nyata memuat `356 nodes` dan `557 edges` dari Vault lokal.
- Cosmos dan Obsidian Parity memakai projection data yang sama; mode hanya mengubah layer dan visual grammar.
- Agent Map memuat 8 agent dan 0 edge pada fixture tanpa provenance. UI menampilkan kondisi ini secara jujur dan tidak membuat core/hub palsu.
- Hermes dan OpenClaw menampilkan `Summon`, `Stop`, `Restart`, dan `Status` dari action contract masing-masing.

## Visual dan interaction QA

| Area | 1440×900 | 1280×800 | 768×1024 | 390×844 |
|---|---:|---:|---:|---:|
| Today | Lulus | Lulus | Lulus | Lulus |
| Project Workspace | Lulus | — | — | Fallback responsif tervalidasi |
| Neural Vault | Lulus | — | Lulus | Fallback responsif tervalidasi |
| Agent Map | Lulus | — | — | Lulus; graph memakai scroll internal |
| Theme picker | 4 tema lulus | Lulus | Lulus | Lulus |
| Hermes/OpenClaw detail | Lulus | — | — | Layout fallback tersedia |

Tidak ada horizontal overflow pada page di 1280, 768, dan 390. Pada mobile, semua primary navigation dan theme controls berukuran minimum 44×44 px. Agent Map yang lebih lebar memakai scroll container lokal, bukan memperlebar seluruh page.

## Empat tema struktural

- Minimalist: permukaan terang, tipografi tenang, efek dekoratif dimatikan.
- Brutalist: kontras keras, radius nol, border tebal, layout utilitarian.
- Glassmorph: surface transparan, depth/blur terbatas, hierarchy berbasis layer.
- Cyberpunk: Neural Cosmos, glow hanya untuk status aktif/fokus, motion hanya untuk heartbeat, flow, selection, dan perubahan data.

Theme picker memakai radiogroup berlabel. Arrow key berpindah dari Minimalist ke Brutalist dan memperbarui `data-theme` serta fokus secara bersamaan.

## Neural Vault Cosmos

- Layout seeded dan deterministik; urutan input tidak mengubah hasil.
- Cluster utama disusun pada orbit elips yang tersebar, dengan root di pusat bila ada.
- Anggaran label mengikuti effect tier dan lebar Canvas.
- Label landmark dipilih berdasarkan folder dan degree, dibatasi, lalu melewati collision check.
- Node size = degree, bloom = note baru, dashed/faded = unresolved, ring = perubahan snapshot.
- Selection wave hanya muncul setelah input eksplisit; reduced motion mematikan motion.
- Search, neighborhood focus, inspector, keyboard traversal, open-in-Obsidian, dan table fallback tersedia.

## Agent Map

- Tidak ada radial core default.
- Edge hanya diterima jika type, source, target, dan provenance valid.
- Legend membedakan dependency, task, subagent, communication, dan approval.
- Animasi edge hanya berlaku untuk flow yang sedang aktif dan tetap mengikuti reduced motion.
- Inspector dan table fallback memperlihatkan sumber provenance.

## Functional smoke

- Today → Continue membuka Project Workspace dan destination yang relevan.
- Project Workspace: Overview, Tasks, Memory, Files, Decisions, Activity tersedia dengan empty state jujur.
- Hermes Agent Detail terbuka tanpa runtime error dan menunjukkan action gateway lengkap.
- OpenClaw Agent Detail terbuka tanpa runtime error dan menunjukkan action gateway lengkap.
- Browser session bersih tidak menghasilkan application error; warning yang terlihat berasal dari browser-plugin liveness stream, bukan aplikasi.

## Verifikasi otomatis

- `npm test`: 66 test lulus, 0 gagal.
- `npm run build`: production build sukses, 60 module ditransformasi.
- Benchmark 1.000 node: deterministic layout + projection jauh di bawah budget 1.500 ms pada mesin verifikasi.
- `git diff --check`: lulus.

## Bukti screenshot

- QA screenshots are generated locally during release review and kept outside the public repository and npm package because they may display a user's private roster, vault metadata, or avatars.

## Batasan yang disengaja

- Tidak ada WebGL/Three.js; Canvas 2D memenuhi kebutuhan saat ini dengan biaya runtime dan maintenance lebih rendah.
- Graph 10.000/100.000 note belum menjadi interactive full-detail graph. Dataset di atas threshold harus masuk aggregate/indexed mode pada roadmap berikutnya.
- Browser QA memakai API fixture read-only yang membaca Vault nyata untuk mencegah perubahan pada user data dan proses produksi.
- Screenshot regression otomatis berbasis pixel belum ditambahkan; screenshot release ini menjadi baseline manual pertama.
