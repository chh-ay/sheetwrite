import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Installs the checksum-pinned `typos` and `cargo-deny` binaries that
 * `bun scripts/rust-lint.ts` runs, into Cargo's bin directory.
 */
interface ToolRelease {
  readonly url: string;
  readonly sha256: string;
  /** The executable's path inside the archive. */
  readonly member: string;
}

interface Tool {
  readonly name: string;
  readonly releases: Readonly<Record<string, ToolRelease>>;
}

export const TYPOS_VERSION = "1.52.1";
export const CARGO_DENY_VERSION = "0.20.2";

const typosRelease = (target: string, sha256: string): ToolRelease => ({
  url: `https://github.com/crate-ci/typos/releases/download/v${TYPOS_VERSION}/typos-v${TYPOS_VERSION}-${target}.tar.gz`,
  sha256,
  member: "./typos",
});

const cargoDenyRelease = (target: string, sha256: string): ToolRelease => ({
  url: `https://github.com/EmbarkStudios/cargo-deny/releases/download/${CARGO_DENY_VERSION}/cargo-deny-${CARGO_DENY_VERSION}-${target}.tar.gz`,
  sha256,
  member: `cargo-deny-${CARGO_DENY_VERSION}-${target}/cargo-deny`,
});

export const RUST_CHECK_TOOLS: readonly Tool[] = [
  {
    name: "typos",
    releases: {
      "darwin-arm64": typosRelease(
        "aarch64-apple-darwin",
        "e342c1ec32ea6f60a8b557cd75f30e7c604745131754acff295402a0a3d43263",
      ),
      "linux-x64": typosRelease(
        "x86_64-unknown-linux-musl",
        "c034dbec8797cfa0c4548b3726c1eebbafcf703b8a17f15a961b037788eebcdd",
      ),
    },
  },
  {
    name: "cargo-deny",
    releases: {
      "darwin-arm64": cargoDenyRelease(
        "aarch64-apple-darwin",
        "fe67d82a10d8597a3549364cb733a3f9cc1bfff9031b7ae46384a9f2a72090c3",
      ),
      "linux-x64": cargoDenyRelease(
        "x86_64-unknown-linux-musl",
        "9f12ed4c49936e09b48bf862b595cde2fe64fcbd9d74dfacac6131ca824c8d5f",
      ),
    },
  },
];

async function run(command: readonly [string, ...string[]]): Promise<void> {
  const child = Bun.spawn([...command], { stdin: "ignore", stdout: "inherit", stderr: "inherit" });
  const exitCode = await child.exited;
  if (exitCode !== 0) throw new Error(`${command.join(" ")} failed with exit code ${exitCode}`);
}

async function installTool(tool: Tool, cargoBin: string): Promise<void> {
  const platform = `${process.platform}-${process.arch}`;
  const release = tool.releases[platform];
  if (release === undefined) throw new Error(`No reviewed ${tool.name} binary for ${platform}`);

  const response = await fetch(release.url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Unable to download ${release.url}: HTTP ${response.status}`);
  const archive = new Uint8Array(await response.arrayBuffer());
  const digest = new Bun.CryptoHasher("sha256").update(archive).digest("hex");
  if (digest !== release.sha256) {
    throw new Error(
      `Checksum mismatch for ${release.url}: expected ${release.sha256}, received ${digest}`,
    );
  }

  const temporaryRoot = await mkdtemp(join(tmpdir(), `sheetwrite-${tool.name}-`));
  try {
    const archivePath = join(temporaryRoot, "release.tar.gz");
    await writeFile(archivePath, archive);
    await run(["tar", "-xzf", archivePath, "-C", temporaryRoot, release.member]);
    const destination = join(cargoBin, tool.name);
    await copyFile(join(temporaryRoot, release.member), destination);
    await chmod(destination, 0o755);
    await run([destination, "--version"]);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export async function installRustChecks(): Promise<void> {
  const cargoBin = join(process.env.CARGO_HOME ?? join(homedir(), ".cargo"), "bin");
  await mkdir(cargoBin, { recursive: true });
  for (const tool of RUST_CHECK_TOOLS) await installTool(tool, cargoBin);
}

if (import.meta.main) {
  installRustChecks().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
