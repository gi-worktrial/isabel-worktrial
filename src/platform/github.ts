import {
  MANIFEST_PATH,
  type Pin,
  manifestSchema,
} from "@grounded-intelligence/grounded-sdk";
import type { ProductClient } from "#src/queries/client";
import { parse, stringify } from "smol-toml";
import { z } from "zod";

function encodeText(text: string) {
  return btoa(
    Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join(""),
  );
}

export const INSTALL_STATE_KEY = "github-install-state";

export const installStateSchema = z.object({ state: z.string(), orgId: z.string() });

/** Sends the browser to install the App, remembering which organization to bind it to. */
export function installApp(appUrl: string, orgId: string) {
  const state = crypto.randomUUID();
  sessionStorage.setItem(INSTALL_STATE_KEY, JSON.stringify({ state, orgId }));
  location.assign(`${appUrl}/installations/new?state=${state}`);
}

export type Manifest = { repo: string; branch: string; head: string; toml: string };

export const pinsOf = ({ toml }: Manifest) => manifestSchema.parse(parse(toml)).repos;

/** Commits `repos.toml` with each name pinned to its pin, or unpinned without one. */
export async function writePins(
  client: ProductClient,
  manifest: Manifest,
  changes: Record<string, Pin | undefined>,
) {
  const document = manifestSchema.parse(parse(manifest.toml));
  const repos = { ...document.repos };
  for (const [name, pin] of Object.entries(changes)) {
    if (pin === undefined) {
      delete repos[name];
    } else {
      repos[name] = pin;
    }
  }

  await client.repos.createCommitOnBranch({
    repo: manifest.repo,
    branch: manifest.branch,
    expectedHeadOid: manifest.head,
    message: {
      headline: Object.entries(changes)
        .map(([name, pin]) =>
          pin === undefined ? `Unpin ${name}` : `Pin ${name} at ${pin.revision.slice(0, 12)}`,
        )
        .join(", "),
    },
    fileChanges: {
      additions: [{ path: MANIFEST_PATH, contents: encodeText(stringify({ ...document, repos })) }],
    },
  });
}
