import fs from "node:fs";
import path from "node:path";

export function stripBom(text) {
  return String(text || "").replace(/^\uFEFF/, "");
}

export function writeJsonAtomic(filePath, data, { backup = true, fsImpl = fs } = {}) {
  const directory = path.dirname(filePath);
  fsImpl.mkdirSync(directory, { recursive: true });

  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
  );

  let descriptor;
  try {
    const jsonStr = `${JSON.stringify(data, null, 2)}\n`;
    // Validate stringified JSON before write
    JSON.parse(jsonStr);

    descriptor = fsImpl.openSync(tempPath, "w", 0o600);
    fsImpl.writeFileSync(descriptor, jsonStr, "utf8");
    fsImpl.fsyncSync(descriptor);
    fsImpl.closeSync(descriptor);
    descriptor = undefined;

    if (backup && fsImpl.existsSync(filePath)) {
      try {
        fsImpl.copyFileSync(filePath, `${filePath}.bak`);
      } catch {}
    }

    fsImpl.renameSync(tempPath, filePath);
    return true;
  } catch (err) {
    if (descriptor !== undefined) {
      try {
        fsImpl.closeSync(descriptor);
      } catch {}
    }
    if (fsImpl.existsSync(tempPath)) {
      try {
        fsImpl.unlinkSync(tempPath);
      } catch {}
    }
    throw err;
  }
}

export function preserveCorruptFile(filePath, { quarantineDir, fsImpl = fs } = {}) {
  if (!fsImpl.existsSync(filePath)) return null;
  const targetDir = quarantineDir || path.join(path.dirname(filePath), "Quarantine");
  try {
    fsImpl.mkdirSync(targetDir, { recursive: true });
    const isoTime = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${path.basename(filePath)}.corrupt.${isoTime}.json`;
    const dest = path.join(targetDir, filename);
    fsImpl.copyFileSync(filePath, dest);
    return dest;
  } catch (err) {
    return null;
  }
}

export function loadDurableJson(filePath, { validator, fallback, quarantineDir, fsImpl = fs } = {}) {
  const bakPath = `${filePath}.bak`;

  // 1. Read active file
  if (fsImpl.existsSync(filePath)) {
    try {
      const raw = fsImpl.readFileSync(filePath, "utf8");
      const cleaned = stripBom(raw);
      const parsed = JSON.parse(cleaned);
      if (typeof validator === "function") validator(parsed);
      return { data: parsed, recovered: false, source: "active" };
    } catch (activeErr) {
      // 2. Preserve corrupt original using timestamped quarantine
      preserveCorruptFile(filePath, { quarantineDir, fsImpl });
    }
  }

  // 3. Inspect known-good backup (.bak)
  if (fsImpl.existsSync(bakPath)) {
    try {
      const rawBak = fsImpl.readFileSync(bakPath, "utf8");
      const cleanedBak = stripBom(rawBak);
      const parsedBak = JSON.parse(cleanedBak);
      if (typeof validator === "function") validator(parsedBak);

      // 4. Safe restore according to policy
      writeJsonAtomic(filePath, parsedBak, { backup: false, fsImpl });
      return { data: parsedBak, recovered: true, source: "backup" };
    } catch (bakErr) {
      // Preserve corrupt .bak in quarantine
      preserveCorruptFile(bakPath, { quarantineDir, fsImpl });
    }
  }

  // 5 & 6. Minimum safe fallback state
  const defaultData = typeof fallback === "function" ? fallback() : (fallback || {});
  try {
    writeJsonAtomic(filePath, defaultData, { backup: false, fsImpl });
  } catch {}
  return { data: defaultData, recovered: true, source: "fallback" };
}
