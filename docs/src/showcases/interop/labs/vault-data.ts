import resultsData from "@docs/generated/compatibility-results.json";
import compatibilityData from "@docs/generated/compatibility.json";
import type {
  CompatibilityResultCase,
  CompatibilityResults,
} from "@docs/showcases/compatibility-results.js";

/*
 * The checked compatibility data the Evidence vault shows, and the plain
 * words it shows it in. Every count comes from the generated data; names are
 * derived from each case's subject and category.
 */

export const RESULTS = resultsData as unknown as CompatibilityResults;
export const TEST_SET = RESULTS.testSet;
/** Checks that apply: the not-applicable ones are kept in the set but not counted. */
export const APPLICABLE = TEST_SET.totalTests - TEST_SET.unsupported;
export const RECORDS = compatibilityData.records;
export type CompatibilityRecord = (typeof RECORDS)[number];
export type CaseKind = CompatibilityResultCase["kind"];

export const nf = (value: number): string => value.toLocaleString("en");

/** The apps a check can carry a reviewed result from. */
export const OTHER_APPS = [
  { id: "excel-desktop", label: "Excel" },
  { id: "google-sheets", label: "Google Sheets" },
  { id: "libreoffice", label: "LibreOffice" },
] as const;

/** Each reason the check set gives for checks that do not apply, in reader's words. */
const REASON_WORDS: Readonly<Record<string, (subjects: string) => string>> = {
  "Category is not applicable to a zero-argument function.": (subjects) =>
    `vary the arguments of functions that take none (${subjects})`,
};

/** A list as a reader says it: "A, B and C". */
export function spokenList(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** Why the not-applicable checks do not count, one clause per reason in the data. */
export const NOT_APPLICABLE_REASONS = TEST_SET.unsupportedReasons.map((group) => {
  const subjects = spokenList(group.subjects);
  const words = REASON_WORDS[group.reason];
  return {
    tests: group.tests,
    subjects: group.subjects,
    text: words
      ? words(subjects)
      : `${group.reason.replace(/\.$/u, "").toLowerCase()} (${subjects})`,
  };
});

/** The kinds of check, with the full set's count and what one exercises. */
export const CASE_KINDS = [
  {
    kind: "formula",
    label: "Formulas",
    short: "Formulas",
    icon: "formula",
    count: TEST_SET.formulaTests,
    what: "One formula in a cell",
  },
  {
    kind: "mutation",
    label: "Edit sequences",
    short: "Edits",
    icon: "edit",
    count: TEST_SET.editSequenceTests,
    what: "Several edits in a row, then the results",
  },
  {
    kind: "workbook",
    label: "Workbooks",
    short: "Workbooks",
    icon: "sheet",
    count: TEST_SET.workbookTests,
    what: "Whole-workbook behavior, such as sheets",
  },
] as const satisfies readonly {
  kind: CaseKind;
  label: string;
  short: string;
  icon: string;
  count: number;
  what: string;
}[];

/** What a check's result was, as one badge. */
export type CaseOutcome = "pass" | "warning" | "difference" | "regression" | "not-applicable";

export function caseOutcome(entry: CompatibilityResultCase): CaseOutcome {
  if (entry.unsupported) return "not-applicable";
  if (entry.statusTags.includes("regression")) return "regression";
  if (entry.statusTags.includes("known-difference")) return "difference";
  if (entry.statusTags.includes("warning")) return "warning";
  return "pass";
}

export const OUTCOME_LABELS: Readonly<Record<CaseOutcome, string>> = {
  pass: "Pass",
  warning: "Pass, with warning",
  difference: "Known difference",
  regression: "Regression",
  "not-applicable": "Not applicable",
};

/** The result filter's choices: only outcomes the published checks have. */
export const OUTCOME_CHOICES: readonly CaseOutcome[] = (
  ["pass", "warning", "difference", "regression", "not-applicable"] as const
).filter((outcome) => RESULTS.cases.some((entry) => caseOutcome(entry) === outcome));

const CATEGORY_WORDS: Readonly<Record<string, string>> = {
  normal: "",
  boundary: " at a boundary value",
  error: " with an error input",
  empty: " with an empty cell",
  mixed: " with a number stored as text",
  "range-array": " over a range",
  mutation: "",
};

const sentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** A check's name in plain words, from its subject and category. */
export function checkName(entry: CompatibilityResultCase): string {
  const [subject = entry.label] = entry.label.split(" · ");
  const category = CATEGORY_WORDS[entry.category] ?? ` (${entry.category})`;
  if (entry.featureValue.startsWith("operator:")) {
    return `${sentence(subject.replaceAll("-", " "))} operator${category}`;
  }
  if (entry.kind === "formula") return `${subject}${category}`;
  return `${sentence(subject.toLowerCase())}${category}`;
}

/** What kind of check it is and the case it covers, for the detail heading. */
export function checkKind(entry: CompatibilityResultCase): string {
  const kind = CASE_KINDS.find((item) => item.kind === entry.kind)?.label ?? entry.kind;
  return entry.category === "mutation" || entry.category === "normal"
    ? kind.replace(/s$/u, "")
    : `${kind.replace(/s$/u, "")} · ${entry.category.replaceAll("-", " ")} case`;
}

/** What a non-formula check covers, in muted words under its name. */
export function checkSteps(entry: CompatibilityResultCase): string {
  return entry.featureLabel.replace(/^Feature · /u, "");
}

interface CheckedValue {
  readonly type: string;
  readonly value?: unknown;
  readonly error?: string;
  readonly displayedText?: string;
}

/** An expected value as a cell shows it; structured results name their type. */
export function expectedText(result: CheckedValue): string {
  switch (result.type) {
    case "number":
      return String(result.value);
    case "string":
      return `"${String(result.value)}"`;
    case "boolean":
      return String(result.value).toUpperCase();
    case "error":
      return result.error ?? String(result.value);
    case "blank":
      return "Blank";
    case "unsupported":
      return "—";
    default: {
      const value = result.value as { passed?: number } | undefined;
      return typeof value?.passed === "number"
        ? `${value.passed} step${value.passed === 1 ? "" : "s"} pass`
        : "Workbook state";
    }
  }
}

/** The three columns the feature boundaries are grouped in. */
export const BOUNDARY_GROUPS = [
  {
    id: "supported",
    title: "Supported",
    icon: "check",
    statuses: ["supported", "warning"],
    note: null,
  },
  {
    id: "partly",
    title: "Partly supported",
    icon: "conditional",
    statuses: ["partial", "roundtrip-only"],
    note: null,
  },
  {
    id: "not-claimed",
    title: "Not claimed",
    icon: "minus",
    statuses: ["unsupported"],
    note: "Import detects these parts and reports them instead of reading them. Keeping them on save isn't claimed.",
  },
] as const satisfies readonly {
  id: string;
  title: string;
  icon: string;
  statuses: readonly CompatibilityRecord["status"][];
  note: string | null;
}[];

export type BoundaryGroup = (typeof BOUNDARY_GROUPS)[number];

export const boundaryRecords = (group: BoundaryGroup): CompatibilityRecord[] =>
  RECORDS.filter((record) => group.statuses.some((status) => status === record.status));

/** Reader-facing names for feature areas; unknown areas fall back to their id. */
const AREA_NAMES: Readonly<Record<string, string>> = {
  formula: "Formulas",
  reference: "References",
  worksheet: "Worksheets",
  view: "Views",
  style: "Styles",
  validation: "Validation",
  clipboard: "Clipboard",
  "xlsx-import": "XLSX import",
  "xlsx-export": "XLSX export",
};
export const areaName = (area: string): string => AREA_NAMES[area] ?? area.replaceAll("-", " ");
