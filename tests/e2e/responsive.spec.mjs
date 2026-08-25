import { test, expect } from "@playwright/test";
import { startIsolatedApp } from "./helpers.mjs";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

for (const viewport of VIEWPORTS) {
  test(`${viewport.name} ${viewport.width}x${viewport.height} keeps primary navigation usable`, async ({ page }) => {
    const app = await startIsolatedApp();
    try {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(app.origin, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole("button", { name: "Agents", exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Agents", exact: true }).click();
      await expect(page.getByRole("heading", { name: "No Registered Agents" })).toBeVisible();
      await page.getByRole("button", { name: "Settings", exact: true }).click();
      await expect(page.getByRole("radio", { name: /Cyberpunk/ })).toBeVisible();

      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return {
          scrollWidth: doc.scrollWidth,
          innerWidth: window.innerWidth,
        };
      });
      expect(overflow.scrollWidth, `${viewport.name} horizontal overflow`).toBeLessThanOrEqual(overflow.innerWidth + 1);
    } finally {
      await app.close();
    }
  });
}
