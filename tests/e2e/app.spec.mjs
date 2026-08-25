import { test, expect } from "@playwright/test";
import { startIsolatedApp } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });

let app;

test.beforeAll(async () => {
  app = await startIsolatedApp();
});

test.afterAll(async () => {
  await app?.close();
});

test("shell renders, navigation works, APIs answer, themes switch", async ({ page }) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", error => pageErrors.push(String(error)));
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto(app.origin, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("heading", { name: "Opening your workspace" })).toHaveCount(0);
  await expect(page.locator(".brand-name")).toContainText("E2E");
  await expect(page.locator(".brand-sub")).toContainText("Zero Agent OS");

  const destinations = [
    { name: "Agents", expectText: "AGENTS" },
    { name: "Projects", expectText: "PROJECTS" },
    { name: "Memory", expectText: /MEMORY|VAULT|Neural/i },
    { name: "Switchboard", expectText: "SWITCHBOARD" },
    { name: "Marketplace", expectText: "MARKETPLACE" },
    { name: "Observatory", expectText: "OBSERVATORY" },
    { name: "Settings", expectText: "SETTINGS" },
  ];

  for (const dest of destinations) {
    await page.getByRole("button", { name: dest.name, exact: true }).click();
    await expect(page.locator("#main-content")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Opening your workspace" })).toHaveCount(0);
    await expect(page.locator("#main-content")).toContainText(dest.expectText);
  }

  await page.getByRole("button", { name: "Agents", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No Registered Agents" })).toBeVisible();
  await expect(page.getByText("zero agents", { exact: false })).toBeVisible();

  const stateRes = await page.request.get(`${app.origin}/api/state`);
  expect(stateRes.status()).toBe(200);
  const state = await stateRes.json();
  expect(state.agents).toEqual([]);
  const procsRes = await page.request.get(`${app.origin}/api/procs`);
  expect(procsRes.status()).toBe(200);

  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("radio", { name: /Brutalist/ }).click();
  await expect.poll(async () => page.locator("html").getAttribute("data-theme")).toBe("brutalist");
  await page.getByRole("radio", { name: /Cyberpunk/ }).click();
  await expect.poll(async () => page.locator("html").getAttribute("data-theme")).toBe("cyberpunk");
  await expect(page.locator("#main-content")).toBeVisible();

  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  const fatalConsole = consoleErrors.filter(text => !/favicon|Download the React DevTools/i.test(text));
  expect(fatalConsole, fatalConsole.join("\n")).toEqual([]);
});
