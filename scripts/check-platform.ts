// CI checks the pinned native SDK copy and the web mirror in src/platform against their pins; --native also compares the
// sibling platform's origin/main and lists what platform changed, added or removed since the pins.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

import { applyPatch, parsePatch, reversePatch } from "diff";

import {
  changedLines,
  filesUnder,
  type Kind,
  mirrored,
  patchFile,
  PATCHES,
  platformFile,
  platformFiles,
  readManifest,
  ROOT,
  sha256,
} from "./platform-mirror.ts";
import source from "./platform-sdk.json" with { type: "json" };

const native = process.argv.includes("--native");
const SDK = join(ROOT, "src", "sdk");
const differences: string[] = [];
for (const [name, expected] of Object.entries(source.files)) {
  const file = join(SDK, name);
  if (!existsSync(file)) {
    differences.push(`src/sdk/${name} is missing`);
  } else if (createHash("sha256").update(readFileSync(file)).digest("hex") !== expected) {
    differences.push(`src/sdk/${name} differs from platform at ${source.commit}`);
  }
}

if (native) {
  const platform = join(ROOT, "..", "platform");
  if (!existsSync(platform)) {
    throw new Error("check:platform --native requires a sibling platform checkout");
  }
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", platform, ...args], { encoding: "utf8" });
  const nativeFiles = git("ls-tree", "--name-only", `origin/main:${source.path}`)
    .split("\n")
    // platform's own tests run in platform, so the copy leaves them out
    .filter((name) => name !== "" && name !== "index.ts" && !name.endsWith(".test.ts"));
  for (const name of new Set([...nativeFiles, ...Object.keys(source.files)])) {
    if (!(name in source.files) || !nativeFiles.includes(name)) {
      differences.push(`${name} differs from the native SDK file list`);
    } else if (
      readFileSync(join(SDK, name), "utf8") !== git("show", `origin/main:${source.path}${name}`)
    ) {
      differences.push(`src/sdk/${name} differs from platform's origin/main`);
    }
  }
}

// the web mirror: each file is what its kind says, so a copy is platform's bytes and a patch is the whole difference
const web = readManifest();
const at = (path: string) => `src/platform/${path}`;
const counts: Partial<Record<Kind, number>> = {};
for (const [path, entry] of Object.entries(web.files)) {
  counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
  const file = mirrored(path);
  const present = existsSync(file);
  if (entry.kind === "skip" || entry.kind === "pending") {
    if (entry.kind === "skip" && present && !web.generated.includes(path)) {
      differences.push(`${at(path)} is skipped, so it should not be here`);
    }
    continue;
  }
  if (!present) {
    differences.push(`${at(path)} is missing (${entry.kind})`);
    continue;
  }
  if (entry.kind !== "copy" && entry.reason === undefined) {
    differences.push(`${at(path)} is a ${entry.kind} with no reason in scripts/platform-web.json`);
  }
  const bytes = readFileSync(file);
  if (entry.kind === "copy" && sha256(bytes) !== entry.sha256) {
    differences.push(
      `${at(path)} differs from platform at ${web.commit}; record a patch or copy it again`,
    );
  }
  if (entry.kind !== "patch") {
    continue;
  }
  if (!existsSync(patchFile(path))) {
    differences.push(`${at(path)} has no patch in scripts/platform-web/patches`);
    continue;
  }
  const patch = readFileSync(patchFile(path), "utf8");
  const [parsed] = parsePatch(patch);
  const original =
    parsed === undefined ? false : applyPatch(bytes.toString("utf8"), reversePatch(parsed));
  if (original === false || sha256(original) !== entry.sha256) {
    differences.push(
      `${at(path)} is not platform's file plus its patch; run pnpm sync:platform -- --repatch`,
    );
  }
  const budget = entry.budget ?? web.budget;
  if (changedLines(patch) > budget) {
    differences.push(
      `${at(path)}'s patch changes ${changedLines(patch)} lines, over its budget of ${budget}`,
    );
  }
}

// nothing else lives in the mirror (a pending path may still hold our file from before it), and no patch outlives its
// file
const known = new Set([...web.ours, ...web.generated]);
for (const path of filesUnder(join(ROOT, "src", "platform"))) {
  const entry = web.files[path];
  if (!known.has(path) && (entry === undefined || entry.kind === "skip")) {
    differences.push(`${at(path)} is not in scripts/platform-web.json`);
  }
}
for (const path of web.ours) {
  if (!existsSync(mirrored(path))) {
    differences.push(`${at(path)} is listed as ours but missing`);
  }
}
for (const name of filesUnder(PATCHES)) {
  const path = name.replace(/\.patch$/u, "");
  if (web.files[path]?.kind !== "patch") {
    differences.push(`scripts/platform-web/patches/${name} belongs to no patched file`);
  }
}

// what platform changed, added or removed since the pin, for review or pnpm sync:platform
if (native) {
  const listed = new Set(platformFiles("origin/main"));
  for (const path of listed) {
    if (web.files[path] === undefined) {
      differences.push(`platform added web/src/${path}; classify it in scripts/platform-web.json`);
    }
  }
  for (const [path, entry] of Object.entries(web.files)) {
    const latest = platformFile("origin/main", path);
    if (!listed.has(path) || latest === undefined) {
      differences.push(`platform removed web/src/${path} (${entry.kind})`);
    } else if (sha256(latest) !== entry.sha256) {
      const next =
        entry.kind === "copy" || entry.kind === "patch" ? "pnpm sync:platform" : "review";
      differences.push(`platform changed web/src/${path} since the pin (${entry.kind}): ${next}`);
    }
  }
}

if (differences.length > 0) {
  process.stderr.write(`${differences.join("\n")}\n`);
  process.exit(1);
}
const summary = Object.entries(counts)
  .map(([kind, count]) => `${count} ${kind}`)
  .join(", ");
process.stdout.write(
  `SDK: ${Object.keys(source.files).length} native files match platform at ${source.commit}.\n` +
    `Web: ${summary} at platform ${web.commit.slice(0, 7)}, plus ${web.ours.length} of ours.\n`,
);
