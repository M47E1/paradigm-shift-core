import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3101",
    headless: true,
    launchOptions: {
      args: ["--window-position=-10000,-10000"],
    },
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
      name: "desktop-firefox",
      use: {
        browserName: "firefox",
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "desktop-webkit",
      use: {
        browserName: "webkit",
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "no-webgl-chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          args: [
            "--window-position=-10000,-10000",
            "--disable-webgl",
            "--disable-software-rasterizer",
          ],
        },
      },
    },
  ],
  webServer: {
    command: "npm run build && npx next start --hostname 127.0.0.1 --port 3101",
    env: {
      NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3101",
      PUBLIC_SITE_URL_ALLOW_LOOPBACK: "1",
    },
    url: "http://127.0.0.1:3101",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
