import { FileText } from "lucide-react";
import { type ReactNode, useState } from "react";

import type { SaveDialogProps } from "#src/features/debug/file-editor";
import type { EditedFile } from "#src/features/debug/files";
import { ConfirmDialog } from "#src/ui/confirm-dialog";
import { FilePath } from "#src/ui/file-name";

/** Edited files commit onto this Candidate. With no edits, this dialog only branches a new Candidate. */
export function SaveCandidateDialog({
  branch,
  swatch,
  files,
  onClose,
  onSave,
  saveHere,
  saveAsNew,
}: SaveDialogProps & {
  /** This Candidate's branch tag. */
  branch: ReactNode;
  swatch: ReactNode;
  saveHere(files: EditedFile[]): Promise<void>;
  saveAsNew(title: string, files: EditedFile[]): Promise<void>;
}) {
  const branching = files.length === 0;
  const [title, setTitle] = useState("");
  const name = title.trim();
  const count = files.length === 1 ? "1 file" : `${files.length} files`;
  const confirm = branching ? "Create" : "Save and run Evals";

  return (
    <ConfirmDialog
      open
      title={branching ? "New Candidate" : `Save ${count}`}
      confirmLabel={confirm}
      blocked={branching && name === ""}
      onConfirm={() => onSave(() => (branching ? saveAsNew(name, files) : saveHere(files)))}
      onClose={onClose}
    >
      {branching && (
        <span className="field-control flex items-center gap-2 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-ring">
          {swatch}
          <input
            aria-label="Name"
            autoFocus
            placeholder="Name the new Candidate"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-faint"
          />
        </span>
      )}
      {!branching && (
        <ul aria-label="Edited files" className="flex flex-col gap-1">
          {files.map(({ path }) => (
            <li key={path} title={path} className="flex min-w-0 items-center gap-2">
              <FileText aria-hidden="true" className="size-3.5 shrink-0 text-muted" />
              <FilePath path={path} className="truncate type-mono-12 text-ink" />
            </li>
          ))}
        </ul>
      )}
      <p className="flex min-w-0 items-center gap-2 type-label-13 text-muted">
        <span className="shrink-0">{branching ? "Branches from" : "Commits onto"}</span>
        <span className="min-w-0">{branch}</span>
      </p>
    </ConfirmDialog>
  );
}
