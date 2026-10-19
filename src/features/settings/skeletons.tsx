// the settings pages' route skeletons, each page's title over its field groups; route skeletons load with the first
// page, so this file imports only ui/skeleton
import { FieldsSkeleton, PageSkeleton, TableSkeleton } from "#src/ui/skeleton";

export function MembersSkeleton() {
  return (
    <PageSkeleton title="Members" label="Loading Members">
      <FieldsSkeleton
        lead={<TableSkeleton columns={4} rows={1} />}
        groups={[{ title: "Invitations", rows: 1 }]}
      />
    </PageSkeleton>
  );
}

export function ModelsSkeleton() {
  return (
    <PageSkeleton title="Models" label="Loading Models">
      <FieldsSkeleton
        groups={[
          { title: "This organization's models", rows: 2 },
          { title: "Shared models", rows: 2 },
          { title: "Usage", rows: 4, table: true },
        ]}
      />
    </PageSkeleton>
  );
}

export function SandboxesSkeleton() {
  return (
    <PageSkeleton title="Sandboxes" label="Loading Sandboxes">
      <FieldsSkeleton
        groups={[
          { title: "Sandbox limit", rows: 1 },
          { title: "Active sandboxes", rows: 3, table: true },
        ]}
      />
    </PageSkeleton>
  );
}

// platform's Deployment page has no title row, only its groups
export function DeploymentSkeleton() {
  return (
    <div role="status" aria-label="Loading Deployment">
      <FieldsSkeleton
        groups={[
          { title: "Shared models", rows: 2 },
          { title: "Models organizations added for themselves", rows: 2 },
          { title: "Usage by organization", rows: 4, table: true },
          { title: "Usage by model", rows: 4, table: true },
        ]}
      />
    </div>
  );
}

export function AgentSettingsSkeleton() {
  return (
    <PageSkeleton title="Agent settings" label="Loading Agent settings">
      <FieldsSkeleton
        groups={[
          { title: "Connections", rows: 1 },
          { title: "API keys", rows: 2, table: true },
          { title: "Delete agent", rows: 1 },
        ]}
      />
    </PageSkeleton>
  );
}
