// moves the web mirror in src/platform along platform, reading the sibling checkout only:
//   (no flags)          three-way merges every copy and patch from the pin to origin/main (or --to <ref>), rewrites
//                       pins and patches, and lists conflicts, changed shims and forks, and added or removed files
//   --take <path...>    brings pending files in as platform's bytes at the pin, moving what stood there to the Trash
//   --repatch [path...] records each copy or patch as it now stands: a copy when it matches the pin, else its patch
//   --reviewed <path..> marks a shim's or fork's newer platform version as read
//   --repo <path>       reads platform from another clone, read only, such as one holding unmerged PR branches
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import process from "node:process";

import {
  createMirrorPatch,
  type Entry,
  MANIFEST,
  type Manifest,
  mirrored,
  patchFile,
  PLATFORM,
  platformFile,
  platformFiles,
  readManifest,
  readPlatformFrom,
  ROOT,
  resolveRef,
  sha256,
} from "./platform-mirror.ts";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => (flag(name) ? args[args.indexOf(name) + 1] : undefined);
const paths = args.filter(
  (arg, index) => !arg.startsWith("--") && !["--to", "--repo"].includes(args[index - 1] ?? ""),
);
const repo = option("--repo") ?? PLATFORM;
if (!existsSync(repo)) {
  throw new Error(`sync:platform reads a platform checkout, and ${repo} is missing`);
}
readPlatformFrom(repo);
const manifest = readManifest();
const report: string[] = [];

function toTrash(file: string) {
  const trash = join(homedir(), ".Trash", `${basename(file)} ${Date.now()}`);
  renameSync(file, trash);
  report.push(`moved ${file} to the Trash`);
}

function write(file: string, bytes: Buffer | string) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}

// platform's file at the pin, checked against the manifest's hash
function pinned(path: string, entry: Entry): Buffer {
  const bytes = platformFile(manifest.commit, path);
  if (bytes === undefined || sha256(bytes) !== entry.sha256) {
    throw new Error(`web/src/${path} at ${manifest.commit} does not match its pinned hash`);
  }
  return bytes;
}

// the platform PRs a reason is tagged with, whose merge may shrink the patch or fork or make it a copy
function absorbs(entry: Entry): string {
  const prs = [...new Set(entry.reason?.match(/platform PR \d+/gu))];
  return prs.length === 0 ? "" : ` (tagged ${prs.join(", ")}: shrink what merged)`;
}

function entryOf(path: string): Entry {
  const entry = manifest.files[path];
  if (entry === undefined) {
    throw new Error(`${path} is not in scripts/platform-web.json`);
  }
  return entry;
}

// a file kept as a copy when it is platform's bytes, else as a patch
function record(path: string, platform: Buffer) {
  const entry = entryOf(path);
  const ours = readFileSync(mirrored(path));
  const { budget, reason } = entry;
  if (ours.equals(platform)) {
    manifest.files[path] = { kind: "copy", sha256: sha256(platform) };
    if (existsSync(patchFile(path))) {
      toTrash(patchFile(path));
    }
    return;
  }
  manifest.files[path] = {
    kind: "patch",
    sha256: sha256(platform),
    ...(budget === undefined ? {} : { budget }),
    // a new patch's reason is written by hand, and check:platform asks for it
    ...(reason === undefined ? {} : { reason }),
  };
  write(patchFile(path), createMirrorPatch(path, platform.toString("utf8"), ours.toString("utf8")));
}

function take(path: string) {
  const entry = entryOf(path);
  if (entry.kind !== "pending") {
    throw new Error(`${path} is already ${entry.kind}`);
  }
  const bytes = pinned(path, entry);
  const file = mirrored(path);
  if (existsSync(file) && !readFileSync(file).equals(bytes)) {
    toTrash(file);
  }
  write(file, bytes);
  manifest.files[path] = { kind: "copy", sha256: entry.sha256 };
  report.push(`took ${path}${entry.plan === undefined ? "" : `, planned as ${entry.plan}`}`);
}

// git merge-file merges ours with platform's change from base to theirs, and counts the conflicts it marks
function merge(ours: Buffer, base: Buffer, theirs: Buffer): { text: Buffer; conflicts: number } {
  const folder = mkdtempSync(join(tmpdir(), "sync-platform-"));
  const [o, b, t] = ["ours", "base", "theirs"].map((name) => join(folder, name));
  if (o === undefined || b === undefined || t === undefined) {
    throw new Error("merge needs three files");
  }
  writeFileSync(o, ours);
  writeFileSync(b, base);
  writeFileSync(t, theirs);
  try {
    return { text: execFileSync("git", ["merge-file", "-p", o, b, t]), conflicts: 0 };
  } catch (error) {
    // git exits with the number of conflicts it marked, and a negative status on failure
    if (
      error instanceof Error &&
      "status" in error &&
      typeof error.status === "number" &&
      error.status > 0 &&
      "stdout" in error &&
      Buffer.isBuffer(error.stdout)
    ) {
      return { text: error.stdout, conflicts: error.status };
    }
    throw error;
  }
}

function sync(ref: string) {
  const target = resolveRef(ref);
  const listed = new Set(platformFiles(target));
  for (const [path, entry] of Object.entries(manifest.files)) {
    const theirs = platformFile(target, path);
    if (theirs === undefined || !listed.has(path)) {
      report.push(`platform removed web/src/${path} (${entry.kind}); decide what replaces it`);
      continue;
    }
    if (sha256(theirs) === entry.sha256) {
      continue;
    }
    if (entry.kind === "shim" || entry.kind === "fork") {
      report.push(
        `review: platform changed web/src/${path}, our ${entry.kind} (then --reviewed)${absorbs(entry)}`,
      );
      continue;
    }
    if (entry.kind === "skip" || entry.kind === "pending") {
      manifest.files[path] = { ...entry, sha256: sha256(theirs) };
      continue;
    }
    const base = pinned(path, entry);
    const { text, conflicts } = merge(readFileSync(mirrored(path)), base, theirs);
    write(mirrored(path), text);
    if (conflicts > 0) {
      manifest.files[path] = { ...entry, sha256: sha256(theirs) };
      report.push(
        `conflict: ${conflicts} in src/platform/${path}; resolve it, then --repatch it${absorbs(entry)}`,
      );
    } else {
      record(path, theirs);
      report.push(`merged ${path}${absorbs(entry)}`);
    }
  }
  for (const path of listed) {
    if (manifest.files[path] === undefined) {
      const bytes = platformFile(target, path);
      if (bytes !== undefined) {
        manifest.files[path] = { kind: "pending", sha256: sha256(bytes) };
        report.push(`platform added web/src/${path}; classify it (pending until then)`);
      }
    }
  }
  report.push(`pinned ${target.slice(0, 7)} (was ${manifest.commit.slice(0, 7)})`);
  manifest.commit = target;
}

if (flag("--take")) {
  for (const path of paths) {
    take(path);
  }
} else if (flag("--repatch")) {
  const chosen = paths.length > 0 ? paths : Object.keys(manifest.files);
  for (const path of chosen) {
    const entry = entryOf(path);
    if (entry.kind === "copy" || entry.kind === "patch") {
      record(path, pinned(path, entry));
      if (manifest.files[path]?.kind !== entry.kind) {
        report.push(`recorded ${path} as a ${manifest.files[path]?.kind ?? entry.kind}`);
      }
    }
  }
} else if (flag("--reviewed")) {
  for (const path of paths) {
    const latest = platformFile(manifest.commit, path);
    if (latest === undefined) {
      throw new Error(`web/src/${path} is not in platform at ${manifest.commit}`);
    }
    manifest.files[path] = { ...entryOf(path), sha256: sha256(latest) };
  }
} else {
  sync(option("--to") ?? "origin/main");
}

const sorted: Manifest = {
  ...manifest,
  files: Object.fromEntries(
    Object.entries(manifest.files).toSorted(([a], [b]) => a.localeCompare(b)),
  ),
};
writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);
// in the repo's format, so `format:check` passes after every sync
execFileSync(join(ROOT, "node_modules", ".bin", "oxfmt"), [MANIFEST]);
process.stdout.write(
  report.length === 0 ? "sync:platform: nothing to do\n" : `${report.join("\n")}\n`,
);
