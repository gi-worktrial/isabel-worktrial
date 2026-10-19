import type { SandboxStatus, ThreadConnectionOptions } from "@grounded-intelligence/grounded-sdk";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useEffect, useEffectEvent, useRef } from "react";

import { Desktop } from "#/pebble/desktop";
import { buttonVariants } from "#/ui/button";
import { cn } from "#/ui/cn";
import { Tooltip } from "#/ui/tooltip";

/** The fullscreen chat's side pane, with a tab for each view of the thread's sandbox. */
export function ThreadPane({
  connection,
  sandbox,
  onWake,
}: {
  connection: ThreadConnectionOptions;
  sandbox: SandboxStatus | undefined;
  onWake(): void;
}) {
  const wake = useEffectEvent(onWake);
  const woken = useRef(false);
  // Wakes once the chat socket first reports the sandbox, which can arrive after the pane opens.
  useEffect(() => {
    if (!woken.current && sandbox !== undefined) {
      woken.current = true;
      wake();
    }
  }, [sandbox]);

  return (
    <section aria-label="Pane" className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex h-10 shrink-0 items-center gap-1 border-b border-divider px-2">
        <div role="tablist" aria-label="Pane tabs" className="flex items-center gap-1">
          <button
            type="button"
            role="tab"
            id="pane-desktop-tab"
            aria-selected
            aria-controls="pane-desktop"
            className="flex h-7 items-center gap-1.5 px-1.5 type-label-13 font-medium text-ink"
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                sandbox === "ready" ? "bg-success" : "bg-faint",
              )}
            />
            Desktop
          </button>
        </div>
        <Tooltip label="Close pane">
          <Link
            to="."
            search={(previous) => ({ ...previous, pane: undefined })}
            aria-label="Close pane"
            className={cn(
              buttonVariants({ variant: "quiet", size: null }),
              "ml-auto size-7 hover:bg-fill",
            )}
          >
            <X className="size-4" />
          </Link>
        </Tooltip>
      </header>
      <div
        role="tabpanel"
        id="pane-desktop"
        aria-labelledby="pane-desktop-tab"
        className="flex min-h-0 flex-1 flex-col"
      >
        <Desktop connection={connection} sandbox={sandbox} onWake={onWake} />
      </div>
    </section>
  );
}
