# Contributing

## Prerequisites

Use Bun 1.4.2, Rust 1.98.1 with `wasm32-unknown-unknown`, Node 26.9.0, and npm 11.19.1. Install the pinned Rust toolchain explicitly — rustup no longer auto-installs toolchain files for most commands — then install dependencies:

```sh
rustup toolchain install
bun install --frozen-lockfile
bun scripts/install-wasm-pack.ts
```

## Development checks

Run the narrowest relevant test while editing, then run the full repository gate before submitting:

```sh
bun test path/to/focused.test.ts
bun run verify:ci
```

Browser changes also require `bun run test:browser`; Rust changes require `cargo test` from `packages/wasm`.

`verify:ci` is the broadest local pre-submit gate, though not a complete mirror of the pipeline — CI additionally runs the full browser matrix, coverage, and the production docs build. Matched timing comparisons run deliberately through the local protocol in `bench/README.md`, not as a required CI job. `verify:ci` prints `::workspace-node::<id>` before each step; `bun scripts/workspace-tooling.ts verify-ci --dry-run` lists every id with the exact command it runs, so you can re-run just the step that failed. [`scripts/README.md`](scripts/README.md) explains how the repository's scripts are organised and which handful you actually need.

Generated API pages and `docs/src/generated/*` are owned by `bun run docs:generate`. Do not hand-edit generated files. Build output, benchmark evidence, and release artifacts remain uncommitted.

After the initial 0.1.0 release, user-visible package changes require a Changeset created with `bunx changeset`. Private workspaces are excluded.

Benchmark baselines and delivery-size budgets are reviewed evidence, not knobs for making a regression pass. Change a baseline only in a standalone, measured review that records the reason; never weaken correctness sentinels or coverage thresholds.

## Documentation deployment

CI builds the docs with the package outputs from the same run. It packages
`docs/dist/client` as `.vercel/output`, then runs browser tests against
`.vercel/output/static`. A successful push to `develop` deploys that exact output
to Vercel after Required CI passes. Pull requests and forks do not deploy.
Changes that skip the docs build also skip deployment.

Before merging this deployment setup, add these secrets to the GitHub
`Production` environment or the repository:

| Secret | Value |
|---|---|
| `VERCEL_TOKEN` | A Vercel token with access to the existing Sheetwrite project |
| `VERCEL_ORG_ID` | The `orgId` from the existing project's `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | The `projectId` from that same file |

Keep the existing Vercel project and domain. These IDs let the CLI select it on
a fresh runner without a local project link. Do not commit tokens or env files.
Missing secrets fail the deployment job, not the pull-request checks.

`vercel.json` disables automatic Git deployments. Source deployments fail with
a prebuilt-only message, so Vercel cannot install tools or rebuild the library.
Do not merge this setup before the secrets are ready: otherwise the live site
will stop receiving updates. After merging, check the first successful
`Deploy Production Docs` job and the live site.

To package an existing local docs build without rebuilding it:

```sh
bun run docs:prepare-deployment
DOCS_OUTPUT_DIR=.vercel/output/static bun run test:browser
```

The package step replaces only `.vercel/output`. It preserves the project link
and other `.vercel` files. IndexNow runs only after a successful production
deployment and reads the deployed sitemap; local builds and PR checks do not
send a notification.

See [SUPPORT.md](SUPPORT.md) for issue routing and [SECURITY.md](SECURITY.md) for private vulnerability reports.
