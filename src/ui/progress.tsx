import { cn } from "#/ui/cn";

export function Busy({ label, className }: { label: string; className?: string }) {
  return (
    <span
      role="status"
      className={cn("inline-flex min-w-0 items-center gap-2 type-meta-12 text-muted", className)}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="size-3.5 shrink-0 text-divider-strong motion-safe:animate-spin"
      >
        <circle
          cx="8"
          cy="8"
          r="6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="30 11"
        />
      </svg>
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}
