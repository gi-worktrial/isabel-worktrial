// serves one fixture page through Vite and opens it in Chrome, for component tests that need a real browser
import { createServer as createSocketServer } from "node:net";

import { chromium, type Page } from "@playwright/test";
import { createServer } from "vite";

import { PLATFORM_ALIASES } from "#scripts/platform-aliases";

// a function the fixture sets on window, called in the page
export const call = (page: Page, name: string, ...args: unknown[]) =>
  page.evaluate(([fn, values]) => Reflect.get(window, fn)(...values), [name, args] as const);

export async function componentPage(name: string, fixture: string) {
  const path = `/${name}.html`;
  // Vite treats port 0 as its default. Ask the OS for a port before handing it to Vite.
  const port = await new Promise<number>((resolve, reject) => {
    const socket = createSocketServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address();
      socket.close((error) => {
        if (error !== undefined) {
          reject(error);
        } else if (address === null || typeof address === "string") {
          reject(new Error("The component test could not reserve a TCP port"));
        } else {
          resolve(address.port);
        }
      });
    });
  });
  const server = await createServer({
    configFile: false,
    envDir: false,
    cacheDir: `node_modules/.vite/${name}`,
    server: { host: "127.0.0.1", port, strictPort: true, watch: null },
    resolve: { alias: PLATFORM_ALIASES },
    plugins: [
      {
        name,
        configureServer(dev) {
          dev.middlewares.use((request, response, next) => {
            if (!request.url?.startsWith(path)) {
              next();
              return;
            }
            void dev.transformIndexHtml(path, fixture).then((html) => {
              response.setHeader("Content-Type", "text/html");
              response.end(html);
            }, next);
          });
        },
      },
    ],
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (address === null || address === undefined || typeof address === "string") {
    throw new Error("The component test server has no TCP address");
  }
  const browser = await chromium.launch({ channel: "chrome" });
  return {
    // opens the fixture in a fresh tab and closes it after the body
    async open(body: (page: Page) => Promise<void>, search = "") {
      const page = await browser.newPage();
      try {
        await page.goto(`http://127.0.0.1:${address.port}${path}${search}`);
        await body(page);
      } finally {
        await page.close();
      }
    },
    async close() {
      await browser.close();
      await server.close();
    },
  };
}
