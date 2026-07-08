---
name: agentic-os-installer
description: Ship a complete Claude Code powered Agentic OS for your agency instead of building it over three weekends. This skill installs the whole operating system that produces your automations: Claude Code as the engine, a memory layer, your Google suite wired in, and skill packs for research, content, ops, and data, all rolled into one dashboard command center. Use it when you run an AI agency and want to stop selling one-off automations and start installing the system that produces them.
---

<!--
  GIVEAWAY SKILL, built by Gennaro Santoro (Operations Heroes).
  You commented the keyword, here it is. Drop this file into your agent and go.
-->

# Agentic OS Installer

> **What this does (in one line):** You tell Claude about your agency stack and it stands up your whole Agentic OS, engine, memory, Google suite, skill packs, and one dashboard, so you have a working operating system instead of a pile of disconnected automations.

## ⚙️ BEFORE YOU START: fill these in

These are the only things you need to provide. Everything else is automatic.

| Fill in | What it is | Example |
|---|---|---|
| `AGENCY_NAME` | What to call this OS so it is branded to you | Bright Studio OS |
| `VAULT_PATH` | The folder on your machine where the OS and its memory will live | /Users/you/BrightStudioOS |
| `GOOGLE_ACCOUNT` | The Google account whose Gmail, Calendar, and Drive the OS should connect to | you@brightstudio.com |
| `SKILL_PACKS` | Which capability areas you want switched on first | research, content, ops, data |

> If you do not have one of these yet, the skill will tell you exactly where to get it the first time you run it. You can start with one Google account and add more later.

## ✅ What you need installed

- Claude Code (this is the engine the OS runs on).
- A note/memory app for the memory layer. Obsidian is the simplest, pointed at `VAULT_PATH`.
- A Google account you are willing to connect for Gmail, Calendar, and Drive.
- That is it. The skill scaffolds the rest.

## 🚀 How to use it

1. Put this `SKILL.md` where your agent looks for skills (in Claude Code: a `skills/agentic-os-installer/` folder, or just paste this whole file into a new chat and say "follow this skill").
2. Fill in the fields above.
3. Then just tell your agent: **"Install my Agentic OS at VAULT_PATH for AGENCY_NAME."**

## 🧠 The workflow (what the agent does)

1. Confirm the inputs. If `VAULT_PATH` does not exist, create it. This folder is both the OS and its memory.
2. Scaffold the memory layer: a clean vault with folders for the OS itself, clients, notes, and a daily log. This is where everything the OS does gets remembered.
3. Wire in the Google suite for `GOOGLE_ACCOUNT`: connect Gmail, Calendar, and Drive so the OS can read and act on real work. Walk the user through the one-time sign-in if it is not connected yet.
4. Drop in the requested `SKILL_PACKS`. For each area (research, content, ops, data), install a small set of plug-and-play skills the agency can run on day one.
5. Build the command center: one dashboard that surfaces what the OS can do, what is scheduled, and the latest results, all from one screen. This is the thing you use, package, and hand to your team.
6. Brand it to `AGENCY_NAME` and write a short README so a new team member or a client can pick it up without you in the room.
7. Hand back the working OS plus a one-line summary of what was installed and what to run first.

## 🛟 If something goes wrong

- **Google will not connect:** make sure you are signing in with `GOOGLE_ACCOUNT` and approving Gmail, Calendar, and Drive scopes. Re-run the connect step after approving.
- **A skill pack does not show up:** check that the pack folder landed under your skills directory inside `VAULT_PATH`, then restart your agent so it re-reads the skills.
- **The memory layer feels empty:** that is expected on day one. It fills in as the OS does work. Ask it to log every run to the daily note.
- **You want to sell this to a client:** point the installer at a fresh `VAULT_PATH` and a different `GOOGLE_ACCOUNT`. Each install is its own clean OS you can hand over.

---

### You got this for free. Here's where the rest lives.

This is one skill. Inside **Operations Heroes** there are dozens more, plus the video walkthroughs, the automations, the templates, and direct help wiring them into your own business.

**👉 Join us: https://operationsheroes.io/skool**

*Built with the Agentic OS by Gennaro Santoro / Sempra Systems.*
