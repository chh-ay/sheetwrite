---
"@sheetwrite/bench": patch
---

`render-driver --scenario-set diagnostic --scenarios <subset>` runs a subset without the window-transfer pair. Before, the driver always added the pair's counterbalance and appended both rows, and the artifact parser then rejected the run. A subset with only one row of the pair is now refused up front. `--output` without `--markdown-output` writes the Markdown view to the output path with `.json` replaced by `.md`, or with `.md` appended when the path does not end in `.json`; before, such a path (for example `x.json.tmp`) got the Markdown written over the JSON.
