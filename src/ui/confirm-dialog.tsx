import { Dialog } from "radix-ui";
import { useState, type ReactNode } from "react";

import { Button } from "#/ui/button";
import { Modal } from "#/ui/dialog";

type ConfirmDialogProps = {
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  blocked?: boolean;
  children?: ReactNode;
  onConfirm(): void;
} & (
  | { trigger: ReactNode; open?: undefined; onClose?: undefined }
  | { trigger?: undefined; open: boolean; onClose(): void }
);

/**
 * Platform's ConfirmDialog on its Modal, plus a description line, a danger confirm, and an `open` and `onClose` for a
 * caller that opens it from a menu or a header action.
 */
export function ConfirmDialog({
  trigger,
  open: controlledOpen,
  onClose,
  title,
  description,
  confirmLabel,
  destructive = false,
  blocked = false,
  children,
  onConfirm,
}: ConfirmDialogProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  return (
    <Modal
      trigger={trigger}
      title={title}
      description={description}
      open={controlledOpen ?? ownOpen}
      onOpenChange={(next) => {
        setOwnOpen(next);
        if (!next) {
          onClose?.();
        }
      }}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!blocked) {
            // a controlled one leaves closing to its caller
            setOwnOpen(false);
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
