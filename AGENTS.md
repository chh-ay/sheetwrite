## Agent skills

### Issue tracker

Issues live in GitHub Issues on `chh-ay/sheetwrite` (via `gh`). See `docs/agents/issue-tracker.md`. Titles, labels and bodies follow `docs/agents/issue-format.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `triaged`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md`. Design decisions are tracked as GitHub issues labelled `proposal`, not in `docs/adr/`. See `docs/agents/domain.md`.

### Rust code

Before changing any Rust crate (`packages/wasm`, `packages/wasm/history`, `packages/queries/engine`), read `docs/contributing/rust.md`: the lint policy and the performance conventions. Check with `bun run lint:rust`.

### Tests

Do not add a unit test the change does not need.

- Add a unit test only when it fails before your change and passes after it.
- When you add that test, write it first and watch it fail. Then change the code until it passes.
- Do not add a test that already passes on the old code.
- Do not add a test that mocks the function you changed and then asserts on that mock.
- Do not add a snapshot or a large fixture for a one-line fix.
- A change that no unit test can reach (canvas paint, real keyboard or clipboard input, browser layout) needs steps in the PR body under "Test plan". Do not add a test file that cannot run the changed code.

Test layout: TypeScript unit tests are in `packages/*/test` and run with `bun run test:unit` (`bun test`, no Jest). Rust tests are `#[test]` functions in the crates. Browser tests are in `test/browser` and run with `bun run test:browser` (Playwright).

### Priorities

When goals conflict, choose in this order:

1. **Speed and maintainability.** Make it fast, and keep the code simple to read and change. Don't trade one for the other without a measurement that shows the gain.
2. **Package size.** Report it in every PR, but a measured speed gain or simpler code is worth more bytes.
3. **Test count.** Keep only the tests the test rule above requires.
