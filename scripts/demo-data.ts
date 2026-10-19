// demo-data's public folder, beside this repo or at DEMO_DATA: vite serves it, so its build output is at /scenarios
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const DEMO_DATA_PUBLIC = join(
  process.env["DEMO_DATA"] ?? fileURLToPath(new URL("../../demo-data", import.meta.url)),
  "public",
);
