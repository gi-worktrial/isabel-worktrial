// the Traces list's annotation filters in its header row, where platform lays them out as a card beside the table:
// each outcome as a segmented control, each set of tags as a menu, and a picked tag as a chip that clears it
import { ChevronDown, Tag, X } from "lucide-react";

import { Button } from "#/ui/button";
import { cn } from "#/ui/cn";
import { Dropdown, MenuRadioGroup, MenuRadioItem } from "#/ui/menu";
import { SegmentedControl } from "#/ui/segmented-control";
import { FAIL_LABEL, PASS_LABEL } from "#src/sdk/evals";

type Criterion = { name: string; counts: ReadonlyArray<{ label: string; traces: number }> };
type Section = { title: string; criteria: readonly Criterion[] };

const ALL = "all";
const OUTCOMES = new Map([
  [PASS_LABEL, "Passed"],
  [FAIL_LABEL, "Failed"],
]);

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const valueOf = (name: string, label: string) => `${name}:${label}`;

// an outcome's dot and count carry its color, so the filter reads at a glance
const OUTCOME_DOTS = new Map([
  [PASS_LABEL, "bg-success"],
  [FAIL_LABEL, "bg-danger"],
]);
const OUTCOME_COUNTS = new Map([
  [PASS_LABEL, "text-success-ink"],
  [FAIL_LABEL, "text-danger"],
]);

/** Outcome as All, Passed and Failed with their counts, then a menu per set of tags, then the picked tag to clear. */
export function AnnotationFilters({
  sections,
  annotation,
  onFilter,
}: {
  sections: readonly Section[];
  annotation: string | undefined;
  onFilter(annotation: string | undefined): void;
}) {
  const [outcomes = [], tags = []] = ["Outcome", "Tags"].map(
    (title) => sections.find((section) => section.title === title)?.criteria,
  );
  const picked = tags.find(({ name }) => annotation?.startsWith(`${name}:`));
  return (
    <>
      {outcomes.map(({ name, counts }) => (
        <SegmentedControl
          key={name}
          label={sentence(name)}
          value={annotation?.startsWith(`${name}:`) ? annotation : ALL}
          segments={[
            { value: ALL, label: "All" },
            ...counts.map(({ label, traces }) => ({
              value: valueOf(name, label),
              label: (
                <>
                  {OUTCOME_DOTS.has(label) && (
                    <span
                      aria-hidden="true"
                      className={cn("size-2 shrink-0 rounded-full", OUTCOME_DOTS.get(label))}
                    />
                  )}
                  {OUTCOMES.get(label) ?? label}
                  <span className={cn("tabular-nums", OUTCOME_COUNTS.get(label) ?? "text-muted")}>
                    {traces.toLocaleString()}
                  </span>
                </>
              ),
            })),
          ]}
          onChange={(value) => onFilter(value === ALL ? undefined : value)}
        />
      ))}
      {tags.map(({ name, counts }) => (
        <Dropdown
          key={name}
          trigger={
            <Button>
              <Tag aria-hidden="true" className="size-4 text-muted" />
              {sentence(name)}
              <ChevronDown aria-hidden="true" className="size-3.5 text-muted" />
            </Button>
          }
        >
          <MenuRadioGroup value={annotation ?? ""} onValueChange={onFilter}>
            {counts.map(({ label, traces }) => (
              <MenuRadioItem key={label} value={valueOf(name, label)}>
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <span className="text-muted tabular-nums">{traces.toLocaleString()}</span>
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </Dropdown>
      ))}
      {picked !== undefined && annotation !== undefined && (
        <button
          type="button"
          aria-label={`Clear ${sentence(picked.name)} ${annotation.slice(picked.name.length + 1)}`}
          onClick={() => onFilter(undefined)}
          className="inline-flex h-8 items-center gap-2 rounded-sm bg-inset px-3 type-label-13 text-ink hover:bg-subtle"
        >
          {annotation.slice(picked.name.length + 1)}
          <X className="size-3.5 text-muted" />
        </button>
      )}
    </>
  );
}
