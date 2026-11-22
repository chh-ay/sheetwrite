# Bundler fixtures

Run from the repository root:

```sh
bun run verify:bundlers
```

The orchestrator stages and packs publishable package contents, rewrites workspace dependency ranges, removes stale fixture installations, installs the fresh tarballs, and runs each real production build. Fixture manifests pin Vite 7.2.2, webpack 5.102.1, and Next.js 15.5.9. They name each Sheetwrite package as a version-free tarball in `.packed`, such as `sheetwrite-core.tgz`, and their locks hold only a placeholder for it. The orchestrator copies the tarballs to those names and fills the placeholders for the build, then restores the lock.

Verified contracts:

- Vite builds separate core, React, Vue, Svelte, Worker, lazy XLSX, and lazy charts entries; initializes core with `await initSheetwrite()`; and emits the co-located WASM asset.
- The charts view cache must be in the lazy charts chunk and in no core or adapter initial chunk.
- The add-ons page installs every add-on with static imports; the chart drawing code, the XLSX codec, the query engine and the history panel must stay out of its initial graph.
- The Sort panel must be a lazy chunk of its own in the Vite, webpack and Next.js builds: in no initial chunk and apart from the other side panels.
- Vite's emitted browser JavaScript is scanned and fails if it contains `node:fs`, `node:fs/promises`, or `fs/promises`.
- webpack 5 initializes with no explicit WASM URL and builds without `IgnorePlugin`.
- Next.js initializes from a client component and builds without `IgnorePlugin`.
- Browser fixtures continue to verify the worker asset recipes they exercise.
- Each build writes normalized, exact-once asset ownership to `test-results/bundlers/`; the size report derives initial, Worker, XLSX, CSS, and WASM transfer metrics from those manifests rather than chunk names.
- Node/Bun lifecycle tests verify zero-argument Node initialization and explicit-source retry behavior.

The package export boundary selects `loader-browser.mjs` for browser-aware bundlers and `loader-node.mjs` for Node. `@sheetwrite/wasm/wasm` remains available for explicit asset-control fixtures, but it is not the ordinary startup path.

Fixture installs are deliberately fresh. The local tarball file names never change, so reusing `node_modules` can make npm retain stale package contents and produce a false browser-graph failure.
