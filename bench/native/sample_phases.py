#!/usr/bin/env python3
"""Attribute a macOS `sample` call graph of formula-replay to engine phases.

Usage: sample_phases.py <sample-output.txt>

`/usr/bin/sample` reports function frames only (no inlined frames), so this
is the coarser macOS counterpart of `phases.py` on Linux `perf` data. It uses
the same phase rules: each tree node's self samples go to the phase of the
nearest frame, from the node towards the root, that a rule matches.
"""

import collections
import re
import sys

from phases import ALLOCATOR, frame_phase

LINE = re.compile(r"^(?P<indent>[ +!:|]*)(?P<count>\d+) (?P<name>.*?)(?:  \(in [^)]*\).*)?$")


def main():
    nodes = []
    in_graph = False
    with open(sys.argv[1], errors="replace") as handle:
        for line in handle:
            if line.startswith("Call graph:"):
                in_graph = True
                continue
            if in_graph and line.strip() == "":
                break
            if not in_graph:
                continue
            match = LINE.match(line.rstrip("\n"))
            if match:
                name = re.sub(r"::h[0-9a-f]{16}$", "", match.group("name").strip())
                nodes.append((len(match.group("indent")), int(match.group("count")), name))

    phases = collections.Counter()
    allocator = collections.Counter()
    total = 0
    stack = []
    for index, (depth, count, name) in enumerate(nodes):
        while stack and stack[-1][0] >= depth:
            stack.pop()
        stack.append((depth, name))
        # Self samples: this node's count minus its direct children's counts.
        # Direct children are the following deeper lines at the first child's
        # depth, up to the next line at or above this node's depth.
        children = 0
        child_depth = None
        for later_depth, later_count, _ in nodes[index + 1 :]:
            if later_depth <= depth:
                break
            if child_depth is None:
                child_depth = later_depth
            if later_depth == child_depth:
                children += later_count
        own = count - children
        if own <= 0:
            continue
        phase = "other"
        for _, frame in reversed(stack):
            found = frame_phase(frame)
            if found is not None:
                phase = found
                break
        if any(frame.endswith("formula_replay::main") or "formula_replay" in frame for _, frame in stack):
            phases[phase] += own
            total += own
            if ALLOCATOR.match(name) or "malloc" in name or name.startswith("_free"):
                allocator[phase] += own

    print(f"samples\t{total}")
    for phase, count in phases.most_common():
        print(f"phase\t{phase}\t{count / max(total, 1):.4f}\tallocator-leaf\t{allocator[phase] / max(total, 1):.4f}")


if __name__ == "__main__":
    main()
