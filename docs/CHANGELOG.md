# @sheetwrite/docs-start

## Unreleased

- Generate code-sample hovers with TypeScript 7.1 (beta) instead of TypeScript 5.9: one language server answers every sample, Vue samples go through the Vue content mapper, and svelte2tsx runs in a short-lived child process. The hover pass never runs `npm` or reaches the network, and nothing is cached between runs. The cold hover pass drops from about 22 s to about 1.7 s and peak memory from about 1.3 GB to about 450 MB (Linux).
- Keep the engine out of the script every page loads. The performance and interoperability showcases move to their own modules, and the router entry no longer imports `@sheetwrite/core`. The docs route loads its page index and the formula filter only where they're used. First-load JS drops 49–64% gzip on the landing page, the showcase hub, the docs overview, guides and formula family pages.
- Add "Try it" to runnable examples: the example runs in an editor and a live grid on the page, loaded only after the click, with inline errors and a reset. The first grid guide and five feature pages have runnable examples.
- Add "Edit on GitHub" and "Report a problem" to each docs page head, and a changelog RSS feed at `/changelog/rss.xml`.
- Keep browser smoke specs independent of built workspace packages by sharing pure engine workbook and collaboration/database seed modules with the showcases.
- Cut uncompressed page weight by 21–56% across the site (7–18% after Brotli): share one popover panel per distinct hovered symbol, serve Expressive Code styles once from the cached site stylesheet instead of inlining them on every page, keep landing snippets, the docs page index, and the capability inventory out of the bundle every page loads, and stop sending landing and showcase styles to documentation pages. Hidden landing code tabs load on intent.
- Deploy content-hashed assets and Pagefind shards with a one-year immutable cache; HTML and stable entry files still revalidate on each deployment.
- Make the landing hero and architecture illustrations seekable through keyboard-accessible numbered chapters, with replay-safe state and reduced-motion still frames. Add undo/redo, tile-fetch, recalculation, and host-save animation sequences.
- Rework the showcase gallery: separate Capabilities and Framework adapters sections, a fading blueprint background, aligned preview heights, and theme-aware preview contrast. Enrich landing feature illustrations and align architecture event details and reload glyphs.
- Replace the documentation layout with a task-focused home, grouped navigation, a dedicated reading panel, and redesigned API rows. Add explicit Home and Showcases links on desktop and mobile.
- Keep the overview free of the guide outline; retain the right rail on wide guide pages and the collapsible outline on mobile.
- Add a filter for large API indexes; start API members collapsed, preserve deep-link expansion, remove signature copy controls, and link source locations.
- Publish generated `/llms.txt` and `/llms-full.txt` endpoints with stale-output checks for AI-assisted development.
- Run the production Vite build under Node to avoid a Bun server-compilation crash.

## 0.0.2

### Patch Changes

- Updated dependencies [8457eca]
- Updated dependencies [dac694a]
- Updated dependencies [0e09ecc]
- Updated dependencies [41f6749]
- Updated dependencies
- Updated dependencies [41f6749]
- Updated dependencies [41f6749]
- Updated dependencies [41f6749]
- Updated dependencies [55b1f35]
- Updated dependencies [b225783]
- Updated dependencies [41f6749]
- Updated dependencies [ce1e404]
- Updated dependencies [41f6749]
  - @sheetwrite/core@0.4.0
  - @sheetwrite/xlsx@0.4.0
  - @sheetwrite/react@0.4.0
  - @sheetwrite/vue@0.4.0
  - @sheetwrite/svelte@0.4.0
  - @sheetwrite/wasm@0.4.0

## 0.0.1

### Patch Changes

- Updated dependencies [6ed7572]
- Updated dependencies [87fadb7]
  - @sheetwrite/core@0.2.0
  - @sheetwrite/wasm@0.2.0
  - @sheetwrite/xlsx@0.2.0
  - @sheetwrite/react@0.2.0
  - @sheetwrite/vue@0.2.0
  - @sheetwrite/svelte@0.2.0
