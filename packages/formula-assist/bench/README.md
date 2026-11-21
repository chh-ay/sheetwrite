# Formula assist benchmarks

Three tools measure the predictor against the bar set on #801.

## Replay: keystrokes saved and wrong suggestions

`replay-cli.ts` types formulas key by key into the workbook they came from, after removing their cell:

```sh
bun packages/formula-assist/bench/replay-cli.ts                 # every set but the held-out half
bun packages/formula-assist/bench/replay-cli.ts --set enron-dev --per-signal
```

The typist:

- presses Tab when the ghost text is a prefix of the rest of the formula;
- otherwise takes the leading words that agree with Ctrl+→, when that saves keys;
- takes the function list's entry with Tab when it is the function being typed, as in Excel;
- otherwise types the next character.

The ghost shown is the one the formula bar would show: core's `shownSuggestion` decides.

| Metric | Meaning |
| --- | --- |
| Saved | 1 − keys ÷ characters of the formulas |
| Wrong | Shown suggestions that are not a prefix of the rest of the formula, ÷ all shown. A ghost that stays while the user types through it counts once. |
| Coverage | Formulas where a suggestion was taken |
| Accepted | Suggestions taken, ÷ shown |
| Shown per 100 keys | How often a suggestion appears: the "in the way" measure |

The row "Excel floor" uses no signal: only the function list, as Excel has it. `--per-signal` adds each signal alone and the predictor without each one, which shows what each signal earns.

### Sets

| Set | What | Use |
| --- | --- | --- |
| `enron-dev` | 50 workbooks of the Enron sample (see `enron/README.md`) | Tune here |
| `enron-dev2` | 50 more, a burned held-out set | Tune here |
| `enron-heldout` | 50 workbooks neither development set nor a burned draw holds | Gate only, never read while tuning |
| `conformance` | Every formula case of the conformance corpus | Regression floor |
| `fixtures` | Every formula of the XLSX fixtures | Wrong-suggestion ceiling |

`bench/bar.ts` holds the bar. `test/replay.test.ts` checks it in CI.

## Calibration: the confidence of each candidate

`calibrate.ts` asks every signal for its candidates at every key and counts how often each kind (signal and reason) is right:

```sh
bun packages/formula-assist/bench/calibrate.ts --write   # enron-dev, enron-dev2, conformance and fixtures
```

The confidences in `src/calibration.ts` are the 95% lower bounds this prints, from the development sets only. `--write` writes that file.

## Latency: 4 ms per key on 100,000 rows

`latency.ts` opens 200 edits spread over a 100,000-row sheet and times opening each edit, every `suggest` call, and the formula bar's whole work per key (analysis, `suggest` and the ghost). Run it on a quiet core, away from builds:

```sh
bun packages/formula-assist/bench/latency.ts
```

It fails when the 95th percentile of either step reaches 4 ms. Report the two machines in separate tables and never compare them.
