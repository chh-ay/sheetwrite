import { mkdir, open, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { canonicalJson, isNonemptyString, isObject, sha256Bytes } from "./normalize.js";
import { scanSecrets, validateResult } from "./schema.js";
import type { CaptureArtifact, ConformanceCorpus, ConformanceObservation } from "./types.js";

const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;
const CAPTURE_DIRECTORY = "scripts/conformance/captures";

async function read_bounded_file(path: string, limit: number): Promise<Uint8Array> {
  const handle = await open(path, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new TypeError(`Capture artifact is not a regular file: ${path}`);
    if (info.size > limit) throw new RangeError(`Capture artifact exceeds ${limit} bytes: ${path}`);
    return new Uint8Array(await handle.readFile());
  } finally {
    await handle.close();
  }
}

function validate_capture_artifact(value: unknown, path: string): string[] {
  const issues: string[] = [];
  if (!isObject(value)) return [`${path}: expected object`];
  if (value.protocol !== 1) issues.push(`${path}.protocol: expected 1`);
  if (!isNonemptyString(value.producer)) issues.push(`${path}.producer: required`);
  if (!isNonemptyString(value.producerVersion)) issues.push(`${path}.producerVersion: required`);
  if (!isNonemptyString(value.capturedAt) || Number.isNaN(Date.parse(value.capturedAt))) {
    issues.push(`${path}.capturedAt: invalid timestamp`);
  }
  if (!Array.isArray(value.observations)) {
    issues.push(`${path}.observations: expected array`);
  } else {
    const ids = new Set<string>();
    value.observations.forEach((observation, index) => {
      const observation_path = `${path}.observations[${index}]`;
      if (!isObject(observation)) {
        issues.push(`${observation_path}: expected object`);
        return;
      }
      if (!isNonemptyString(observation.caseId))
        issues.push(`${observation_path}.caseId: required`);
      else if (ids.has(observation.caseId)) issues.push(`${observation_path}.caseId: duplicate`);
      else ids.add(observation.caseId);
      validateResult(observation.result, `${observation_path}.result`, issues);
    });
  }
  scanSecrets(value, path, issues);
  return issues;
}

function binds_observation(
  artifact: CaptureArtifact,
  case_id: string,
  observation: ConformanceObservation,
): boolean {
  if (
    artifact.producer !== observation.producer ||
    artifact.producerVersion !== observation.producerVersion ||
    artifact.capturedAt !== observation.capturedAt
  ) {
    return false;
  }
  const captured = artifact.observations.find((candidate) => candidate.caseId === case_id);
  return (
    captured !== undefined && canonicalJson(captured.result) === canonicalJson(observation.result)
  );
}

export async function verifyCaptureArtifacts(
  corpus: ConformanceCorpus,
  directory = CAPTURE_DIRECTORY,
): Promise<{ verified: Set<string>; issues: string[] }> {
  const verified = new Set<string>();
  const issues: string[] = [];
  const reviewed_by_hash = new Map<
    string,
    Array<{ caseId: string; observation: ConformanceObservation }>
  >();
  for (const entry of corpus.cases) {
    for (const observation of entry.observations) {
      if (observation.status !== "reviewed" || !observation.artifactSha256) continue;
      const bound = reviewed_by_hash.get(observation.artifactSha256) ?? [];
      bound.push({ caseId: entry.id, observation });
      reviewed_by_hash.set(observation.artifactSha256, bound);
    }
  }
  for (const [hash, claims] of reviewed_by_hash) {
    const path = resolve(directory, `${hash}.json`);
    let bytes: Uint8Array;
    try {
      bytes = await read_bounded_file(path, MAX_CAPTURE_BYTES);
    } catch (error) {
      issues.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const actual_hash = sha256Bytes(bytes);
    if (actual_hash !== hash) {
      issues.push(`${path}: filename hash ${hash} does not match artifact bytes ${actual_hash}`);
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    } catch (error) {
      issues.push(
        `${path}: invalid UTF-8 JSON (${error instanceof Error ? error.message : String(error)})`,
      );
      continue;
    }
    const artifact_issues = validate_capture_artifact(value, path);
    if (artifact_issues.length > 0) {
      issues.push(...artifact_issues);
      continue;
    }
    const artifact = value as CaptureArtifact;
    let fully_bound = true;
    for (const claim of claims) {
      if (!binds_observation(artifact, claim.caseId, claim.observation)) {
        fully_bound = false;
        issues.push(
          `${path}: does not bind reviewed observation ${claim.caseId}/${claim.observation.producer}`,
        );
      }
    }
    if (fully_bound) verified.add(hash);
  }
  return { verified, issues };
}

function artifact_path(producer: string): string {
  return resolve(
    "test-results/conformance",
    `${producer}-${new Date().toISOString().replaceAll(":", "-")}.json`,
  );
}

export async function persistCapture(artifact: CaptureArtifact): Promise<string> {
  const path = artifact_path(artifact.producer);
  await mkdir(dirname(path), { recursive: true });
  const bytes = new TextEncoder().encode(`${canonicalJson(artifact)}\n`);
  if (bytes.byteLength > MAX_CAPTURE_BYTES) {
    throw new RangeError(`Conformance capture exceeds ${MAX_CAPTURE_BYTES} bytes`);
  }
  await writeFile(path, bytes, { flag: "wx" });
  return `${path} sha256=${sha256Bytes(bytes)}`;
}

export async function readBoundedResponse(
  response: Response,
  limit = MAX_CAPTURE_BYTES,
): Promise<Uint8Array> {
  const raw_length = response.headers.get("content-length");
  if (raw_length !== null) {
    const length = Number(raw_length);
    if (!Number.isSafeInteger(length) || length < 0 || length > limit) {
      await response.body?.cancel();
      throw new RangeError(`Oracle response Content-Length exceeds ${limit} bytes`);
    }
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) throw new RangeError(`Oracle response exceeds ${limit} bytes`);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
