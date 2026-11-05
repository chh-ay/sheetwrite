#!/usr/bin/env python3
"""Attribute `perf script --inline -F ip,sym` samples of formula-replay to engine phases.

Usage: phases.py <perf-script-output> [--unmatched N] [--leaves N]

Each sample's frames are read from the leaf outwards, inlined frames included.
The first frame that matches a phase rule names the sample's phase, so a
helper inherits the phase of the nearest engine function that called it.
Rules are ordered from specific (a range read inside an evaluation) to
general (the recalculation pass itself).
"""

import collections
import functools
import re
import sys

# (phase, pattern searched in the frame's function name). First match from the
# leaf wins, so put narrower functions before the ones that call them.
RULES = [
    ("parse", r"calc::parse|Parser>|Tokens>|tokenize|lex_|parse_formula|parse_reference|formula_tokens"),
    ("result write", r"store_formula_result|set_derived|write_result|store_spill|SpillChange|commit_spill"),
    ("range read", r"RangeReader|range_reader|read_range|for_each_range|range_values|collect_range|numeric_range|range_numbers|fold_range|typed_range|RangeSnapshot|criteria|Criteria"),
    ("cell read", r"literal_cell_value|cell_value|read_cell|value_at|resolve_cell|eval_cell_ref"),
    ("lookup", r"lookup|Lookup|xmatch|vlookup|match_"),
    ("source write", r"FormulaStore>"),
    ("evaluation", r"eval_ast|eval_func|operators::|eval_formula_body|eval_at\b|eval_at$|_family|eval::math|eval::text|eval::date|eval::statistics|eval::array|eval::financial|eval::analysis|FuncAccumulator"),
    ("dirty collection", r"collect_affected|DirtyWalk|select_readers|exact_readers|collect_matching_range_groups|mark_dirty|dirty_|DirtySeeds|GroupMarks"),
    ("dependency index", r"build_dep_index|ensure_index|DepIndex|ExactBand|ExactColumn|RangeGroup|RangeSheetIndex|RangeInterval|reads_of|ReadSet|update_dependencies|register_reads|DependencyDepthWalk|ComponentWalk|EdgeCursor"),
    ("pass ordering", r"ipnsort|sort::|order_formulas|topolog|depth"),
    ("pass state", r"FormulaBits|FormulaResults|FormulaWork|PassRegexes|RangeSums|EvalPass|evaluate_pass|eval_formula_id|SheetFormulas>::id|FormulaAddresses|next_address"),
    ("source write", r"set_formula|replace_cell_source|set_number|set_column_numbers|FormulaStore>|intern"),
    ("pass driver", r"recompute_formulas|recompute_at|recompute_sheet|recompute_with"),
]
ALLOCATOR = re.compile(r"^(malloc|cfree|free|realloc|calloc|_int_malloc|_int_free|_int_realloc|malloc_consolidate|unlink_chunk|__memmove|__memcpy|__memset)")
COMPILED = [(phase, re.compile(pattern)) for phase, pattern in RULES]
FRAME = re.compile(r"^\s*([0-9a-f]+)\s+(.*?)(?:\s+\(inlined\))?\s*$")


def samples(path):
    frames = []
    with open(path, errors="replace") as handle:
        for line in handle:
            if line.strip() == "":
                if frames:
                    yield frames
                frames = []
                continue
            match = FRAME.match(line)
            if match:
                frames.append(match.group(2))
    if frames:
        yield frames


@functools.lru_cache(maxsize=None)
def bare(name):
    """The frame's function path without generic arguments, so a type or
    closure named in a generic argument never decides the phase."""
    name = name.replace("sheetwrite_wasm::", "").replace("alloc::alloc::Global", "")
    for _ in range(6):
        stripped = re.sub(r"(?<=[A-Za-z0-9_}])<[^<>]*>", "", name)
        if stripped == name:
            break
        name = stripped
    return name


@functools.lru_cache(maxsize=None)
def frame_phase(frame):
    name = bare(frame)
    for phase, pattern in COMPILED:
        if pattern.search(name):
            return phase
    return None


def classify(frames):
    for frame in frames:
        phase = frame_phase(frame)
        if phase is not None:
            return phase, frame
    return "other", frames[0] if frames else "?"


def short(name, width=110):
    return bare(name)[:width]

def main():
    path = sys.argv[1]
    unmatched_rows = int(sys.argv[sys.argv.index("--unmatched") + 1]) if "--unmatched" in sys.argv else 10
    leaf_rows = int(sys.argv[sys.argv.index("--leaves") + 1]) if "--leaves" in sys.argv else 25

    phases = collections.Counter()
    leaves = collections.Counter()
    matched_frames = collections.Counter()
    unmatched = collections.Counter()
    allocator = collections.Counter()
    total = 0

    for frames in samples(path):
        total += 1
        phase, frame = classify(frames)
        phases[phase] += 1
        leaves[short(frames[0])] += 1
        matched_frames[(phase, short(frame))] += 1
        if ALLOCATOR.match(frames[0]):
            allocator[phase] += 1
        if phase == "other":
            unmatched[" <- ".join(short(f, 40) for f in frames[:6])] += 1

    print(f"samples\t{total}")
    for phase, count in phases.most_common():
        print(f"phase\t{phase}\t{count / total:.4f}\tallocator-leaf\t{allocator[phase] / total:.4f}")
    for (phase, frame), count in matched_frames.most_common(leaf_rows):
        print(f"via\t{phase}\t{count / total:.4f}\t{frame}")
    for frame, count in leaves.most_common(leaf_rows):
        print(f"leaf\t{count / total:.4f}\t{frame}")
    for stack, count in unmatched.most_common(unmatched_rows):
        print(f"other\t{count / total:.4f}\t{stack}")


if __name__ == "__main__":
    main()
