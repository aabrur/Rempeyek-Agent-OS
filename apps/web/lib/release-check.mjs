/* Release/update checking — pure logic shared by the server (/api/version repo slug) and the
   client update banner (semver compare). Malformed input NEVER claims an update: a garbage tag or
   version compares as equal, so the banner stays silent instead of nagging or lying. */

/* parseRepoUrl: owner/repo from a GitHub remote URL (https or ssh, optional .git). GitHub only —
   the update banner queries the GitHub Releases API, so other hosts return null (no check). */
export function parseRepoUrl(remote) {
  const m = String(remote || "").trim().match(/github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  return m ? { owner: m[1], repo: m[2], slug: `${m[1]}/${m[2]}` } : null;
}

/* parseVersion: [major, minor, patch] from "2.1.0" / "v2.1.0" / "2.1.0-beta.1", else null. */
export function parseVersion(v) {
  const m = String(v || "").trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/* compareVersions: 1 if a>b, -1 if a<b, 0 if equal OR either side is malformed. */
export function compareVersions(a, b) {
  const pa = parseVersion(a), pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1;
  return 0;
}

/* releaseState: the banner's whole decision. updateAvailable only for a strictly newer,
   well-formed tag. Notes are bounded so a hostile release body cannot flood the UI. */
export function releaseState({ current, latestTag, url = "", notes = "" } = {}) {
  return {
    current: String(current || ""),
    latest: parseVersion(latestTag) ? String(latestTag).trim().replace(/^v/i, "") : null,
    updateAvailable: compareVersions(latestTag, current) === 1,
    url: String(url || ""),
    notes: String(notes || "").slice(0, 4000),
  };
}
