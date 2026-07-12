# Rempeyek Agent OS — Roadmap Eksekusi Lanjutan

Tanggal: 2026-07-12  
Status: aktif setelah audit implementasi Plan B

## Keputusan

Implementasi sebelumnya harus diperlakukan sebagai **fondasi produk dan runtime**, bukan transformasi desain final. Backend, security, project context, approval queue, dan graph data contract sudah bertambah; namun perubahan visual belum memenuhi brief awal. Roadmap ini memisahkan pekerjaan yang benar-benar selesai, pekerjaan yang belum terlaksana, alasan kegagalan eksekusi, serta acceptance criteria yang mencegah klaim selesai terlalu dini.

## Koreksi terhadap klaim sebelumnya

Klaim “seluruh Plan B selesai” terlalu luas. Test dan build membuktikan stabilitas teknis, tetapi tidak membuktikan kualitas visual, perbedaan tema, atau fidelity terhadap brief. Perubahan frontend sebelumnya masih menempel pada information architecture, komponen, layout radial, dan CSS legacy.

## Yang sudah terlaksana

- Server test seam dan access policy fail-closed.
- ProjectWorkspace domain, Today projection, dan approval queue.
- Vault graph berbasis file Markdown, wikilink, tag, folder, ghost link, dan orphan.
- Agent topology menolak relasi tanpa provenance.
- Empat ID tema canonical beserta migrasi ID lama.
- Obsidian Parity/Cosmos toggle, table fallback, reduced motion, dan effect tier dasar.
- Slot aktif Copilot diganti Codex.
- Summon profile canonical untuk delapan agent.
- Pemeriksaan dan pemulihan gateway Hermes serta OpenClaw.

## Yang belum terlaksana secara memadai

### 1. Redesign image-first per layar

Belum ada reference image final terpisah untuk Today, Project Workspace, Neural Vault, Agent Map, Advanced Operations, dan empat mode tema. Satu reference awal tidak cukup untuk mengendalikan seluruh produk.

**Pembenaran teknis:** tidak ada. Ini adalah kesalahan urutan eksekusi. Image generation seharusnya menjadi design source of truth sebelum coding visual.

### 2. Empat tema yang benar-benar struktural

Minimalist, Brutalist, Glassmorph, dan Cyberpunk masih berbagi terlalu banyak layout, typography, density, dan component treatment. Perbedaan utama masih token warna, radius, blur, border, dan shadow.

**Penyebab:** CSS legacy dan komponen tunggal dipertahankan untuk mengurangi risiko, tetapi keputusan itu mengorbankan brief visual.

### 3. Neural Cosmos renderer final

Cosmos sudah memakai data Vault nyata, tetapi art direction, cluster composition, depth, particle routing, label hierarchy, selection states, dan visual rhythm belum mencapai kualitas reference Obsidian maupun brief luxury cyberpunk.

**Penyebab:** pekerjaan berhenti pada data contract, compatibility adapter, dan performance guard; renderer tidak menjalani siklus reference → screenshot → compare → iterate.

### 4. Agent Map final

Relasi palsu sudah dihapus, tetapi komposisi masih memanfaatkan layout radial lama. Belum ada visual grammar kuat untuk dependency, task routing, subagent, communication, incident, heartbeat, dan approval dependency.

### 5. Browser visual QA

Belum ada baseline screenshot pada 1440×900, 1280×800, 768px, dan 390px untuk seluruh tema dan layar utama. Tidak ada visual-diff gate yang membandingkan implementasi dengan reference image.

### 6. Performance validation skala besar

Effect tier sudah ada, tetapi benchmark resmi 1.000, 10.000, dan 100.000 notes belum menjadi release gate. Pemindahan parsing besar ke worker/thread atau incremental index belum dilakukan.

## Roadmap eksekusi

### Stage A — Visual contract dan reference images

1. Generate satu gambar standalone beresolusi besar untuk setiap layar utama.
2. Generate empat reference tambahan untuk layar yang sama dalam Minimalist, Brutalist, Glassmorph, dan Cyberpunk.
3. Ekstrak typography, spacing, grid, material, motion semantics, dan responsive behavior ke design specification.
4. Founder memilih reference final sebelum implementasi visual.

**Acceptance criteria:** semua text dan controls dapat dibaca; satu visual hero per layar; tidak ada fake metrics, decorative graph, gamer HUD, nested-card spam, atau neon overload.

### Stage B — Theme architecture completion

1. Pisahkan semantic tokens dari structural mode tokens.
2. Buat variasi density, typography scale, border system, elevation, navigation treatment, dan graph rendering per mode.
3. Pertahankan data, accessibility, dan interaction contract yang identik.

**Acceptance criteria:** screenshot grayscale tetap menunjukkan empat identitas berbeda melalui struktur, bukan hanya warna.

### Stage C — Today dan Project Workspace redesign

1. Today menampilkan last active project, one next action, approvals, recent output, dan system health tanpa dashboard clutter.
2. Project Workspace mendapat Overview, Tasks, Memory, Files, Decisions, dan Activity yang jelas.
3. Technical plumbing dipindahkan ke Advanced Operations.

**Acceptance criteria:** user dapat melanjutkan pekerjaan kemarin dalam maksimal dua interaksi tanpa membuka terminal atau membaca JSONL.

### Stage D — Neural Vault Cosmos v2

1. Gunakan satu dataset untuk Parity dan Cosmos.
2. Implement stable seeded layout, cluster gravity, semantic node sizing, progressive detail, dan meaningful particles.
3. Tambahkan keyboard selection, neighborhood focus, breadcrumbs, legend, table parity, dan motion pause.
4. Tambahkan incremental cache dan worker-based parsing bila benchmark membuktikan perlu.

**Acceptance criteria:** jumlah node/edge identik dengan API; 1.000 nodes tetap interaktif; mode reduced-motion tetap informatif; setiap efek mewakili state nyata.

### Stage E — Agent Map v2

1. Layout mengikuti topology nyata, bukan orbit default.
2. Edge memiliki provenance dan legend: dependency, task, subagent, communication, approval.
3. Tidak ada core/hub jika datanya tidak ada.
4. Empty state menjelaskan data relationship yang belum tersedia.

**Acceptance criteria:** setiap edge dapat ditelusuri ke config, telemetry, task, atau subagent record.

### Stage F — Release verification

1. Unit dan HTTP integration tests.
2. Browser smoke dan keyboard navigation.
3. Screenshot matrix per layar, breakpoint, dan tema.
4. Performance benchmark Vault fixture.
5. Security review untuk terminal, gateway, approval, dan path boundary.

**Definition of done:** build/test saja tidak cukup; reference fidelity, runtime health, accessibility, dan responsive screenshots harus lolos bersama.

## Kontrak summon canonical

| Agent | Working directory | Command |
|---|---|---|
| Claude Code | `C:\Users\abrur\.claude` | `claude` |
| Cline | `C:\Users\abrur\.cline` | `cline` |
| Codex | `C:\Users\abrur\.codex` | `codex` |
| Antigravity | `C:\Users\abrur\.gemini` | `agy` |
| Kilo Code | `C:\Users\abrur\.kilocode` | `kilo` |
| OpenClaw | `C:\Users\abrur\.openclaw` | `openclaw` |
| Pi | `C:\Users\abrur\.pi` | `pi` |
| Hermes | `C:\Users\abrur\AppData\Local\hermes` | `hermes` |

Built-in mapping adalah canonical dan tidak bergantung pada nilai config lama. Custom agent tetap memakai `gateway.home` dan `gateway.trigger` dari konfigurasi terpercaya.

## Kondisi gateway setelah perbaikan

### Hermes

- CLI executable dan profile tersedia.
- Gateway berjalan sebagai process aktif.
- Scheduled Task lama masih disabled.
- Installer resmi membuat Startup-folder service fallback agar gateway kembali saat login.
- Dashboard memakai Hermes CLI resmi untuk `start`, `stop`, `restart`, `status`, dan debug `run --replace`.

### OpenClaw

- Scheduled Task tersedia dan enabled.
- Gateway berhasil dimulai ulang.
- Listener `127.0.0.1:18789` aktif.
- CLI connectivity probe berhasil.
- Dashboard tetap memakai TCP probe sebagai sumber health utama.

## Risiko tersisa

- Hermes belum memakai Scheduled Task karena instalasi elevated tidak disetujui dalam proses non-interaktif; Startup fallback adalah kondisi jujur saat ini.
- OpenClaw dapat hidup namun request model tetap gagal ketika provider rate-limit atau context overflow; itu masalah provider/session, bukan gateway listener.
- `telemetry/memory-capture.json` adalah perubahan runtime lokal dan tidak boleh masuk commit implementasi.
- Obsidian Vault tetap menjadi data user; pengujian write path harus memakai fixture/temp Vault.

## Urutan prioritas

1. Reference images dan visual acceptance contract.
2. Theme architecture serta Today redesign.
3. Neural Vault Cosmos v2.
4. Agent Map v2.
5. Browser visual QA dan benchmark release gate.

Roadmap ini tidak mengizinkan klaim “selesai” hanya berdasarkan test/build. Status final harus menyertakan screenshot, runtime probe, accessibility check, dan perbandingan terhadap reference design.
