import { ScrollArea } from "radix-ui";
import { type ComponentProps, useEffect, useRef, useState } from "react";

import { Button } from "#/ui/button";
import { cn } from "#/ui/cn";

export function Suggestions({
  className,
  children,
  ...props
}: ComponentProps<typeof ScrollArea.Root>) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const element = viewport.current!;
    const update = () => {
      setCanScrollLeft(element.scrollLeft > 1);
      setCanScrollRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 1);
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    observer.observe(content.current!);
    element.addEventListener("scroll", update, { passive: true });
    update();

    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, []);

  return (
    <ScrollArea.Root
      data-scroll-left={canScrollLeft}
      data-scroll-right={canScrollRight}
      className="w-full overflow-x-auto whitespace-nowrap [--fade-left:black] [--fade-right:black] data-[scroll-left=true]:[--fade-left:transparent] data-[scroll-right=true]:[--fade-right:transparent] [mask-image:linear-gradient(to_right,var(--fade-left),black_12px,black_calc(100%_-_12px),var(--fade-right))]"
      {...props}
    >
      <ScrollArea.Viewport ref={viewport} className="size-full">
        <div
          ref={content}
          className={cn("flex w-max min-w-full flex-nowrap items-center gap-2 py-1", className)}
        >
          {children}
        </div>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar orientation="horizontal" className="hidden">
        <ScrollArea.Thumb />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}

type SuggestionProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  suggestion: string;
  onClick?: ((suggestion: string) => void) | undefined;
};

export function Suggestion({
  suggestion,
  onClick,
  className,
  children,
  ...props
}: SuggestionProps) {
  return (
    <Button
      variant="outline"
      size="small"
      className={cn("rounded-full px-3 focus-inset", className)}
      onClick={() => onClick?.(suggestion)}
      {...props}
    >
      {children ?? suggestion}
    </Button>
  );
}
