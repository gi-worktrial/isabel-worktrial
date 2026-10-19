// only the folders give way, from their left, so the folder nearest the name and the whole name stay
export function FilePath({ path, className }: { path: string; className: string }) {
  const slash = path.lastIndexOf("/");
  return (
    <span className={`flex min-w-0 overflow-hidden ${className}`}>
      {slash === -1 ? null : (
        <span dir="rtl" className="min-w-0 shrink-[999] truncate text-left font-normal text-muted">
          <bdi dir="ltr">{path.slice(0, slash + 1)}</bdi>
        </span>
      )}
      <span className="shrink-0">{path.slice(slash + 1)}</span>
    </span>
  );
}

// lines added and removed, a side with none left out so nothing red shows for nothing removed
export function LineCounts({
  added,
  removed,
  className,
}: {
  added: number;
  removed: number;
  className: string;
}) {
  return (
    <span
      aria-label={`${added} lines added, ${removed} lines removed`}
      className={`flex shrink-0 gap-2 tabular-nums ${className}`}
    >
      {added === 0 ? null : <span className="text-success-ink">+{added}</span>}
      {removed === 0 ? null : <span className="text-danger">−{removed}</span>}
    </span>
  );
}
