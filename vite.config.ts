import { existsSync } from "node:fs";

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { DEMO_DATA_PUBLIC } from "./scripts/demo-data.ts";
import { PLATFORM_ALIASES, SRC_ALIAS } from "./scripts/platform-aliases.ts";

// a server restarted after a config edit forgets its --port and would fall back to 5173, which another server may hold, so the
// default is the preview's own port and a busy port fails instead of moving
const DEFAULT_PORT = 5186;

// the --port a dev server was started on, in either spelling
function cliPort(): string {
  const at = process.argv.findIndex((arg) => arg === "--port" || arg.startsWith("--port="));
  const arg = process.argv[at];
  if (at === -1 || arg === undefined) {
    return String(DEFAULT_PORT);
  }
  return arg.includes("=")
    ? arg.slice("--port=".length)
    : (process.argv[at + 1] ?? String(DEFAULT_PORT));
}

// demo-data's build output is the demo's public folder; the native product (--mode product) has none
function publicDir(mode: string): string | false {
  if (mode === "product") {
    return false;
  }
  if (mode !== "test" && !existsSync(DEMO_DATA_PUBLIC)) {
    throw new Error(
      `${DEMO_DATA_PUBLIC} is missing: clone demo-data beside demo-product and run pnpm build there, or set DEMO_DATA`,
    );
  }
  return DEMO_DATA_PUBLIC;
}

// separate caches prevent concurrent previews from loading duplicate CodeMirror instances
export default defineConfig(({ mode }) => ({
  plugins: [
    // platform's route tree, mirrored in src/platform, plus our own routes beside it
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/platform/routes",
      generatedRouteTree: "./src/platform/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
    mode === "test" || mode === "product" ? null : cloudflare(),
  ],
  // platform's files import the SDK by its index, so the build treats the SDK and Pebble's socket client as free of side
  // effects and gives the socket client, zod and React chunks of their own; the first page then loads the socket only
  // once a chat opens (without these the first load is 768 to 812 kB, over the budget)
  build: {
    rolldownOptions: {
      treeshake: {
        moduleSideEffects: (id: string) =>
          !/[\\/](agents|capnweb|partysocket)@|[\\/]src[\\/]sdk[\\/]/u.test(id),
      },
      output: {
        codeSplitting: {
          groups: [
            { name: "zod", test: /[\\/]zod@/u, priority: 3 },
            { name: "react", test: /[\\/](react|react-dom|scheduler)@/u, priority: 3 },
            { name: "sdk", test: /[\\/]src[\\/]sdk[\\/](?!(pebble|client)\.ts$)/u, priority: 2 },
            {
              name: "pebble-socket",
              test: /[\\/](agents|capnweb|partysocket)@|[\\/]src[\\/]sdk[\\/]pebble\.ts$/u,
            },
          ],
        },
      },
    },
  },
  publicDir: publicDir(mode),
  cacheDir: `node_modules/.vite/port-${cliPort()}`,
  resolve: {
    alias: mode === "test" ? [...PLATFORM_ALIASES, SRC_ALIAS] : PLATFORM_ALIASES,
  },
  server: { port: DEFAULT_PORT, strictPort: true },
}));
