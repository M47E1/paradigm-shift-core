import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile-chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: "no-webgl-chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          args: ["--disable-webgl", "--disable-software-rasterizer"],
        },
      },
    },
  ],
  webServer: {
    command: "npm run build && npx next start --hostname 127.0.0.1 --port 3100",
    env: { NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3100" },
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
