import { expect, test, vi } from "vitest";
import { z } from "zod";

import { type Persistence, SavedStore } from "./storage.ts";

const schema = z.object({ text: z.string() });

class Draft extends SavedStore<z.infer<typeof schema>> {
  constructor(persistence: Persistence) {
    super(persistence, schema.parse, { text: "Initial" });
  }
  getSnapshot = () => this.saved;
  edit(text: string): void {
    this.commit({ text });
  }
}

test("reload retains a per-page draft when storage throws or is unreadable", () => {
  const read = vi.fn<() => string | null>(() => {
    throw new Error("Storage blocked");
  });
  const draft = new Draft({
    read,
    write: () => {
      throw new Error("Storage blocked");
    },
  });
  draft.edit("Typed in memory");
  const changed = vi.fn<() => void>();
  const unsubscribe = draft.subscribe(changed);
  draft.reload();
  expect(draft.getSnapshot()).toEqual({ text: "Typed in memory" });
  read.mockReturnValue("not JSON");
  draft.reload();
  expect(draft.getSnapshot()).toEqual({ text: "Typed in memory" });
  read.mockReturnValue('{"text":42}');
  draft.reload();
  expect(draft.getSnapshot()).toEqual({ text: "Typed in memory" });
  expect(changed).not.toHaveBeenCalled();
  unsubscribe();
});

test("reload of a removed key restores the constructor initial value without writing", () => {
  const read = vi.fn<() => string | null>(() => '{"text":"Saved"}');
  const write = vi.fn<(value: string) => void>();
  const draft = new Draft({ read, write });
  const changed = vi.fn<() => void>();
  const unsubscribe = draft.subscribe(changed);
  read.mockReturnValue(null);
  draft.reload();
  expect(draft.getSnapshot()).toEqual({ text: "Initial" });
  expect(changed).toHaveBeenCalledOnce();
  expect(write).not.toHaveBeenCalled();
  unsubscribe();
});
