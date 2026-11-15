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

const SHA = "a".repeat(40);
const workflowPath = resolve(import.meta.dir, "../.github/workflows/release.yml");

async function workflow() {
  return parseWorkflowContract(await readFile(workflowPath, "utf8"), "release workflow");
}

function artifact(name: string, version: string): ReleasePackageArtifact {
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

const WASM = artifact("@sheetwrite/wasm", "0.7.0");
const CORE = artifact("@sheetwrite/core", "1.4.0");
const REACT = artifact("@sheetwrite/react", "2.1.3");

const idOf = (item: { name: string; version: string }) => `${item.name}@${item.version}`;
const registryEntry = (
  item: { name: string; version: string },
  integrity = `sha512-${item.name}-${item.version}`,
) => ({
  name: item.name,
  version: item.version,
  dist: { integrity },
});
const published = (item: ReleasePackageArtifact) => ({
  name: item.name,
  version: item.version,
  integrity: item.integrity,
});

function ciRun(overrides: Partial<CiRun> = {}): CiRun {
  return {
    id: 10,
    head_sha: SHA,
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
    const parsed = await workflow();
    // A manual start with no inputs: nothing chooses the commit except the develop head.
    expect(Object.keys(parsed.on ?? {})).toEqual(["workflow_dispatch"]);
    expect(parsed.on?.workflow_dispatch?.inputs).toBeUndefined();
    expect(parsed.concurrency).toEqual({ group: "npm-release", "cancel-in-progress": false });
    expect(parsed.jobs.identity?.if).toBe("github.ref == 'refs/heads/develop'");
  });

  it("isolates OIDC and repository write access to the publishing job", async () => {
    const parsed = await workflow();
    expect(parsed.permissions).toEqual({ actions: "read", contents: "read" });
    const privileged = Object.entries(parsed.jobs).filter(
      ([, job]) => job.permissions?.["id-token"] === "write",
    );
    expect(privileged.map(([name]) => name)).toEqual(["publish"]);
    expect(parsed.jobs.publish?.environment).toBe("npm-release");
    expect(parsed.jobs.publish?.permissions).toEqual({
      actions: "read",
      contents: "write",
      "id-token": "write",
      "pull-requests": "write",
    });
    // No other job may get OIDC or any write scope, whether or not it gates publication.
    for (const [name, job] of Object.entries(parsed.jobs)) {
      if (name === "publish") continue;
      for (const [scope, access] of Object.entries(job.permissions ?? {})) {
        expect(access, `${name} ${scope}`).not.toBe("write");
      }
    }
  });

  it("publishes only artifacts from successful CI without repeating its gates", async () => {
    const source = await readFile(workflowPath, "utf8");
    const commands = Object.values((await workflow()).jobs ?? {})
      .flatMap((job) => job.steps ?? [])
      .flatMap((step) => (step.run ? [step.run] : []))
      .join("\n");
    expect(source).toContain("scripts/release-preflight.ts");
    expect(commands).toContain("gh run download");
    expect(commands).toContain("canonical-release-artifacts");
    expect(commands).toContain("scripts/release-publish.ts");
    expect(commands).toContain("scripts/release-github.ts");
    expect(commands).not.toMatch(
      /verify:ci|verify:release-quality|test:coverage|test:browser|release:prepare|release-verify\.ts|install-wasm-pack|browser:install/,
    );
    // Publication uses npm trusted publishing, never a stored token.
    expect(source).not.toMatch(
      /secrets\.(?:NODE_AUTH_TOKEN|NPM_TOKEN)|changeset publish|release-stage/,
    );
  });

  it("takes artifacts only from the newest passed develop push CI run of the commit", () => {
    const repository = "chh-ay/sheetwrite";
    const rejected = [
      ciRun({ id: 90, head_sha: "b".repeat(40) }),
      ciRun({ id: 91, head_branch: "feature" }),
      ciRun({ id: 92, event: "pull_request" }),
      ciRun({ id: 93, status: "in_progress", conclusion: null }),
      ciRun({ id: 94, conclusion: "failure" }),
      ciRun({ id: 95, head_repository: { full_name: "fork/sheetwrite" } }),
    ];

    expect(selectCiRun([ciRun({ id: 11 }), ciRun({ id: 12 }), ...rejected], SHA, repository)).toBe(
      12,
    );
    expect(() => selectCiRun(rejected, SHA, repository)).toThrow(
      "No successful develop push CI run",
    );
  });

  it("binds canonical artifact bytes only to the exact source commit", () => {
    const packages = [WASM, CORE];
    expect(() =>
      assertCanonicalReleaseIdentity({ sourceCommit: SHA, packages }, SHA),
    ).not.toThrow();
    expect(() =>
      assertCanonicalReleaseIdentity({ sourceCommit: "b".repeat(40), packages }, SHA),
    ).toThrow("Canonical artifacts came from");
  });

  it("rejects core-only before publishing when its omitted wasm version is unavailable", async () => {
    const core = { ...CORE, internalDependencies: { "@sheetwrite/wasm": "0.7.0" } };
    const queried: string[] = [];
    let publishCalls = 0;
    await expect(
      publishArtifactsIdempotently(
        "/artifacts",
        [core],
        async (identity) => {
          queried.push(idOf(identity));
          return undefined;
        },
        async (_root, item) => {
          publishCalls += 1;
          return published(item);
        },
      ),
    ).rejects.toThrow(
      "@sheetwrite/core@1.4.0 requires unpublished internal dependency @sheetwrite/wasm@0.7.0",
    );
    expect(queried).toEqual(["@sheetwrite/wasm@0.7.0"]);
    expect(publishCalls).toBe(0);
  });

  it("publishes a mixed-version dependency-ordered subset sequentially", async () => {
    const artifacts = [WASM, CORE, REACT];
    const steps: string[] = [];
    const result = await publishArtifactsIdempotently(
      "/artifacts",
      artifacts,
      async (item) => {
        steps.push(`query:${idOf(item)}`);
        return undefined;
      },
      async (_root, item) => {
        steps.push(`publish:${idOf(item)}`);
        await Promise.resolve();
        steps.push(`done:${idOf(item)}`);
        return published(item);
      },
    );
    expect(steps).toEqual(
      artifacts.flatMap((item) => [
        `query:${idOf(item)}`,
        `publish:${idOf(item)}`,
        `done:${idOf(item)}`,
      ]),
    );
    expect(result.verifiedPackages.map((entry) => entry.version)).toEqual([
      "0.7.0",
      "1.4.0",
      "2.1.3",
    ]);
    expect(result.newlyPublishedPackages).toEqual(result.verifiedPackages);
  });

  it("resumes a partial prior publication and rejects mismatched registry bytes", async () => {
    const artifacts = [WASM, CORE, REACT];
    const publishedIds: string[] = [];
    const result = await publishArtifactsIdempotently(
      "/artifacts",
      artifacts,
      async (item) => (item.name === WASM.name ? registryEntry(WASM) : undefined),
      async (_root, item) => {
        publishedIds.push(idOf(item));
        return published(item);
      },
    );
    expect(publishedIds).toEqual([CORE, REACT].map(idOf));
    expect(result.verifiedPackages.map(idOf)).toEqual(artifacts.map(idOf));
    expect(result.newlyPublishedPackages.map(idOf)).toEqual([CORE, REACT].map(idOf));

    await expect(
      publishArtifactsIdempotently(
        "/artifacts",
        [WASM],
        async () => registryEntry(WASM, "sha512-different"),
        async () => {
          throw new Error("must not republish mismatched bytes");
        },
      ),
    ).rejects.toThrow("integrity does not match");
  });

  it("does not publish again when a rerun finds a version that npm still validates", async () => {
    const publishedNames: string[] = [];
    const result = await publishArtifactsIdempotently(
      "/artifacts",
      [WASM, CORE],
      async (item) => (item.name === WASM.name ? "pending" : undefined),
      async (_root, item) => {
        publishedNames.push(item.name);
        throw new Error(
          "npm publish failed (1): npm error code E403 You cannot publish over the previously published versions: 1.4.0.",
        );
      },
    );
    expect(publishedNames).toEqual([CORE.name]);
    expect(result.verifiedPackages.map((entry) => entry.name)).toEqual([WASM.name, CORE.name]);
    expect(result.newlyPublishedPackages).toEqual([]);

    await expect(
      publishArtifactsIdempotently(
        "/artifacts",
        [CORE],
        async () => undefined,
        async () => {
          throw new Error("npm publish failed (1): npm error code E401 Unauthorized");
        },
      ),
    ).rejects.toThrow("E401");
  });

  it("requires explicit npm publication identity", () => {
    const identity = { name: "@sheetwrite/core", version: "0.2.0" };
    expect(publishedPackageFrom(identity)).toEqual(identity);
    // `npm publish --json` keys its report by package name.
    expect(
      publishedPackageFrom({ [identity.name]: { id: "@sheetwrite/core@0.2.0", ...identity } }),
    ).toEqual(identity);
    expect(() => publishedPackageFrom({ id: "@sheetwrite/core@0.2.0" })).toThrow(
      "explicit package name and version",
    );
  });

  it("verifies mixed registry versions, integrity, latest tags, and propagation retries", async () => {
    const registryQueries: string[] = [];
    const latestQueries: string[] = [];
    let pauses = 0;
    await verifyPublishedArtifacts(
      [WASM, CORE],
      async (item) => {
        registryQueries.push(idOf(item));
        if (registryQueries.length === 1) throw new Error("registry has not propagated");
        return registryEntry(item);
      },
      async (name) => {
        latestQueries.push(name);
        return name === WASM.name ? WASM.version : CORE.version;
      },
      2,
      async () => {
        pauses += 1;
      },
    );
    expect(pauses).toBe(1);
    expect(registryQueries).toEqual([idOf(WASM), idOf(CORE), idOf(WASM)]);
    expect(latestQueries).toEqual([CORE.name, WASM.name]);

    expect(() =>
      assertRegistryPackage(CORE, registryEntry(CORE, "sha512-wrong"), CORE.version),
    ).toThrow("integrity does not match");
    const flatNpmViewResponse = {
      name: CORE.name,
      version: CORE.version,
      "dist.integrity": CORE.integrity,
    };
    expect(() => assertRegistryPackage(CORE, flatNpmViewResponse, CORE.version)).toThrow(
      "integrity does not match",
    );
    expect(() => assertRegistryPackage(CORE, registryEntry(CORE), "1.3.0")).toThrow(
      "latest is 1.3.0",
    );
  });

  it("reports accepted versions as pending, and fails versions without publication evidence", async () => {
    const notFound = async (): Promise<never> => {
      throw new Error("npm view failed (1): npm error code E404");
    };
    const latest = async () => CORE.version;
    const noPause = async () => undefined;
    const warnings: string[] = [];
    const warn = console.warn;
    console.warn = (message: string) => warnings.push(message);
    try {
      expect(await verifyPublishedArtifacts([CORE], notFound, latest, 3, noPause, [CORE])).toBe(
        "pending",
      );
    } finally {
      console.warn = warn;
    }
    expect(warnings).toEqual([
      expect.stringContaining("@sheetwrite/core@1.4.0 still validating on npm"),
    ]);

    await expect(verifyPublishedArtifacts([CORE], notFound, latest, 3, noPause)).rejects.toThrow(
      "verification failed after 3 checks",
    );

    let reads = 0;
    const eventuallyFound = async () => {
      reads += 1;
      return reads < 3 ? notFound() : registryEntry(CORE);
    };
    expect(
      await verifyPublishedArtifacts([CORE], eventuallyFound, latest, 5, noPause, [CORE]),
    ).toBe("verified");
  });
});
