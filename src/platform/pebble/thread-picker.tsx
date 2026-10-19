import type { Thread } from "@grounded-intelligence/grounded-sdk";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { threadTitle, threadUsed } from "#/lib/pebble/view";
import { ChatRow } from "#/pebble/chat-row";
import { Button } from "#/ui/button";
import { cn } from "#/ui/cn";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "#/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "#/ui/popover";

/** The open chat's title, opening a search over the engineer's chats that have had a prompt, most recently used first. */
export function ThreadPicker({
  threads,
  active,
  disabled,
  onSelect,
  archiving,
  answeringThread,
  onRename,
  onArchive,
}: {
  threads: Thread[];
  active: Thread;
  disabled: boolean;
  onSelect(id: string): void;
  archiving: ReadonlySet<string>;
  answeringThread: string | undefined;
  onRename(thread: Thread, title: string): void;
  onArchive(thread: Thread): void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string>();
  const search = query.trim().toLowerCase();
  const shown = threads
    .filter((thread) => threadUsed(thread) && threadTitle(thread).toLowerCase().includes(search))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="quiet"
          size="small"
          disabled={disabled}
          className="menu-selector-trigger min-w-0 shrink rounded-md px-2.5 text-ink enabled:hover:bg-fill data-[state=open]:bg-fill"
        >
          <span className={cn("truncate", active.title === null && "text-muted")}>
            {threadTitle(active)}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        onEscapeKeyDown={(event) => {
          if (renaming !== undefined) {
            event.preventDefault();
          }
        }}
        className="menu-selector w-80 max-w-[calc(100vw-2rem)]"
      >
        <Command shouldFilter={false} defaultValue={active.id}>
          <CommandInput
            aria-label="Search chats"
            placeholder="Search chats"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList label="Chats">
            <CommandEmpty>No chats found</CommandEmpty>
            {shown.map((thread) => (
              <ChatRow
                key={thread.id}
                thread={thread}
                current={thread.id === active.id}
                answering={thread.id === answeringThread}
                leaving={archiving.has(thread.id)}
                renaming={thread.id === renaming}
                onRenaming={(next) => setRenaming(next ? thread.id : undefined)}
                onRename={(title) => onRename(thread, title)}
                onArchive={() => onArchive(thread)}
              >
                <CommandItem
                  value={thread.id}
                  onSelect={() => {
                    onSelect(thread.id);
                    setOpen(false);
                  }}
                />
              </ChatRow>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
