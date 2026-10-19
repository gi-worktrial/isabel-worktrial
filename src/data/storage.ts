// the only code outside src/demo that touches browser storage, and another tab's save shows on reload
import type { z } from "zod";

import { agentStorageKey, type SavedScope } from "#src/data/storage-keys";
import { listeners } from "#src/ui/listeners";

export interface Persistence {
  read(): string | null;
  write(value: string): void;
}

// the store is read on each use, so a blocked one throws where the quiet readers catch it
export const localPersistence = (key: string): Persistence => ({
  read: () => localStorage.getItem(key),
  write: (value) => localStorage.setItem(key, value),
});

// blocked storage reads as nothing saved and drops the write, so a convenience never stops the page
export function readQuietly(persistence: Persistence): string | null {
  try {
    return persistence.read();
  } catch {
    return null;
  }
}

export function writeQuietly(persistence: Persistence, value: string): void {
  try {
    persistence.write(value);
  } catch {
    return;
  }
}

// for libraries that save their own state, such as a panel layout
export const quietStorage = {
  getItem: (key: string) => readQuietly(localPersistence(key)),
  setItem: (key: string, value: string) => writeQuietly(localPersistence(key), value),
};

// a saved value that is missing, unreadable or in another shape reads as nothing saved
export function readSaved<T>(persistence: Persistence, parse: z.ZodType<T>["parse"]): T | null {
  try {
    const saved = persistence.read();
    return saved === null ? null : parse(JSON.parse(saved));
  } catch {
    return null;
  }
}

// a blocked store keeps its value for this page only
export abstract class SavedStore<T> {
  protected saved: T;
  readonly restored: boolean;
  readonly #persistence: Persistence;
  readonly #parse: z.ZodType<T>["parse"];
  readonly #initial: T;
  // the first listener catches up on a save made before it came
  #listeners = listeners({ onFirst: () => this.reload() });
  subscribe = this.#listeners.subscribe;

  constructor(persistence: Persistence, parse: z.ZodType<T>["parse"], fallback: T) {
    this.#persistence = persistence;
    this.#parse = parse;
    this.#initial = fallback;
    const read = readSaved(persistence, parse);
    this.restored = read !== null;
    this.saved = read ?? fallback;
  }

  reload(): void {
    try {
      const text = this.#persistence.read();
      this.adopt(text === null ? this.#initial : this.#parse(JSON.parse(text)));
    } catch {
      return;
    }
  }

  // what storage already holds, so nothing is written
  protected adopt(saved: T): void {
    if (JSON.stringify(saved) === JSON.stringify(this.saved)) {
      return;
    }
    this.saved = saved;
    this.changed();
    this.#listeners.emit();
  }

  protected commit(saved: T): void {
    this.saved = saved;
    this.changed();
    this.persist();
    this.#listeners.emit();
  }

  protected persist(): void {
    writeQuietly(this.#persistence, JSON.stringify(this.saved));
  }

  protected changed(): void {}
}

export function clearAgentStorage(scope: SavedScope): void {
  const prefix = `${agentStorageKey(scope)}:`;
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(prefix)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    return;
  }
}

// every local and per tab key, taken before a Walkthrough, and putting it back drops the keys it added
export function browserStorageSnapshot(): () => void {
  let saved: Array<[Storage, Map<string, string>]>;
  try {
    saved = [localStorage, sessionStorage].map((storage) => [
      storage,
      new Map(Object.keys(storage).map((key) => [key, storage.getItem(key) ?? ""])),
    ]);
  } catch {
    return () => {};
  }
  return () => {
    try {
      for (const [storage, values] of saved) {
        for (const key of Object.keys(storage)) {
          if (!values.has(key)) {
            storage.removeItem(key);
          }
        }
        for (const [key, value] of values) {
          storage.setItem(key, value);
        }
      }
    } catch {
      return;
    }
  };
}
