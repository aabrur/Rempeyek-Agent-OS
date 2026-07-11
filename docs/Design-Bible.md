# Design Bible

The visual constitution of REMPEYEK AGENT OS. Every UI change is measured against this.

## Identity

**Neural Cosmos** — a living command deck floating over a dim cosmos. Luxury cyberpunk,
organic intelligence, Apple-grade restraint. The interface should feel like a premium
instrument, not a game HUD.

**Never:** RGB overload, gamer aesthetic, hacker-terminal green rain, Matrix, globes,
motherboards, robots, literal brain illustrations.

## Typography

| Role | Face | Usage |
|---|---|---|
| Hero / display | **Orbitron** (900/700, fallback Bahnschrift) | page titles, brand, big numbers — gradient-filled, used sparingly |
| UI | **Bahnschrift / Segoe UI Semibold** | buttons, nav, names |
| Data | **Cascadia Mono** | labels, chips, logs, timestamps — uppercase + letter-spacing for eyebrows |

Rule: Orbitron only on display-size text. Small UI stays Bahnschrift so nothing crowds.

## Color

One master accent (`--acc`) drives the whole deck through `color-mix()` — glows,
borders, gradients, active states. Surfaces are a five-step dark stack
(`--bg → --panel → --card → --card-hi → --line`). Semantic colors (lime=running,
amber=waiting, red=error, muted=idle) never change meaning across themes.

Per-agent accents are **identity** (stable across themes); the theme is **chrome**.
See [Theme-System.md](Theme-System.md).

## Surfaces & depth

Glass panels: translucent card gradients + `backdrop-filter: blur(7–10px)` over the
living cosmos backdrop, hairline `--line` borders, soft accent glows
(`box-shadow: 0 0 Npx color-mix(...)`). Radius scale: 7px (controls) · 9–10px (rows,
boxes) · 12–14px (panels, cards).

## Motion

Subtle and purposeful, never decorative noise:

- ambient: nebula drift (90s), star twinkle, skeleton shimmer
- status: pulse on running dots, orbit rings + shockwaves on active topology nodes
- feedback: 150ms hover transitions, 180ms view fade-in, button press = 1px translate

**Everything animated is gated behind `prefers-reduced-motion`.** Focus states are
always visible (`:focus-visible` outline in accent).

## Layout

8pt-ish grid (gaps 6/8/10/14px, panel padding 14–16px). Auto-fit card grids
(`minmax(215px, 1fr)`). One clear hierarchy per view: eyebrow label → display title →
meta line → content. Whitespace is part of the design — don't fill every corner.

## Writing in the UI

Plain verbs, sentence case in prose, uppercase only for eyebrow/mono labels. Buttons
say exactly what they do ("▶ START ALL GATEWAYS"). Empty states are invitations with
the next action, not apologies. Errors say what happened and how to fix it.
