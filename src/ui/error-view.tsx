import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { RotateCw } from "lucide-react";
import { useEffect } from "react";

import { Button } from "#/ui/button";
import { EmptyState } from "#/ui/empty-state";
import { errorMessage } from "#src/ui/format-extra";

/** A read that failed: what didn't load, the reason, and Retry, which reads it again. */
export function ErrorView({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry(): void;
}) {
  return (
    <EmptyState
      role="alert"
      title={title}
      description={errorMessage(error)}
      action={
        <Button size="small" onClick={onRetry}>
          <RotateCw aria-hidden="true" className="size-4" />
          Retry
        </Button>
      }
    />
  );
}

// a record the link names that isn't there, whose own message names repository paths rather than product words
const isMissing = (error: unknown) =>
  typeof error === "object" && error !== null && "status" in error && error.status === 404;

/** Every route's error view: Retry reloads the page's loaders and reads again. */
export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const queries = useQueryErrorResetBoundary();
  // a read that failed while rendering stays failed until its boundary resets, so the reloaded page fetches it again
  useEffect(() => {
    queries.reset();
  }, [queries]);

  return (
    <ErrorView
      title={isMissing(error) ? "This page doesn't exist" : "This page could not load"}
      error={isMissing(error) ? "Nothing matches this link" : error}
      onRetry={() => void router.invalidate()}
    />
  );
}
