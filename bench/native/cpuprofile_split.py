#!/usr/bin/env python3
"""Split a V8 `.cpuprofile` of formula-trace-replay.ts into JS glue, WASM and runtime time.

Usage: cpuprofile_split.py <profile.cpuprofile> [--top N]

Only samples under a `timed_run` frame count. Each sample's leaf frame is
classed as WASM (a `wasm-function` or a frame whose URL ends in `.wasm`),
engine JS glue (`sheetwrite_wasm.js`, the loader), harness JS, garbage
collection, or other runtime work. Sample time uses `timeDeltas`, so the
reported shares do not assume a fixed interval.
"""

import collections
import json
import sys


def main():
    path = sys.argv[1]
    top = int(sys.argv[sys.argv.index("--top") + 1]) if "--top" in sys.argv else 25
    with open(path) as handle:
        profile = json.load(handle)

    nodes = {node["id"]: node for node in profile["nodes"]}
    parent = {}
    for node in profile["nodes"]:
        for child in node.get("children", []):
            parent[child] = node["id"]

    def frames(node_id):
        while node_id is not None:
            yield nodes[node_id]["callFrame"]
            node_id = parent.get(node_id)

    def kind(frame):
        name = frame.get("functionName", "")
        url = frame.get("url", "")
        if url.endswith(".wasm") or "wasm-function" in name or url.startswith("wasm://"):
            return "wasm"
        if name == "(garbage collector)":
            return "gc"
        if "sheetwrite_wasm" in url or "loader" in url or "pkg/" in url:
            return "engine glue (JS)"
        if "formula-trace-replay" in url:
            return "harness (JS)"
        if name in ("(program)", "(idle)", "(root)"):
            return "runtime"
        return "other JS/builtins"

    timed = collections.Counter()
    leaves = collections.Counter()
    total_us = 0
    samples = profile["samples"]
    deltas = profile["timeDeltas"]

    for index, sample in enumerate(samples):
        # The delta after a sample is the time it stands for.
        weight = deltas[index + 1] if index + 1 < len(deltas) else 0
        stack = list(frames(sample))
        if not any(frame.get("functionName") == "timed_run" for frame in stack):
            continue
        leaf = stack[0]
        category = kind(leaf)
        timed[category] += weight
        leaves[(category, leaf.get("functionName") or "(anonymous)")] += weight
        total_us += weight

    count = sum(1 for _ in samples)
    print(f"timed_us\t{total_us}\tsamples_total\t{count}")
    for category, weight in timed.most_common():
        print(f"class\t{category}\t{weight / max(total_us, 1):.4f}")
    for (category, name), weight in leaves.most_common(top):
        print(f"leaf\t{category}\t{weight / max(total_us, 1):.4f}\t{name[:120]}")


if __name__ == "__main__":
    main()
