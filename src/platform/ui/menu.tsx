import { Check } from "lucide-react";
import { DropdownMenu as Menu } from "radix-ui";
import { useRef, type ComponentProps, type ReactNode } from "react";

import { cn } from "#/ui/cn";
import { Tooltip } from "#/ui/tooltip";

export function Dropdown({
  trigger,
  tooltip,
  side = "bottom",
  className,
  children,
  ...content
}: ComponentProps<typeof Menu.Content> & { trigger: ReactNode; tooltip?: ReactNode }) {
  // a click leaves no focus ring on the trigger; opened from the keyboard, focus starts on the picked option
  const pointer = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const button = (
    <Menu.Trigger
      asChild
      onPointerDown={() => (pointer.current = true)}
      onKeyDown={() => (pointer.current = false)}
    >
      {trigger}
    </Menu.Trigger>
  );

  return (
    <Menu.Root
      onOpenChange={(open) =>
        open &&
        !pointer.current &&
        requestAnimationFrame(() =>
          panel.current?.querySelector<HTMLElement>('[data-state="checked"]')?.focus(),
        )
      }
    >
      {tooltip === undefined ? (
        button
      ) : (
        <Tooltip label={tooltip} side={side}>
          {button}
        </Tooltip>
      )}
      <Menu.Portal>
        <Menu.Content
          ref={panel}
          loop
          side={side}
          sideOffset={4}
          className={cn(
            "menu-panel max-h-[min(22rem,var(--radix-dropdown-menu-content-available-height))] max-w-80 min-w-40 overflow-y-auto",
            className,
          )}
          onCloseAutoFocus={(event) => pointer.current && event.preventDefault()}
          {...content}
        >
          {children}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function MenuItem({ className, ...props }: ComponentProps<typeof Menu.Item>) {
  return <Menu.Item className={cn("menu-item", className)} {...props} />;
}

export const MenuRadioGroup = Menu.RadioGroup;
export const MenuSub = Menu.Sub;

export function MenuSubTrigger({ className, ...props }: ComponentProps<typeof Menu.SubTrigger>) {
  return <Menu.SubTrigger className={cn("menu-item", className)} {...props} />;
}

export function MenuSubContent({ className, ...props }: ComponentProps<typeof Menu.SubContent>) {
  return (
    <Menu.Portal>
      <Menu.SubContent
        sideOffset={4}
        className={cn("menu-panel max-h-80 min-w-40 overflow-y-auto", className)}
        {...props}
      />
    </Menu.Portal>
  );
}

export function MenuSeparator({ className, ...props }: ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn("mx-3 my-1 h-px bg-divider", className)} {...props} />;
}

export function MenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Menu.RadioItem>) {
  return (
    <Menu.RadioItem className={cn("menu-item", className)} {...props}>
      {children}
      <CheckSlot>
        <Menu.ItemIndicator>
          <Check className="size-4" />
        </Menu.ItemIndicator>
      </CheckSlot>
    </Menu.RadioItem>
  );
}

export function MenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof Menu.CheckboxItem>) {
  return (
    <Menu.CheckboxItem className={cn("menu-item", className)} {...props}>
      {children}
      <CheckSlot>
        <Menu.ItemIndicator>
          <Check className="size-4" />
        </Menu.ItemIndicator>
      </CheckSlot>
    </Menu.CheckboxItem>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <Menu.Label className="px-3 py-1 type-meta-12 text-muted">{children}</Menu.Label>;
}

/** Reserves checkmark space so row counts stay aligned. */
export function CheckSlot({ children }: { children: ReactNode }) {
  return <span className="flex size-4 shrink-0 items-center text-muted">{children}</span>;
}
