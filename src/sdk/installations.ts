import { z } from "zod";
import type { Api } from "./api.ts";

const appSchema = z.object({ slug: z.string(), name: z.string(), html_url: z.string() });
const installationSchema = z.object({
  id: z.number(),
  account: z.object({ login: z.string(), avatar_url: z.string(), html_url: z.string() }),
  html_url: z.string(),
});
const installationRepositorySchema = z.object({
  id: z.number(),
  full_name: z.string(),
  html_url: z.string(),
  default_branch: z.string(),
  private: z.boolean(),
});

export type GitHubApp = z.infer<typeof appSchema>;
export type Installation = z.infer<typeof installationSchema>;
export type InstallationRepository = z.infer<typeof installationRepositorySchema>;

/** The organization's GitHub App installations, following Octokit's `apps` methods. */
export class Installations {
  constructor(private readonly api: Api) {}

  /** The deployment's GitHub App, which an account installs at `${html_url}/installations/new`. */
  getApp(): Promise<GitHubApp> {
    return this.api.json("/app", appSchema);
  }

  async list(): Promise<Installation[]> {
    const { installations } = await this.api.json(
      "/installations",
      z.object({ installations: z.array(installationSchema) }),
    );
    return installations;
  }

  /** Binds an installation from GitHub's install redirect (needs `repo:manage`). */
  create(input: { installation_id: number; code: string }): Promise<Installation> {
    return this.api.json("/installations", installationSchema, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async listRepos({ installation }: { installation: number }): Promise<InstallationRepository[]> {
    const { repositories } = await this.api.json(
      `/installations/${installation}/repositories`,
      z.object({ repositories: z.array(installationRepositorySchema) }),
    );
    return repositories;
  }
}
