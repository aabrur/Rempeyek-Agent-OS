import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

test("Add Agent can scroll to the custom form and explains its default launch folder", () => {
  const css = read("packages/design-system/src/index.css");
  const modal = read("apps/web/src/components/AddAgentModal.jsx");
  assert.match(css, /\.aa-box\s*\{[^}]*max-height:\s*min\(760px,\s*calc\(100dvh - 32px\)\)[^}]*overflow-y:\s*auto/s);
  assert.match(modal, /Default launch folder: Rempeyek Agent OS state folder\./);
});

test("adapterless agents register a local launcher and the sidebar exposes Trakteer", () => {
  const catalog = read("apps/web/src/components/CatalogGrid.jsx");
  const sidebar = read("apps/web/src/components/Sidebar.jsx");
  assert.doesNotMatch(catalog, /target="_blank"/);
  assert.match(sidebar, /https:\/\/trakteer\.id\/aabrur/);
  assert.match(sidebar, /Dukung Saya di Trakteer/);
});
