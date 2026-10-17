import { test, expect } from "@playwright/test";
import { startIsolatedApp } from "./helpers.mjs";

let app;
test.beforeAll(async () => { app = await startIsolatedApp(); });
test.afterAll(async () => { await app?.close(); });

test("support appears on refresh and hourly, with keyboard dismissal", async ({ page }) => {
  await page.clock.install();
  await page.goto(app.origin);
  const popup = page.getByRole("dialog", { name: "Support Rempeyek’s development" });
  await expect(popup).toBeVisible();
  await page.getByRole("button", { name: "Maybe later", exact: true }).click();
  await expect(popup).not.toBeVisible();
  await page.clock.fastForward(60 * 60 * 1000 - 1000);
  await expect(popup).not.toBeVisible();
  await page.clock.fastForward(1000);
  await expect(popup).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popup).not.toBeVisible();
  await page.reload();
  await expect(popup).toBeVisible();
});

test("Trakteer loads only on click and accepts close messages only from its frame", async ({ page }) => {
  await page.route("https://trakteer.id/**", route => route.fulfill({
    contentType: "text/html",
    body: `<script>window.addEventListener('message', event => { if(event.data?.type === 'embed.openModal') document.body.textContent = 'Tip form ready'; });</script><body></body>`,
  }));
  const response = await page.goto(app.origin);
  expect(response.headers()["content-security-policy"]).toContain("frame-src https://trakteer.id;");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".support-frame")).toHaveCount(0);
  await page.getByRole("button", { name: "Trakteer", exact: true }).click();
  const popup = page.getByRole("dialog", { name: "Tip through Trakteer" });
  await expect(popup).toBeVisible();
  await expect(page.frameLocator(".support-frame").locator("body")).toHaveText("Tip form ready");
  await page.evaluate(() => window.postMessage({ type: "embed.modalClosed" }, "*"));
  await expect(popup).toBeVisible();
  await page.frameLocator(".support-frame").locator("body").evaluate(() => parent.postMessage({ type: "embed.modalClosed" }, "*"));
  await expect(popup).not.toBeVisible();
});

test("support fits small screens and landscape with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const viewport of [{ width: 375, height: 667 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(viewport);
    await page.goto(app.origin);
    const popup = page.getByRole("dialog");
    await expect(popup).toBeVisible();
    const bounds = await popup.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    expect(await popup.evaluate(element => getComputedStyle(element).animationName)).toBe("none");
    await expect(page.getByRole("button", { name: "Maybe later" })).toBeInViewport();
    await page.getByRole("button", { name: "Maybe later" }).click();
  }
});
