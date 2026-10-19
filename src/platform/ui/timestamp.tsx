import { useEffect, useState } from "react";

import { cn } from "#/ui/cn";
import { formatAge, formatExact, formatRelative, formatTimestamp } from "#/ui/format";
import { Tooltip } from "#/ui/tooltip";

const RELATIVE_TICK_MS = 15_000;

export function Timestamp({ at, className }: { at: string; className?: string }) {
  return (
    <Tooltip label={formatExact(at)}>
      <time dateTime={at} className={cn("relative z-10 whitespace-nowrap tabular-nums", className)}>
        {formatTimestamp(at)}
      </time>
    </Tooltip>
  );
}

/** A moment as how long ago it was, such as `2 minutes ago`, kept current while shown. */
export function RelativeTimestamp({ at, className }: { at: string; className?: string }) {
  const now = useNow();

  return (
    <Tooltip label={formatExact(at)}>
      <time dateTime={at} className={cn("whitespace-nowrap", className)}>
        {formatRelative(at, now)}
      </time>
    </Tooltip>
  );
}

/** A moment as a compact age, such as `5m` or `17d`, kept current while shown. */
export function AgeTimestamp({ at, className }: { at: string; className?: string }) {
  const now = useNow();

  return (
    <Tooltip label={formatExact(at)}>
      <time dateTime={at} className={cn("whitespace-nowrap tabular-nums", className)}>
        {formatAge(at, now)}
      </time>
    </Tooltip>
  );
}

function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), RELATIVE_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return now;
}
