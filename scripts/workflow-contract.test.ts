import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import playwrightConfig from "../test/browser/playwright.config.js";
import { WASM_PACK_VERSION } from "./install-wasm-pack.js";
import {
  assertReviewedActionPins,
  parseWorkflowContract,
  REVIEWED_ACTION_PINS,
  type WorkflowContract,
  type WorkflowJob,
} from "./workflow-contract.js";
import {
  BUN_VERSION,
  NODE_VERSION,
  NPM_VERSION,
  RUST_VERSION,
  WASM_TARGET,
} from "./workspace-tooling.js";

const root = resolve(import.meta.dir, "..");
const workflowSources = {
  ci: readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8"),
  release: readFileSync(resolve(root, ".github/workflows/release.yml"), "utf8"),
  version: readFileSync(resolve(root, ".github/workflows/version.yml"), "utf8"),
} as const;
const WORKFLOW_BUN_VERSION = "$" + "{{ env.BUN_VERSION }}";
const WORKFLOW_NODE_VERSION = "$" + "{{ env.NODE_VERSION }}";
const packageManifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
  readonly scripts?: Readonly<Record<string, string>>;
};

function workflows(): Readonly<Record<keyof typeof workflowSources, WorkflowContract>> {
  return {
    ci: parseWorkflowContract(workflowSources.ci, "CI workflow"),
    release: parseWorkflowContract(workflowSources.release, "release workflow"),
    version: parseWorkflowContract(workflowSources.version, "version workflow"),
  };
}

function setupStep(job: WorkflowJob, action: string) {
  return job.steps?.find((step) => step.uses?.startsWith(`${action}@`));
}

function commands(job: WorkflowJob): string {
  return (job.steps ?? []).flatMap((step) => (step.run ? [step.run] : [])).join("\n");
}

function ciJob(name: string): WorkflowJob {
  const job = workflows().ci.jobs[name];
  if (!job) throw new Error(`Missing CI job: ${name}`);
  return job;
}

describe("CI and release workflow contracts", () => {
  it("parses jobs and steps through one fail-closed workflow seam", () => {
    const parsed = workflows();
    expect(Object.keys(parsed.ci.jobs).length).toBeGreaterThan(1);
    expect(Object.keys(parsed.release.jobs)).toEqual(["identity", "publish"]);
    expect(Object.keys(parsed.version.jobs)).toEqual(["version"]);
    const conditionalStep = parseWorkflowContract(
      "jobs:\n  check:\n    steps:\n      - uses: owner/action@0123456789012345678901234567890123456789\n        if: always()",
      "conditional fixture",
    ).jobs.check?.steps?.[0];
    expect(conditionalStep?.if).toBe("always()");

    expect(() => parseWorkflowContract("jobs: []", "fixture")).toThrow(
      "fixture.jobs must be a non-empty object",
    );
    expect(() =>
      parseWorkflowContract("jobs:\n  check:\n    steps:\n      - name: incomplete", "fixture"),
    ).toThrow("must define run or uses");
    expect(() =>
      parseWorkflowContract(
        "jobs:\n  check:\n    steps:\n      - run: echo ok\n        uses: owner/action@0123456789012345678901234567890123456789",
        "fixture",
      ),
    ).toThrow("cannot define both run and uses");
    expect(() =>
      parseWorkflowContract(
        "jobs:\n  check:\n    steps:\n      - run: echo ok\n        with:\n          mode: invalid",
        "fixture",
      ),
    ).toThrow("fixture.jobs.check.steps[0].with is only valid for action steps");
    expect(() =>
      parseWorkflowContract(
        "jobs:\n  check:\n    steps:\n      - run: echo ok\n        if: []",
        "fixture",
      ),
    ).toThrow("fixture.jobs.check.steps[0].if must be a string");
  });

  it("requires every third-party workflow action to use its reviewed commit SHA", () => {
    const parsed = workflows();
    expect(() =>
      assertReviewedActionPins([
        { name: "CI", workflow: parsed.ci },
        { name: "release", workflow: parsed.release },
        { name: "version", workflow: parsed.version },
      ]),
    ).not.toThrow();

    const branchReference = parseWorkflowContract(
      "jobs:\n  check:\n    steps:\n      - uses: actions/checkout@main",
      "branch fixture",
    );
    expect(() =>
      assertReviewedActionPins([{ name: "branch fixture", workflow: branchReference }], {
        "actions/checkout": REVIEWED_ACTION_PINS["actions/checkout"]!,
      }),
    ).toThrow("must use a 40-character SHA");

    const unknownAction = parseWorkflowContract(
      "jobs:\n  check:\n    steps:\n      - uses: unreviewed/action@0123456789012345678901234567890123456789",
      "unknown fixture",
    );
    expect(() =>
      assertReviewedActionPins([{ name: "unknown fixture", workflow: unknownAction }], {}),
    ).toThrow("action is not reviewed");
  });

  it("runs CI for every pull request without duplicating release-branch push work", () => {
    const triggers = workflows().ci.on;
    expect(triggers?.push).toEqual({ branches: ["develop"] });
    expect(triggers?.pull_request).toEqual({});
  });

  it("deploys only successful develop pushes after Required CI and docs", () => {
    const deploy = ciJob("docs-deploy");
    if (!deploy.if) throw new Error("Docs deployment must have a condition");
    expect(deploy.needs).toEqual(["required", "docs-build"]);
    expect(deploy.environment).toBe("Production");

    // These string comparisons and boolean operators also have JavaScript semantics.
    const permitsDeployment = new Function("github", "needs", "success", `return ${deploy.if};`);
    const evaluate = ({
      eventName = "push",
      ref = "refs/heads/develop",
      requiredResult = "success",
      docsResult = "success",
      succeeded = true,
      isFork = false,
    }: {
      eventName?: string;
      ref?: string;
      requiredResult?: string;
      docsResult?: string;
      succeeded?: boolean;
      isFork?: boolean;
    } = {}): unknown =>
      permitsDeployment(
        { event_name: eventName, ref, event: { repository: { fork: isFork } } },
        { required: { result: requiredResult }, "docs-build": { result: docsResult } },
        () => succeeded,
      );
    expect(evaluate()).toBeTrue();
    expect(evaluate({ eventName: "pull_request", ref: "refs/pull/1/merge" })).toBeFalse();
    expect(evaluate({ eventName: "pull_request" })).toBeFalse();
    expect(evaluate({ eventName: "pull_request_target" })).toBeFalse();
    expect(evaluate({ ref: "refs/heads/release" })).toBeFalse();
    expect(evaluate({ succeeded: false })).toBeFalse();
    expect(evaluate({ isFork: true })).toBeFalse();
    for (const result of ["failure", "skipped", "cancelled"]) {
      expect(evaluate({ requiredResult: result })).toBeFalse();
      expect(evaluate({ docsResult: result })).toBeFalse();
    }
  });

  it("fails Required CI when required docs or browser checks do not pass", () => {
    const required = ciJob("required");
    const gate = required.steps?.find((step) => step.name === "Require every CI branch");
    if (!gate?.run) throw new Error("Missing Required CI gate command");
    const gateCommand = gate.run;
    const env = {
      PREFLIGHT: "success",
      UNIT_COVERAGE: "success",
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

  it("rejects every missing Vercel credential before invoking the deployment CLI", () => {
    const deploy = ciJob("docs-deploy");
    const step = deploy.steps?.find(
      (candidate) => candidate.name === "Deploy prebuilt production docs",
    );
    if (!step?.run) throw new Error("Missing prebuilt deployment command");
    const credentials = {
      VERCEL_TOKEN: "test-token",
      VERCEL_ORG_ID: "test-org",
      VERCEL_PROJECT_ID: "test-project",
    };
    const CLI_REACHED_EXIT_CODE = 42;
    const runDeployment = (env: Readonly<Record<string, string>>) =>
      Bun.spawnSync(["bash", "-e", "-c", `npx() { exit ${CLI_REACHED_EXIT_CODE}; }\n${step.run}`], {
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

  it("routes ordinary changes through Changesets and validates semver release branches", () => {
    const changesetStatus = workflows().ci.jobs.preflight?.steps?.find(
      (step) => step.name === "Changeset status",
    );
    expect(changesetStatus?.run).toBe("bun run changeset:ci");
    expect(changesetStatus?.if).toBeUndefined();
  });

  it("keeps each workflow's required toolchain versions in parity", () => {
    const parsed = workflows();
    for (const [name, workflow] of Object.entries(parsed)) {
      expect(workflow.env?.BUN_VERSION, `${name} BUN_VERSION`).toBe(BUN_VERSION);
      const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);
      const nodeSetups = steps.filter((step) => step.uses?.startsWith("actions/setup-node@"));
      const bunSetups = steps.filter((step) => step.uses?.startsWith("oven-sh/setup-bun@"));
      expect(bunSetups.length, `${name} Bun setup`).toBeGreaterThan(0);
      expect(
        bunSetups.every((step) => step.with?.["bun-version"] === WORKFLOW_BUN_VERSION),
      ).toBeTrue();
      if (name === "version") {
        expect(nodeSetups).toEqual([]);
        continue;
      }
      expect(workflow.env?.NODE_VERSION, `${name} NODE_VERSION`).toBe(NODE_VERSION);
      expect(workflow.env?.NPM_VERSION, `${name} NPM_VERSION`).toBe(NPM_VERSION);
      expect(nodeSetups.length, `${name} Node setup`).toBeGreaterThan(0);
      expect(
        nodeSetups.every((step) => step.with?.["node-version"] === WORKFLOW_NODE_VERSION),
      ).toBeTrue();
      expect(
        steps
          .flatMap((step) => (step.run ? [step.run] : []))
          .filter((command) => command.includes("npm install --global"))
          .every((command) => command.includes('npm install --global "npm@$NPM_VERSION"')),
      ).toBeTrue();
    }

    for (const [key, value] of Object.entries({
      RUST_VERSION,
      WASM_TARGET,
      WASM_PACK_VERSION,
    })) {
      expect(parsed.ci.env?.[key], `CI ${key}`).toBe(value);
      expect(parsed.release.env?.[key], `release ${key}`).toBeUndefined();
    }
    expect(commands(parsed.release.jobs.identity!)).not.toContain("install-wasm-pack");
    expect(commands(parsed.release.jobs.publish!)).not.toContain("install-wasm-pack");
  });

  it("installs and runs all browser projects on supported Ubuntu while limiting portable engines", () => {
    const browserJob = workflows().ci.jobs["browser-smoke"]!;
    expect(browserJob["runs-on"]).toBe("ubuntu-latest");
    expect(commands(browserJob)).toContain("bun run browser:install");
    expect(commands(browserJob)).toContain("bun run test:browser");
    expect(packageManifest.scripts?.["browser:install"]).toBe(
      "playwright install --with-deps chromium firefox webkit",
    );
    expect(packageManifest.scripts?.["test:browser:portability"]).toContain("--grep @portability");

    expect(packageManifest.scripts?.["browser:install:chromium"]).toBe(
      "playwright install --with-deps chromium",
    );
    for (const jobName of ["packed-consumers", "bundler-consumers", "delivery-size"]) {
      expect(commands(workflows().ci.jobs[jobName]!)).toContain("bun run browser:install:chromium");
    }

    const unitCoverageCommands = commands(workflows().ci.jobs["unit-coverage"]!).split("\n");
    expect(unitCoverageCommands).toContain("bun run browser:install:chromium");
    expect(unitCoverageCommands).not.toContain("bun run browser:install");

    const projectByName = Object.fromEntries(
      (playwrightConfig.projects ?? []).map((project) => [project.name, project]),
    );
    expect(Object.keys(projectByName)).toEqual([
      "chromium",
      "firefox",
      "webkit",
      "chromium-engine-dpr2",
      "webkit-engine-dpr2",
    ]);
    expect(projectByName.chromium?.grep).toBeUndefined();
    expect(String(projectByName.firefox?.grep)).toBe("/@portability/");
    expect(String(projectByName.webkit?.grep)).toBe("/@portability/");
    expect(String(projectByName["chromium-engine-dpr2"]?.grep)).toBe("/@dpr2-render/");
    expect(String(projectByName["webkit-engine-dpr2"]?.grep)).toBe("/@dpr2-render/");
  });

  it("applies the canonical JavaScript toolchain to the trusted publishing job", () => {
    const publish = workflows().release.jobs.publish!;
    expect(publish.environment).toBe("npm-release");
    expect(publish.permissions).toEqual({
      actions: "read",
      contents: "write",
      "id-token": "write",
      "pull-requests": "write",
    });
    expect(setupStep(publish, "actions/setup-node")?.with?.["node-version"]).toBe(
      WORKFLOW_NODE_VERSION,
    );
    expect(setupStep(publish, "actions/setup-node")?.with?.["registry-url"]).toBe(
      "https://registry.npmjs.org",
    );
    expect(setupStep(publish, "oven-sh/setup-bun")?.with?.["bun-version"]).toBe(
      WORKFLOW_BUN_VERSION,
    );
    expect(commands(publish)).toContain('npm install --global "npm@$NPM_VERSION"');
    expect(commands(publish)).toContain("release-publish.ts");
    expect(commands(publish)).toContain("release-github.ts");
  });

  it("creates independent package version pull requests without publishing", () => {
    const version = workflows().version;
    const job = version.jobs.version!;
    expect(version.permissions).toEqual({ contents: "write", "pull-requests": "write" });
    expect(setupStep(job, "oven-sh/setup-bun")?.with?.["bun-version"]).toBe(WORKFLOW_BUN_VERSION);
    const changesets = setupStep(job, "changesets/action")!;
    expect(changesets.with?.version).toBe("bunx changeset version");
    expect(changesets.with?.createGithubReleases).toBe(false);
    expect(changesets.with?.publish).toBeUndefined();
  });
});
