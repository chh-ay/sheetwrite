#!/usr/bin/env bash
data=$1; key=${data%.data}
/home/vvin/learn/fa-tools/perf script -i "$data" --inline -F ip,sym 2>/dev/null > "$key.script"
python3 /home/vvin/learn/sheetwrite-wt/fa-audit/bench/native/phases.py "$key.script" --leaves 40 --unmatched 15 > "$key.phases"
rm -f "$key.script"
