import { computeAccessibleName, getRole } from "dom-accessibility-api";

import { walkthroughName, type WalkthroughTarget } from "#src/demo/plane/seed/walkthroughs";

const TYPE_MS = 28;
const ASK_TYPE_MS = 1000;
const GLANCE_WORDS = 6;
const LOG = '[role="log"][aria-label="Conversation"]';

// a menu opens on the press and a tab on mousedown, and pointer 1 is live so a drag can capture it
export function press(control: HTMLElement): void {
  const pointer = {
    bubbles: true,
    cancelable: true,
    button: 0,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
  };
  control.dispatchEvent(new PointerEvent("pointerdown", pointer));
  control.dispatchEvent(new MouseEvent("mousedown", pointer));
  control.dispatchEvent(new PointerEvent("pointerup", pointer));
  control.dispatchEvent(new MouseEvent("mouseup", pointer));
  control.click();
}

// a "key ⌘K" act presses its last key with ⌘ held, naming its code as platform's shortcuts read it
export function pressKey(act: string): void {
  const key = act.slice(-1);
  const init = {
    key: key.toLowerCase(),
    code: `Key${key.toUpperCase()}`,
    metaKey: true,
    bubbles: true,
    cancelable: true,
  };
  document.body.dispatchEvent(new KeyboardEvent("keydown", init));
}

// a code editor shows its file a moment after the tab opens
const EDITOR_READY_MS = 3000;
const field = (found: HTMLElement) =>
  found instanceof HTMLTextAreaElement ||
  found instanceof HTMLInputElement ||
  found.isContentEditable;

// a field takes the words as its value, and the code editor reads its own beforeinput events, so the words go at the
// end of its file the way typing would put them there
export async function type(
  found: HTMLElement,
  text: string,
  stopped: () => boolean,
  inMs?: number,
  refind?: () => HTMLElement | null,
): Promise<void> {
  let target = found;
  for (let waited = 0; !field(target) && waited < EDITOR_READY_MS; waited += TYPE_MS) {
    if (stopped()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, TYPE_MS));
    target = refind?.() ?? target;
  }
  target.focus({ preventScroll: true });
  let held = "";
  let write: (value: string) => void;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const own =
      target instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(own, "value")?.set;
    if (setter === undefined) {
      throw new Error("The field has no value setter");
    }
    const input = target;
    held = input.value;
    write = (value) => {
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
  } else if (target.isContentEditable) {
    const editor = target;
    const mac = /Mac/u.test(navigator.platform);
    editor.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "End",
        code: "End",
        metaKey: mac,
        ctrlKey: !mac,
        bubbles: true,
        cancelable: true,
        composed: true,
      }),
    );
    let typed = "";
    write = (value) => {
      editor.dispatchEvent(
        new InputEvent("beforeinput", {
          inputType: "insertText",
          data: value.slice(typed.length),
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      );
      typed = value;
    };
  } else {
    throw new Error("The beat has no field to type in");
  }
  const from = held !== "" && text.startsWith(held) ? held.length + 1 : 1;
  const each =
    inMs === undefined ? 1 : Math.max(1, Math.ceil(((text.length - from + 1) * TYPE_MS) / inMs));
  for (let length = from; length <= text.length + each - 1; length += each) {
    if (stopped()) {
      return;
    }
    write(text.slice(0, Math.min(length, text.length)));
    await new Promise((resolve) => setTimeout(resolve, TYPE_MS));
  }
}

export async function send(
  pane: HTMLElement,
  question: string,
  stopped: () => boolean,
  beforeSend: () => void,
): Promise<void> {
  const prompt = pane.querySelector<HTMLElement>('textarea[aria-label="Prompt"]');
  const button = pane.querySelector<HTMLElement>('button[aria-label="Send prompt"]');
  if (prompt === null || button === null) {
    throw new Error("Pebble's prompt is not on the page");
  }
  await type(prompt, question, stopped, ASK_TYPE_MS);
  // React reads the field on its next frame, and only then does Send take the words
  await new Promise<number>(requestAnimationFrame);
  if (!stopped()) {
    beforeSend();
    button.click();
  }
}

const COMPOSER = ':has(button[aria-label="Send prompt"])';

// an ask stands on the composer while its words are typed, then on the newest turn as it comes
export function askFocus(pane: HTMLElement, part: "composer" | "answer"): HTMLElement {
  if (part === "answer") {
    // the newest turn, never the follow-up prompts rendered after it
    const turns = pane.querySelectorAll<HTMLElement>(
      `${LOG} > div > :is([data-turn], [role="status"])`,
    );
    return turns.item(turns.length - 1) ?? pane;
  }
  const composer = pane
    .querySelector('textarea[aria-label="Prompt"]')
    ?.closest<HTMLElement>(COMPOSER);
  return composer ?? pane;
}

export function failedAnswer(pane: HTMLElement): string | null {
  return pane.querySelector('[role="alert"] p')?.textContent ?? null;
}

// only the conversation's own busy turn counts, since panels and rows inside an answer carry live status of their own
export function answered(pane: HTMLElement): boolean {
  const log = pane.querySelector(LOG);
  if (log === null) {
    return false;
  }
  const turns = log.querySelectorAll<HTMLElement>(
    ":scope > div > [data-turn], :scope > div > [aria-busy]",
  );
  const last = turns[turns.length - 1];
  return last !== undefined && last.dataset.turn === "pebble";
}

// the answer was read as it streamed, so the hold only glances back, a word per five of prose up to six
export function answerText(pane: HTMLElement): string {
  const last = [...pane.querySelectorAll<HTMLElement>(`${LOG} [data-turn="pebble"]`)].at(-1);
  if (last === undefined) {
    return "";
  }
  const prose = [...last.querySelectorAll<HTMLElement>(":is(p, li):not(:has(p, li))")].map(
    (each) => each.innerText,
  );
  const words = prose
    .join(" ")
    .split(/\s+/)
    .filter((word) => word !== "");
  return words.slice(0, Math.min(GLANCE_WORDS, Math.ceil(words.length / 5))).join(" ");
}

// a row with no accessible name, like a list item, is heard by its words; an empty aria-labelledby falls back to
// aria-label, as browsers name the palette's field, where the library stops at the empty label
function nameOf(element: HTMLElement): string {
  return (
    computeAccessibleName(element) ||
    element.getAttribute("aria-label") ||
    element.innerText.replace(/\s+/g, " ").trim()
  );
}

// a closed Pebble panel stays mounted but inert, so its controls count as hidden
function matches(element: HTMLElement, { role, name, shows }: WalkthroughTarget): boolean {
  if (
    getRole(element) !== role ||
    !element.checkVisibility({ visibilityProperty: true }) ||
    element.closest("[inert]") !== null
  ) {
    return false;
  }
  const heard = nameOf(element);
  const pattern = walkthroughName(name);
  return (
    (typeof pattern === "string" ? heard === pattern : pattern.test(heard)) &&
    (shows === undefined || new RegExp(shows, "u").test(element.innerText))
  );
}

// every element under root, open shadow roots included, since the code editor draws inside one
function descendants(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("*")].flatMap((element) =>
    element.shadowRoot === null ? [element] : [element, ...descendants(element.shadowRoot)],
  );
}

// a container's name can repeat, so every matching container is searched
function findAll(target: WalkthroughTarget): HTMLElement[] {
  const roots = target.within === undefined ? [document] : findAll(target.within);
  return roots.flatMap((root) => descendants(root).filter((element) => matches(element, target)));
}

export function findTarget(target: WalkthroughTarget): HTMLElement | null {
  const all = findAll(target);
  return (target.last === true ? all.at(-1) : all[0]) ?? null;
}
