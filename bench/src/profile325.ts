import { collectAggregatedSample, formulaWorkloads, engine } from "./formula-bench.js";

const DEFAULT_PROFILE_MS = 500;
const WARMUP_FIXTURES = 3;
await engine.load();
for (const { id, size, factory } of formulaWorkloads(false)) {
  if (process.env.PROFILE_ONLY && !`${id}/${size}`.includes(process.env.PROFILE_ONLY)) continue;
  const marker = `profile_${id.replaceAll("-", "_")}_${size}`;
  let remainingWarmups = WARMUP_FIXTURES;
  const wrappedFactory = () => {
    const fixture = factory();
    // A real frame lets the sampler exclude setup, restore, checks, and disposal.
    const wrap = new Function("run", `return function ${marker}() { return run(); }`);
    const markedRun = wrap(fixture.run) as () => void;
    return {
      ...fixture,
      run: () => {
        if (remainingWarmups > 0) {
          remainingWarmups--;
          fixture.run();
        } else {
          markedRun();
        }
      },
    };
  };
  const sample = collectAggregatedSample(
    id,
    size,
    process.env.PROFILE_SAMPLING ? wrappedFactory : factory,
    {
      warmupFixtures: WARMUP_FIXTURES,
      minimumSampleDurationMs: Number(process.env.PROFILE_MS ?? DEFAULT_PROFILE_MS),
    },
  );
  process.stdout.write(`${JSON.stringify(sample)}\n`);
}
