import { readFile } from "node:fs/promises";

interface ProcessOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run `command`, drain both pipes while it runs, and return its stdout.
 * A nonzero exit throws the caller's `failure` text. Without `env` the child
 * gets this process's environment.
 */
export async function captureProcess(
  command: readonly string[],
  options: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdin?: "ignore";
    failure: (output: ProcessOutput) => string;
  },
): Promise<string> {
  const child = Bun.spawn([...command], {
    cwd: options.cwd,
    env: options.env,
    stdin: options.stdin,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  if (exitCode !== 0) throw new Error(options.failure({ stdout, stderr, exitCode }));
  return stdout;
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}
