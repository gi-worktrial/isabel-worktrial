import { Tag } from "#/ui/tag";

// a result that hasn't run yet is a grey state, so it reads as muted words rather than a pill
export function NotRun() {
  return <span className="type-label-13 whitespace-nowrap text-muted">Not run</span>;
}

// an Eval's result, green or red
export function ResultTag({ passed }: { passed: boolean | undefined }) {
  if (passed === undefined) {
    return <NotRun />;
  }

  return passed ? <Tag tone="success">Passed</Tag> : <Tag tone="danger">Failed</Tag>;
}
