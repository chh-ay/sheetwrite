import { describe, expect, it } from "bun:test";
import {
  AUDIT_ALLOWANCE_MAX_DAYS,
  type AuditAllowance,
  type AuditCommandResult,
  evaluateAuditPolicy,
  parseAuditPolicyFile,
} from "./dependency-audit.js";

const TODAY = "2026-07-14";

function auditResult(
  severity: "low" | "moderate" | "high" | "critical",
  exitCode = 1,
): AuditCommandResult {
  return {
    exitCode,
    stderr: "bun audit v1.3.14",
    stdout: JSON.stringify({
      vulnerable: [
        {
          id: 123,
          url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
          title: "Fixture vulnerability",
          severity,
        },
      ],
    }),
  };
}

const REVIEWED_ALLOWANCE: AuditAllowance = {
  advisory: "GHSA-AAAA-BBBB-CCCC",
  package: "vulnerable",
  owner: "security@example.invalid",
  rationale: "Fixture has no reachable affected call path while the upstream fix is prepared.",
  expires: "2026-08-01",
};

const POLICY_FILE = {
  policy: {
    scope: "Frozen Bun lockfile",
    failSeverities: ["low", "moderate", "high", "critical"],
    allowanceRequirements: ["advisory", "package", "owner", "rationale", "expires"],
    maximumAllowanceDays: AUDIT_ALLOWANCE_MAX_DAYS,
  },
  allowlist: [],
};

describe("JavaScript dependency audit policy", () => {
  it("fails closed when the declared policy drifts from enforcement", () => {
    expect(parseAuditPolicyFile(POLICY_FILE)).toEqual([]);
    expect(() =>
      parseAuditPolicyFile({
        ...POLICY_FILE,
        policy: { ...POLICY_FILE.policy, failSeverities: ["high", "critical"] },
      }),
    ).toThrow("Audit policy failSeverities");
    expect(() =>
      parseAuditPolicyFile({
        ...POLICY_FILE,
        policy: { ...POLICY_FILE.policy, allowanceRequirements: ["advisory", "package"] },
      }),
    ).toThrow("Audit policy allowanceRequirements");
    expect(() =>
      parseAuditPolicyFile({
        ...POLICY_FILE,
        policy: { ...POLICY_FILE.policy, maximumAllowanceDays: 365 },
      }),
    ).toThrow(`maximumAllowanceDays must be ${AUDIT_ALLOWANCE_MAX_DAYS}`);
    expect(() => parseAuditPolicyFile({ ...POLICY_FILE, legacyXlsxAllowance: true })).toThrow(
      "unknown field: legacyXlsxAllowance",
    );
  });

  it("requires a reviewed allowance for a finding of every severity", () => {
    for (const severity of ["low", "moderate", "high", "critical"] as const) {
      expect(() => evaluateAuditPolicy(auditResult(severity), [], TODAY)).toThrow(
        "vulnerable/GHSA-AAAA-BBBB-CCCC",
      );
      const result = evaluateAuditPolicy(auditResult(severity), [REVIEWED_ALLOWANCE], TODAY);
      const blocking = severity === "high" || severity === "critical";
      expect(result.allowedBlockingFindings).toHaveLength(blocking ? 1 : 0);
      expect(result.nonBlockingFindings).toHaveLength(blocking ? 0 : 1);
    }
  });

  it("requires complete, exact, unexpired, near-term allowance metadata", () => {
    const invalid: Array<[string, Record<string, string>]> = [
      ...(["advisory", "package", "owner", "rationale", "expires"] as const).map(
        (field): [string, Record<string, string>] => [`empty ${field}`, { [field]: "" }],
      ),
      ["impossible date", { expires: "2026-02-31" }],
      ["expired", { expires: "2026-07-13" }],
      ["too far ahead", { expires: "2026-10-13" }],
      ["unknown field", { reason: REVIEWED_ALLOWANCE.rationale }],
    ];
    for (const severity of ["moderate", "high"] as const) {
      expect(() =>
        evaluateAuditPolicy(auditResult(severity), [REVIEWED_ALLOWANCE], TODAY),
      ).not.toThrow();
      for (const [label, change] of invalid) {
        expect(
          () =>
            evaluateAuditPolicy(
              auditResult(severity),
              [{ ...REVIEWED_ALLOWANCE, ...change }],
              TODAY,
            ),
          `${severity}: ${label}`,
        ).toThrow();
      }
    }
  });

  it("rejects stale allowances as soon as the dependency or advisory disappears", () => {
    expect(() =>
      evaluateAuditPolicy({ exitCode: 0, stdout: "{}", stderr: "" }, [REVIEWED_ALLOWANCE], TODAY),
    ).toThrow("Stale dependency audit allowances: vulnerable:GHSA-AAAA-BBBB-CCCC");
  });

  it("fails closed on malformed audit output", () => {
    expect(() =>
      evaluateAuditPolicy({ exitCode: 1, stdout: "not-json", stderr: "" }, [], TODAY),
    ).toThrow("malformed JSON");
    expect(() =>
      evaluateAuditPolicy(
        { exitCode: 1, stdout: JSON.stringify({ vulnerable: [{ severity: "high" }] }), stderr: "" },
        [],
        TODAY,
      ),
    ).toThrow("invalid schema");
  });

  it("fails closed when the audit service is unavailable", () => {
    expect(() =>
      evaluateAuditPolicy(
        { exitCode: 1, stdout: "", stderr: "registry request timed out" },
        [],
        TODAY,
      ),
    ).toThrow("produced no JSON: registry request timed out");
  });
});
