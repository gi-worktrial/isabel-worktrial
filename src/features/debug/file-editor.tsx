import { Editor, type EditorFactory } from "@pierre/diffs/edit";
import { EditProvider, File } from "@pierre/diffs/react";
import type { GitStatusEntry } from "@pierre/trees";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { FileText } from "lucide-react";
import picomatch from "picomatch/posix";
import {
  type ReactNode,
  Suspense,
  lazy,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import { THEME, preloadThemes } from "#/file-diffs";
import { Button } from "#/ui/button";
import { cn } from "#/ui/cn";
import { EmptyState } from "#/ui/empty-state";
import { SearchField } from "#/ui/search-field";
import { SegmentedControl } from "#/ui/segmented-control";
import { Tag } from "#/ui/tag";
import { useTheme } from "#/ui/theme";
import { Tooltip } from "#/ui/tooltip";
import { FileFold } from "#src/features/candidates/file-fold";
import { TextDiff } from "#src/features/candidates/text-diff";
import { type EditedFile, entryText, readText } from "#src/features/debug/files";
import type { NestedEntry, PullFile } from "#src/sdk/index";
import { useResize } from "#src/ui/dom-hooks";
import { ErrorView } from "#src/ui/error-view";
import { FileRail, RailToggle } from "#src/ui/file-tree";
import { usePaletteGroups } from "#src/ui/palette-groups";
import { LinesSkeleton } from "#src/ui/skeleton";

import treeStyles from "#src/ui/file-tree.css?inline";

const DEFAULT_EXCLUDE = [".grounded/**"];
const NO_CHANGES: PullFile[] = [];
const TREE_ROW_HEIGHT = 28;

const getGitStatus = ({ filename, status }: PullFile): GitStatusEntry => ({
  path: filename,
  status: status === "removed" ? "deleted" : status === "added" ? "added" : "modified",
});

const HighlightedFile = lazy(() => preloadThemes().then(() => ({ default: File })));
const createEditor: EditorFactory<undefined, undefined> = (type, options, editStateKey) =>
  new Editor(type, options, editStateKey);

/** What a save dialog gets: the edited files, and `onSave` to run the chosen commit as Save would. */
export type SaveDialogProps = {
  files: EditedFile[];
  onClose(): void;
  onSave(commit: () => Promise<void>): void;
};

type FileEditorProps = {
  /** Every entry of the tree being edited. */
  entries: NestedEntry[];
  /** Glob patterns for files to leave out. */
  exclude?: readonly string[];
  /** Changes to mark in the tree. */
  changes?: PullFile[];
  /** The tab shown before any file is open. */
  overview: { label: string; content: ReactNode };
  /** The file open when the editor first shows, such as the Eval a link opened. */
  initialPath?: string | undefined;
  /** Controls shown beside Save. */
  actions?: ReactNode;
  /** Workspace controls above the code pane, beside the file rail. */
  paneHeader?: ReactNode;
  /** Extends the rail's divider through the page's top padding. */
  railToTop?: boolean;
  /** Reports the file in view so a surrounding workspace can identify it. */
  onFileChange?: ((path: string | undefined) => void) | undefined;
  /** Whether Save is the view's one primary action. */
  primary?: boolean;
  /** The tree the changes are measured from, which turns on diff mode. */
  diff?: DiffBase;
} & (
  | {
      /** Commits the edited files. A thrown error's message is shown, and the edits are kept. */
      onSave(files: EditedFile[]): Promise<void>;
      renderSaveDialog?: never;
    }
  | {
      /** Asks where to save, then hands the commit back through `onSave`. */
      renderSaveDialog(props: SaveDialogProps): ReactNode;
      onSave?: never;
    }
);

/** A diff's base tree, undefined while it loads, with its read's error and retry. */
type DiffBase = { base: readonly NestedEntry[] | undefined; error: Error | null; retry(): void };

type Mode = "edit" | "diff";
const MODES = [
  { value: "edit", label: "Edit" },
  { value: "diff", label: "Diff" },
] as const;

// below this width the editor folds its file list
const NARROW_EDITOR = 640;

/** A tree of files, editable in place or read as a side-by-side diff, with Save handing the edited ones to `onSave` or a save dialog. */
export function FileEditor({
  entries,
  exclude = DEFAULT_EXCLUDE,
  changes = NO_CHANGES,
  overview,
  initialPath,
  actions,
  paneHeader,
  railToTop = false,
  onFileChange,
  primary = false,
  diff,
  onSave,
  renderSaveDialog,
}: FileEditorProps) {
  const id = useId();
  const section = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(initialPath);
  const [query, setQuery] = useState("");
  const [rail, setRail] = useState(true);
  // a narrow editor (Pebble open on a laptop) folds the file list to its toggle so the code keeps the room, and brings
  // it back when the editor widens again, unless the engineer opened or closed it themselves meanwhile
  const folded = useRef(false);
  useResize(section, (element) => {
    const narrow = element.clientWidth < NARROW_EDITOR;
    if (narrow && rail && !folded.current) {
      folded.current = true;
      setRail(false);
    } else if (!narrow && folded.current) {
      folded.current = false;
      setRail(true);
    }
  });
  useEffect(() => onFileChange?.(open), [onFileChange, open]);
  const [drafts, setDrafts] = useState<ReadonlyMap<string, string>>(new Map());
  // saving starts new edit sessions, so the next edits begin at the saved files
  const [session, setSession] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [mode, setMode] = useState<Mode>("edit");
  const [asking, setAsking] = useState(false);
  const [reverted, setReverted] = useState<ReadonlyMap<string, number>>(new Map());

  // a caller's inline list is a new array each render, so the matcher keys on the patterns, not the array
  const patterns = exclude.join("\n");
  const excluded = useMemo(() => picomatch(patterns.split("\n"), { dot: true }), [patterns]);
  const { files, paths, gitStatus } = useMemo(() => {
    const kept = entries.filter(({ type, path }) => type === "file" && !excluded(path));
    return {
      files: kept,
      paths: kept.map(({ path }) => path),
      gitStatus: changes.map(getGitStatus).filter(({ path }) => !excluded(path)),
    };
  }, [entries, changes, excluded]);
  const visiblePaths = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized === ""
      ? paths
      : paths.filter((path) => path.toLocaleLowerCase().includes(normalized));
  }, [paths, query]);
  const { model } = useFileTree({
    paths: visiblePaths,
    gitStatus,
    flattenEmptyDirectories: true,
    initialExpansion: "open",
    itemHeight: TREE_ROW_HEIGHT,
    icons: { set: "minimal", colored: false },
    unsafeCSS: treeStyles,
    // the tree moves focus to the clicked row only after reporting the selection
    onSelectionChange: (selected) => {
      queueMicrotask(() => {
        const path = model.getFocusedPath();
        if (
          path !== null &&
          selected.includes(path) &&
          model.getItem(path)?.isDirectory() === false
        ) {
          setOpen(path);
        }
      });
    },
  });
  // the model keeps its first options, so a reload at a new head resets it
  useEffect(() => {
    model.resetPaths(visiblePaths);
    model.setGitStatus(gitStatus);
  }, [model, visiblePaths, gitStatus]);

  // a hidden view's editor leaves its files to the one in view, and the palette lists them by path
  usePaletteGroups(() =>
    section.current?.checkVisibility() === true
      ? [
          {
            heading: "Files",
            searchOnly: true,
            items: paths.map((path) => ({
              value: path,
              icon: <FileText />,
              onSelect: () => setOpen(path),
            })),
          },
        ]
      : [],
  );

  const entry = files.find(({ path }) => path === open);
  const text = entry?.content === undefined ? undefined : readText(entry.content);

  function edit(path: string, original: string, contents: string) {
    setDrafts((current) => {
      const next = new Map(current);
      if (contents === original) {
        next.delete(path);
      } else {
        next.set(path, contents);
      }

      return next;
    });
  }

  const edited = () => [...drafts].map(([path, contents]) => ({ path, contents }));
  const saveButton = (
    <Button
      size="small"
      variant={primary ? "primary" : "secondary"}
      disabled={pending || drafts.size === 0}
      onClick={askOrSave}
    >
      {pending ? "Saving…" : "Save"}
    </Button>
  );

  function askOrSave() {
    if (renderSaveDialog === undefined) {
      const edits = edited();
      commit(() => onSave(edits));
    } else {
      setAsking(true);
    }
  }

  function revert(path: string) {
    setDrafts((current) => {
      const next = new Map(current);
      next.delete(path);
      return next;
    });
    // a new edit key drops the reverted file's editor state and leaves the others' alone
    setReverted((current) => new Map(current).set(path, (current.get(path) ?? 0) + 1));
  }

  function commit(save: () => Promise<void>) {
    startTransition(async () => {
      try {
        await save();
        setDrafts(new Map());
        setSession((current) => current + 1);
        setError(undefined);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    });
  }

  const diffing = diff !== undefined && mode === "diff";
  const diffPaths = [
    ...new Set([...gitStatus.map(({ path }) => path), ...drafts.keys()]),
  ].toSorted();
  const fileKey = entry && `${session}:${reverted.get(entry.path) ?? 0}:${entry.path}`;

  return (
    <EditProvider createEditor={createEditor}>
      <section
        ref={section}
        aria-label="Editor"
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.code === "KeyS") {
            event.preventDefault();
            if (!pending && drafts.size > 0) {
              askOrSave();
            }
          }
        }}
        className="flex min-w-0 flex-1 gap-3 overflow-hidden"
      >
        {rail && (
          <FileRail
            label="Files"
            className={cn("w-60", railToTop && "-mt-4 h-[calc(100%+1rem)] pt-4")}
          >
            <div className="flex shrink-0 items-center gap-1 pr-2">
              <RailToggle
                shown
                onToggle={() => {
                  folded.current = false;
                  setRail(false);
                }}
              />
              <SearchField
                label="Search files"
                placeholder="Search files"
                value={query}
                onChange={setQuery}
                debounce={0}
                className="min-w-0 flex-1"
              />
            </div>
            <FileTree model={model} aria-label="Files" className="min-h-0 flex-1 py-2 pr-2" />
          </FileRail>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
          {paneHeader !== undefined && (
            <div className="flex h-8 shrink-0 items-center gap-2">{paneHeader}</div>
          )}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden card">
            <header className="flex h-10 shrink-0 items-center gap-3 border-b border-divider px-2">
              {!rail && (
                <RailToggle
                  shown={false}
                  onToggle={() => {
                    folded.current = false;
                    setRail(true);
                  }}
                />
              )}
              {diff !== undefined && (
                <SegmentedControl<Mode>
                  label="View"
                  value={mode}
                  segments={MODES}
                  onChange={setMode}
                />
              )}
              {open !== undefined && drafts.has(open) && (
                <Tooltip label="Drop this file's unsaved edits">
                  <Button size="small" disabled={pending} onClick={() => revert(open)}>
                    Revert
                  </Button>
                </Tooltip>
              )}
              <span className="min-w-0 flex-1" />
              {drafts.size > 0 && (
                <span className="shrink-0 type-label-13 text-muted">{drafts.size} unsaved</span>
              )}
              {actions}
              {drafts.size === 0 ? (
                <Tooltip label="No unsaved edits">
                  <span className="inline-flex">{saveButton}</span>
                </Tooltip>
              ) : (
                saveButton
              )}
            </header>
            {error !== undefined && (
              <p
                role="alert"
                className="shrink-0 border-b border-divider px-3 py-2 type-label-13 text-danger"
              >
                {error}
              </p>
            )}
            {diffing && (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
                <DiffPane diff={diff} open={open} paths={diffPaths} files={files} drafts={drafts} />
              </div>
            )}
            <div
              className={cn(
                "flex min-h-0 min-w-0 flex-1 flex-col overflow-auto",
                diffing && "hidden",
              )}
            >
              {entry === undefined ? (
                overview.content
              ) : entry.content === undefined ? (
                <EmptyState title="This file is too large to edit here" />
              ) : text === undefined ? (
                <EmptyState title="This file isn't text, so it can't be edited here" />
              ) : (
                <Suspense
                  fallback={<LinesSkeleton lines={8} label="Loading file" className="p-3" />}
                >
                  <EditableFile
                    key={fileKey}
                    path={entry.path}
                    original={text}
                    // edits made while saving would miss the commit, so the editor is read-only until it lands
                    edit={!pending}
                    editStateKey={`${id}:${fileKey}`}
                    onEdit={(contents) => edit(entry.path, text, contents)}
                  />
                </Suspense>
              )}
            </div>
          </div>
        </div>
      </section>
      {asking &&
        renderSaveDialog?.({
          files: edited(),
          onClose: () => setAsking(false),
          onSave: (save) => {
            setAsking(false);
            commit(save);
          },
        })}
    </EditProvider>
  );
}

/** The diff view, the open file's diff or else every changed file's, from the base tree. */
function DiffPane({
  diff: { base, error, retry },
  open,
  paths,
  files,
  drafts,
}: {
  diff: DiffBase;
  open: string | undefined;
  /** The changed and edited files' paths, sorted. */
  paths: readonly string[];
  files: readonly NestedEntry[];
  drafts: ReadonlyMap<string, string>;
}) {
  if (base === undefined) {
    return error === null ? (
      <LinesSkeleton lines={6} label="Loading diff" className="p-3" />
    ) : (
      <ErrorView title="The diff could not load" error={error} onRetry={retry} />
    );
  }
  const fileDiff = (path: string) => (
    <TextDiff
      path={path}
      before={entryText(base, path)}
      after={drafts.get(path) ?? entryText(files, path)}
    />
  );
  if (open !== undefined) {
    return paths.includes(open) ? fileDiff(open) : <EmptyState title="No changes in this file" />;
  }
  if (paths.length === 0) {
    return <EmptyState title="No changes yet" />;
  }
  return paths.map((path) => (
    <FileFold
      key={path}
      path={path}
      defaultOpen
      meta={drafts.has(path) && <Tag tone="accent">Unsaved</Tag>}
    >
      {fileDiff(path)}
    </FileFold>
  ));
}

function EditableFile({
  path,
  original,
  edit,
  editStateKey,
  onEdit,
}: {
  path: string;
  original: string;
  edit: boolean;
  editStateKey: string;
  onEdit(contents: string): void;
}) {
  const theme = useTheme();
  return (
    <div className="overflow-clip">
      <HighlightedFile
        file={{ name: path, contents: original }}
        edit={edit}
        editStateKey={editStateKey}
        options={{ theme: THEME, themeType: theme, disableFileHeader: true, overflow: "wrap" }}
        onEditChange={({ file }) => onEdit(file.contents)}
        onEditComplete={() => "accept"}
      />
    </div>
  );
}
