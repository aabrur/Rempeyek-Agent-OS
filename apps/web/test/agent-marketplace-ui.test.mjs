import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

test("Add Agent is a single state-aware dropdown with an explicit custom option", () => {
  const css = read("packages/design-system/src/index.css");
  const modal = read("apps/web/src/components/AddAgentModal.jsx");
  assert.match(css, /\.aa-box\s*\{[^}]*max-height:\s*min\(820px,\s*calc\(100dvh - 24px\)\)[^}]*overflow-y:\s*auto/s);
  assert.doesNotMatch(modal, /<CatalogGrid/);
  assert.match(modal, /<select[^>]+id="aaAgentChoice"/s);
  assert.match(modal, /<optgroup label="Known agents">/);
  assert.match(modal, /value="custom"/);
  assert.match(modal, /labelledBy="addAgentTitle"/);
  assert.match(modal, /Default launch folder: Rempeyek Agent OS state folder\./);
});

test("adapterless agents register a local launcher and the sidebar exposes Trakteer", () => {
  const catalog = read("apps/web/src/components/CatalogGrid.jsx");
  const sidebar = read("apps/web/src/components/Sidebar.jsx");
  assert.doesNotMatch(catalog, /target="_blank"/);
  assert.match(sidebar, /https:\/\/trakteer\.id\/aabrur/);
  assert.match(sidebar, /Dukung Saya di Trakteer/);
});

test("Marketplace keeps its catalog grid and opens the shared modal in custom mode", () => {
  const marketplace = read("apps/web/src/views/MarketplaceView.jsx");
  assert.match(marketplace, /<CatalogGrid/);
  assert.match(marketplace, /initialSelection="custom"/);
});

test("agent registration is bound to injected runtime services", () => {
  const server = read("apps/web/server.js");
  assert.match(server, /function addAgent\(body,\s*services\s*=\s*DEFAULT_RUNTIME_SERVICES\)/);
  assert.match(server, /const r = addAgent\(d,\s*services\)/);
});

test("Agents exposes the operational synchronization prompt before registered nodes", () => {
  const agentsView = read("apps/web/src/views/AgentsView.jsx");
  const prompt = read("apps/web/src/components/OperationalSyncPrompt.jsx");
  assert.match(agentsView, /<OperationalSyncPrompt/);
  assert.ok(
    agentsView.indexOf("<OperationalSyncPrompt") <
      agentsView.indexOf('<SectionRow label="REGISTERED NODES">'),
  );
  assert.match(prompt, /Copy prompt/);
  assert.match(prompt, /Send to all agents/);
  assert.match(prompt, /\/api\/agents\/synchronization-prompt/);
});
