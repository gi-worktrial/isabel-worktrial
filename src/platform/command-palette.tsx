import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Command as CommandPrimitive } from "cmdk";
import { Bot, Keyboard, Moon, Search, Settings, Sun } from "lucide-react";
import { Dialog } from "radix-ui";
import { type ComponentProps, type ReactNode, useState } from "react";

import { SeverityMark } from "#/issue-view";
import { issuesQuery } from "#/queries";
import { chord } from "#/shortcuts";
import { PAGES } from "#/sidebar";
import { Command, CommandInput, CommandItem, CommandList } from "#/ui/command";
import { DialogOverlay, useFocusReturn } from "#/ui/dialog";
import { Kbd } from "#/ui/kbd";
import { PebbleMark } from "#/ui/marks";
import { setTheme, useTheme } from "#/ui/theme";
import { paletteGroups } from "#src/ui/palette-groups";

type CommandPaletteProps = {
  orgId: string;
  agent: string;
  agents: ReadonlyArray<{ name: string }>;
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Opens Pebble's dock, left out while a chat is fullscreen. */
  onPebble: (() => void) | undefined;
  onShortcuts(): void;
};

/** A dialog that searches this Agent's pages and Issues, the other Agents, a few actions, and Traces. */
export function CommandPalette({ open, onOpenChange, ...props }: CommandPaletteProps) {
  const returnFocus = useFocusReturn(open);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <DialogOverlay />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={returnFocus}
          className="fixed top-[16vh] left-1/2 z-40 flex w-[min(640px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-sm py-1 float-layer text-ink outline-none motion-safe:data-[state=open]:animate-enter motion-safe:data-[state=closed]:animate-leave"
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Commands {...props} onRun={() => onOpenChange(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Commands({
  orgId,
  agent,
  agents,
  onPebble,
  onShortcuts,
  onRun,
}: Omit<CommandPaletteProps, "open" | "onOpenChange"> & { onRun(): void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const issues = useQuery(issuesQuery({ orgId, agent })).data ?? [];
  const nextTheme = useTheme() === "dark" ? "light" : "dark";
  const search = query.trim();
  const otherAgents = agents.filter(({ name }) => name !== agent);
  const run = (action: () => void) => () => {
    onRun();
    action();
  };

  return (
    <Command
      loop
      className="[&_[cmdk-group-heading]]:flex [&_[cmdk-group-heading]]:h-7 [&_[cmdk-group-heading]]:items-end [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:type-meta-12 [&_[cmdk-group-heading]]:text-muted"
    >
      <CommandInput
        aria-label="Search pages, Issues and Agents"
        placeholder="Search pages, Issues and Agents"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList label="Commands" className="max-h-[min(24rem,60vh)]">
        <CommandPrimitive.Group heading="Go to">
          {PAGES.map(({ label, Icon, to }) => (
            <PaletteItem
              key={to}
              value={label}
              icon={<Icon />}
              onSelect={run(() => void navigate({ to, params: { orgId, agent } }))}
            />
          ))}
          <PaletteItem
            value="Settings"
            icon={<Settings />}
            onSelect={run(() => void navigate({ to: "/$orgId/settings", params: { orgId } }))}
          />
        </CommandPrimitive.Group>
        {/* Every Issue would crowd the list, so they show once you search. */}
        {search !== "" && (
          <CommandPrimitive.Group heading="Issues">
            {issues.map((issue) => (
              <PaletteItem
                key={issue.id}
                value={issue.id}
                keywords={[issue.title]}
                label={issue.title}
                code={issue.id}
                icon={<SeverityMark severity={issue.severity} />}
                onSelect={run(
                  () =>
                    void navigate({
                      to: "/$orgId/agents/$agent/issues/$issue",
                      params: { orgId, agent, issue: issue.id },
                    }),
                )}
              />
            ))}
          </CommandPrimitive.Group>
        )}
        {otherAgents.length > 0 && (
          <CommandPrimitive.Group heading="Agents">
            {otherAgents.map(({ name }) => (
              <PaletteItem
                key={name}
                value={`Switch to ${name}`}
                icon={<Bot />}
                onSelect={run(
                  () =>
                    void navigate({ to: "/$orgId/agents/$agent", params: { orgId, agent: name } }),
                )}
              />
            ))}
          </CommandPrimitive.Group>
        )}
        <CommandPrimitive.Group heading="General">
          {onPebble !== undefined && (
            <PaletteItem
              value="Ask Pebble"
              icon={<PebbleMark />}
              shortcut={chord("J")}
              onSelect={run(onPebble)}
            />
          )}
          <PaletteItem
            value={`Switch to ${nextTheme} theme`}
            icon={nextTheme === "dark" ? <Moon /> : <Sun />}
            onSelect={run(() => setTheme(nextTheme))}
          />
          <PaletteItem
            value="Keyboard shortcuts"
            icon={<Keyboard />}
            shortcut={chord("/")}
            onSelect={run(onShortcuts)}
          />
        </CommandPrimitive.Group>
        {paletteGroups()
          .filter((group) => search !== "" || group.searchOnly !== true)
          .map(({ heading, items }) => (
            <CommandPrimitive.Group key={heading} heading={heading}>
              {items.map(({ onSelect, ...item }) => (
                <PaletteItem key={item.value} {...item} onSelect={run(onSelect)} />
              ))}
            </CommandPrimitive.Group>
          ))}
        {search !== "" && (
          <CommandPrimitive.Group heading="Traces" forceMount>
            <PaletteItem
              value="search-traces"
              label={`Search Traces for “${search}”`}
              icon={<Search />}
              forceMount
              onSelect={run(
                () =>
                  void navigate({
                    to: "/$orgId/agents/$agent/traces",
                    params: { orgId, agent },
                    search: { q: search },
                  }),
              )}
            />
          </CommandPrimitive.Group>
        )}
      </CommandList>
    </Command>
  );
}

function PaletteItem({
  label,
  code,
  icon,
  shortcut,
  ...props
}: ComponentProps<typeof CommandItem> & {
  value: string;
  label?: string | undefined;
  code?: string | undefined;
  icon: ReactNode;
  shortcut?: string | undefined;
}) {
  return (
    <CommandItem {...props} className="gap-2.5 type-label-13">
      <span className="flex size-4 shrink-0 items-center justify-center text-muted [&>svg]:size-4">
        {icon}
      </span>
      {code !== undefined && <span className="shrink-0 type-mono-12 text-muted">{code}</span>}
      <span className="min-w-0 flex-1 truncate">{label ?? props.value}</span>
      {shortcut !== undefined && <Kbd>{shortcut}</Kbd>}
    </CommandItem>
  );
}
