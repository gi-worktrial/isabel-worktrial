import { Agent } from "@openai/agents";
import { expect, it } from "vitest";

import { ModelReplySchema } from "./index.ts";

it("the SDK parses the model's flat actions, and every field is required", () => {
  const agent = new Agent({ name: "schema-only", outputType: ModelReplySchema });
  const actions = [{ kind: "open_trace", session: "s1", trace: "t1" }];
  const reply = { reply: "I can explain the evidence.", actions };
  expect(agent.processFinalOutput(JSON.stringify(reply))).toEqual(reply);
  const none = { ...reply, actions: [] };
  expect(agent.processFinalOutput(JSON.stringify(none))).toEqual(none);
  expect(() => agent.processFinalOutput(JSON.stringify({ reply: reply.reply }))).toThrow();
  expect(() =>
    agent.processFinalOutput(
      JSON.stringify({ ...none, actions: [{ kind: "open_trace", trace: "t1" }] }),
    ),
  ).toThrow();
  expect(() =>
    agent.processFinalOutput(
      JSON.stringify({ ...none, actions: [{ kind: "approve", candidate: "c" }] }),
    ),
  ).toThrow();
});
