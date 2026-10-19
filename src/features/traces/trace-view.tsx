import type { ComponentProps } from "react";

import { TraceTurns as SessionTurns } from "#/trace-view";
import { StepPlacesOf } from "#src/features/traces/failure";
import { TrialSession } from "#src/features/traces/transcript";

/** Platform's transcript off its session page, such as a debug Eval's trial, its span links opening in `params`' session. */
export function TraceTurns({
  params,
  ...turns
}: ComponentProps<typeof SessionTurns> & {
  params: { orgId: string; agent: string; session: string };
}) {
  return (
    <TrialSession value={params}>
      <StepPlacesOf turns={turns.turns}>
        <SessionTurns {...turns} />
      </StepPlacesOf>
    </TrialSession>
  );
}
