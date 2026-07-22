import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import sharp from "sharp";

test("home exposes semantic navigation and the intended visual mode", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Paradigm Shift Core",
  );
  await expect(page.getByRole("navigation", { name: "Explore the site" })).toBeVisible();

  const expectsCanvas = testInfo.project.name === "desktop-chromium";
  await expect(page.locator("canvas")).toHaveCount(expectsCanvas ? 1 : 0);
  await expect(page.getByTestId("stage-fallback")).toHaveCount(expectsCanvas ? 0 : 1);
  const featuredProjects = page.locator(".content-band--ink");
  await expect(featuredProjects.getByRole("heading", { level: 2 })).toHaveCount(1);
  await expect(featuredProjects.getByRole("heading", { level: 3 })).toHaveCount(2);

});

test("reduced motion uses the non-WebGL fallback", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.getByTestId("stage-fallback")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Explore the site" })).toBeVisible();
});

test("desktop WebGL scene paints and advances", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop WebGL only");
  await page.goto("/");

  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();

  const sampleFrame = async () => {
    const png = await canvas.screenshot();
    const { data, info } = await sharp(png)
      .raw()
      .toBuffer({ resolveWithObject: true });

    let hash = 2166136261;
    let channelMin = 255;
    let channelMax = 0;
    let sampleCount = 0;
    for (let index = 0; index < data.length; index += info.channels * 16) {
      for (let channel = 0; channel < Math.min(3, info.channels); channel += 1) {
        const value = data[index + channel];
        channelMin = Math.min(channelMin, value);
        channelMax = Math.max(channelMax, value);
        hash = Math.imul(hash ^ value, 16777619) >>> 0;
      }
      sampleCount += 1;
    }
    return { channelMin, channelMax, hash, sampleCount };
  };

  const first = await sampleFrame();
  await page.waitForTimeout(500);
  const second = await sampleFrame();
  expect(first.sampleCount).toBeGreaterThan(1_000);
  expect(first.channelMax - first.channelMin).toBeGreaterThan(20);
  expect(second.hash).not.toBe(first.hash);
});

test("skip link moves focus to main content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("all public routes render one primary heading", async ({ page }) => {
  for (const route of ["/", "/projects", "/thinking", "/about", "/contact"]) {
    const response = await page.goto(route);
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  }
});

test("public routes have no serious automated accessibility violations", async ({ page }) => {
  for (const route of ["/", "/projects", "/thinking", "/about", "/contact"]) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    );
    expect(serious, `accessibility violations on ${route}`).toEqual([]);
  }
});

test("production responses set the browser security policy", async ({ page }) => {
  const response = await page.goto("/");
  if (!response) throw new Error("Navigation returned no response.");
  const headers = response.headers();
  const csp = headers["content-security-policy"] ?? "";

  expect(csp).toContain("default-src 'self'");
  expect(csp).not.toContain("'unsafe-eval'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
});

test("metadata endpoints use the configured public origin", async ({ request }) => {
  const [robots, sitemap] = await Promise.all([
    request.get("/robots.txt"),
    request.get("/sitemap.xml"),
  ]);
  expect(robots.ok()).toBeTruthy();
  expect(sitemap.ok()).toBeTruthy();

  const expectedOrigin = "http://127.0.0.1:3100";
  expect(await robots.text()).toContain(expectedOrigin);
  const sitemapBody = await sitemap.text();
  expect(sitemapBody).toContain(expectedOrigin);
  expect(sitemapBody).not.toContain("localhost");
});

test("public routes do not overflow horizontally", async ({ page }) => {
  for (const route of ["/", "/projects", "/thinking", "/about", "/contact"]) {
    await page.goto(route);
    const metrics = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
    }));
    expect(metrics.document, `horizontal overflow on ${route}`).toBeLessThanOrEqual(metrics.viewport);
  }
});
