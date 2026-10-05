import { resolve } from "node:path";

const REPOSITORY_ROOT = resolve(import.meta.dir, "../..");
/**
 * Capture outputs are results, not inputs: a written artifact cannot change a
 * measured timing. Excluding this pathspec lets one clean tree publish a whole
 * evidence set at a single commit instead of one commit per artifact.
 */
const CAPTURE_OUTPUT_PATHSPEC = ":!bench/results";

/**
 * Protocol-binding capture stamp shared by every benchmark artifact. The docs
 * evidence page refuses to publish numbers whose provenance (commit, tree
 * cleanliness, capture time) cannot be established.
 */
export interface ProtocolCaptureMeta {
  readonly commit: string;
  readonly dirty: boolean;
  readonly timestamp: string;
}

function gitOutput(args: readonly string[]): string {
  const result = Bun.spawnSync(["git", ...args], {
    cwd: REPOSITORY_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.toString()}`);
  }
  return result.stdout.toString().trim();
}

/**
 * True when the sources differ from HEAD. `bench/results` is excluded because
 * every path under it is an output of the protocols themselves. Pass
 * `includeUntracked` when an uncommitted new file must also block the run.
 */
export function sourceTreeDirty(includeUntracked: boolean): boolean {
  return (
    gitOutput([
      "status",
      "--porcelain",
      ...(includeUntracked ? [] : ["--untracked-files=no"]),
      "--",
      CAPTURE_OUTPUT_PATHSPEC,
    ]).length > 0
  );
}

export function protocolCaptureMeta(): ProtocolCaptureMeta {
  return {
    commit: gitOutput(["rev-parse", "HEAD"]),
    dirty: sourceTreeDirty(false),
    timestamp: new Date().toISOString(),
  };
}
