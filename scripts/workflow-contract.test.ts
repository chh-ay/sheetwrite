import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  assertReviewedActionPins,
  parseWorkflowContract,
  type WorkflowContract,
  type WorkflowJob,
} from "./workflow-contract.js";

// The guard test runs about 40 real git commands in a temporary repository.
// They take about 5 s on a loaded machine, which is Bun's default test limit.
const GIT_REPOSITORY_TEST_TIMEOUT_MS = 30_000;

const root = resolve(import.meta.dir, "..");
const workflowSources = {
  ci: readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8"),
  release: readFileSync(resolve(root, ".github/workflows/release.yml"), "utf8"),
  version: readFileSync(resolve(root, ".github/workflows/version.yml"), "utf8"),
  docs: readFileSync(resolve(root, ".github/workflows/docs-deploy.yml"), "utf8"),
} as const;

function workflows(): Readonly<Record<keyof typeof workflowSources, WorkflowContract>> {
  return {
    ci: parseWorkflowContract(workflowSources.ci, "CI workflow"),
    release: parseWorkflowContract(workflowSources.release, "release workflow"),
    version: parseWorkflowContract(workflowSources.version, "version workflow"),
    docs: parseWorkflowContract(workflowSources.docs, "docs deployment workflow"),
  };
}

function job(workflow: keyof typeof workflowSources, name: string): WorkflowJob {
  const found = workflows()[workflow].jobs[name];
  if (!found) throw new Error(`Missing ${workflow} job ${name}`);
  return found;
}

function stepRun(found: WorkflowJob, name: string): string {
  const step = found.steps?.find((candidate) => candidate.name === name);
  if (!step?.run) throw new Error(`Missing step ${name}`);
  return step.run;
}

describe("CI and release workflow contracts", () => {
  it("requires every third-party workflow action to use its reviewed commit SHA", () => {
    const parsed = workflows();
    expect(() =>
      assertReviewedActionPins([
        { name: "CI", workflow: parsed.ci },
        { name: "release", workflow: parsed.release },
        { name: "version", workflow: parsed.version },
        { name: "docs deployment", workflow: parsed.docs },
      ]),
    ).not.toThrow();

    const branchReference = parseWorkflowContract(
      "jobs:\n  check:\n    steps:\n      - uses: actions/checkout@main",
      "branch fixture",
    );
    expect(() =>
      assertReviewedActionPins([{ name: "branch fixture", workflow: branchReference }], {
        "actions/checkout": "0".repeat(40),
      }),
    ).toThrow("must use a 40-character SHA");

    const unknownAction = parseWorkflowContract(
      "jobs:\n  check:\n    steps:\n      - uses: unreviewed/action@0123456789012345678901234567890123456789",
      "unknown fixture",
    );
    expect(() =>
      assertReviewedActionPins([{ name: "unknown fixture", workflow: unknownAction }], {}),
    ).toThrow("action is not reviewed");

    const unreviewedCommit = parseWorkflowContract(
      `jobs:\n  check:\n    steps:\n      - uses: actions/checkout@${"1".repeat(40)}`,
      "unreviewed commit fixture",
    );
    expect(() =>
      assertReviewedActionPins(
        [{ name: "unreviewed commit fixture", workflow: unreviewedCommit }],
        {
          "actions/checkout": "0".repeat(40),
        },
      ),
    ).toThrow();
  });

  it("never deploys production docs from CI", () => {
    // Production docs describe published packages; develop holds unreleased ones.
    for (const [name, ciJob] of Object.entries(workflows().ci.jobs)) {
      expect({ name, environment: ciJob.environment }).toEqual({ name, environment: undefined });
    }
  });

  it("checks the XLSX isolation of the examples in the production docs build", () => {
    const steps = job("ci", "docs-build").steps ?? [];
    const build = steps.findIndex((step) => step.name === "Build production docs");
    const check = steps.findIndex((step) => step.name === "Example XLSX isolation");
    expect(build).toBeGreaterThanOrEqual(0);
    expect(check).toBeGreaterThan(build);
    expect(steps[check]?.run).toBe("bun scripts/verify-example-xlsx-isolation.ts");
  });

  it("deploys docs from the release commit only after its GitHub release", () => {
    const publish = job("release", "publish");
    const docs = job("release", "docs");
    const githubRelease = publish.steps?.find(
      (step) => step.run === "bun scripts/release-github.ts",
    );
    if (githubRelease?.if === undefined) throw new Error("Missing GitHub release condition");

    expect(publish.outputs?.released).toBe(`\${{ ${githubRelease.if} }}`);
    expect(docs.if).toBe("needs.publish.outputs.released == 'true'");
    expect(docs.needs).toEqual(["identity", "publish"]);
    expect(docs.uses).toBe("./.github/workflows/docs-deploy.yml");
    expect(docs.with).toEqual({ ref: "${{ needs.identity.outputs.commit }}" });
  });

  it("starts docs deployment only from a release call or a manual run", () => {
    const docs = workflows().docs;
    expect(Object.keys(docs.on ?? {}).sort()).toEqual(["workflow_call", "workflow_dispatch"]);
    expect(docs.on?.workflow_dispatch?.inputs?.ref?.required).toBeTrue();
    expect(job("docs", "deploy").environment).toBe("Production");
    // The packaged site passes its browser specs before it deploys.
    expect(job("docs", "check").needs).toBe("build");
    expect(job("docs", "deploy").needs).toEqual(["build", "check"]);
  });

  it("builds docs with the toolchain versions CI tests", () => {
    const ciEnv = workflows().ci.env ?? {};
    for (const [name, version] of Object.entries(workflows().docs.env ?? {})) {
      expect({ name, version }).toEqual({ name, version: ciEnv[name] });
    }
  });

  it(
    "deploys only develop commits that npm already released",
    async () => {
      const guard = stepRun(job("docs", "build"), "Require a released commit on develop");
      const repository = await mkdtemp(join(tmpdir(), "sheetwrite-docs-guard-"));
      // Outside the repository, so commits never pick it up.
      const output = `${repository}.output`;
      const git = (...args: string[]): string => {
        const result = Bun.spawnSync(["git", ...args], { cwd: repository, stdout: "pipe" });
        if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed`);
        return result.stdout.toString().trim();
      };
      const runGuard = (commit: string): number => {
        git("checkout", "--quiet", "--detach", commit);
        return Bun.spawnSync(["bash", "-e", "-c", guard], {
          cwd: repository,
          env: { ...process.env, GITHUB_OUTPUT: output },
          stdout: "pipe",
          stderr: "pipe",
        }).exitCode;
      };

      try {
        git("init", "--quiet");
        const commit = (message: string): string => {
          git("add", "--all");
          git(
            "-c",
            "user.name=test",
            "-c",
            "user.email=test@example.com",
            "commit",
            "--quiet",
            "--allow-empty",
            "-m",
            message,
          );
          return git("rev-parse", "HEAD");
        };
        const changeset = join(repository, ".changeset", "feature.md");
        const corePackage = join(repository, "packages", "core", "package.json");
        const setVersion = (version: string) =>
          writeFile(corePackage, `${JSON.stringify({ name: "@sheetwrite/core", version })}\n`);
        await mkdir(join(repository, ".changeset"));
        await mkdir(join(repository, "packages", "core"), { recursive: true });
        await writeFile(join(repository, ".changeset", "README.md"), "Changesets\n");
        await setVersion("1.0.0");
        const released = commit("released 1.0.0");
        git("tag", "@sheetwrite/core@1.0.0");
        await writeFile(changeset, "---\n'@sheetwrite/core': minor\n---\n\nA feature.\n");
        const unreleased = commit("feature with a pending changeset");
        await rm(changeset);
        await setVersion("1.1.0");
        const versioned = commit("version packages, not yet published");
        const unpublishedDocs = commit("docs fix before publication");
        git("update-ref", "refs/remotes/origin/develop", unpublishedDocs);

        // npm does not have 1.1.0 yet: only the 1.0.0 release may deploy.
        expect(runGuard(versioned)).not.toBe(0);
        expect(runGuard(unpublishedDocs)).not.toBe(0);
        expect(runGuard(unreleased)).not.toBe(0);
        expect(runGuard(released)).toBe(0);
        expect(await readFile(output, "utf8")).toBe(`commit=${released}\n`);

        // The release workflow tags 1.1.0 after npm publishes it.
        git("checkout", "--quiet", "--detach", unpublishedDocs);
        git("tag", "@sheetwrite/core@1.1.0");
        const docsFix = commit("docs-only fix after publication");
        git("update-ref", "refs/remotes/origin/develop", docsFix);
        git("checkout", "--quiet", "--detach", released);
        const unreviewed = commit("unreviewed branch");

        expect(runGuard(versioned)).toBe(0);
        expect(runGuard(docsFix)).toBe(0);
        expect(runGuard(unreviewed)).not.toBe(0);
      } finally {
        await rm(repository, { recursive: true, force: true });
        await rm(output, { force: true });
      }
    },
    GIT_REPOSITORY_TEST_TIMEOUT_MS,
  );

  it("fails Required CI when required docs or browser checks do not pass", () => {
    const required = job("ci", "required");
    const gate = required.steps?.find((step) => step.name === "Require every CI branch");
    if (!gate?.run) throw new Error("Missing Required CI gate command");
    const gateCommand = gate.run;
    const env = {
      PREFLIGHT: "success",
      UNIT_COVERAGE: "success",
      UNIT: "success",
      RUST: "success",
      STATIC: "success",
      BENCH: "success",
      ARTIFACT_BUILD: "success",
      PACKED: "success",
      BUNDLERS: "success",
      SIZE: "success",
      DOCS: "success",
      BROWSER: "success",
      DOCS_REQUIRED: "true",
    };
    const exitCode = (overrides: Readonly<Record<string, string>>): number =>
      Bun.spawnSync(["bash", "-e", "-c", gateCommand], {
        env: { ...env, ...overrides },
        stdout: "pipe",
        stderr: "pipe",
      }).exitCode;
    expect(exitCode({})).toBe(0);
    for (const result of ["failure", "skipped", "cancelled"]) {
      expect(exitCode({ DOCS: result })).not.toBe(0);
      expect(exitCode({ BROWSER: result })).not.toBe(0);
    }
    expect(exitCode({ DOCS_REQUIRED: "false", DOCS: "skipped", BROWSER: "skipped" })).toBe(0);
    expect(exitCode({ DOCS_REQUIRED: "false" })).not.toBe(0);
  });

  it("installs Chromium on the runners without the Ubuntu apt mirrors", () => {
    // The runner image has Chromium's libraries; apt only added fonts, and a
    // mirror outage failed every pull request.
    const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
      readonly scripts: Readonly<Record<string, string>>;
    };
    expect(manifest.scripts["browser:install:chromium"]).toBe("bun scripts/install-chromium.ts");
    const installs = Object.values(workflows().ci.jobs).flatMap((ciJob) =>
      (ciJob.steps ?? []).filter((step) => step.name === "Install Chromium"),
    );
    expect(installs.length).toBeGreaterThan(0);
    for (const step of installs) expect(step.run).toBe("bun run browser:install:chromium");
    expect(workflowSources.ci).not.toMatch(/--with-deps|install-deps|apt-get/);
  });

  it("rejects every missing Vercel credential before invoking the deployment CLI", () => {
    const run = stepRun(job("docs", "deploy"), "Deploy prebuilt production docs");
    const credentials = {
      VERCEL_TOKEN: "test-token",
      VERCEL_ORG_ID: "test-org",
      VERCEL_PROJECT_ID: "test-project",
    };
    const CLI_REACHED_EXIT_CODE = 42;
    const runDeployment = (env: Readonly<Record<string, string>>) =>
      Bun.spawnSync(["bash", "-e", "-c", `npx() { exit ${CLI_REACHED_EXIT_CODE}; }\n${run}`], {
        env,
        stdout: "pipe",
        stderr: "pipe",
      });
    expect(runDeployment(credentials).exitCode).toBe(CLI_REACHED_EXIT_CODE);
    for (const name of Object.keys(credentials)) {
      const result = runDeployment({ ...credentials, [name]: "" });
      expect(result.exitCode).toBe(1);
      expect(result.stdout.toString()).toContain(name);
      expect(result.stdout.toString()).not.toContain(credentials.VERCEL_TOKEN);
    }
    const missingAll = runDeployment({});
    expect(missingAll.exitCode).toBe(1);
    for (const name of Object.keys(credentials)) {
      expect(missingAll.stdout.toString()).toContain(name);
    }
  });

  it("gives changeset versioning the token that the GitHub changelog generator needs", () => {
    const steps = workflows().version.jobs.version?.steps ?? [];
    const versioning = steps.find((step) => step.uses?.startsWith("changesets/action@"));
    if (versioning?.uses === undefined) throw new Error("Missing changesets version step");

    // @changesets/changelog-github reads each entry's pull request and author from GitHub.
    expect(versioning.with?.["version-script"]).toBe("bun run changeset:version");
    expect(versioning.env?.GITHUB_TOKEN).toBe("${{ github.token }}");
    // Release publication owns tags and GitHub releases, one per version.
    expect(versioning.with?.["create-github-releases"]).toBe(false);
    expect(versioning.with?.["push-git-tags"]).toBe(false);
  });

  it("publishes the version GitHub release from the commit and packages that npm verified", () => {
    const publish = workflows().release.jobs.publish;
    const steps = publish?.steps ?? [];
    const releaseIndex = steps.findIndex((step) => step.run === "bun scripts/release-github.ts");
    const publishIndex = steps.findIndex((step) => step.id === "publish");
    const step = steps[releaseIndex];
    if (step === undefined) throw new Error("Missing GitHub release step");

    expect(publishIndex).toBeGreaterThan(-1);
    expect(releaseIndex).toBeGreaterThan(publishIndex);
    expect(step.if).toBe("steps.publish.outputs.pending != 'true'");
    expect(step.env).toEqual({
      GH_TOKEN: "${{ github.token }}",
      EXPECTED_SHA: "${{ needs.identity.outputs.commit }}",
      VERIFIED_PACKAGES: "${{ steps.publish.outputs.verified }}",
      PUBLISHED_PACKAGES: "${{ steps.publish.outputs.published }}",
    });
    // Tags and release notes need the release commit with full tag history.
    expect(publish?.permissions?.contents).toBe("write");
    expect(steps[0]?.with).toEqual({
      ref: "${{ needs.identity.outputs.commit }}",
      "fetch-depth": 0,
    });
  });
});
