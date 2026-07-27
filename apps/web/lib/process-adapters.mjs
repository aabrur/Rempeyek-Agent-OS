const executable = (platform, windows, other) =>
  platform === "win32" ? windows : other;

export function resolveProbe({ entry, platform = process.platform } = {}) {
  const trigger = entry?.agent?.trigger;
  if (!trigger) return null;
  return platform === "win32"
    ? { program: "where.exe", args: [trigger] }
    : { program: "which", args: [trigger] };
}

export function resolveAdapter({
  entry,
  adapterId,
  action,
  platform = process.platform,
} = {}) {
  if (!entry || !["install", "uninstall"].includes(action)) return null;
  const source = action === "install" ? entry.installers : entry.uninstallers;
  const adapter = (source || entry.installers || []).find(item => item.id === adapterId);
  if (!adapter || (adapter.platforms && !adapter.platforms.includes(platform))) {
    return null;
  }

  const probe = resolveProbe({ entry, platform });
  if (adapter.type === "npm-global") {
    const verb = action === "install" ? "install" : "uninstall";
    const program = executable(platform, "npm.cmd", "npm");
    const args = [verb, "--global", adapter.package];
    return {
      program,
      args,
      display: `${program.replace(/\.cmd$/, "")} ${args.join(" ")}`,
      probe,
    };
  }
  if (adapter.type === "winget" && platform === "win32") {
    const args = action === "install"
      ? [
          "install",
          "--exact",
          "--id",
          adapter.packageId,
          "--accept-package-agreements",
          "--accept-source-agreements",
        ]
      : ["uninstall", "--exact", "--id", adapter.packageId];
    return {
      program: "winget.exe",
      args,
      display: `winget ${args.join(" ")}`,
      probe,
    };
  }
  if (adapter.type === "python-tool" || adapter.type === "uv-tool") {
    const verb = action === "install" ? "install" : "uninstall";
    const program = executable(platform, "uv.exe", "uv");
    const args = ["tool", verb, adapter.package];
    return {
      program,
      args,
      display: `${program.replace(/\.exe$/, "")} ${args.join(" ")}`,
      probe,
    };
  }
  if (adapter.type === "pipx") {
    const verb = action === "install" ? "install" : "uninstall";
    const program = executable(platform, "pipx.exe", "pipx");
    const args = [verb, adapter.package];
    return {
      program,
      args,
      display: `pipx ${args.join(" ")}`,
      probe,
    };
  }
  if (adapter.type === "powershell-script" && platform === "win32") {
    const program = "powershell.exe";
    const args = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", adapter.script || ""];
    return {
      program,
      args,
      display: `powershell -ExecutionPolicy Bypass -Command "${adapter.displayCommand || adapter.script}"`,
      probe,
    };
  }
  if (adapter.type === "git-source") {
    const program = executable(platform, "git.exe", "git");
    const args = ["clone", adapter.repositoryUrl, adapter.targetDir || "."];
    return {
      program,
      args,
      display: `git ${args.join(" ")}`,
      probe,
    };
  }
  if (adapter.type === "managed-bundle") {
    return {
      type: "managed-bundle",
      bundleId: adapter.bundleId || entry.id,
      display: `[Internal Bundle] Unpack ${entry.name}`,
      probe,
    };
  }
  if (adapter.type === "official-url" || adapter.type === "wsl-only") {
    return {
      externalUrl: entry.officialUrl || entry.sourceUrl,
      note: adapter.note || entry.availabilityNote || "External setup required",
      probe,
    };
  }
  return null;
}

export function startResolvedProcess(spec, { spawnImpl, cwd, env } = {}) {
  if (!spec?.program || !Array.isArray(spec.args)) {
    throw new Error("resolved process spec is required");
  }
  if (typeof spawnImpl !== "function") {
    throw new Error("spawnImpl is required");
  }
  return spawnImpl(spec.program, spec.args, {
    cwd,
    env,
    shell: false,
    windowsHide: true,
  });
}
