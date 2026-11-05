import { verifyCaptureArtifacts } from "./capture.js";
import { generateConformanceEvidence, INVENTORY_PATH, readFormulaInventory } from "./generate.js";
import { canonicalJson, isObject } from "./normalize.js";
import { readCorpusJson, SHA256_PATTERN, validateCorpus } from "./schema.js";
import type { ConformanceCorpus } from "./types.js";

function declaredArtifactHashes(value: unknown): Set<string> {
  const hashes = new Set<string>();
  if (!isObject(value) || !Array.isArray(value.cases)) return hashes;
  for (const entry of value.cases) {
    if (!isObject(entry) || !Array.isArray(entry.observations)) continue;
    for (const observation of entry.observations) {
      if (
        isObject(observation) &&
        observation.status === "reviewed" &&
        SHA256_PATTERN.test(String(observation.artifactSha256 ?? ""))
      ) {
        hashes.add(String(observation.artifactSha256));
      }
    }
  }
  return hashes;
}

/**
 * The compatibility test set, validated with its captured observations. It is
 * generated from the inventory; `path` instead reads a corpus file, which must
 * equal the generated one.
 */
export async function loadCorpus(
  path?: string,
  paths: {
    inventory?: string;
    captures?: string;
  } = {},
): Promise<ConformanceCorpus> {
  const inventory = await readFormulaInventory(paths.inventory ?? INVENTORY_PATH);
  const generated = generateConformanceEvidence(inventory);
  const manifest = generated.manifest;
  // Canonical key order, as a corpus file has: published results list case
  // fields in this order.
  const value: unknown =
    path === undefined ? JSON.parse(canonicalJson(generated.corpus)) : await readCorpusJson(path);
  const structuralIssues = validateCorpus(
    value,
    manifest,
    inventory,
    declaredArtifactHashes(value),
  );
  if (structuralIssues.length > 0) throw new Error(structuralIssues.join("\n"));
  const corpus = value as ConformanceCorpus;
  const artifacts = await verifyCaptureArtifacts(corpus, paths.captures);
  const issues = [
    ...artifacts.issues,
    ...validateCorpus(corpus, manifest, inventory, artifacts.verified),
  ];
  if (issues.length > 0) throw new Error(issues.join("\n"));
  return corpus;
}
