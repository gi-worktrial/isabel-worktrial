import { Tooltip as Radix } from "radix-ui";
import type { ReactElement, ReactNode } from "react";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <Radix.Provider delayDuration={400}>{children}</Radix.Provider>;
}

export function Tooltip({
  label,
  side = "bottom",
  children,
}: {
  label: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  children: ReactElement;
}) {
  return (
    <Radix.Root>
      <Radix.Trigger asChild>{children}</Radix.Trigger>
      <Radix.Portal>
        <Radix.Content
          side={side}
          sideOffset={4}
          collisionPadding={16}
          className="z-60 max-w-96 rounded-[3px] bg-tip px-2 py-1 type-meta-12 text-white shadow-float motion-safe:animate-enter"
        >
          {label}
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}
