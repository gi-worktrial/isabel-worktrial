// what a model call did in its turn, so the timeline names it as the transcript does rather than by its model alone;
// platform's traces.tsx calls it, so it reads only the SDK
import type { Span } from "#src/sdk/agents";
import { spanMessages } from "#src/sdk/genai";

const said = (span: Span, type: string) =>
  spanMessages(span, "gen_ai.output.messages").some((message) =>
    message.parts.some((part) => part.type === type && Boolean(part.content)),
  );

const isChat = (span: Span) => span.attributes["gen_ai.operation.name"] === "chat";

/** A model call as the transcript names it: the turn's last words are its Agent response. */
function modelRole(span: Span, spans: readonly Span[]) {
  if (span === spans.filter((each) => isChat(each) && said(each, "text")).at(-1)) {
    return "Agent response";
  }
  return said(span, "text") ? "Message" : said(span, "reasoning") ? "Reasoning" : "Model call";
}

/** A model call's role, then its model, such as `Reasoning, gpt-5`. */
export function modelName(span: Span, spans: readonly Span[]) {
  const model = span.attributes["gen_ai.request.model"];
  const role = modelRole(span, spans);
  return model === undefined ? role : `${role}, ${model}`;
}
