import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { repositorySourceUrl } from "../docs/src/lib/repository.js";
import {
  buildCompatibilityResults,
  type CompatibilityResults,
} from "../docs/src/showcases/compatibility-results.js";
import {
  COMPATIBILITY_FIXTURES,
  COMPATIBILITY_INVENTORY,
  type CompatibilityFixture,
  type CompatibilityRecord,
} from "../docs/src/showcases/compatibility.js";
import { compareReviewedObservation } from "./conformance/compare.js";
import { loadCorpus } from "./conformance/corpus.js";
import { generateConformanceEvidence, readFormulaInventory } from "./conformance/generate.js";
import { runOffline } from "./conformance/offline.js";
import { repositoryRoot } from "./docs-shared.js";
import { html } from "./evidence-format.js";

let compatibilityResultsPromise: Promise<CompatibilityResults> | undefined;

export function compatibilityResults(): Promise<CompatibilityResults> {
  compatibilityResultsPromise ??= (async () => {
    const testDirectory = join(repositoryRoot, "test/conformance");
    const paths = {
      inventory: join(testDirectory, "formula-contract.inventory.json"),
      captures: join(repositoryRoot, "scripts/conformance/captures"),
    };
    const [corpus, inventory, packageJson] = await Promise.all([
      loadCorpus(undefined, paths),
      readFormulaInventory(paths.inventory),
      readFile(join(repositoryRoot, "packages/core/package.json"), "utf8").then(
        (content) => JSON.parse(content) as { version: string },
      ),
    ]);
    const { manifest } = generateConformanceEvidence(inventory);
    const offline = await runOffline(corpus, paths);
    return buildCompatibilityResults({
      corpus,
      manifest,
      offline,
      libraryVersion: packageJson.version,
      compareObservation: compareReviewedObservation,
    });
  })();
  return compatibilityResultsPromise;
}

function compatibilityCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ").trim();
}

function compatibilitySource(source: string): string {
  return source.startsWith("https://")
    ? `[spec/source](${source})`
    : `[checked source file](${repositorySourceUrl(source)})`;
}

export function publicCompatibilitySource(source: string): string {
  return source.startsWith("https://") ? source : "/docs/reference/compatibility-results/#sources";
}

export function renderCompatibilityResults(
  records: readonly CompatibilityRecord[] = COMPATIBILITY_INVENTORY,
  fixtures: readonly CompatibilityFixture[] = COMPATIBILITY_FIXTURES,
): string {
  const lines = [
    "---",
    'title: "Detailed compatibility results"',
    'description: "Checked formula, workbook, clipboard, and XLSX examples with exact sources and limits."',
    "---",
    "",
    "This page is generated from checked examples and evidence records. It states only what each named result proves; it is not a percentage or a blanket Excel, Google Sheets, LibreOffice, or OpenFormula compatibility claim.",
    "",
    "Result labels distinguish **evaluated** formulas or structures, **preserved** source or metadata, deliberately **flattened** interchange, explicit **warning** boundaries, and **unsupported** behavior.",
    "",
    '<section class="compat-results" aria-label="Checked compatibility results">',
    ...records.flatMap((record) => {
      const evidence = `${record.fixtureIds.length} checked evidence ${record.fixtureIds.length === 1 ? "record" : "records"}`;
      return [
        '<details class="compat-result">',
        '<summary class="compat-result__summary">',
        `<span class="compat-result__title">${html(record.label)}</span>`,
        '<span class="compat-result__meta">',
        `<code>${html(record.area)}</code>`,
        `<code>${html(record.dialect)}</code>`,
        `<span data-status="${record.status}">${record.status}</span>`,
        "</span>",
        '<svg class="compat-result__fold" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>',
        "</summary>",
        '<div class="compat-result__body">',
        "<dl>",
        `<div><dt>Result</dt><dd>${html(record.resultMode)}</dd></div>`,
        `<div><dt>Import</dt><dd>${html(record.importBehavior)}</dd></div>`,
        `<div><dt>Export</dt><dd>${html(record.exportBehavior)}</dd></div>`,
        `<div><dt>Known boundary</dt><dd>${html(record.divergence)}</dd></div>`,
        `<div><dt>Evidence</dt><dd>${evidence}</dd></div>`,
        "</dl>",
        `<a href="/showcases/interoperability/?compatibility=${encodeURIComponent(record.id)}">Open the checked interactive result</a>`,
        "</div>",
        "</details>",
      ];
    }),
    "</section>",
    "",
    "## Warning boundaries",
    "",
    "| Feature | Warning code | Meaning |",
    "| --- | --- | --- |",
    ...records
      .filter((record) => record.warningCode !== null)
      .map(
        (record) =>
          `| ${compatibilityCell(record.label)} | \`${record.warningCode}\` | ${compatibilityCell(record.semantics)} |`,
      ),
    "",
    "<details>",
    "<summary>Technical evidence file details and checksums</summary>",
    "",
    '<div class="compat-evidence-files">',
    ...fixtures.flatMap((fixture) => [
      '<article class="compat-evidence-file">',
      "<header>",
      `<code>${html(fixture.id)}</code>`,
      `<span>${html(fixture.kind)}</span>`,
      "</header>",
      `<p>${html(`${fixture.producer} ${fixture.producerVersion}`)}</p>`,
      "<dl>",
      `<div><dt>Source</dt><dd>${html(fixture.provenance)}</dd></div>`,
      `<div><dt>SHA-256</dt><dd><code>${fixture.sha256 ? html(fixture.sha256) : "source-controlled test or manifest"}</code></dd></div>`,
      `<div><dt>Checked result</dt><dd>${html(fixture.expected.join("; "))}</dd></div>`,
      `<div><dt>Warnings</dt><dd>${html(fixture.expectedWarnings.join("; ") || "none")}</dd></div>`,
      "</dl>",
      "</article>",
    ]),
    "</div>",
    "",
    "</details>",
    "",
    "## Exact sources",
    "",
    ...records.map(
      (record) => `- ${compatibilityCell(record.label)}: ${compatibilitySource(record.source)}`,
    ),
    "",
  ];
  return `${lines.join("\n").trimEnd()}\n`;
}

export async function collectCompatibilityDigestIssues(
  root: string = repositoryRoot,
  fixtures: readonly CompatibilityFixture[] = COMPATIBILITY_FIXTURES,
): Promise<string[]> {
  const issues: string[] = [];
  for (const fixture of fixtures) {
    if (!fixture.sha256) continue;
    try {
      const bytes = await readFile(join(root, fixture.path));
      const actual = createHash("sha256").update(bytes).digest("hex");
      if (actual !== fixture.sha256) {
        issues.push(
          `compatibility fixture digest mismatch: ${fixture.id} expected=${fixture.sha256} actual=${actual}`,
        );
      }
    } catch {
      issues.push(`missing compatibility fixture for digest: ${fixture.path}`);
    }
  }
  return issues;
}
