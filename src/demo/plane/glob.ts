import picomatch from "picomatch/posix.js";

/** Whether a ref or path matches a glob, read with picomatch as platform's job runner reads `on` filters. */
export const matches = (glob: string, value: string) =>
  picomatch.isMatch(value, glob, { dot: true });
