// shim: platform answers these from its control plane (WorkOS and its database) as server functions taking `{ data }`;
// ours answer the same calls from the services, where the viewer is a tenant admin, the members are the people whose
// commits are in the active Agent's repo (each demo Agent names its people by its own domain), and every change to
// membership is refused with its reason
import { getActiveAgent } from "#/last-visited-agent";
import { currentServices } from "#src/app/services";
import { clientFor, getAccess as servicesAccess, SETTINGS_LOCKS } from "#src/queries/client";

type OrgInput = { data: { orgId: string } };

const GROUNDED_EMAIL = "@grounded.ai";
const COMMITS_READ = 100;
// the viewer as records they started name them, such as a sandbox's creator
const VIEWER_NAME = "You";

const refuse = (reason: string) => async (_input: unknown) => {
  throw new Error(reason);
};

/** Which sections the caller sees. */
export const getAccess = ({ data }: OrgInput) => servicesAccess(data);

/** Every member's name and email by their commits, with the admin's view of roles and no pending invitations. */
export async function listMembers({ data }: OrgInput) {
  const client = clientFor(data.orgId);
  const agents = await client.agents.list();
  const active = getActiveAgent(data.orgId, agents);
  const repo = agents.find(({ name }) => name === active)?.repo;
  const commits =
    repo === undefined ? [] : await client.repos.listCommits({ repo, per_page: COMMITS_READ });
  const members = new Map<string, { name: string; email: string }>();
  for (const { author } of commits.map(({ commit }) => commit)) {
    if (!author.email.endsWith(GROUNDED_EMAIL) && !members.has(author.email)) {
      members.set(author.email, { name: author.name, email: author.email });
    }
  }
  return {
    admin: true as const,
    members: [...members.values()].map((member) => ({
      ...member,
      membershipId: member.email,
      role: "member",
      self: false,
    })),
    invitations: [] as Array<{ id: string; email: string; expiresAt: string }>,
  };
}

/** Names by user ID: the services' commits carry their author's name already, so only the viewer is named here. */
export async function getMemberNames(_input: OrgInput): Promise<Record<string, string>> {
  return { [currentServices().viewer]: VIEWER_NAME };
}

export const inviteMember = refuse(SETTINGS_LOCKS.invitations);
export const revokeInvitation = refuse(SETTINGS_LOCKS.invitations);
export const changeRole = refuse(SETTINGS_LOCKS.members);
export const removeMember = refuse(SETTINGS_LOCKS.members);

/** The data plane's organizations by name, which only its operators see. */
export const getOrganizationNames = refuse("Only the data plane's operators see its organizations");
