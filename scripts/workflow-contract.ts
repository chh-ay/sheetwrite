import { readFile } from "node:fs/promises";

interface WorkflowStepBase {
  readonly id?: string;
  readonly name?: string;
  readonly if?: string;
  readonly env?: Readonly<Record<string, unknown>>;
}

export interface RunWorkflowStep extends WorkflowStepBase {
  readonly run: string;
  readonly uses?: never;
  readonly with?: never;
}

export interface ActionWorkflowStep extends WorkflowStepBase {
  readonly run?: never;
  readonly uses: string;
  readonly with?: Readonly<Record<string, unknown>>;
}

export type WorkflowStep = RunWorkflowStep | ActionWorkflowStep;

export interface WorkflowJob {
  readonly name?: string;
  readonly if?: string;
  readonly "runs-on"?: string;
  readonly needs?: string | readonly string[];
  readonly environment?: string | Readonly<Record<string, unknown>>;
  readonly permissions?: Readonly<Record<string, string>>;
  readonly outputs?: Readonly<Record<string, string>>;
  readonly "timeout-minutes"?: number;
  readonly uses?: string;
  readonly steps?: readonly WorkflowStep[];
}

export interface WorkflowTriggers {
  readonly push?: {
    readonly branches?: readonly string[];
  };
  readonly pull_request?: {
    readonly branches?: readonly string[];
  };
  readonly workflow_dispatch?: {
    readonly inputs?: Readonly<Record<string, { readonly required?: boolean }>>;
  };
  readonly [event: string]: unknown;
}

export interface WorkflowConcurrency {
  readonly group?: string;
  readonly "cancel-in-progress"?: boolean;
  readonly [key: string]: unknown;
}

export interface WorkflowContract {
  readonly name?: string;
  readonly on?: WorkflowTriggers;
  readonly env?: Readonly<Record<string, unknown>>;
  readonly concurrency?: WorkflowConcurrency;
  readonly permissions?: Readonly<Record<string, string>>;
  readonly jobs: Readonly<Record<string, WorkflowJob>>;
}

export interface NamedWorkflow {
  readonly name: string;
  readonly workflow: WorkflowContract;
}

export const REVIEWED_ACTION_PINS: Readonly<Record<string, string>> = {
  "actions/checkout": "3d3c42e5aac5ba805825da76410c181273ba90b1",
  "actions/setup-node": "949feb2413d6458794dcd2491c4babbbce0c15c1",
  "oven-sh/setup-bun": "0c5077e51419868618aeaa5fe8019c62421857d6",
  "changesets/action": "ae32849d5ba541f9ae29e40e22a623bc13562f51",
  "actions/upload-artifact": "cf430e030ddbb5b0abf93d22962f4752f3646cd9",
  "actions/download-artifact": "9000827ccba6bdab643e8b6fd33ac0654aef8333",
  // CI restores caches on every run and saves them only on develop.
  "actions/cache/restore": "55cc8345863c7cc4c66a329aec7e433d2d1c52a9",
  "actions/cache/save": "55cc8345863c7cc4c66a329aec7e433d2d1c52a9",
  "peter-evans/create-pull-request": "5f6978faf089d4d20b00c7766989d076bb2fc7f1",
};

const SHA_40 = /^[0-9a-f]{40}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown, label: string): asserts value is string | undefined {
  if (value !== undefined && typeof value !== "string")
    throw new Error(`${label} must be a string`);
}

function optionalRecord(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> | undefined {
  if (value !== undefined && !isRecord(value)) throw new Error(`${label} must be an object`);
}

function parseStep(value: unknown, label: string): WorkflowStep {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  optionalString(value.id, `${label}.id`);
  optionalString(value.name, `${label}.name`);
  optionalString(value.run, `${label}.run`);
  optionalString(value.if, `${label}.if`);
  optionalRecord(value.env, `${label}.env`);
  optionalString(value.uses, `${label}.uses`);
  optionalRecord(value.with, `${label}.with`);
  if (value.run !== undefined) {
    if (value.uses !== undefined) {
      throw new Error(`${label} cannot define both run and uses`);
    }
    if (value.with !== undefined) {
      throw new Error(`${label}.with is only valid for action steps`);
    }
    return {
      id: value.id,
      name: value.name,
      run: value.run,
      if: value.if,
      env: value.env,
    };
  }
  if (value.uses !== undefined) {
    return {
      id: value.id,
      name: value.name,
      if: value.if,
      env: value.env,
      uses: value.uses,
      with: value.with,
    };
  }
  throw new Error(`${label} must define run or uses`);
}

function parseJob(value: unknown, label: string): WorkflowJob {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  optionalString(value.name, `${label}.name`);
  optionalString(value["runs-on"], `${label}.runs-on`);
  optionalString(value.if, `${label}.if`);
  optionalString(value.uses, `${label}.uses`);
  if (
    value.needs !== undefined &&
    typeof value.needs !== "string" &&
    (!Array.isArray(value.needs) || value.needs.some((need) => typeof need !== "string"))
  ) {
    throw new Error(`${label}.needs must be a string or string array`);
  }
  optionalRecord(value.permissions, `${label}.permissions`);
  optionalRecord(value.outputs, `${label}.outputs`);
  if (
    value["timeout-minutes"] !== undefined &&
    (typeof value["timeout-minutes"] !== "number" || value["timeout-minutes"] <= 0)
  ) {
    throw new Error(`${label}.timeout-minutes must be a positive number`);
  }
  if (value.steps !== undefined) {
    if (!Array.isArray(value.steps) || value.steps.length === 0) {
      throw new Error(`${label}.steps must be a non-empty array`);
    }
    value.steps.map((step, index) => parseStep(step, `${label}.steps[${index}]`));
  }
  if (value.uses !== undefined && value.steps !== undefined) {
    throw new Error(`${label} cannot define both uses and steps`);
  }
  if (value.uses === undefined && value.steps === undefined) {
    throw new Error(`${label} must define steps or uses`);
  }
  return value as unknown as WorkflowJob;
}

export function parseWorkflowContract(source: string, label = "workflow"): WorkflowContract {
  let raw: unknown;
  try {
    raw = Bun.YAML.parse(source);
  } catch (error) {
    throw new Error(
      `${label} is not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isRecord(raw)) throw new Error(`${label} must be an object`);
  optionalString(raw.name, `${label}.name`);
  optionalRecord(raw.on, `${label}.on`);
  optionalRecord(raw.env, `${label}.env`);
  optionalRecord(raw.concurrency, `${label}.concurrency`);
  optionalRecord(raw.permissions, `${label}.permissions`);
  if (!isRecord(raw.jobs) || Object.keys(raw.jobs).length === 0) {
    throw new Error(`${label}.jobs must be a non-empty object`);
  }
  const jobs: Record<string, WorkflowJob> = {};
  for (const [jobName, job] of Object.entries(raw.jobs)) {
    jobs[jobName] = parseJob(job, `${label}.jobs.${jobName}`);
  }
  return { ...(raw as unknown as WorkflowContract), jobs };
}

export async function readWorkflowContract(path: string, label = path): Promise<WorkflowContract> {
  return parseWorkflowContract(await readFile(path, "utf8"), label);
}

interface ActionReference {
  readonly workflow: string;
  readonly location: string;
  readonly uses: string;
}

function actionReferences(named: NamedWorkflow): readonly ActionReference[] {
  const references: ActionReference[] = [];
  for (const [jobName, job] of Object.entries(named.workflow.jobs)) {
    if (job.uses) {
      references.push({ workflow: named.name, location: `jobs.${jobName}`, uses: job.uses });
    }
    for (const [index, step] of (job.steps ?? []).entries()) {
      if (step.uses) {
        references.push({
          workflow: named.name,
          location: `jobs.${jobName}.steps[${index}]`,
          uses: step.uses,
        });
      }
    }
  }
  return references;
}

export function assertReviewedActionPins(
  workflows: readonly NamedWorkflow[],
  reviewedPins: Readonly<Record<string, string>> = REVIEWED_ACTION_PINS,
): void {
  const usedActions = new Set<string>();
  for (const named of workflows) {
    for (const reference of actionReferences(named)) {
      if (reference.uses.startsWith("./")) continue;
      const separator = reference.uses.lastIndexOf("@");
      if (separator <= 0 || separator === reference.uses.length - 1) {
        throw new Error(
          `${reference.workflow} ${reference.location} third-party action is not pinned: ${reference.uses}`,
        );
      }
      const action = reference.uses.slice(0, separator);
      const commit = reference.uses.slice(separator + 1);
      if (!SHA_40.test(commit)) {
        throw new Error(
          `${reference.workflow} ${reference.location} action ${action} must use a 40-character SHA`,
        );
      }
      const reviewed = reviewedPins[action];
      if (reviewed === undefined) {
        throw new Error(
          `${reference.workflow} ${reference.location} action is not reviewed: ${action}`,
        );
      }
      if (commit !== reviewed) {
        throw new Error(
          `${reference.workflow} ${reference.location} action ${action} uses unreviewed SHA ${commit}`,
        );
      }
      usedActions.add(action);
    }
  }
  const staleReviews = Object.keys(reviewedPins).filter((action) => !usedActions.has(action));
  if (staleReviews.length > 0) {
    throw new Error(`Reviewed action pins are unused: ${staleReviews.join(", ")}`);
  }
}
