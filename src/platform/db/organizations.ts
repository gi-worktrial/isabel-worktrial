// shim: platform reads the signed-in user's Orgs from its database and the last one from a cookie; ours come from the
// services app/services.ts loads, and the cookie is the one platform's shell writes
import { getOrganizations as servicesOrganizations } from "#src/queries/client";

export const lastOrganizationCookie = "last-org-id";

export async function getOrganizations() {
  return servicesOrganizations();
}

export async function getLastOrganizationId(): Promise<string | undefined> {
  const prefix = `${lastOrganizationCookie}=`;
  const cookie = document.cookie.split("; ").find((each) => each.startsWith(prefix));
  return cookie === undefined ? undefined : decodeURIComponent(cookie.slice(prefix.length));
}
