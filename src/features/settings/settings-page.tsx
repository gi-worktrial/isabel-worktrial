import type { ReactNode } from "react";

/** A settings page in our page shape, its title row over one bounded column of platform's field groups. */
export function SettingsPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article aria-label={title} className="enter-fade flex min-w-0 flex-col gap-4">
      <h1 className="flex min-h-8 min-w-0 items-center type-title-18 text-ink">
        <span className="min-w-0 truncate" title={title}>
          {title}
        </span>
      </h1>
      <div className="flex max-w-4xl min-w-0 flex-col gap-10">{children}</div>
    </article>
  );
}

/** Controls the services refuse, disabled with the reason under them. */
export function Locked({ reason, children }: { reason: string; children: ReactNode }) {
  return (
    <fieldset disabled className="flex min-w-0 flex-col gap-2">
      {children}
      <p className="type-meta-12 text-muted">{reason}</p>
    </fieldset>
  );
}

/** A short list's empty words on a quiet panel, in the list's place, so they never dangle. */
export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="rounded-sm bg-subtle px-3 py-2 type-label-13 text-muted">{children}</p>;
}
