const storageKey = (orgId: string) => `grounded.last-visited-agent.${orgId}`;

/** The last visited Agent while it still exists, else the newest. */
export const getActiveAgent = (orgId: string, agents: ReadonlyArray<{ name: string }>) =>
  (agents.find(({ name }) => name === localStorage.getItem(storageKey(orgId))) ?? agents[0])?.name;

export function setLastVisitedAgent(orgId: string, agent: string) {
  localStorage.setItem(storageKey(orgId), agent);
}
