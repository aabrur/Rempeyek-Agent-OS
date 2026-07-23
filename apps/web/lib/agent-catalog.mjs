import {
  MARKETPLACE_ENTRIES,
  agentSeed,
} from "./marketplace-manifest.mjs";

export const AGENT_CATALOG = MARKETPLACE_ENTRIES
  .filter(entry => entry.kind === "agent")
  .map(entry => ({
    ...agentSeed(entry),
    install: { url: entry.officialUrl },
  }));

const CATALOG_BY_ID = new Map(AGENT_CATALOG.map(entry => [entry.id, entry]));

export function catalogEntry(id) {
  return CATALOG_BY_ID.get(String(id || "")) || null;
}

const HOME_ABS = value => /^([a-zA-Z]:[\\/]|[\\/])/.test(value);

function resolveHome(raw, homedir) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (HOME_ABS(value)) return value;
  const relative = value.replace(/^~[\\/]?/, "");
  return homedir
    ? `${homedir.replace(/[\\/]$/, "")}/${relative}`.replace(
        /\//g,
        homedir.includes("\\") ? "\\" : "/",
      )
    : relative;
}

export function buildAgentRecord({
  body = {},
  cat = null,
  existingIds = [],
  existingNodeNums = [],
  date = "",
  homedir = "",
} = {}) {
  if (body.catalogId && !cat) return { error: `unknown catalog agent '${body.catalogId}'` };
  const id = String((cat?.id ?? body.id) || "").trim();
  if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(id)) {
    return { error: "id must be a 2-32 char slug (a-z, 0-9, -)" };
  }
  const name = String((cat?.name ?? body.name) || "")
    .replace(/[\x00-\x1f\x7f]+/g, " ")
    .trim()
    .slice(0, 40);
  if (!name) return { error: "name is required" };
  if (existingIds.includes(id)) return { error: `agent '${id}' already exists` };

  const accent = /^#[0-9a-fA-F]{6}$/.test(String(body.accent || ""))
    ? body.accent
    : undefined;
  const nextNode = (existingNodeNums.length ? Math.max(...existingNodeNums) : 0) + 1;
  const trigger = String((cat?.trigger ?? body.trigger) || "")
    .trim()
    .split(/\s+/)[0]
    .slice(0, 60);
  const home = resolveHome(cat?.home ?? body.home, homedir);

  const gateway = { actions: [] };
  if (home) gateway.home = home;
  if (trigger) gateway.trigger = trigger;
  if (cat) gateway.marketplaceId = cat.id;
  if (cat?.envAllow) gateway.envAllow = [...cat.envAllow];
  const hasGateway =
    gateway.home || gateway.trigger || gateway.marketplaceId || gateway.envAllow;

  const agent = {
    id,
    name,
    icon: String((cat?.icon ?? body.icon) || "🤖").slice(0, 4),
    role: String((cat?.role ?? body.role) || "Agent").trim().slice(0, 80),
    node: `Node-${nextNode}`,
    lane: name.replace(/[^A-Za-z0-9]/g, ""),
    enabled: true,
    ...(accent ? { accent } : {}),
    note: `Registered via dashboard ${date}.${
      trigger
        ? ` Summon with \`${trigger}\`.`
        : " Observe-only until a gateway trigger is configured."
    }`,
    ...(hasGateway ? { gateway } : {}),
  };
  return { agent };
}
