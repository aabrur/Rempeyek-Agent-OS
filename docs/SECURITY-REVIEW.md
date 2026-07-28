# Rempeyek Agent OS Security Review

## Threat Model & Protective Controls

### 1. Sensitive Path Protection
- **Policy Enforcement:** Default-deny for sensitive paths (`Config/access-policy.json`).
- **Denied Paths:**
  - `%USERPROFILE%\.ssh`
  - `%USERPROFILE%\.gnupg`
  - `%APPDATA%\Microsoft\Credentials`
  - `%LOCALAPPDATA%\Google\Chrome\User Data`
  - `%LOCALAPPDATA%\Microsoft\Edge\User Data`
  - Secrets files (`.env`, `.pem`, `.key`, `id_rsa`, `wallet.dat`)
- **Validation:** Enforced via `isPathAllowed()` in `access-policy-engine.mjs`.

### 2. Path Traversal & Escapes
- **Canonical Resolution:** All paths are normalized via `path.resolve()` and checked to prevent symlink, junction, or relative path traversal outside allowed roots.

### 3. Log Secret Protection
- **Redaction Engine:** Automatic regex pattern matching for API keys (`sk-*`, `AIzaSy*`, `ghp_*`, `xox*`) and passwords before persisting logs or session records.

### 4. Skill Validation & Integrity
- **Checksum Verification:** Every skill in `%USERPROFILE%\.skills` is checksummed using SHA-256 before synchronization.
- **Isolation:** Executable skills require explicit trust status before assignment to agent nodes.

### 5. Document Ingestion Security
- **Untrusted Input Handling:** Document contents ingested into Graphify or Vault notes are treated strictly as untrusted data. Instructions inside documents (e.g., "ignore previous instructions") are parsed as content, not authority.
