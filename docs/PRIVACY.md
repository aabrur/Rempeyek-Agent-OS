# Privacy & Security Architecture

Rempeyek Agent OS is built on a **local-first, security-hardened framework**. It is designed to ensure that user data, system credentials, and private files remain private and controlled solely by the local machine owner.

---

## Core Privacy Principles

1. **Zero Cloud Telemetry**: Rempeyek Agent OS does not transmit usage statistics, prompt histories, or system metrics to external telemetry servers.
2. **Local Data Ownership**: All Neural Vault contents, agent memory graphs, logs, and configuration state are stored on your local disk.
3. **Explicit Data Sharing**: No data leaves your machine unless you explicitly configure an external LLM API or service connector.

---

## Deny-by-Default Access Policy

File system access by background agents is controlled by an Access Policy Engine configured in `Config/access-policy.json`.

```json
{
  "schema_version": 1,
  "allowed_roots": [],
  "denied_roots": [],
  "allowed_extensions": [".md", ".txt", ".json", ".yaml", ".yml", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py"],
  "denied_extensions": [".exe", ".dll", ".bat", ".cmd", ".ps1", ".vbs", ".msi", ".com", ".scr"],
  "max_file_size": 10485760,
  "follow_symlinks": false,
  "allow_network_paths": false,
  "allow_hidden_files": false,
  "require_approval_for": ["execute_process", "network_access", "write_project_files"],
  "redaction_patterns": ["password", "secret", "api_key", "token", "seed", "mnemonic", "private_key"]
}
```

---

## Blocked Sensitive Paths

The Access Policy Engine automatically blocks all agent attempts to read, write, or inspect sensitive system paths using regular expression pattern matching (`DENIED_SENSITIVE_PATTERNS`):

| Category | Blocked Paths & Files |
| :--- | :--- |
| **SSH & GPG Keys** | `~/.ssh/`, `~/.gnupg/`, `id_rsa`, `id_ed25519`, `*.pem`, `*.key` |
| **Browser Profiles** | Chrome `User Data`, Edge `User Data`, Brave `User Data`, Firefox `Profiles` |
| **Crypto & Wallets** | `wallet.dat`, `~/.ethereum/`, `~/.bitcoin/`, `~/.solana/`, `seed.txt`, `mnemonic` |
| **Password Managers** | `~/.password-store/`, KeePass (`*.kdbx`), 1Password (`*.1pif`) |
| **Cloud Credentials** | `~/.aws/credentials`, `~/.azure/`, `~/.gcloud/`, `.env` files |
| **OS Credentials** | Windows Credentials Manager (`AppData/Roaming/Microsoft/Credentials`), Windows Vault (`AppData/Local/Microsoft/Vault`) |

---

## Symlink & Directory Junction Protection

To prevent agents from bypassing directory boundaries via symbolic links or NTFS directory junctions:

* **Real Target Resolution**: The system resolves symlinks to their canonical real path (`fs.realpathSync`) before checking access.
* **Escaping Prevention**: Symlinks pointing outside defined allowed roots are immediately blocked.
* **Pattern Matching**: Real target paths are cross-checked against sensitive regex patterns regardless of symlink origin location.

---

## Approval Triggers & Guardrails

Potentially disruptive or dangerous actions require explicit user confirmation through an Approval Queue:

* `execute_process`: Running terminal commands or external scripts.
* `network_access`: Fetching remote web resources or communicating with external endpoints.
* `write_project_files`: Modifying code or configuration outside designated agent sandbox spaces.

---

## Extension Controls

* **Allowed Extensions**: Text and source code extensions (`.md`, `.txt`, `.json`, `.yaml`, `.js`, `.ts`, `.py`, etc.) are permitted for processing.
* **Denied Extensions**: Executable or script files (`.exe`, `.dll`, `.bat`, `.cmd`, `.ps1`, `.msi`, `.vbs`) are blocked from agent execution and modification.

---

## Remote Access Security (`DASH_TOKEN`)

By default, the web dashboard server binds locally and operates without authentication headers for local usage.

When exposing the dashboard across remote networks or SSH tunnels:

1. Define a secure dashboard token:
   ```bash
   export DASH_TOKEN="your-strong-random-token"
   ```
2. Remote requests will be rejected unless accompanied by the required header:
   ```http
   x-dash-token: your-strong-random-token
   ```
