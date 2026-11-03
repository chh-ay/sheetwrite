import { readFileSync, writeFileSync } from "node:fs";

type ProfileNode = { id: number; callFrame: { functionName: string; url?: string }; children?: number[]; hitCount?: number };
type CpuProfile = { nodes: ProfileNode[]; samples: number[]; timeDeltas: number[] };
const profilePath = process.argv[2];
if (!profilePath) throw new Error("Pass a CPU profile path");
const profile = JSON.parse(readFileSync(profilePath, "utf8")) as CpuProfile;
const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
const parents = new Map<number, number>();
for (const node of profile.nodes) for (const child of node.children ?? []) parents.set(child, node.id);
const rows = new Map<string, { samples: number; micros: number; leaves: Record<string, number> }>();
for (const [index, sample] of profile.samples.entries()) {
  const stack: string[] = [];
  let cursor: number | undefined = sample;
  while (cursor !== undefined) {
    stack.push(nodes.get(cursor)?.callFrame.functionName ?? "unknown");
    cursor = parents.get(cursor);
  }
  const marker = stack.find((name) => name.startsWith("profile_"));
  if (!marker) continue;
  const row = rows.get(marker) ?? { samples: 0, micros: 0, leaves: {} };
  row.samples++;
  row.micros += profile.timeDeltas[index] ?? 0;
  const leaf = stack[0] ?? "unknown";
  row.leaves[leaf] = (row.leaves[leaf] ?? 0) + 1;
  rows.set(marker, row);
}
const result = { totalSamples: profile.samples.length, rows: Object.fromEntries(rows), names: [...new Set(profile.nodes.map((node) => node.callFrame.functionName))] };
writeFileSync(`${profilePath}.summary.json`, JSON.stringify(result, null, 2));
process.stdout.write(`${JSON.stringify(result)}\n`);
