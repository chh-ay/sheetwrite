import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { ReleasePackageArtifact } from "./release-artifacts.js";
import { type CiRun, selectCiRun } from "./release-preflight.js";
import {
  assertCanonicalReleaseIdentity,
  assertRegistryPackage,
  publishArtifactsIdempotently,
  publishedPackageFrom,
  verifyPublishedArtifacts,
} from "./release-publish.js";
import { parseWorkflowContract } from "./workflow-contract.js";

const repositoryRoot = resolve(import.meta.dir, "..");
const workflowPath = resolve(repositoryRoot, ".github/workflows/release.yml");

async function workflow() {
  const source = await readFile(workflowPath, "utf8");
  return { parsed: parseWorkflowContract(source, "release workflow"), source };
}

function artifact(name: string, version = "0.2.0"): ReleasePackageArtifact {
  return {
    name,
    version,
    path: `${name.slice("@sheetwrite/".length)}-${version}.tgz`,
    bytes: 1,
    unpackedBytes: 1,
    fileCount: 1,
    files: ["package.json"],
    shasum: "0".repeat(40),
    integrity: `sha512-${name}-${version}`,
    sha512: "0".repeat(128),
    internalDependencies: {},
  };
}

function ciRun(overrides: Partial<CiRun> = {}): CiRun {
  return {
    id: 10,
    head_sha: "a".repeat(40),
    head_branch: "develop",
    event: "push",
    status: "completed",
    conclusion: "success",
    head_repository: { full_name: "chh-ay/sheetwrite" },
    ...overrides,
  };
}

describe("manual package release workflow", () => {
  it("runs only when started on develop and serializes publication", async () => {
    const { parsed } = await workflow();
    // A manual start with no inputs: nothing chooses the commit except the develop head.
    expect(Object.keys(parsed.on ?? {})).toEqual(["workflow_dispatch"]);
    expect(parsed.on?.workflow_dispatch?.inputs).toBeUndefined();
    expect(parsed.concurrency).toEqual({
      group: "npm-release",
      "cancel-in-progress": false,
    });
    expect(parsed.jobs.identity?.if).toBe("github.ref == 'refs/heads/develop'");
  });

  it("takes artifacts only from the newest passed develop push CI run of the commit", () => {
    const sha = "a".repeat(40);
    const repository = "chh-ay/sheetwrite";
    const rejected = [
      ciRun({ id: 90, head_sha: "b".repeat(40) }),
      ciRun({ id: 91, head_branch: "feature" }),
      ciRun({ id: 92, event: "pull_request" }),
      ciRun({ id: 93, status: "in_progress", conclusion: null }),
      ciRun({ id: 94, conclusion: "failure" }),
      ciRun({ id: 95, head_repository: { full_name: "fork/sheetwrite" } }),
    ];

    expect(selectCiRun([ciRun({ id: 11 }), ciRun({ id: 12 }), ...rejected], sha, repository)).toBe(
      12,
    );
    expect(() => selectCiRun(rejected, sha, repository)).toThrow(
      "No successful develop push CI run",
    );
  });

  it("binds canonical artifact bytes only to the exact source commit", () => {
    const sha = "a".repeat(40);
    const artifacts = [
      artifact("@sheetwrite/wasm", "0.3.1"),
      artifact("@sheetwrite/core", "1.2.0"),
    ];
    expect(() =>
      assertCanonicalReleaseIdentity({ sourceCommit: sha, packages: artifacts }, sha),
    ).not.toThrow();
    expect(() =>
      assertCanonicalReleaseIdentity({ sourceCommit: "b".repeat(40), packages: artifacts }, sha),
    ).toThrow("Canonical artifacts came from");
  });

  it("isolates OIDC and repository write access to the publishing job", async () => {
    const { parsed } = await workflow();
    expect(parsed.permissions).toEqual({ actions: "read", contents: "read" });
    const jobs = parsed.jobs ?? {};
    const privileged = Object.entries(jobs).filter(
      ([, job]) => job.permissions?.["id-token"] === "write",
    );
    expect(privileged).toHaveLength(1);
    const [publishName, publishJob] = privileged[0]!;
    expect(publishJob.environment).toBe("npm-release");
    expect(publishJob.permissions).toEqual({
      actions: "read",
      contents: "write",
      "id-token": "write",
      "pull-requests": "write",
    });

    // No other job may get OIDC or any write scope, whether or not it gates publication.
    for (const [name, job] of Object.entries(jobs)) {
      if (name === publishName) continue;
      for (const [scope, access] of Object.entries(job.permissions ?? {})) {
        expect(access, `${name} ${scope}`).not.toBe("write");
      }
    }
  });

  it("publishes only artifacts from successful CI without repeating its gates", async () => {
    const { parsed, source } = await workflow();
    const commands = Object.values(parsed.jobs ?? {})
      .flatMap((job) => job.steps ?? [])
      .flatMap((step) => (step.run ? [step.run] : []))
      .join("\n");
    expect(source).toContain("scripts/release-preflight.ts");
    expect(commands).toContain("gh run download");
    expect(commands).toContain("canonical-release-artifacts");
    expect(commands).toContain("scripts/release-publish.ts");
    expect(commands).toContain("scripts/release-github.ts");
    expect(commands).toContain("bun run compatibility:validate");
    expect(commands).toContain("bun run compatibility:check -- --allow-unclaimed");
    expect(commands).not.toMatch(
      /verify:ci|verify:release-quality|test:coverage|test:browser|release:prepare|release-verify\.ts|install-wasm-pack|browser:install/,
    );
    expect(source).not.toMatch(
      /secrets\.(?:NODE_AUTH_TOKEN|NPM_TOKEN)|changeset publish|release-stage/,
    );
  });

  it("rejects core-only before publishing when its omitted wasm version is unavailable", async () => {
    const core = {
      ...artifact("@sheetwrite/core", "1.4.0"),
      internalDependencies: { "@sheetwrite/wasm": "0.7.0" },
    };
    const queried: string[] = [];
    let publishCalls = 0;
    await expect(
      publishArtifactsIdempotently(
        "/artifacts",
        [core],
        async (identity) => {
          queried.push(`${identity.name}@${identity.version}`);
          return undefined;
        },
        async (_root, item) => {
          publishCalls += 1;
          return {
            name: item.name,
            version: item.version,
            integrity: item.integrity,
          };
        },
      ),
    ).rejects.toThrow(
      "@sheetwrite/core@1.4.0 requires unpublished internal dependency @sheetwrite/wasm@0.7.0",
    );
    expect(queried).toEqual(["@sheetwrite/wasm@0.7.0"]);
    expect(publishCalls).toBe(0);
  });

  it("publishes a mixed-version dependency-ordered subset sequentially", async () => {
    const started: string[] = [];
    const completed: string[] = [];
    const artifacts = [
      artifact("@sheetwrite/wasm", "0.7.0"),
      artifact("@sheetwrite/core", "1.4.0"),
      artifact("@sheetwrite/react", "2.1.3"),
    ];
    const result = await publishArtifactsIdempotently(
      "/artifacts",
      artifacts,
      async (item) => {
        started.push(`query:${item.name}@${item.version}`);
        return undefined;
      },
      async (_root, item) => {
        started.push(`publish:${item.name}@${item.version}`);
        expect(completed).toHaveLength(started.length / 2 - 1);
        await Promise.resolve();
        completed.push(`${item.name}@${item.version}`);
        return {
          name: item.name,
          version: item.version,
          integrity: item.integrity,
        };
      },
    );
    expect(started).toEqual(
      artifacts.flatMap((item) => [
        `query:${item.name}@${item.version}`,
        `publish:${item.name}@${item.version}`,
      ]),
    );
    expect(completed).toEqual(artifacts.map((item) => `${item.name}@${item.version}`));
    expect(result.verifiedPackages.map((entry) => entry.version)).toEqual([
      "0.7.0",
      "1.4.0",
      "2.1.3",
    ]);
    expect(result.newlyPublishedPackages).toEqual(result.verifiedPackages);
  });

  it("resumes a partial prior publication and rejects mismatched registry bytes", async () => {
    const artifacts = [
      artifact("@sheetwrite/wasm", "0.7.0"),
      artifact("@sheetwrite/core", "1.4.0"),
      artifact("@sheetwrite/react", "2.1.3"),
    ];
    const queried: string[] = [];
    const published: string[] = [];
    const result = await publishArtifactsIdempotently(
      "/artifacts",
      artifacts,
      async (item) => {
        queried.push(`${item.name}@${item.version}`);
        const canonical = artifacts.find(
          (artifact) => artifact.name === item.name && artifact.version === item.version,
        );
        if (canonical === undefined) throw new Error("Unexpected package query");
        return canonical === artifacts[0]
          ? {
              name: item.name,
              version: item.version,
              dist: { integrity: canonical.integrity },
            }
          : undefined;
      },
      async (_root, item) => {
        published.push(`${item.name}@${item.version}`);
        return {
          name: item.name,
          version: item.version,
          integrity: item.integrity,
        };
      },
    );
    expect(queried).toEqual(artifacts.map((item) => `${item.name}@${item.version}`));
    expect(published).toEqual(artifacts.slice(1).map((item) => `${item.name}@${item.version}`));
    expect(result.verifiedPackages.map((entry) => entry.name)).toEqual(
      artifacts.map((item) => item.name),
    );
    expect(result.newlyPublishedPackages.map((entry) => entry.name)).toEqual(
      artifacts.slice(1).map((item) => item.name),
    );

    await expect(
      publishArtifactsIdempotently(
        "/artifacts",
        [artifacts[0]!],
        async (item) => ({
          name: item.name,
          version: item.version,
          dist: { integrity: "sha512-different" },
        }),
        async () => {
          throw new Error("must not republish mismatched bytes");
        },
      ),
    ).rejects.toThrow("integrity does not match");
  });

  it("requires explicit npm publication identity", () => {
    expect(publishedPackageFrom({ name: "@sheetwrite/core", version: "0.2.0" })).toEqual({
      name: "@sheetwrite/core",
      version: "0.2.0",
    });
    expect(
      publishedPackageFrom({
        "@sheetwrite/core": {
          id: "@sheetwrite/core@0.2.0",
          name: "@sheetwrite/core",
          version: "0.2.0",
          size: 381363,
          unpackedSize: 2005268,
          shasum: "557be78d365d7f77f48485907835685cb953d737",
          integrity:
            "sha512-QAJ3U891g0fM2LE7d+gxGJlUHaZwRhFqqHuOhPpXJUHzsnYP5JpSwXFUfxwrij5v2SCdcHeZwT06szZ13R0BNg==",
          filename: "sheetwrite-core-0.2.0.tgz",
          files: [{ path: "package.json", size: 1769, mode: 420 }],
          entryCount: 293,
          bundled: [],
        },
      }),
    ).toEqual({
      name: "@sheetwrite/core",
      version: "0.2.0",
    });
    expect(() => publishedPackageFrom({ id: "@sheetwrite/core@0.2.0" })).toThrow(
      "explicit package name and version",
    );
  });

  it("verifies mixed registry versions, integrity, latest tags, and propagation retries", async () => {
    const artifacts = [
      artifact("@sheetwrite/wasm", "0.7.0"),
      artifact("@sheetwrite/core", "1.4.0"),
    ];
    const registryQueries: string[] = [];
    const latestQueries: string[] = [];
    let pauses = 0;
    await verifyPublishedArtifacts(
      artifacts,
      async (item) => {
        registryQueries.push(`${item.name}@${item.version}`);
        if (registryQueries.length === 1) throw new Error("registry has not propagated");
        return {
          name: item.name,
          version: item.version,
          dist: { integrity: item.integrity },
        };
      },
      async (name) => {
        latestQueries.push(name);
        return artifacts.find((item) => item.name === name)!.version;
      },
      2,
      async () => {
        pauses += 1;
      },
    );
    expect(pauses).toBe(1);
    expect(registryQueries).toEqual([
      "@sheetwrite/wasm@0.7.0",
      "@sheetwrite/core@1.4.0",
      "@sheetwrite/wasm@0.7.0",
    ]);
    expect(latestQueries).toEqual(["@sheetwrite/core", "@sheetwrite/wasm"]);

    const core = artifact("@sheetwrite/core", "1.4.0");
    expect(() =>
      assertRegistryPackage(
        core,
        {
          name: core.name,
          version: core.version,
          dist: { integrity: "sha512-wrong" },
        },
        core.version,
      ),
    ).toThrow("integrity does not match");
    const flatNpmViewResponse = {
      name: core.name,
      version: core.version,
      "dist.integrity": core.integrity,
    };
    expect(() => assertRegistryPackage(core, flatNpmViewResponse, core.version)).toThrow(
      "integrity does not match",
    );
    expect(() =>
      assertRegistryPackage(
        core,
        {
          name: core.name,
          version: core.version,
          dist: { integrity: core.integrity },
        },
        "1.3.0",
      ),
    ).toThrow("latest is 1.3.0");
  });

  it("does not publish again when a rerun finds a version that npm still validates", async () => {
    const artifacts = [
      artifact("@sheetwrite/wasm", "0.7.0"),
      artifact("@sheetwrite/core", "1.4.0"),
    ];
    const published: string[] = [];
    const result = await publishArtifactsIdempotently(
      "/artifacts",
      artifacts,
      async (item) => (item.name === "@sheetwrite/wasm" ? "pending" : undefined),
      async (_root, item) => {
        published.push(item.name);
        if (item.name === "@sheetwrite/core") {
          throw new Error(
            "npm publish failed (1): npm error code E403 You cannot publish over the previously published versions: 1.4.0.",
          );
        }
        return {
          name: item.name,
          version: item.version,
          integrity: item.integrity,
        };
      },
    );
    expect(published).toEqual(["@sheetwrite/core"]);
    expect(result.verifiedPackages.map((entry) => entry.name)).toEqual([
      "@sheetwrite/wasm",
      "@sheetwrite/core",
    ]);
    expect(result.newlyPublishedPackages).toEqual([]);

    await expect(
      publishArtifactsIdempotently(
        "/artifacts",
        [artifacts[1]!],
        async () => undefined,
        async () => {
          throw new Error("npm publish failed (1): npm error code E401 Unauthorized");
        },
      ),
    ).rejects.toThrow("E401");
  });

  it("reports accepted versions as pending, and fails versions without publication evidence", async () => {
    const core = artifact("@sheetwrite/core", "1.4.0");
    const notFound = async (): Promise<never> => {
      throw new Error("npm view failed (1): npm error code E404");
    };
    const warnings: string[] = [];
    const warn = console.warn;
    console.warn = (message: string) => warnings.push(message);
    try {
      expect(
        await verifyPublishedArtifacts(
          [core],
          notFound,
          async () => core.version,
          3,
          async () => undefined,
          [core],
        ),
      ).toBe("pending");
    } finally {
      console.warn = warn;
    }
    expect(warnings).toEqual([
      expect.stringContaining("@sheetwrite/core@1.4.0 still validating on npm"),
    ]);

    await expect(
      verifyPublishedArtifacts(
        [core],
        notFound,
        async () => core.version,
        3,
        async () => undefined,
      ),
    ).rejects.toThrow("verification failed after 3 checks");

    let reads = 0;
    expect(
      await verifyPublishedArtifacts(
        [core],
        async (item) => {
          reads += 1;
          if (reads < 3) return notFound();
          return {
            name: item.name,
            version: item.version,
            dist: { integrity: item.integrity },
          };
        },
        async () => core.version,
        5,
        async () => undefined,
        [core],
      ),
    ).toBe("verified");
  });
});
