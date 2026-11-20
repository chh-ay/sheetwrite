# @sheetwrite/docs-start

## Unreleased

- An API page whose declaration is its main content (a function, a constant, a type with no members) shows it right under the summary, before the examples and parameters, instead of last. "Referenced by" lists only the public exports whose declarations name the symbol; the packages that depend on its package, the same on every page of that package, are gone.
- The React, Vue and Svelte workbench pages (`/react/`, `/vue/`, `/svelte/`) carry their content in the static HTML. Each workbench renders in the browser only, so with JavaScript off a page held only its intro and proof cards (1,376 to 1,631 characters of main text). A section beside the live example now describes each panel of the workbench, with its heading, what it does, its controls, and its links, and "The code behind it" shows the adapter code with the APIs it calls, as on the other showcase pages. `docs:check-site` checks the text, headings, links and code of the three pages in their static HTML.
- The three workbench pages no longer move when the workbench mounts. Its stage kept a 44rem floor, so the mounted workbench (up to 101rem tall on a phone) pushed the rest of the page down: up to 0.44 CLS on `/vue/` when the mount landed with the content below the stage in view. The stage now reserves the height each workbench takes once mounted, measured for each band of widths. The React sync label keeps its width when it changes, the Svelte colleague keeps a muted pill while away, and the Svelte shell bar keeps the height of its name box and formula bar, so neither header moves when the workbench settles.
- Every feature section and the grid, formatting, analysis, data and formula feature pages that showed only a screenshot have a blueprint figure: what a right-click does, which clipboard format a paste uses, a DOM renderer's hooks, what a fill drag writes, how search steps through matches, the five selection shapes, the status bar totals, the shared command model, font and number-format fields, the cells a line chart reads, a pivot's output, what checks a write, a GROUPBY spill and what formula help shows.
- The opening screenshot of each feature section has tablet and phone crops of the same view (`<name>-tablet` and `<name>-phone`, the new `sectionTablet` and `sectionPhone` sizes), so its text stays readable at 834 and 390 px. A placed screenshot takes them as `narrow`.
- The Charts page opens with a short lead and a figure of the line chart its example draws, then the install step, then the example. The column chart screenshot moves to Insert and edit in the grid.
- The worker rendering and collaboration pages open in plain words, without repository paths or commands.
- The docs home cards and section headers, the showcase hub cards, and the database and collaboration proof cards are blueprint pictures: boxes and connectors on the dotted canvas (`BlueprintCard` and `cardLayout`), with text that reaches 4.5:1 in both themes. The old card art for them, and `Panel` and `FRAMEWORK_CARD_HEIGHT`, which only it used, are gone.
- The 0.7.0 release notes show performance as lanes against 0.6.1, one row per workload with each machine's result in the words of the text, from a new `perf-lanes` fence. They open their highlights with a blueprint summary, and the highlight cards show each panel cropped from its capture (`card-*` shots, the new `highlight` size) instead of the whole app shrunk to a sliver.
- The 0.7.0 upgrade guide no longer says how its code is built.
- The API index says in one line what each package is for, and drops the build-system words. The performance overview says what its pages show, and its results heading names 0.7.0.
- `docs:check` also rejects a bare issue number such as "#228" in a docs page or a doc comment, not only tracker links and "PR #N".
- Keep every 0.6.1 URL working for readers and search engines. The 21 API pages of exports that 0.7.0 removed redirect (308) to the page of what replaces each one, and a page's address without its trailing slash redirects to the address with it instead of serving a second copy. Each sitemap `<lastmod>` is the date of the last commit to the page's sources, not the build date. `bun run docs:check-site`, run in CI after the docs build and before each deployment, reads the packaged site through its own routes and fails on an indexable page without a title, description, self-referencing canonical or Open Graph tags, a shared title or description, a BreadcrumbList without Google's required fields or with a crumb that is not a live page, a broken internal link, a sitemap entry that is noindex, redirected or missing, sitemap dates that are all one build date, a 0.6.1 URL (`docs/published-urls.txt`) that no longer opens a page, or main content that is missing from the static HTML.
- The API reference shows `@throws`: a function page lists each under "Throws" (the error and when it is thrown), and a member card shows its parameters, return value and throws as labelled lines instead of raw `@param` and `@returns` text. The API manifest kept no `@throws` before.
- Code-sample hover popovers show a symbol's summary, with its parameters, return value and throws as tag lines; the doc text from the API manifest no longer shows raw `@param` and `@returns` inline.
- The API reference shows `InitOutput` (`@sheetwrite/wasm`, `@sheetwrite/formulas`) as one card with no member list: its members are the raw module exports wasm-bindgen generates for the loader, not API to call. `docs:generate` no longer counts them as undescribed. The `free()` method wasm-bindgen adds to each engine class, which has no doc source, gets one shared description.
- A class constructor's doc comment shows on its card in the API reference; it was read under the name `new` and lost, so `docs:generate` also counted documented constructors as undescribed.
- The API reference shows `@param` and `@returns` text on the Parameters and Returns cards. The API manifest kept only `@example` and `@see` tags, so every described parameter and return value showed its type's summary or nothing, and `docs:generate` counted it as undescribed.
- Functions that return `void` or `Promise<void>` have no Returns card in the API reference, and the generator no longer counts their return value as missing a description.
- `docs:generate` reports, per package, how many public members, parameters and return values the API reference shows without a description (no doc comment, no `@param`/`@returns`, and no documented type to fall back on).
- The landing no longer shifts while it loads on a slow link: Chromium painted a partly parsed page, and the rest of the header or the hero's buttons and install box arrived a frame later. A render-blocking `<link rel="expect">` holds the first paint until the hero's picture starts (Chromium only; other browsers ignore it).
- Code renders in the system's own code font until JetBrains Mono is cached, instead of Courier New: SF Mono (when installed) or Menlo on macOS, Consolas on Windows, DejaVu Sans Mono or Liberation Mono on Linux, with Courier New last. Each local font has its own fallback face scaled to JetBrains Mono's advance and line metrics, so code blocks and diagram labels keep their layout when the web font is used on a later visit.
- Code hover panels have room for one-line signatures: up to 44rem wide (still inside the viewport), with right padding kept when a long signature scrolls. A panel no longer covers its code block's tabs or title bar, and the open symbol's tint reaches a little past its glyphs without moving any text.
- Showcase pages list the APIs beside their code as rows: each name links to its API reference and carries the first sentence of its docs, and pointing at or focusing a row tints the code lines that use it (CSS only, no added script). The panel's label, "APIs in this example", is set in the body font; the panel's top lines up with the code block and it stays in view beside long code (the showcase page no longer clips with `overflow: hidden`, which also lets the site header stick there).
- Redesign the generated API reference as signature cards. Members are grouped into Properties, Methods and Events; each member is a card whose header is its highlighted declaration (wrapping, with optional and read-only flags) over its documentation, all visible without a click. Parameters and return values use the same cards. Long member lists open with a row of member links instead of the collapsed "Jump to a member" index, and the member count badge is gone.
- The performance showcase loads in the dev server on macOS again. `PerformanceStage.tsx` imported both `./flight.js` and `./Flight.js`, and on a case-insensitive disk `Flight.js` resolved to `flight.ts`, so the flight controls were undefined ("Comp is not a function"). The flight component file is now `FlightPanel.tsx`, and `bun run lint` fails when two tracked paths, or two modules in one folder once their extensions are dropped, differ only by case.
- Phones: the site header's brand and buttons, the landing's links, buttons, code tabs, footer links and number switches, the release strip's links and the content tabs take at least 44 × 44 px. Terminal blocks fit a phone's column (the 44 px tabs replace the gaps, and Copy wraps rather than overflow). The sidebar's column keeps its surface the full page height, and long inline code breaks instead of widening the page.
- The site header shares the page frame's edges at every width: the landing's 80rem column, the 92rem frame elsewhere, and on docs pages the reading column (its outline included). A page with another frame sets `--sw-frame-max` on its root. Between 64rem and 88rem the docs bar keeps search as its icon so it fits the narrow reading column. The 404 message starts on the frame's left edge.
- Show the whole dashboard in the 0.7.0 release hero: the capture is cropped to the dashboard's items, so the chart is no longer cut at the $600k gridline. The Dashboards highlight card shows its own capture, the PivotChart and pivot filtered to one region, instead of repeating the hero.
- Give every control on phones a touch target of at least 44 × 44 px: the docs bar's search, theme and menu buttons, page actions, Try it, code and terminal copy buttons, terminal tabs, the outline and article disclosures, formula table rows, the formula and symbol filter fields, and the footer links. Small buttons keep their look and get an invisible target around them; fields and rows grow. "Referenced by" chips on API symbol pages start under their label.
- Drop Tailwind. No page used a Tailwind utility, so the site's own reset (`styles/reset.css`, only the preflight rules a page needs) replaces it: the first stylesheet shrinks from 20.3 to 11.4 KB (4.7 to 2.7 KB Brotli), and every page type renders pixel for pixel as before at 1440, 834 and 390 px in both themes.
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
- The landing footer links the API reference under Explore, so every API page is at most three links from the home page (82 were four).

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
