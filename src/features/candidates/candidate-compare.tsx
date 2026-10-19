import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Columns2 } from "lucide-react";
import { useState } from "react";

import { CandidateStatusTag } from "#/candidate-results";
import { useIssueParams } from "#/issue-view";
import { candidateQuery, candidatesQuery, treeQuery } from "#/queries";
import { Button } from "#/ui/button";
import { EmptyState } from "#/ui/empty-state";
import { Tag } from "#/ui/tag";
import { Tooltip } from "#/ui/tooltip";
import { BranchSwatch, CandidateBranch, useBranchTones } from "#src/features/candidates/branches";
import {
  type ComparedEval,
  type ComparedRun,
  compareEvals,
  countDifferences,
} from "#src/features/candidates/compare";
import { FileFold } from "#src/features/candidates/file-fold";
import { CandidateProofs, useRunEvals } from "#src/features/candidates/proofs-view";
import { TextDiff } from "#src/features/candidates/text-diff";
import { entryText } from "#src/features/debug/files";
import type { CandidateSummary } from "#src/sdk/index";
import { ErrorView } from "#src/ui/error-view";
import { ResultTag } from "#src/ui/result-tag";
import { Section } from "#src/ui/section";
import { Select } from "#src/ui/select";
import { LinesSkeleton, TableSkeleton } from "#src/ui/skeleton";
import { type Column, Table } from "#src/ui/table";

/** Compare, once the Issue has two or more Candidates to set side by side. */
export function CompareLink() {
  const params = useIssueParams();
  const candidates = useQuery(candidatesQuery(params)).data ?? [];
  if (candidates.length < 2) {
    return null;
  }

  return (
    <Tooltip label="Set two Candidates side by side: their Eval results and file changes">
      <Button size="small" asChild>
        <Link to="/$orgId/agents/$agent/issues/$issue/candidates/compare" params={params}>
          <Columns2 aria-hidden="true" className="size-3.5" />
          Compare
        </Link>
      </Button>
    </Tooltip>
  );
}

/** Two Candidates side by side: each one's picker and results, the Evals where they differ, and how their files differ. */
export function CandidateCompare({
  candidates,
  a,
  b,
  onPick,
}: {
  candidates: readonly CandidateSummary[];
  a: CandidateSummary;
  b: CandidateSummary;
  onPick(side: "a" | "b", candidate: string): void;
}) {
  const options = candidates.map(({ id, title }) => ({ value: id, label: title }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex h-8 min-w-0 items-center gap-2">
        <h2 className="type-heading-15 text-ink">Compare Candidates</h2>
        <span className="truncate type-label-13 text-muted">
          Eval results and file changes side by side
        </span>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <Side
          label="First Candidate"
          candidate={a}
          options={options}
          onPick={(id) => onPick("a", id)}
        />
        <Side
          label="Second Candidate"
          candidate={b}
          options={options}
          onPick={(id) => onPick("b", id)}
        />
      </div>
      {a.id === b.id ? (
        <div className="card">
          <EmptyState
            title="Pick two different Candidates"
            description="Compare shows their Evals and file changes side by side."
          />
        </div>
      ) : (
        <>
          <EvalsCompare a={a} b={b} />
          <FilesCompare a={a} b={b} />
        </>
      )}
    </div>
  );
}

// one column's picker, then the picked Candidate's branch, status and Eval counts (opening their proofs) under it
function Side({
  label,
  candidate,
  options,
  onPick,
}: {
  label: string;
  candidate: CandidateSummary;
  options: ReadonlyArray<{ value: string; label: string }>;
  onPick(candidate: string): void;
}) {
  const params = useIssueParams();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-1">
        <Select
          aria-label={label}
          options={options}
          value={candidate.id}
          onChange={onPick}
          className="min-w-0 flex-1 justify-between [&>span]:truncate"
        />
        <Tooltip label="Open Candidate">
          <Button variant="quiet" asChild className="w-8 px-0">
            <Link
              to="/$orgId/agents/$agent/issues/$issue/candidates/$candidate"
              params={{ ...params, candidate: candidate.id }}
              aria-label={`Open ${candidate.title}`}
            >
              <ArrowUpRight aria-hidden="true" className="size-4" />
            </Link>
          </Button>
        </Tooltip>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <CandidateBranch candidate={candidate} />
        <CandidateStatusTag candidate={candidate} />
        <CandidateProofs candidate={candidate} />
      </div>
    </div>
  );
}

// a side's results, undefined while loading and null before its first run, beside the read's error and refetch
function useRun({ results }: CandidateSummary) {
  const query = useRunEvals(results?.run);
  const run: ComparedRun | null | undefined =
    results === undefined
      ? null
      : query.data && { ...query.data, regressions: results.regressions ?? [] };
  return { run, error: query.error, refetch: query.refetch };
}

const sideColumn = (
  key: "a" | "b",
  candidate: CandidateSummary,
  tone: number | undefined,
): Column<ComparedEval> => ({
  id: key,
  label: (
    <span className="flex max-w-48 min-w-0 items-center gap-2">
      <BranchSwatch tone={tone} />
      <span className="min-w-0 truncate">{candidate.title}</span>
    </span>
  ),
  kind: "status",
  sort: (row) => row[key],
  // a regression implies the Eval failed, so the cell says only that
  cell: (row) =>
    row.regressed[key] ? (
      <Tag tone="danger">Regressed</Tag>
    ) : (
      <ResultTag passed={row[key] === "not_run" ? undefined : row[key] === "passed"} />
    ),
});

const compareColumns = (
  a: CandidateSummary,
  b: CandidateSummary,
  tones: ReadonlyMap<string, number>,
): Array<Column<ComparedEval>> => [
  {
    id: "eval",
    label: "Eval",
    kind: "primary",
    sort: (row) => row.title,
    cell: (row) => (
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate" title={row.id}>
          {row.title}
        </span>
        {row.group === "new" && <Tag>New</Tag>}
      </span>
    ),
  },
  sideColumn("a", a, tones.get(a.id)),
  sideColumn("b", b, tones.get(b.id)),
];

function EvalsCompare({ a, b }: { a: CandidateSummary; b: CandidateSummary }) {
  const { issue } = useIssueParams();
  const sideA = useRun(a);
  const sideB = useRun(b);
  const runA = sideA.run;
  const runB = sideB.run;
  const error = sideA.error ?? sideB.error;
  const loading = runA === undefined || runB === undefined;
  const rows = loading ? [] : compareEvals(issue, runA ?? undefined, runB ?? undefined);
  const differ = countDifferences(rows);
  const [showSame, setShowSame] = useState(false);
  const { tones } = useBranchTones();
  // the Evals both Candidates agree on fold away until asked for, so the table opens on what tells them apart
  const shown = showSame ? rows : rows.filter((row) => row.a !== row.b);
  return (
    <Section
      title="Evals"
      detail={differ === 0 ? undefined : differ === 1 ? "1 differs" : `${differ} differ`}
      actions={
        rows.length > differ ? (
          <Button size="small" onClick={() => setShowSame((current) => !current)}>
            {showSame ? "Only differences" : `Show ${rows.length - differ} with the same result`}
          </Button>
        ) : undefined
      }
    >
      {error !== null ? (
        <div className="card">
          <ErrorView
            title="The Eval results could not load"
            error={error}
            onRetry={() => {
              void sideA.refetch();
              void sideB.refetch();
            }}
          />
        </div>
      ) : loading ? (
        <TableSkeleton label="Loading Eval results" columns={3} rows={3} />
      ) : (
        <Table
          label="Evals compared"
          columns={compareColumns(a, b, tones)}
          rows={shown}
          rowKey={(row) => row.id}
          empty={
            rows.length === 0 ? (
              <EmptyState
                title="Neither Candidate has run its Evals"
                description="Results show here once a Candidate's Evals run."
              />
            ) : (
              <EmptyState title="Same result on every Eval" />
            )
          }
        />
      )}
    </Section>
  );
}

function FilesCompare({ a, b }: { a: CandidateSummary; b: CandidateSummary }) {
  const params = useIssueParams();
  const { orgId, agent } = params;
  const fullA = useQuery(candidateQuery({ ...params, candidate: a.id }));
  const fullB = useQuery(candidateQuery({ ...params, candidate: b.id }));
  const treeA = useQuery(treeQuery({ orgId, agent, ref: a.head_sha }));
  const treeB = useQuery(treeQuery({ orgId, agent, ref: b.head_sha }));
  const error = fullA.error ?? fullB.error ?? treeA.error ?? treeB.error;
  const ready =
    fullA.data !== undefined &&
    fullB.data !== undefined &&
    treeA.data !== undefined &&
    treeB.data !== undefined;
  const paths = ready
    ? [
        ...new Set([...fullA.data.files, ...fullB.data.files].map(({ filename }) => filename)),
      ].toSorted()
    : [];
  const differing = ready
    ? paths.flatMap((path) => {
        const before = entryText(treeA.data, path);
        const after = entryText(treeB.data, path);
        return before === after ? [] : [{ path, before, after }];
      })
    : [];

  const { tones } = useBranchTones();

  return (
    <Section
      title="File changes"
      detail={
        ready && differing.length > 0
          ? differing.length === 1
            ? "1 file differs"
            : `${differing.length} files differ`
          : undefined
      }
    >
      {error !== null ? (
        <div className="card">
          <ErrorView
            title="The file changes could not load"
            error={error}
            onRetry={() => {
              for (const query of [fullA, fullB, treeA, treeB]) {
                void query.refetch();
              }
            }}
          />
        </div>
      ) : !ready ? (
        <LinesSkeleton lines={5} label="Loading file changes" className="card p-3" />
      ) : (
        <div className="overflow-clip card">
          {differing.length === 0 ? (
            <EmptyState
              title="Same file changes"
              description="Both Candidates change the same files the same way."
            />
          ) : (
            <>
              {/* which Candidate each half of the split diffs shows */}
              <div className="grid h-9 grid-cols-2 border-b border-divider type-label-13 text-muted">
                {[a, b].map((candidate) => (
                  <span key={candidate.id} className="flex min-w-0 items-center gap-2 px-3">
                    <BranchSwatch tone={tones.get(candidate.id)} />
                    <span className="min-w-0 truncate">{candidate.title}</span>
                  </span>
                ))}
              </div>
              {differing.map(({ path, before, after }) => (
                <FileFold key={path} path={path} defaultOpen>
                  <TextDiff path={path} before={before} after={after} />
                </FileFold>
              ))}
            </>
          )}
        </div>
      )}
    </Section>
  );
}
