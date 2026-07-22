import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

async function instrumentWebGLRequests(page: Page) {
  await page.addInitScript(() => {
    const runtime = window as typeof window & {
      __webglContextRequests: number;
    };
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    runtime.__webglContextRequests = 0;

    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      contextId: string,
      ...args: unknown[]
    ) {
      if (contextId === "webgl" || contextId === "webgl2") {
        runtime.__webglContextRequests += 1;
      }
      return Reflect.apply(originalGetContext, this, [contextId, ...args]);
    } as typeof originalGetContext;
  });
}

async function webGLRequestCount(page: Page) {
  return page.evaluate(() => {
    const runtime = window as typeof window & {
      __webglContextRequests: number;
    };
    return runtime.__webglContextRequests;
  });
}

test("home exposes semantic navigation and the intended visual mode", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Paradigm Shift Core",
  );
  await expect(page.getByRole("navigation", { name: "Explore the site" })).toBeVisible();

  if (testInfo.project.name === "desktop-chromium") {
    await expect(page.locator("canvas")).toHaveCount(1);
    await expect(page.getByTestId("stage-fallback")).toHaveCount(0);
  } else if (
    ["mobile-chromium", "no-webgl-chromium"].includes(testInfo.project.name)
  ) {
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.getByTestId("stage-fallback")).toHaveCount(1);
  } else {
    await expect
      .poll(
        async () =>
          (await page.locator("canvas").count()) +
          (await page.getByTestId("stage-fallback").count()),
      )
      .toBe(1);
  }
  const featuredProjects = page.locator(".content-band--ink");
  await expect(featuredProjects.getByRole("heading", { level: 2 })).toHaveCount(1);
  await expect(featuredProjects.getByRole("heading", { level: 3 })).toHaveCount(2);

});

test("reduced motion uses the non-WebGL fallback", async ({ page }) => {
  await instrumentWebGLRequests(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.getByTestId("stage-fallback")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Explore the site" })).toBeVisible();
  expect(await webGLRequestCount(page)).toBe(0);
});

test("child effect failures keep the HTML experience available", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop WebGL only");
  await page.addInitScript(() => {
    const runtime = window as typeof window & {
      __intersectionObserverFailureTriggered: boolean;
    };
    runtime.__intersectionObserverFailureTriggered = false;
    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      value: class {
        constructor() {
          runtime.__intersectionObserverFailureTriggered = true;
          throw new Error("Injected IntersectionObserver failure.");
        }
      },
    });
  });
  await page.goto("/");

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __intersectionObserverFailureTriggered: boolean;
            }
          ).__intersectionObserverFailureTriggered,
      ),
    )
    .toBe(true);
  await expect(page.getByTestId("stage-fallback")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Paradigm Shift Core");
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

test("WebGL context loss replaces the canvas with the fallback", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop WebGL only");
  await page.addInitScript(() => {
    const runtime = window as typeof window & {
      __webglContextLossListenerCount: number;
      __webglContextLossObserved: boolean;
    };
    const originalAddEventListener =
      HTMLCanvasElement.prototype.addEventListener;
    runtime.__webglContextLossListenerCount = 0;
    runtime.__webglContextLossObserved = false;

    HTMLCanvasElement.prototype.addEventListener = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type === "webglcontextlost") {
        runtime.__webglContextLossListenerCount += 1;
      }
      return Reflect.apply(originalAddEventListener, this, [type, ...args]);
    } as typeof originalAddEventListener;
  });
  await page.goto("/");

  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __webglContextLossListenerCount: number;
            }
          ).__webglContextLossListenerCount,
      ),
    )
    .toBeGreaterThanOrEqual(2);

  const contextLossSupported = await canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    const runtime = window as typeof window & {
      __webglContextLossObserved: boolean;
    };
    canvasElement.addEventListener(
      "webglcontextlost",
      () => {
        runtime.__webglContextLossObserved = true;
      },
      { once: true },
    );
    const context =
      canvasElement.getContext("webgl2") ?? canvasElement.getContext("webgl");
    const extension = context?.getExtension("WEBGL_lose_context");
    extension?.loseContext();
    return Boolean(context && extension);
  });
  expect(contextLossSupported).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __webglContextLossObserved: boolean;
            }
          ).__webglContextLossObserved,
      ),
    )
    .toBe(true);
  await expect(page.getByTestId("stage-fallback")).toHaveCount(1);
  await expect(page.locator("canvas")).toHaveCount(0);
});

test("desktop WebGL pauses when the stage leaves the viewport", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "Desktop WebGL only");
  await page.goto("/");

  const stage = page.getByTestId("orbital-stage");
  await expect(stage).toHaveAttribute("data-render-active", "true");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(stage).toHaveAttribute("data-render-active", "false");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(stage).toHaveAttribute("data-render-active", "true");
});

test("skip link moves focus to main content", async ({ page }, testInfo) => {
  await page.goto("/");
  const skipLink = page.getByRole("link", { name: "Skip to content" });
  if (testInfo.project.name === "desktop-webkit") {
    // WebKit follows the host platform's full-keyboard-access preference.
    await skipLink.focus();
  } else {
    await page.keyboard.press("Tab");
  }
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("hero actions precede the visual index in reading and focus order", async ({
  page,
}) => {
  await page.goto("/");
  const action = page.getByRole("link", { name: "Explore projects" });
  const indexLink = page
    .getByRole("navigation", { name: "Explore the site" })
    .getByRole("link")
    .first();
  await expect(action).toBeVisible();
  await expect(indexLink).toBeVisible();
  expect(
    await action.evaluate((element, following) => {
      const other = document.querySelector(following);
      return Boolean(
        other &&
          element.compareDocumentPosition(other) &
            Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }, ".stage-index a"),
  ).toBe(true);
});

test("all public routes render one primary heading", async ({ page }) => {
  for (const route of ["/", "/projects", "/thinking", "/about", "/contact"]) {
    const response = await page.goto(route);
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  }
});

test("public routes have no automated accessibility violations", async ({ page }) => {
  for (const route of ["/", "/projects", "/thinking", "/about", "/contact"]) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations,
      `accessibility violations on ${route}`,
    ).toEqual([]);
  }
});

test("production responses set the browser security policy", async ({ page }) => {
  const response = await page.goto("/");
  if (!response) throw new Error("Navigation returned no response.");
  const headers = response.headers();
  const csp = headers["content-security-policy"] ?? "";
  const directives = new Map(
    csp
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => Boolean(name))
      .map(([name, ...values]) => [name, values]),
  );

  expect(directives.get("default-src")).toEqual(["'self'"]);
  expect(directives.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
  expect(directives.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
  expect(directives.get("img-src")).toEqual(["'self'", "data:", "blob:"]);
  expect(directives.get("font-src")).toEqual(["'self'"]);
  expect(directives.get("connect-src")).toEqual(["'self'"]);
  expect(directives.get("media-src")).toEqual(["'self'"]);
  expect(directives.get("worker-src")).toEqual(["'self'", "blob:"]);
  expect(directives.get("object-src")).toEqual(["'none'"]);
  expect(directives.get("base-uri")).toEqual(["'self'"]);
  expect(directives.get("form-action")).toEqual(["'self'"]);
  expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
  expect(csp).not.toContain("'unsafe-eval'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["permissions-policy"]).toBe(
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("metadata endpoints use the configured public origin", async ({ request }) => {
  const [robots, sitemap] = await Promise.all([
    request.get("/robots.txt"),
    request.get("/sitemap.xml"),
  ]);
  expect(robots.ok()).toBeTruthy();
  expect(sitemap.ok()).toBeTruthy();

  const expectedOrigin = "http://127.0.0.1:3101";
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
