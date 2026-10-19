import { threadTitleSchema, type Thread } from "@grounded-intelligence/grounded-sdk";
import { Archive, LoaderCircle, Pencil } from "lucide-react";
import { Slot } from "radix-ui";
import { type ReactElement, useRef } from "react";

import { threadTitle } from "#/lib/pebble/view";
import { IconButton } from "#/ui/button";
import { cn } from "#/ui/cn";
import { Input } from "#/ui/input";
import { AgeTimestamp } from "#/ui/timestamp";

const ACTION = "not-disabled:hover:bg-divider";

type ChatRowProps = {
  thread: Thread;
  /** The `menu-item` link or button that opens the chat, which the row fills with its title. */
  children: ReactElement;
  current: boolean;
  answering: boolean;
  leaving: boolean;
  renaming: boolean;
  onRenaming(renaming: boolean): void;
  onRename(title: string): void;
  onArchive(): void;
};

/** A chat in a list, with Rename and Archive on hover and its title edited in place. */
export function ChatRow({
  thread,
  children,
  current,
  answering,
  leaving,
  renaming,
  onRenaming,
  onRename,
  onArchive,
}: ChatRowProps) {
  const title = threadTitle(thread);
  // Set when Enter or Escape ends renaming: focus goes back to Rename, and the field's blur doesn't save.
  const refocus = useRef(false);
  const save = (next: string) => {
    if (next !== thread.title && threadTitleSchema.safeParse(next).success) {
      onRename(next);
    }
  };
  const finishRenaming = () => {
    refocus.current = true;
    onRenaming(false);
  };

  return (
    <div
      className={cn("group/chat relative shrink-0", leaving && "animate-row-out overflow-hidden")}
    >
      {renaming ? (
        <Input
          aria-label="Chat title"
          autoFocus
          className="mx-1 w-[calc(100%-0.5rem)]"
          defaultValue={thread.title ?? ""}
          placeholder={title}
          maxLength={threadTitleSchema.maxLength ?? undefined}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={(event) => {
            if (!refocus.current) {
              save(event.currentTarget.value);
              onRenaming(false);
            }
          }}
          onKeyDown={(event) => {
            // Keeps a surrounding command list from treating Enter or the arrows as its own.
            event.stopPropagation();
            if (event.nativeEvent.isComposing) {
              return;
            }

            if (event.key === "Enter") {
              // Focus moves to Rename before the key finishes, which would otherwise press it.
              event.preventDefault();
              save(event.currentTarget.value);
              finishRenaming();
            } else if (event.key === "Escape") {
              finishRenaming();
            }
          }}
        />
      ) : (
        <>
          <Slot.Root
            aria-current={current || undefined}
            data-state={current ? "checked" : "unchecked"}
            className="w-full group-hover/chat:pr-16 group-has-[:focus-visible]/chat:pr-16"
          >
            <Slot.Slottable>{children}</Slot.Slottable>
            <span className={cn("min-w-0 flex-1 truncate", thread.title === null && "text-muted")}>
              {title}
            </span>
            <span className="flex shrink-0 items-center group-hover/chat:hidden group-has-[:focus-visible]/chat:hidden">
              {answering ? (
                <span className="flex size-4 items-center justify-center text-accent">
                  <LoaderCircle aria-hidden className="size-3.5 motion-safe:animate-spin" />
                </span>
              ) : (
                <AgeTimestamp at={thread.updated_at} className="type-meta-12 text-muted" />
              )}
            </span>
            {answering && <span className="sr-only">Pebble is answering</span>}
          </Slot.Root>
          <div
            className="absolute inset-y-0 right-1 flex items-center gap-0.5 opacity-0 group-hover/chat:opacity-100 group-has-[:focus-visible]/chat:opacity-100"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.stopPropagation();
              }
            }}
          >
            <IconButton
              ref={(button: HTMLButtonElement | null) => {
                if (button !== null && refocus.current) {
                  refocus.current = false;
                  button.focus();
                }
              }}
              label={`Rename ${title}`}
              size="small"
              className={ACTION}
              onClick={() => onRenaming(true)}
            >
              <Pencil className="size-3.5" />
            </IconButton>
            <IconButton
              label={`Archive ${title}`}
              size="small"
              className={ACTION}
              onClick={onArchive}
            >
              <Archive className="size-3.5" />
            </IconButton>
          </div>
        </>
      )}
    </div>
  );
}
