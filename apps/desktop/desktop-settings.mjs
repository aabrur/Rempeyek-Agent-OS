import fs from "node:fs";
import path from "node:path";

export const DESKTOP_SETTINGS_DEFAULTS = Object.freeze({
  autoCheck: true,
  autoDownload: true,
  updateChannel: "stable",
  launchAtLogin: false,
  closeBehavior: "tray",
  startMinimized: false,
  nativeNotifications: true,
});

const BOOLEAN_KEYS = new Set([
  "autoCheck",
  "autoDownload",
  "launchAtLogin",
  "startMinimized",
  "nativeNotifications",
]);
const ENUMS = {
  updateChannel: new Set(["stable", "preview"]),
  closeBehavior: new Set(["tray", "exit"]),
};
const ALLOWED_KEYS = new Set([
  ...BOOLEAN_KEYS,
  ...Object.keys(ENUMS),
]);

function validatedPatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("desktop settings patch must be an object");
  }
  const patch = {};
  for (const [key, next] of Object.entries(value)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (BOOLEAN_KEYS.has(key)) {
      if (typeof next !== "boolean") {
        throw new TypeError(`${key} must be a boolean`);
      }
    } else if (!ENUMS[key].has(next)) {
      throw new TypeError(
        `${key} must be one of: ${[...ENUMS[key]].join(", ")}`,
      );
    }
    patch[key] = next;
  }
  return patch;
}

export function createDesktopSettingsStore(filePath, deps = fs) {
  if (!filePath) throw new Error("desktop settings file path is required");
  const directory = path.dirname(filePath);

  function write(document) {
    deps.mkdirSync(directory, { recursive: true });
    const tempPath = path.join(
      directory,
      `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
    );
    let descriptor;
    try {
      descriptor = deps.openSync(tempPath, "w", 0o600);
      deps.writeFileSync(
        descriptor,
        `${JSON.stringify(document, null, 2)}\n`,
        "utf8",
      );
      deps.fsyncSync(descriptor);
      deps.closeSync(descriptor);
      descriptor = undefined;
      deps.renameSync(tempPath, filePath);
    } catch (error) {
      if (descriptor !== undefined) {
        try {
          deps.closeSync(descriptor);
        } catch {}
      }
      try {
        deps.unlinkSync(tempPath);
      } catch {}
      throw error;
    }
  }

  function read() {
    if (!deps.existsSync(filePath)) {
      const initial = { ...DESKTOP_SETTINGS_DEFAULTS };
      write(initial);
      return initial;
    }
    const stored = JSON.parse(deps.readFileSync(filePath, "utf8"));
    return {
      ...DESKTOP_SETTINGS_DEFAULTS,
      ...validatedPatch(stored),
    };
  }

  function update(patch) {
    const next = {
      ...read(),
      ...validatedPatch(patch),
    };
    write(next);
    return { ...next };
  }

  return { read, update };
}
