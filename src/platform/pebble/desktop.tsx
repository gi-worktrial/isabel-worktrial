// shim: platform streams the thread sandbox's screen over noVNC; the demo's sandboxes have no screen, so the pane says
// so in platform's frame and keeps its Start sandbox (scripts/platform-web.json says why)
import type { SandboxStatus, ThreadConnectionOptions } from "@grounded-intelligence/grounded-sdk";

import { Button } from "#/ui/button";

/** The thread sandbox's desktop, which this data plane's sandboxes don't have. */
export function Desktop({
  sandbox,
  onWake,
}: {
  connection: ThreadConnectionOptions;
  sandbox: SandboxStatus | undefined;
  onWake(): void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-subtle px-4 text-center type-label-13 text-muted">
      {sandbox === "ready" ? (
        "This sandbox has no desktop to show."
      ) : (
        <>
          The sandbox is asleep.
          <Button size="small" onClick={onWake}>
            Start sandbox
          </Button>
        </>
      )}
    </div>
  );
}
