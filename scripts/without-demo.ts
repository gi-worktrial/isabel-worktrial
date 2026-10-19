// typecheck and build the native product without demo modules
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WORK = mkdtempSync(join(tmpdir(), "without-demo-"));
const COPY = join(WORK, "demo-product");
const TRASH = join(homedir(), ".Trash");
mkdirSync(TRASH, { recursive: true });

function discard(path: string): void {
  if (existsSync(path)) {
    renameSync(path, join(mkdtempSync(join(TRASH, "without-demo-")), basename(path)));
  }
}
// the copy builds without the Worker's secrets
const SKIPPED = new Set([
  "node_modules",
  ".git",
  "dist",
  "test-results",
  ".wrangler",
  ".fallow",
  ".env",
  ".dev.vars",
]);
// native services keep their implementation; only the explicit demo import is replaced in this copy
const DEMO_PATHS = ["src/demo", "src/app/services.test.ts"];
// test/ holds the demo seed and the journeys; its localStorage stub, component page and run fixture are the product's own unit tests' helpers
const PRODUCT_TEST_HELPERS = new Set(["storage.ts", "component-page.ts", "job-run.ts"]);
const SEEDED_TEST = /\.test\.tsx?$/;

function run(command: string, args: readonly string[]): void {
  process.stdout.write(`\n$ ${command} ${args.join(" ")}  (in ${relative(ROOT, COPY)})\n`);
  execFileSync(command, args, {
    cwd: COPY,
    stdio: "inherit",
    env: { ...process.env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false" },
  });
}

for (const entry of readdirSync(ROOT)) {
  if (!SKIPPED.has(entry) && !entry.startsWith(".env.") && !entry.startsWith(".dev.vars.")) {
    cpSync(join(ROOT, entry), join(COPY, entry), { recursive: true });
  }
}
// keep build caches separate from the live preview
mkdirSync(join(COPY, "node_modules"));
for (const entry of readdirSync(join(ROOT, "node_modules"))) {
  if (entry !== ".vite" && entry !== ".vite-temp") {
    symlinkSync(join(ROOT, "node_modules", entry), join(COPY, "node_modules", entry));
  }
}
const servicesFile = join(COPY, "src/app/services.ts");
const services = readFileSync(servicesFile, "utf8");
const demoEntry = 'return (await import("#src/demo/services")).demoServices;';
if (!services.includes(demoEntry)) {
  throw new Error("The explicit demo service entry changed; update the no-demo boundary check");
}
writeFileSync(
  servicesFile,
  services.replace(
    demoEntry,
    'throw new Error("The native product requires native Org services");',
  ),
);
for (const path of DEMO_PATHS) {
  discard(join(COPY, path));
}
for (const entry of readdirSync(join(COPY, "test"))) {
  if (!PRODUCT_TEST_HELPERS.has(entry)) {
    discard(join(COPY, "test", entry));
  }
}
const excluded: string[] = [];
for (const path of readdirSync(join(COPY, "src"), { recursive: true, encoding: "utf8" })) {
  const file = join(COPY, "src", path);
  if (
    SEEDED_TEST.test(path) &&
    /(?:#test\/tiny-seed|test\/tiny-seed\.ts)/.test(readFileSync(file, "utf8"))
  ) {
    excluded.push(path);
    discard(file);
  }
}
// the unique copy goes to Trash even when a check fails
try {
  process.stdout.write(`Excluded demo-dependent tests: ${excluded.join(", ")}\n`);
  run(join(COPY, "node_modules/.bin/vite"), ["build", "--mode", "product", "--logLevel", "warn"]);
  run(join(COPY, "node_modules/.bin/tsc"), ["-p", "tsconfig.json", "--noEmit"]);
} finally {
  discard(WORK);
}
