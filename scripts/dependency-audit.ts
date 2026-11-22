import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export type AuditSeverity = "low" | "moderate" | "high" | "critical";

export interface AuditFinding {
  readonly package: string;
  readonly advisory: string;
  readonly severity: AuditSeverity;
  readonly title: string;
  readonly url: string;
}

export interface AuditAllowance {
  readonly advisory: string;
  readonly package: string;
  readonly owner: string;
  readonly rationale: string;
  readonly expires: string;
}

export interface AuditCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface AuditPolicyResult {
  readonly findings: readonly AuditFinding[];
  readonly allowedBlockingFindings: readonly AuditFinding[];
  readonly nonBlockingFindings: readonly AuditFinding[];
}

const BLOCKING_SEVERITIES: Readonly<Record<AuditSeverity, boolean>> = {
  low: false,
  moderate: false,
  high: true,
  critical: true,
};

export const AUDIT_ALLOWANCE_MAX_DAYS = 90;
const DAY_MILLISECONDS = 86_400_000;
const ALLOWANCE_KEYS: Readonly<Record<string, true>> = {
  advisory: true,
  package: true,
  owner: true,
  rationale: true,
  expires: true,
};
const POLICY_FILE_KEYS: Readonly<Record<string, true>> = { policy: true, allowlist: true };
const POLICY_DECLARATION_KEYS: Readonly<Record<string, true>> = {
  scope: true,
  failSeverities: true,
  allowanceRequirements: true,
  maximumAllowanceDays: true,
};
const POLICY_SEVERITIES = ["low", "moderate", "high", "critical"] as const;
const POLICY_ALLOWANCE_FIELDS = ["advisory", "package", "owner", "rationale", "expires"] as const;

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validate_exact_string_array(
  value: unknown,
  expected: readonly string[],
  label: string,
): void {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((item, index) => item !== expected[index])
  ) {
    throw new Error(`${label} must be ${expected.join(", ")}`);
  }
}

export function parseAuditPolicyFile(raw: unknown): readonly unknown[] {
  if (!is_record(raw)) throw new Error("Audit policy must be an object");
  for (const key of Object.keys(raw)) {
    if (POLICY_FILE_KEYS[key] !== true)
      throw new Error(`Audit policy has an unknown field: ${key}`);
  }
  if (!is_record(raw.policy)) throw new Error("Audit policy declaration must be an object");
  for (const key of Object.keys(raw.policy)) {
    if (POLICY_DECLARATION_KEYS[key] !== true) {
      throw new Error(`Audit policy declaration has an unknown field: ${key}`);
    }
  }
  if (typeof raw.policy.scope !== "string" || raw.policy.scope.trim() === "") {
    throw new Error("Audit policy scope must be non-empty");
  }
  validate_exact_string_array(
    raw.policy.failSeverities,
    POLICY_SEVERITIES,
    "Audit policy failSeverities",
  );
  validate_exact_string_array(
    raw.policy.allowanceRequirements,
    POLICY_ALLOWANCE_FIELDS,
    "Audit policy allowanceRequirements",
  );
  if (raw.policy.maximumAllowanceDays !== AUDIT_ALLOWANCE_MAX_DAYS) {
    throw new Error(`Audit policy maximumAllowanceDays must be ${AUDIT_ALLOWANCE_MAX_DAYS}`);
  }
  if (!Array.isArray(raw.allowlist)) {
    throw new Error("Audit policy must contain an allowlist array");
  }
  return raw.allowlist;
}

function advisory_identity(url: string, id: unknown): string {
  const slug = url.match(/\/(GHSA-[A-Za-z0-9-]+|CVE-[A-Za-z0-9-]+)$/i)?.[1];
  if (slug) return slug.toUpperCase();
  if (typeof id === "number" || typeof id === "string") return String(id);
  throw new Error("Audit advisory is missing an identity");
}

export function parseAuditOutput(stdout: string): readonly AuditFinding[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `Bun audit returned malformed JSON: ${error instanceof Error ? error.message : error}`,
    );
  }
  if (!is_record(parsed)) throw new Error("Bun audit JSON must be an object keyed by package");

  const findings: AuditFinding[] = [];
  for (const [package_name, advisories] of Object.entries(parsed)) {
    if (!Array.isArray(advisories)) {
      throw new Error(`Bun audit entry for ${package_name} must be an array`);
    }
    for (const advisory of advisories) {
      if (!is_record(advisory))
        throw new Error(`Bun audit advisory for ${package_name} must be an object`);
      const severity = advisory.severity;
      const title = advisory.title;
      const url = advisory.url;
      if (
        (severity !== "low" &&
          severity !== "moderate" &&
          severity !== "high" &&
          severity !== "critical") ||
        typeof title !== "string" ||
        typeof url !== "string"
      ) {
        throw new Error(`Bun audit advisory for ${package_name} has an invalid schema`);
      }
      findings.push({
        package: package_name,
        advisory: advisory_identity(url, advisory.id),
        severity,
        title,
        url,
      });
    }
  }
  return findings.sort((left, right) =>
    `${left.package}:${left.advisory}`.localeCompare(`${right.package}:${right.advisory}`),
  );
}

function policy_date(value: string, label: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD`);
  }
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(milliseconds) ||
    new Date(milliseconds).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${label} is not a calendar date`);
  }
  return milliseconds;
}

function validate_allowance(value: unknown, index: number, today: string): AuditAllowance {
  if (!is_record(value)) throw new Error(`Audit allowance ${index} must be an object`);
  for (const key of Object.keys(value)) {
    if (ALLOWANCE_KEYS[key] !== true) {
      throw new Error(`Audit allowance ${index} has an unknown field: ${key}`);
    }
  }
  for (const field of ["advisory", "package", "owner", "rationale", "expires"] as const) {
    if (typeof value[field] !== "string" || value[field].trim() === "") {
      throw new Error(`Audit allowance ${index} has an empty ${field}`);
    }
  }
  const allowance = value as unknown as AuditAllowance;
  const today_milliseconds = policy_date(today, "Audit policy date");
  const expiry_milliseconds = policy_date(
    allowance.expires,
    `Audit allowance ${allowance.advisory} expiry`,
  );
  if (expiry_milliseconds < today_milliseconds) {
    throw new Error(`Audit allowance ${allowance.advisory} expired on ${allowance.expires}`);
  }
  if (expiry_milliseconds - today_milliseconds > AUDIT_ALLOWANCE_MAX_DAYS * DAY_MILLISECONDS) {
    throw new Error(
      `Audit allowance ${allowance.advisory} expires more than ${AUDIT_ALLOWANCE_MAX_DAYS} days from review`,
    );
  }
  return allowance;
}

export function evaluateAuditPolicy(
  command: AuditCommandResult,
  allowlist: readonly unknown[],
  today = new Date().toISOString().slice(0, 10),
): AuditPolicyResult {
  if (command.stdout.trim() === "") {
    throw new Error(
      `Bun audit produced no JSON${command.stderr ? `: ${command.stderr.trim()}` : ""}`,
    );
  }
  const findings = parseAuditOutput(command.stdout);
  if (command.exitCode !== 0 && command.exitCode !== 1) {
    throw new Error(
      `Bun audit failed with exit code ${command.exitCode}: ${command.stderr.trim()}`,
    );
  }
  if (command.exitCode === 0 && findings.length > 0) {
    throw new Error("Bun audit returned findings with a success exit code");
  }
  if (command.exitCode === 1 && findings.length === 0) {
    throw new Error(`Bun audit failed without findings: ${command.stderr.trim()}`);
  }

  const allowance_by_key = new Map<string, AuditAllowance>();
  for (const [index, value] of allowlist.entries()) {
    const allowance = validate_allowance(value, index, today);
    const key = `${allowance.package}:${allowance.advisory.toUpperCase()}`;
    if (allowance_by_key.has(key)) throw new Error(`Duplicate audit allowance for ${key}`);
    allowance_by_key.set(key, allowance);
  }

  const reviewed: AuditFinding[] = [];
  const unreviewed: AuditFinding[] = [];
  const matched_allowance_keys = new Set<string>();
  for (const finding of findings) {
    const key = `${finding.package}:${finding.advisory}`;
    if (allowance_by_key.has(key)) {
      reviewed.push(finding);
      matched_allowance_keys.add(key);
    } else {
      unreviewed.push(finding);
    }
  }
  if (unreviewed.length > 0) {
    throw new Error(
      `Unallowlisted dependency findings: ${unreviewed
        .map((finding) => `${finding.package}/${finding.advisory} (${finding.severity})`)
        .join(", ")}`,
    );
  }
  const stale = [...allowance_by_key.keys()].filter((key) => !matched_allowance_keys.has(key));
  if (stale.length > 0) {
    throw new Error(`Stale dependency audit allowances: ${stale.join(", ")}`);
  }
  return {
    findings,
    allowedBlockingFindings: reviewed.filter((finding) => BLOCKING_SEVERITIES[finding.severity]),
    nonBlockingFindings: reviewed.filter((finding) => !BLOCKING_SEVERITIES[finding.severity]),
  };
}

export async function runDependencyAudit(root = resolve(import.meta.dir, "..")): Promise<void> {
  const child = Bun.spawn(["bun", "audit", "--json"], {
    cwd: root,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exit_code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  const artifact_root = resolve(root, "test-results/dependency-audit");
  await mkdir(artifact_root, { recursive: true });
  await writeFile(resolve(artifact_root, "bun-audit.json"), stdout);
  await writeFile(resolve(artifact_root, "bun-audit.stderr.txt"), stderr);

  const policy_path = resolve(root, "scripts/dependency-audit-allowlist.json");
  const allowlist = parseAuditPolicyFile(JSON.parse(await readFile(policy_path, "utf8")));
  const result = evaluateAuditPolicy({ stdout, stderr, exitCode: exit_code }, allowlist);
  const report_path = resolve(artifact_root, "policy-result.json");
  await mkdir(dirname(report_path), { recursive: true });
  await writeFile(report_path, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `JavaScript dependency audit passed: ${result.findings.length} finding(s), ${result.findings.length} reviewed allowance(s)`,
  );
}

if (import.meta.main) {
  runDependencyAudit().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
