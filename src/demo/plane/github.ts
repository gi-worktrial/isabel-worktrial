// the demo's GitHub App stand-in: one installation holding the Agents' own repositories, which the repositories list
// names as connected, so platform's GitHub pages and Agent settings read without the network
import type { ProductClient } from "#src/queries/client";
import type { Repository } from "#src/sdk/index";

import { refusal } from "./access.ts";
import { MAIN } from "./paths.ts";

const GITHUB = "https://github.com";
// the demo Org's GitHub account
const ACCOUNT = "grounded";
const INSTALLATION = 1;
// a plain square, since the demo fetches no avatar
const AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 1'%3E%3Crect width='1' height='1' fill='%23d4d4d4'/%3E%3C/svg%3E";

const githubOf = (name: string) => {
  const fullName = `${ACCOUNT}/${name}`;
  return { full_name: fullName, html_url: `${GITHUB}/${fullName}` };
};

/** An Agent's repository as the git service lists it, connected to its GitHub repository. */
export const connectedRepository = (name: string): Repository => ({
  name,
  default_branch: MAIN,
  github: githubOf(name),
});

/** The App, its one installation and the `repositories` it holds; binding another account is refused. */
export function installationsResource(
  repositories: () => Promise<readonly string[]>,
): ProductClient["installations"] {
  return {
    getApp: async () => ({
      slug: "grounded",
      name: "Grounded",
      html_url: `${GITHUB}/apps/grounded`,
    }),
    list: async () => [
      {
        id: INSTALLATION,
        account: { login: ACCOUNT, avatar_url: AVATAR, html_url: `${GITHUB}/${ACCOUNT}` },
        html_url: `${GITHUB}/organizations/${ACCOUNT}/settings/installations/${INSTALLATION}`,
      },
    ],
    create: async () => refusal("The demo can't connect another GitHub account")(),
    listRepos: async () =>
      (await repositories()).map((name, index) => ({
        id: index + 1,
        ...githubOf(name),
        default_branch: MAIN,
        private: true,
      })),
  };
}
