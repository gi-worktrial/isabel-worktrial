// the manifest of platform's web app mirrored in src/platform: what each platform file is here, its pinned hash, and
// the patch from platform's file to ours; check-platform.ts verifies it, sync-platform.ts moves it
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { createTwoFilesPatch, FILE_HEADERS_ONLY } from "diff";
import { z } from "zod";

export const ROOT = join(import.meta.dirname, "..");
export const MANIFEST = join(ROOT, "scripts", "platform-web.json");
export const PATCHES = join(ROOT, "scripts", "platform-web", "patches");
export const PLATFORM = join(ROOT, "..", "platform");

// the checkout platform's files are read from: the sibling, or another clone of platform for sync:platform's --repo
let repo = PLATFORM;
export function readPlatformFrom(path: string) {
  repo = path;
}

// copy: platform's bytes; patch: platform's file plus a recorded patch; shim: platform's path and exports, our body;
// fork: our file in platform's place, reviewed by hand when platform's changes; skip: not here; pending: not mirrored
// yet, with the kind it is planned as and the phase that lands it
const KINDS = ["copy", "patch", "shim", "fork", "skip", "pending"] as const;
export type Kind = (typeof KINDS)[number];

const EntrySchema = z.strictObject({
  kind: z.enum(KINDS),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  // why a patch, shim or fork differs from platform's file, in one line
  reason: z.string().min(1).optional(),
  // a patch's changed lines past the default budget
  budget: z.number().int().positive().optional(),
  plan: z.enum(["copy", "patch", "shim", "fork"]).optional(),
  phase: z.string().optional(),
});
export type Entry = z.infer<typeof EntrySchema>;

const ManifestSchema = z.strictObject({
  commit: z.string().regex(/^[0-9a-f]{40}$/u),
  path: z.literal("web/src/"),
  root: z.literal("src/platform/"),
  // changed lines a patch may hold
  budget: z.number().int().positive(),
  // our own files among platform's, and the route tree our router plugin generates in platform's place
  ours: z.array(z.string()),
  generated: z.array(z.string()),
  files: z.record(z.string(), EntrySchema),
});
export type Manifest = z.infer<typeof ManifestSchema>;

export const readManifest = (): Manifest =>
  ManifestSchema.parse(JSON.parse(readFileSync(MANIFEST, "utf8")));

export const mirrored = (path: string) => join(ROOT, "src", "platform", path);
export const patchFile = (path: string) => join(PATCHES, `${path}.patch`);

export const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

/** Every file under a folder, as paths relative to it. */
export function filesUnder(folder: string): string[] {
  if (!existsSync(folder)) {
    return [];
  }
  return readdirSync(folder, { recursive: true, encoding: "utf8" })
    .filter((name) => statSync(join(folder, name)).isFile())
    .map((name) => relative(folder, join(folder, name)).split("\\").join("/"));
}

/** platform's file at a commit or ref in the checkout, read only; undefined when it has none. */
export function platformFile(ref: string, path: string): Buffer | undefined {
  try {
    return execFileSync("git", ["-C", repo, "show", `${ref}:web/src/${path}`], {
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return undefined;
  }
}

/** platform's web/src file list at a ref. */
export function platformFiles(ref: string): string[] {
  return execFileSync("git", ["-C", repo, "ls-tree", "-r", "--name-only", ref, "web/src/"], {
    encoding: "utf8",
  })
    .split("\n")
    .filter((name) => name !== "")
    .map((name) => name.slice("web/src/".length));
}

export function resolveRef(ref: string): string {
  return execFileSync("git", ["-C", repo, "rev-parse", `${ref}^{commit}`], {
    encoding: "utf8",
  }).trim();
}

/** The unified diff from platform's file to ours, with file headers only. */
export const createMirrorPatch = (path: string, platform: string, ours: string) =>
  createTwoFilesPatch(`a/${path}`, `b/${path}`, platform, ours, undefined, undefined, {
    context: 3,
    headerOptions: FILE_HEADERS_ONLY,
  });

/** A patch's added and removed lines, after its two file headers. */
export const changedLines = (patch: string) =>
  patch
    .split("\n")
    .slice(2)
    .filter((line) => line.startsWith("+") || line.startsWith("-")).length;
