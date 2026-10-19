import { defineConfig } from "@playwright/test";

const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./test",
  testMatch: "**/*.pw.ts",
  forbidOnly: ci,
  // a CI runner has two cores, so four workers starve the browser and the server
  workers: ci ? 2 : 4,
  use: {
    baseURL: "http://127.0.0.1:5185",
    channel: "chrome",
    viewport: { width: 1440, height: 960 },
    trace: "retain-on-failure",
  },
  webServer: {
    // serve built chunks in CI; direct tools also work in copies with linked dependencies
    command: ci
      ? `${process.env.GROUNDED_BUILT === "1" ? "" : "node node_modules/vite/bin/vite.js build && "}node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5185 --strictPort`
      : "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5185 --strictPort",
    url: "http://127.0.0.1:5185/",
    // the Worker reads no .env, so an unmocked journey gets a 503 instead of a model call
    env: { CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" },
  },
});
