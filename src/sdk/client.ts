import { Agents } from "./agents.ts";
import { Evals } from "./evals.ts";
import { Jobs } from "./jobs.ts";
import { Api, type Auth } from "./api.ts";
import { Installations } from "./installations.ts";
import { Issues } from "./issues.ts";
import { Threads } from "./pebble.ts";
import { Pulls } from "./pulls.ts";
import { Git, Repos } from "./repos.ts";
import { Sandboxes } from "./sandboxes.ts";
import { Deployment, Settings } from "./settings.ts";

export type GroundedClientOptions = { auth: Auth };

/** A browser-safe client for an organization's data plane. */
export class GroundedClient {
  readonly repos: Repos;
  readonly git: Git;
  readonly installations: Installations;
  readonly pulls: Pulls;
  readonly agents: Agents;
  readonly issues: Issues;
  readonly evals: Evals;
  readonly jobs: Jobs;
  readonly pebble: { threads: Threads };

  /** The organization's models and usage (changes and usage require admin access). */
  readonly settings: Settings;
  /** The data plane's shared models and every organization's usage (operators only). */
  readonly deployment: Deployment;
  readonly sandboxes: Sandboxes;

  constructor({ auth }: GroundedClientOptions) {
    const api = new Api(auth);
    this.repos = new Repos(api);
    this.git = new Git(api);
    this.installations = new Installations(api);
    this.pulls = new Pulls(api);
    this.agents = new Agents(api);
    this.jobs = new Jobs(api);
    this.evals = new Evals(this.repos, this.agents, this.jobs);
    this.issues = new Issues(this.repos, this.git, this.agents, this.pulls, this.jobs, this.evals);
    this.pebble = { threads: new Threads(api) };
    this.settings = new Settings(api);
    this.deployment = new Deployment(api);
    this.sandboxes = new Sandboxes(api);
  }
}
