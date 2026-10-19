const APPLY_PROMPT = /<ApplyPrompt>([\s\S]*?)<\/ApplyPrompt>/u;

/** A Candidate's MDX body as its rationale and the `<ApplyPrompt>` text an engineer copies, which repeats the rationale and the Fix. */
export function splitApplyPrompt(body: string): { rationale: string; prompt: string | undefined } {
  const match = APPLY_PROMPT.exec(body);
  const prompt = match?.[1]?.trim();
  return match === null || prompt === undefined || prompt === ""
    ? { rationale: body.trim(), prompt: undefined }
    : { rationale: body.replace(match[0], "").trim(), prompt };
}
