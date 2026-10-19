import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { membersQuery } from "#/queries";
import { createFileRoute } from "@tanstack/react-router";
import type { SubmitEvent } from "react";
import { changeRole, inviteMember, removeMember, revokeInvitation } from "../../../members";
import { Button } from "#/ui/button";
import { FieldGroup } from "#/ui/field";
import { Input } from "#/ui/input";
import { crumbs } from "#/crumbs";
import { Locked, SettingsPage } from "#src/features/settings/settings-page";
import { SETTINGS_LOCKS } from "#src/queries/client";

export const Route = createFileRoute("/$orgId/settings/members")({
  loader: async ({ context: { queryClient }, params }) => {
    await queryClient.ensureQueryData(membersQuery(params));
    return crumbs(
      { label: "Settings", to: "/$orgId/settings" },
      { label: "Members", to: "/$orgId/settings/members" },
    );
  },
  component: Members,
});

function Members() {
  const { orgId } = Route.useParams();
  const page = useSuspenseQuery(membersQuery({ orgId })).data;
  const queryClient = useQueryClient();

  async function act(change: Promise<unknown>) {
    await change;
    await queryClient.invalidateQueries();
  }

  async function invite(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    await act(
      inviteMember({
        data: {
          orgId,
          email: String(fields.get("email")),
          role: fields.get("role") === "admin" ? "admin" : "member",
        },
      }),
    );
    form.reset();
  }

  if (!page.admin) {
    return (
      <FieldGroup title="Members">
        <ul>
          {page.members.map(({ name, email }) => (
            <li key={email}>
              {name} {email}
            </li>
          ))}
        </ul>
      </FieldGroup>
    );
  }

  return (
    <SettingsPage title="Members">
      <section aria-label="Members" className="flex flex-col gap-3">
        <Locked reason={SETTINGS_LOCKS.members}>
        <div className="card overflow-clip">
          <table className="record-table">
            <tbody>
              {page.members.map(({ membershipId, name, email, role, self }) => (
                <tr key={membershipId}>
                  <td>{name}</td>
                  <td className="@max-lg:hidden">{email}</td>
                  <td>
                    <select
                      className="field-control w-auto"
                      value={role}
                      disabled={self}
                      onChange={(event) =>
                        act(
                          changeRole({
                            data: {
                              orgId,
                              membershipId,
                              role: event.target.value === "admin" ? "admin" : "member",
                            },
                          }),
                        )
                      }
                    >
                      <option>member</option>
                      <option>admin</option>
                    </select>
                  </td>
                  <td className="text-right">
                    {!self && (
                      <Button
                        size="small"
                        onClick={() => act(removeMember({ data: { orgId, membershipId } }))}
                      >
                        Remove
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </Locked>
      </section>

      <FieldGroup title="Invitations">
        <Locked reason={SETTINGS_LOCKS.invitations}>
        <ul className="flex flex-col gap-2">
          {page.invitations.map(({ id, email, expiresAt }) => (
            <li key={id}>
              {email} (expires {new Date(expiresAt).toLocaleDateString()}){" "}
              <Button
                size="small"
                onClick={() => act(revokeInvitation({ data: { orgId, invitationId: id } }))}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
        <form onSubmit={invite} className="flex max-w-xl gap-2">
          <Input name="email" type="email" aria-label="Email" placeholder="Email" required />
          <select className="field-control w-auto" name="role">
            <option>member</option>
            <option>admin</option>
          </select>
          <Button type="submit">Invite</Button>
        </form>
        </Locked>
      </FieldGroup>
    </SettingsPage>
  );
}
