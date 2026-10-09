import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertReviewedActionPins,
  parseWorkflowContract,
  type WorkflowContract,
  type WorkflowJob,
} from "./workflow-contract.js";

const root = resolve(import.meta.dir, "..");
const workflowSources = {
  ci: readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8"),
  release: readFileSync(resolve(root, ".github/workflows/release.yml"), "utf8"),
  version: readFileSync(resolve(root, ".github/workflows/version.yml"), "utf8"),
} as const;

function workflows(): Readonly<Record<keyof typeof workflowSources, WorkflowContract>> {
  return {
    ci: parseWorkflowContract(workflowSources.ci, "CI workflow"),
    release: parseWorkflowContract(workflowSources.release, "release workflow"),
    version: parseWorkflowContract(workflowSources.version, "version workflow"),
  };
}

function ciJob(name: string): WorkflowJob {
  const job = workflows().ci.jobs[name];
  if (!job) throw new Error(`Missing CI job ${name}`);
  return job;
}

describe("CI and release workflow contracts", () => {
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
});
