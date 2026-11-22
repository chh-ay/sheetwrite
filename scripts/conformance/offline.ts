import { runSheetwriteCase } from "./adapters/sheetwrite.js";
import { verifyCaptureArtifacts } from "./capture.js";
import { compareResults, compareReviewedObservation } from "./compare.js";
import { generateConformanceEvidence, readFormulaInventory } from "./generate.js";
import { validateCorpus } from "./schema.js";
import type { ConformanceCorpus, OfflineConformanceResult } from "./types.js";

export async function runOffline(
  corpus: ConformanceCorpus,
  paths: {
    inventory?: string;
    captures?: string;
  } = {},
): Promise<OfflineConformanceResult> {
  const [artifacts, inventory] = await Promise.all([
    verifyCaptureArtifacts(corpus, paths.captures),
    readFormulaInventory(paths.inventory),
  ]);
  const { manifest } = generateConformanceEvidence(inventory);
  const corpus_issues = [
    ...artifacts.issues,
    ...validateCorpus(corpus, manifest, inventory, artifacts.verified),
  ];
  if (corpus_issues.length > 0) throw new Error(corpus_issues.join("\n"));
  const local_canaries = corpus.cases.filter((entry) => entry.localCanary === true).length;

  const failures: string[] = [];
  const warnings: string[] = [];
  const unsupported: string[] = [];
  let checked = 0;
  let reviewed = 0;
  let deferred = 0;
  for (const entry of corpus.cases) {
    checked += 1;
    const actual = await runSheetwriteCase(entry);
    const local_differences = compareResults(entry.expected, actual);
    if (local_differences.length > 0) {
      failures.push(`${entry.id} sheetwrite: ${local_differences.join("; ")}`);
    }
    if (entry.unsupported) {
      unsupported.push(entry.id);
      warnings.push(`${entry.id}: explicitly unsupported; compatibility is not claimed`);
      continue;
    }
    const reviewed_observations = entry.observations.filter(
      (observation) => observation.status === "reviewed",
    );
    if (reviewed_observations.length === 0) {
      deferred += 1;
      warnings.push(`${entry.id}: no reviewed producer capture; compatibility is not claimed`);
    }
    for (const observation of reviewed_observations) {
      reviewed += 1;
      const differences = compareReviewedObservation(
        entry.expected,
        observation,
        entry.knownDivergence,
      );
      if (differences.length > 0) {
        failures.push(`${entry.id} ${observation.producer}: ${differences.join("; ")}`);
      }
    }
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
  return {
    status: deferred === 0 && unsupported.length === 0 ? "verified" : "blocked",
    checked,
    localCanaries: local_canaries,
    reviewed,
    deferred,
    warnings,
    unsupported,
  };
}
