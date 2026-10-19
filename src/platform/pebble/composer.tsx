import {
  thinkingLevelSchema,
  type SandboxStatus,
  type ThinkingLevel,
  type pebbleModels,
} from "@grounded-intelligence/grounded-sdk";
import { ArrowUp, AtSign, ChevronDown, ChevronRight, RotateCcw, Square } from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "#/ui/cn";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "#/ui/input-group";
import {
  Dropdown,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
} from "#/ui/menu";
import { Suggestion, Suggestions } from "#/ui/suggestion";
import { Tooltip } from "#/ui/tooltip";
import { setDraft as saveDraft, useDraft } from "#src/features/pebble/drafts";
import {
  MENTION_GROUPS,
  type Mention,
  MentionText,
  resolveMentions,
} from "#src/features/pebble/mentions";
import { Chip } from "#src/ui/chip";
import { useListbox } from "#src/ui/listbox";
import { Popover } from "#src/ui/popover";
import { matchesWords } from "#src/ui/search";

type ComposerProps = {
  /** The thread the prompt belongs to, whose draft every view of it shares. */
  thread: string | undefined;
  disabled: boolean;
  busy: boolean;
  models: ReturnType<typeof pebbleModels>;
  model: string | undefined;
  thinkingLevel: ThinkingLevel | undefined;
  onModel(model: string): void;
  onThinkingLevel(level: ThinkingLevel | undefined): void;
  mentions: readonly Mention[];
  /** Called once the engineer first types @, so the records to mention load only when wanted. */
  onMentioning(): void;
  onSend(text: string, mentions: readonly Mention[]): Promise<boolean>;
  onStop(): void;
  /** Called as the draft changes, by typing or a prefill. */
  onType(): void;
  onRetryWake(): void;
  sandbox: SandboxStatus | undefined;
  /** Text to put at the start of the prompt once it's enabled, cleared through `onPrefilled` once applied. */
  prefill: string | undefined;
  onPrefilled: (() => void) | undefined;
  suggestions?: readonly string[] | undefined;
};

const THINKING_LABELS: Record<ThinkingLevel, string> = {
  off: "Off",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max",
};

const DEFAULT_LEVEL = "default";
/** Matches the fade-out delay in `--animate-status-ready`. */
const READY_STATUS_DURATION_MS = 3000;
const MODEL_NAMESPACE_CAP = 10;
const MODEL_NAME_CAP = 40;
const ASLEEP = { label: "Pebble is asleep", short: "Asleep", dot: "bg-faint" };
const SANDBOX_STATUS: Record<SandboxStatus, { label: string; short: string; dot: string }> = {
  unknown: ASLEEP,
  stopped: ASLEEP,
  starting: {
    label: "Waking Pebble up…",
    short: "Waking…",
    dot: "bg-accent motion-safe:animate-pulse",
  },
  ready: { label: "Pebble is ready", short: "Ready", dot: "bg-success" },
  pausing: {
    label: "Pebble is going to sleep",
    short: "Sleeping…",
    dot: "bg-faint motion-safe:animate-pulse",
  },
  error: { label: "Pebble couldn't wake up", short: "Wake failed", dot: "bg-danger" },
};

function modelOptionLabel(name: string) {
  const segments = name.split("/");
  return segments
    .map((segment, index) => {
      const cap = index === segments.length - 1 ? MODEL_NAME_CAP : MODEL_NAMESPACE_CAP;
      return segment.length <= cap ? segment : `${segment.slice(0, cap)}…`;
    })
    .join("/");
}

function mentionAtCursor(value: string, cursor: number) {
  const query = /(?:^|\s)@([^\s@]*)$/u.exec(value.slice(0, cursor))?.[1];
  return query === undefined ? null : { start: cursor - query.length - 1, end: cursor, query };
}

export function Composer({
  thread,
  disabled,
  busy,
  models,
  model,
  thinkingLevel,
  onModel,
  onThinkingLevel,
  mentions,
  onMentioning,
  onSend,
  onStop,
  onType,
  onRetryWake,
  sandbox,
  prefill,
  onPrefilled,
  suggestions,
}: ComposerProps) {
  const draft = useDraft(thread);
  const setDraft = (next: string | ((current: string) => string)) => saveDraft(thread, next);
  const [mention, setMention] = useState<ReturnType<typeof mentionAtCursor>>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const caret = useRef<number | null>(null);
  const pickerId = useId();
  const optionId = (index: number) => `${pickerId}-option-${index}`;
  useEffect(() => {
    if (prefill !== undefined && !disabled) {
      input.current?.focus();
      saveDraft(thread, (current) => (current.startsWith(prefill) ? current : prefill + current));
      onType();
      onPrefilled?.();
    }
  }, [prefill, disabled, onType, onPrefilled, thread]);
  useLayoutEffect(() => {
    if (caret.current !== null) {
      input.current?.focus();
      input.current?.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [draft]);
  useLayoutEffect(() => {
    const textarea = input.current;
    if (textarea?.selectionStart === draft.length && textarea.selectionEnd === draft.length) {
      textarea.scrollTop = textarea.scrollHeight;
    }
  }, [draft]);
  // keyboard order follows the shown groups
  const options = useMemo(() => {
    const matching = mentions.filter(
      ({ label, detail }) => mention !== null && matchesWords(mention.query, [label, detail]),
    );
    return MENTION_GROUPS.flatMap((group) =>
      matching.filter((option) => option.kind === group.kind),
    );
  }, [mentions, mention]);
  const sendable = !disabled && !busy && draft.trim() !== "";
  const selectedModel = models.find(({ name }) => name === model);
  const displayedModel = model?.slice(model.lastIndexOf("/") + 1);
  const thinkingLabel = thinkingLevel === undefined ? "Default" : THINKING_LABELS[thinkingLevel];
  const levels =
    selectedModel?.thinkingLevels ??
    (selectedModel?.reasoning
      ? thinkingLevelSchema.options.filter(
          (level) => level !== "off" && level !== "xhigh" && level !== "max",
        )
      : ["off"]);

  async function send() {
    if (!sendable) {
      return;
    }

    const submitted = draft;
    const resolved = resolveMentions(submitted, mentions);
    setMention(null);
    input.current?.focus();
    if (await onSend(resolved.text, resolved.mentions)) {
      setDraft((current) => (current === submitted ? "" : current));
    }
  }

  function attach(option: Mention) {
    setMention(null);
    const start = mention?.start ?? input.current?.selectionStart ?? draft.length;
    const end = mention?.end ?? input.current?.selectionEnd ?? start;
    const prefix = draft.slice(0, start);
    const inserted = `@${option.label} `;
    caret.current = prefix.length + inserted.length;
    setDraft(`${prefix}${inserted}${draft.slice(end).replace(/^ /u, "")}`);
  }

  const listbox = useListbox(options, attach, mention);
  const active = listbox.current;
  const typed = (value: string, cursor: number) => {
    setDraft(value);
    const next = mentionAtCursor(value, cursor);
    if (next !== null) {
      onMentioning();
    }
    setMention(next);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention !== null && options.length > 0 && listbox.onKeyDown(event)) {
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  // the @ button starts a mention at the caret, so the picker is one click away without knowing the key
  const startMention = () => {
    const start = input.current?.selectionStart ?? draft.length;
    const end = input.current?.selectionEnd ?? start;
    const before = draft.slice(0, start);
    const at = before === "" || /\s$/u.test(before) ? "@" : " @";
    caret.current = before.length + at.length;
    typed(`${before}${at}${draft.slice(end)}`, caret.current);
  };

  return (
    <form
      data-composer=""
      aria-label="Message Pebble"
      className="@container/composer mx-auto w-full max-w-(--chat-width) shrink-0 px-4 pt-1 pb-2"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      {suggestions !== undefined && suggestions.length > 0 && (
        <div className="pb-2 enter-fade">
          <Suggestions role="group" aria-label="Suggested prompts" className="justify-start">
            {suggestions.map((suggestion) => (
              <Suggestion
                key={suggestion}
                suggestion={suggestion}
                disabled={disabled || busy}
                onClick={(text) => {
                  setDraft((current) => (current.trim() === "" ? text : `${current}\n\n${text}`));
                  input.current?.focus();
                  onType();
                }}
              />
            ))}
          </Suggestions>
        </div>
      )}
      <Popover
        anchor={
          <InputGroup>
            {/* @mentions show as chips from an overlay under the field, whose own words stay clear */}
            <div
              ref={overlay}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden pt-3 pr-12 pb-2 pl-3 type-copy-14 whitespace-pre-wrap wrap-break-word text-ink"
            >
              <MentionText text={draft} mentions={mentions} overlay />
            </div>
            <InputGroupTextarea
              ref={input}
              rows={1}
              aria-label="Prompt"
              placeholder="Ask Pebble"
              value={draft}
              readOnly={disabled}
              aria-disabled={disabled}
              aria-autocomplete="list"
              aria-controls={mention === null ? undefined : pickerId}
              aria-activedescendant={
                mention === null || active === undefined
                  ? undefined
                  : optionId(options.indexOf(active))
              }
              className="relative min-h-11 pt-3 pb-2 pr-12 wrap-break-word text-transparent caret-ink"
              onChange={(event) => {
                typed(event.target.value, event.target.selectionStart);
                onType();
              }}
              onClick={(event) =>
                typed(event.currentTarget.value, event.currentTarget.selectionStart)
              }
              onScroll={(event) => {
                if (overlay.current !== null) {
                  overlay.current.scrollTop = event.currentTarget.scrollTop;
                }
              }}
              onKeyDown={onKeyDown}
            />
            <InputGroupAddon align="block-end" className="absolute right-1.5 bottom-1.5 w-auto p-0">
              {busy ? (
                <Tooltip label="Stop answer">
                  <InputGroupButton
                    aria-label="Stop answer"
                    variant="primary"
                    className="size-8 shrink-0 rounded-sm px-0 enabled:hover:bg-primary/85"
                    disabled={disabled}
                    onClick={onStop}
                  >
                    <Square className="size-3 fill-current" />
                  </InputGroupButton>
                </Tooltip>
              ) : (
                <Tooltip label="Send prompt">
                  <InputGroupButton
                    type="submit"
                    aria-label="Send prompt"
                    variant="primary"
                    className="size-8 shrink-0 rounded-sm px-0 enabled:hover:bg-primary/85"
                    disabled={!sendable}
                  >
                    <ArrowUp className="size-4" />
                  </InputGroupButton>
                </Tooltip>
              )}
            </InputGroupAddon>
          </InputGroup>
        }
        open={mention !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMention(null);
          }
        }}
        ref={listbox.list}
        id={pickerId}
        role="listbox"
        aria-label="Mention a record"
        side="top"
        align="start"
        sideOffset={6}
        // focus and the caret stay in the prompt
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        // escape closes the picker, not Pebble
        onEscapeKeyDown={(event) => event.stopPropagation()}
        onInteractOutside={(event) => {
          if (event.target === input.current) {
            event.preventDefault();
          }
        }}
        className="menu-panel max-h-80 w-(--radix-popover-trigger-width) overflow-y-auto"
      >
        {options.length === 0 && (
          <p className="px-3 py-1 type-meta-12 text-muted">Nothing matches</p>
        )}
        {MENTION_GROUPS.map((group) => {
          const members = options.filter((option) => option.kind === group.kind);
          return (
            members.length > 0 && (
              <div key={group.kind} role="group" aria-label={group.label}>
                {/* a heading only tells kinds apart, so one kind needs none */}
                {!options.every((option) => option.kind === group.kind) && (
                  <p aria-hidden="true" className="px-3 py-1 type-meta-12 text-muted">
                    {group.label}
                  </p>
                )}
                {members.map((option) => (
                  <button
                    key={`${option.kind}:${option.label}:${option.detail}`}
                    id={optionId(options.indexOf(option))}
                    type="button"
                    role="option"
                    aria-selected={option === active}
                    className="menu-item w-full text-left"
                    // a move, not an enter, so a list opening under a still pointer keeps its first pick
                    onMouseMove={() => listbox.setActive(options.indexOf(option))}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => attach(option)}
                  >
                    <Chip kind={group.chip}>{option.label}</Chip>
                    {option.detail !== "" && (
                      <span className="min-w-0 flex-1 truncate type-meta-12 text-muted">
                        {option.detail}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )
          );
        })}
      </Popover>
      <div className="mt-1 flex min-w-0 items-center gap-2">
        {/* a control of the row the model picker sits in, so it lines up with platform's controls */}
        <Tooltip label="Mention a record">
          <InputGroupButton
            aria-label="Mention a record"
            className="menu-selector-trigger shrink-0 rounded-md px-2.5"
            disabled={disabled}
            // the caret stays in the prompt
            onMouseDown={(event) => event.preventDefault()}
            onClick={startMention}
          >
            <AtSign className="size-3.5" />
          </InputGroupButton>
        </Tooltip>
        {/* the demo has no models, so it shows no picker */}
        {(models.length > 0 || model !== undefined) && (
          <Dropdown
            align="start"
            side="top"
            className="menu-selector w-max max-w-[min(36rem,calc(100vw-2rem))] rounded-md"
            trigger={
              <InputGroupButton
                aria-label={
                  model === undefined
                    ? "Select model"
                    : `Model: ${model}; thinking: ${thinkingLabel}`
                }
                className="menu-selector-trigger min-w-0 max-w-56 shrink-[3] rounded-md px-2.5 data-[state=open]:bg-fill"
                disabled={disabled || busy}
              >
                <span className="min-w-0 truncate">{displayedModel ?? "Select model"}</span>
                {model !== undefined && (
                  <span className="shrink-0 text-faint">{thinkingLabel}</span>
                )}
                <ChevronDown className="size-3.5 shrink-0" />
              </InputGroupButton>
            }
          >
            <MenuRadioGroup
              aria-label="Model"
              className="flex flex-col gap-1"
              value={model ?? ""}
              onValueChange={onModel}
            >
              {model !== undefined && selectedModel === undefined && (
                <MenuRadioItem
                  value={model}
                  aria-label={model}
                  title={model}
                  className="h-auto min-h-7 py-1"
                >
                  <span className="min-w-0 flex-1 break-all whitespace-normal">
                    {modelOptionLabel(model)}
                  </span>
                </MenuRadioItem>
              )}
              {models.map(({ name }) => (
                <MenuRadioItem
                  key={name}
                  value={name}
                  aria-label={name}
                  title={name}
                  className="h-auto min-h-7 py-1"
                >
                  <span className="min-w-0 flex-1 break-all whitespace-normal">
                    {modelOptionLabel(name)}
                  </span>
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
            {selectedModel !== undefined && (
              <>
                <MenuSeparator />
                <MenuSub>
                  <MenuSubTrigger>
                    <span className="min-w-0 flex-1 truncate">Thinking</span>
                    <span className="text-muted">{thinkingLabel}</span>
                    <ChevronRight className="size-3.5 shrink-0" />
                  </MenuSubTrigger>
                  <MenuSubContent className="menu-selector rounded-md">
                    <MenuRadioGroup
                      aria-label="Thinking level"
                      className="flex flex-col gap-1"
                      value={thinkingLevel ?? DEFAULT_LEVEL}
                      onValueChange={(value) => {
                        if (value === DEFAULT_LEVEL) {
                          onThinkingLevel(undefined);
                          return;
                        }

                        const level = thinkingLevelSchema.safeParse(value);
                        if (level.success) {
                          onThinkingLevel(level.data);
                        }
                      }}
                    >
                      <MenuRadioItem value={DEFAULT_LEVEL}>Default</MenuRadioItem>
                      {levels.map((level) => (
                        <MenuRadioItem key={level} value={level}>
                          {THINKING_LABELS[level]}
                        </MenuRadioItem>
                      ))}
                    </MenuRadioGroup>
                  </MenuSubContent>
                </MenuSub>
              </>
            )}
          </Dropdown>
        )}
        <PebbleStatus sandbox={sandbox} onRetryWake={onRetryWake} disabled={disabled} />
      </div>
    </form>
  );
}

/** Ready shows briefly after a wake, and a failed wake stays shown while it retries. */
function PebbleStatus({
  sandbox,
  onRetryWake,
  disabled,
}: {
  sandbox: SandboxStatus | undefined;
  onRetryWake(): void;
  disabled: boolean;
}) {
  const [previous, setPrevious] = useState(sandbox);
  const [shown, setShown] = useState<SandboxStatus | undefined>(
    sandbox === "ready" ? undefined : sandbox,
  );
  if (sandbox !== previous) {
    setPrevious(sandbox);
    const retrying = sandbox === "starting" && shown === "error";
    const alreadyAwake = sandbox === "ready" && previous === undefined;
    if (!retrying && !alreadyAwake) {
      setShown(sandbox);
    }
  }
  useEffect(() => {
    if (shown !== "ready") {
      return;
    }

    const timer = setTimeout(() => setShown(undefined), READY_STATUS_DURATION_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  if (shown === undefined) {
    return null;
  }
  const status = SANDBOX_STATUS[shown];

  return (
    <div
      role="status"
      aria-label={status.label}
      className="ml-auto flex min-h-4 w-fit max-w-full min-w-0 shrink-0 items-center px-1 type-meta-12 font-medium text-faint"
    >
      <span
        key={status.short}
        className={cn(
          "flex min-w-0 items-center gap-1.5",
          shown === "ready"
            ? "motion-safe:animate-status-ready"
            : "motion-safe:animate-status-fade",
        )}
      >
        <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", status.dot)} />
        {shown === "error" ? (
          <button
            type="button"
            aria-label="Retry waking Pebble"
            title="Retry waking Pebble"
            disabled={disabled || sandbox !== "error"}
            onClick={onRetryWake}
            className="inline-flex min-w-0 items-center gap-1 hover:text-ink focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="truncate">{status.short}</span>
            <RotateCcw aria-hidden="true" className="size-3 shrink-0" />
          </button>
        ) : (
          <span className="min-w-0 truncate" title={status.label}>
            {status.short}
          </span>
        )}
      </span>
    </div>
  );
}
