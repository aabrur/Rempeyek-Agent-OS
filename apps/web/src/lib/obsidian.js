/* The registered Obsidian vault is the repo root, so its name isn't "Obsidian Vault".
   Use the name-independent `path=` param with the file's absolute path — Obsidian
   resolves the vault by path. vaultAbs comes from /api/state.vault. */
let vaultAbs = "";
export function setVaultAbs(p) { vaultAbs = p || ""; }

export function obsUri(rel) {
  if (vaultAbs) {
    const abs = vaultAbs.replace(/[\\/]+$/, "") + "\\" + String(rel).replace(/\//g, "\\");
    return `obsidian://open?path=${encodeURIComponent(abs)}`;
  }
  return `obsidian://open?vault=Obsidian%20Vault&file=${encodeURIComponent(String(rel).replace(/\.md$/, ""))}`;
}
