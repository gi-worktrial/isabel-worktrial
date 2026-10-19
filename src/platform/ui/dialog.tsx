import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useState, type ReactNode } from "react";

import { Button, IconButton } from "#/ui/button";
import { cn } from "#/ui/cn";

export function DialogOverlay() {
  return (
    <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 dark:bg-black/60 motion-safe:data-[state=open]:animate-fade motion-safe:data-[state=closed]:animate-leave" />
  );
}

/** A Dialog.Content `onCloseAutoFocus` that returns focus to whatever opened the dialog, which Radix only does for a Trigger. */
export function useFocusReturn(open: boolean) {
  const [shown, setShown] = useState(false);
  const [openers, setOpeners] = useState<Element[]>([]);
  if (open !== shown) {
    setShown(open);
    // Read while rendering, before the menu or popover that opened the dialog unmounts.
    if (open) {
      setOpeners(openersOf(document.activeElement));
    }
  }

  return (event: Event) => {
    const opener = openers.find((element) => element.isConnected);
    if (opener instanceof HTMLElement) {
      event.preventDefault();
      opener.focus();
    }
  };
}

/** A modal that its trigger, or the caller through `open`, opens. */
export function Modal({
  trigger,
  title,
  description,
  open,
  onOpenChange,
  role,
  className,
  children,
}: {
  trigger?: ReactNode;
  title: string;
  description?: ReactNode;
  open: boolean;
  onOpenChange(open: boolean): void;
  role?: "alertdialog" | undefined;
  className?: string;
  children: ReactNode;
}) {
  const returnFocus = useFocusReturn(open);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <DialogOverlay />
        <Dialog.Content
          // An undefined role would replace the "dialog" role Radix sets.
          role={role ?? "dialog"}
          aria-describedby={undefined}
          onCloseAutoFocus={returnFocus}
          className={cn(
            "fixed top-1/2 left-1/2 z-40 flex max-h-[calc(100vh-2rem)] w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-auto rounded-sm p-4 float-layer text-ink outline-none motion-safe:data-[state=open]:animate-enter motion-safe:data-[state=closed]:animate-leave",
            className,
          )}
        >
          <div className="-mt-1 -mr-1 flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Dialog.Title className="type-heading-15">{title}</Dialog.Title>
              {description !== undefined && (
                <Dialog.Description className="type-label-13 text-muted">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <IconButton label="Close" size="small" tabIndex={-1}>
                <X className="size-4" />
              </IconButton>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The focused element, then the trigger of each menu or popover it sits in. */
function openersOf(element: Element | null): Element[] {
  const openers = [];
  while (element && element !== document.body) {
    openers.push(element);
    const layer = element.parentElement?.closest("[role=menu], [role=dialog]");
    element = layer ? document.querySelector(`[aria-controls="${layer.id}"]`) : null;
  }
  return openers;
}

/** A form in a modal that its trigger opens, closing once it's confirmed. */
export function ConfirmDialog({
  trigger,
  title,
  confirmLabel,
  blocked = false,
  destructive = false,
  children,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  confirmLabel: string;
  blocked?: boolean;
  destructive?: boolean;
  children?: ReactNode;
  onConfirm(): void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Modal
      trigger={trigger}
      title={title}
      open={open}
      onOpenChange={setOpen}
      role={destructive ? "alertdialog" : undefined}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!blocked) {
            setOpen(false);
            onConfirm();
          }
        }}
      >
        {children}
        <div className="mt-1 flex justify-end gap-2">
          <Dialog.Close asChild>
            <Button variant="secondary">Cancel</Button>
          </Dialog.Close>
          <Button variant={destructive ? "danger" : "primary"} type="submit" disabled={blocked}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
