# Getting Started with Rempeyek Agent OS

Welcome to **Rempeyek Agent OS**, an autonomous multi-agent operating system designed for local-first execution, unified AI family registries, and transparent memory governance.

---

## Prerequisites

Before installing Rempeyek Agent OS, ensure your system meets the following requirements:

* **Node.js**: Version **18.0.0** or higher (LTS recommended).
* **Operating System**: Windows 10/11, macOS 12+ (Intel/Apple Silicon), or Linux (Ubuntu 20.04+, Debian 11+, Fedora 36+).
* **Git**: Installed and accessible in your system terminal.

---

## Clone and Install

1. **Clone the repository:**
   ```bash
   git clone https://github.com/aabrur/Rempeyek-Agent-OS.git
   cd Rempeyek-Agent-OS
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```
   *Note: The first launch script will also check for missing `node_modules` and run `npm install` automatically if needed.*

---

## Launch the System

You can launch Rempeyek Agent OS using either the single-entry launcher or standard npm scripts:

### Option A: Using the Rempeyek Launcher (Recommended)
```bash
node bin/rempeyek-agent-os.mjs
```
*On Windows, you can also double-click `start.cmd` in the root directory.*

### Option B: Development Mode
```bash
npm run dev
```

---

## First Launch Bootstrap Process

When you run Rempeyek Agent OS for the first time, the system automatically runs an internal **Bootstrap Engine**. Without manual setup, it auto-configures your system by:

1. Creating runtime directories (`Config/`, `Vault/`, `Logs/`, `Cache/`, `Backups/`, `Quarantine/`, `Temp/`, `Runtime/`, `Updates/`, `Packages/`, `Agents/`).
2. Creating a system manifest tracking application version and execution mode.
3. Scaffolding your local **Neural Vault** structure for persistent note, memory, and graph storage.
4. Initializing the **AI Family Registry** and registering system agents.
5. Setting up **Shared Memory** indexes and **Graphify** knowledge links.
6. Generating a deny-by-default security access policy (`Config/access-policy.json`).

For full details on this workflow, see the [First Run Guide](file:///docs/FIRST-RUN.md).

---

## Accessing the Dashboard

Once startup completes, your default Web browser will open automatically. You can also access the dashboard manually at:

👉 **[http://localhost:4321](http://localhost:4321)**

> [!NOTE]
> If port `4321` is occupied, set a custom port before launching:
> ```bash
> PORT=5000 node bin/rempeyek-agent-os.mjs
> ```

---

## Adding Your First Agent

1. Open the dashboard at `http://localhost:4321`.
2. Navigate to **Marketplace** from the main sidebar.
3. Browse the catalog of pre-configured AI family agents (or custom worker profiles).
4. Click **Install / Register** on your desired agent bundle.
5. View and interact with your newly registered agent in the **Agent Topology** map or **Chat System**.
