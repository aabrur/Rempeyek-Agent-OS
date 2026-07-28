# Rempeyek Agent OS Skills Sync Report

## Overview
- **Canonical Skill Warehouse:** `C:\Users\abrur\.skills`
- **Node Destination:** `C:\Users\abrur\AppData\Local\Rempeyek-Agent-OS\Agents\<Node-ID>\skills`
- **Shared Registry:** `Vault\Skills\Registry\skills-registry.json`

## Synchronization Process
1. **Discovery:** Scans `C:\Users\abrur\.skills` for skill directories containing `SKILL.md`.
2. **Validation & Checksum:** Calculates SHA-256 hash of all directory contents.
3. **Capability Matching:** Matches node capabilities (`coding`, `research`, `design`, `audit`) with skill capabilities.
4. **Assignment:** Copies validated skill files into the node's private `skills/` directory.
5. **Registry Recording:** Writes assignment state into `Vault\Skills\Assignments\<Node-ID>.json`.
