const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/u;

export function validateEngineVersions<Engine extends string>(
  value: unknown,
  engines: readonly Engine[],
): asserts value is Readonly<Record<Engine, string>> {
  if (value === null || typeof value !== "object") {
    throw new Error("engineVersions must record the measured engine versions");
  }
  const versions = value as Record<string, unknown>;
  for (const engine of engines) {
    const version = versions[engine];
    if (typeof version !== "string" || !SEMVER.test(version)) {
      throw new Error(`engineVersions.${engine} must be a non-empty semver string`);
    }
  }
}
