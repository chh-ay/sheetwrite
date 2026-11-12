# Rust code

These rules cover the three Rust crates: the engine (`packages/wasm`), the
version-history kernel (`packages/wasm/history`) and the query steps
(`packages/queries/engine`). They all compile to WebAssembly and run on one
thread inside a page or a Node process. The engine is the reason people pick
Sheetwrite, so speed, code size and predictable failure come before
convenience. The decision behind them is on #325.

## Checks

```bash
bun run lint:rust                    # rustfmt, then Clippy against the baseline
bun scripts/rust-lint.ts --report    # warning counts per lint and crate, as a table
bun scripts/rust-lint.ts --update    # record lower counts after a fix
bun scripts/check-engine-exports.ts  # after build:packages: callers of generated bindings
```

- **One lint set.** Each crate's `Cargo.toml` ends with the same `[lints]`
  tables; `bun scripts/rust-lint.ts` fails when they differ. Change all three
  together. The repo root holds the one `clippy.toml` and `rustfmt.toml` that
  all three crates use.
- **Every build is linted.** Clippy runs on the native build with tests and
  on the shipped WASM library, with and without the `analysis` feature.
- **Counts can only go down.** Lints that still have violations are set to
  `warn` while they are fixed. `scripts/rust-lint-baseline.json` holds their
  count per crate; the check fails when a count changes. A new warning fails
  CI like an error. A fix that removes warnings records the lower count with
  `--update` in the same change.
- **Deny once clean.** When a lint reaches zero in all three crates, set it to
  `deny` in the three tables. `correctness` and `perf` are denied already.
- **Spelling and dependencies.** The same check runs `typos` over the crate
  sources (`typos.toml` lists the Excel function names it would flag) and
  `cargo deny` for the licenses, bans and sources of every dependency
  (`deny.toml`). `bun scripts/install-rust-checks.ts` installs both at the
  versions CI uses.

The existing Type Checks & Generated Docs job checks engine exports. Every
exported Rust function and method names its JavaScript binding with an
explicit camelCase `js_name`; constructors are the exception. The check also
resolves the built default, full, history and query declarations against
executable sources in `packages` and `test`; generated output and type-only
declarations do not count. Remove an uncalled export unless it is public API
on purpose. In that case, add `/// @enginePublic <reason>` to its Rust docs,
so the generated declaration carries the reason. A bare marker does not pass.
Run with `--report` to list the callers and public reasons.

Result buffers cross the boundary once. Expose a buffer through a `take*`
method that moves it out (`std::mem::take`), not through a getter that clones
it on every read. Review enforces this rule; a cloning getter is not reliably
distinguishable from a small fixed result in a source check.



## Lint policy

What the lint set asks for, and how to satisfy it here.

- **No `unwrap`, `expect` or `panic!` outside tests.** A panic in WASM kills
  the module and loses the workbook state in it. Return a `Result` or a
  `FormulaError`, or write the code so the failure can't happen: `let ... else`
  with an early return, `get(..)` instead of indexing when the index isn't
  proven, iterators instead of index loops. Tests may unwrap.
- **`unsafe` is denied.** A site that stays needs a measured reason: the safe
  version was slower on the formula gate or in instruction counts, on Linux
  and on the Mac. It carries a narrow `#[allow(unsafe_code, reason = "...")]`
  on the smallest item possible and a `// SAFETY:` comment that proves the
  invariant, like `payload_unchecked` in `cells.rs`.
- **Every `allow` has a reason.** `#[allow(lint, reason = "...")]`, on the
  item, never on a whole module. When the reason is speed or code size, say
  what was measured.
- **No `std` `HashMap`, `HashSet` or `LinkedList`.** Use `FxHashMap` and
  `FxHashSet` from `rustc-hash` where a hash map is justified. Keys that are
  dense indices (rows, pool ids, formula slots) go in a `Vec` or a bitset
  instead, like `PoolIdStamps` in `query.rs`.
- **No `Mutex` or `RwLock`.** WASM has one thread; use `Cell` or `RefCell`.
- **No `print!`, `println!`, `eprint!`, `eprintln!` or `dbg!`.** The engine
  reports through return values that the TypeScript side turns into errors.
- **Handle the empty case where it shows.** Prefer `if let`, `let ... else`,
  `?` or `unwrap_or_default`. Use `unwrap_or` only when the fallback is the
  right value for that case, and say why in a comment when it is not obvious.
  `clippy::or_fun_call` catches fallbacks that are computed eagerly.
- **List enum arms.** A `_ =>` arm on one of our enums hides the new variant
  that should have been handled. Name the variants, even when several share a
  body: `Value::Number(_) | Value::Bool(_) | Value::Blank => ...`.
- **No shadowing that reuses a value.** `let range = range.clamp(..)` hides the
  unclamped value from the next reader; give the new value its own name.
- **Document what is shared.** Every item visible outside its module has a doc
  comment that says what it is for and what it expects.
- **Short functions, few arguments.** At most 75 lines, five arguments and a
  cognitive complexity of 15. Group arguments that travel together into a
  struct (`EvalPass` is one). For a hot function, splitting can change what
  LLVM and wasm-opt inline and grow the binary; if a split costs speed or
  size, keep the function whole with
  `#[allow(clippy::too_many_lines, reason = "...")]` and the measurement.
- **Small values by value, large ones by reference.** Clippy warns when a
  `Copy` type over 32 bytes is passed by value, a type over 128 bytes is
  moved, or a stack frame or array grows past its limit.

## Performance conventions

Every change to code on an evaluation, load or edit path follows these. The
size budget is +4 KB Brotli per engine per pull request, and no WASM function
may exceed 75,000 bytes (JavaScriptCore stops optimizing functions near
100,000).

- **Inline check, cold body.** Keep the common case a short test and move the
  rest to a separate function marked `#[cold]` and `#[inline(never)]`.
  `FormulaBits::insert` in `formula_slots.rs` grows its storage in `grow_to`,
  and `eval_volatile_family` in `eval/mod.rs` keeps `TODAY` and `RAND` out of
  the main evaluator.
- **Keep the `*_family` handlers out of line.** `eval_func` sends each group
  of functions to a `*_family` function marked `#[inline(never)]`, and the
  release build passes `--no-inline=*_family` to wasm-opt. This keeps
  `eval_ast` small enough for JavaScriptCore's optimizing tier. Don't inline
  them, and give a new group of functions its own family.
- **Nothing is formatted before the error branch.** No `format!`,
  `to_string` or message building on the success path. Build messages inside
  the cold function, or return a `FormulaError` and let the caller describe
  it.
- **Small results.** A `Result` or enum is as large as its largest variant.
  Box a rare large error or variant so the common case stays small.
- **Bound recursion with a counter.** Tree walks take a `depth` argument and
  return an error past the limit, as the evaluator does with
  `FORMULA_RECURSION_LIMIT`.
- **Reuse buffers.** Keep scratch `Vec`s in the pass or the store and
  `clear()` them, instead of allocating one per cell or per row.
- **No owning fields in hot nodes.** A `String`, `Vec` or `Rc` inside a tree
  node is an allocation and a pointer to chase on every visit. Prefer ids
  into a pool or a slice of the parent's storage. Changing the layout of a
  hot type is a design change: measure, prototype and post a note on #325
  first.
- **Kind and wrapper, rare large variants boxed.** When one variant is much
  larger than the others, box it so it doesn't widen every value.
- **Pin the size of hot types.** Put a compile-time assertion next to the
  definition of every hot type (`Value`, `Ast`, `FormulaEntry`, the per-cell
  slots of paged storage), like the one on `FormulaSlot`:

  ```rust
  const _: () = assert!(std::mem::size_of::<FormulaSlot>() == std::mem::size_of::<Option<FormulaEntry>>());
  ```

  A pull request that changes one of these sizes says why and shows the gate.
- **`u32` index types with a niche.** Give each kind of id (formulas, sheets,
  pool strings) its own `u32` type that leaves one value unused, so
  `Option<Id>` stays four bytes and ids of different kinds cannot be mixed up.
- **Inline-capacity lists from measurements.** Choose the inline size of a
  small list from measured lengths and write them in a comment (for example
  "p90: 2 arguments").
- **`dyn` only on cold paths.** Hot code takes generics or `impl Fn`; trait
  objects are for callbacks that run rarely, where code size matters more.
- **Build searchers once.** Compile a pattern (`regex-lite`, wildcard
  matchers) once per range or per formula, not once per cell.

## Measuring

A change that touches evaluation passes the formula gate on Linux and on the
Mac, with both engines: two A/B rounds and one A/A round of seven pairs per
row (see [CONTRIBUTING.md](../../CONTRIBUTING.md)).
The pull request lists the gate results, the Brotli size of each engine and
the largest function sizes. Changes to `unsafe` or to the layout of a hot type
also report native instruction counts on Linux (the Mac has no counter).

A change that should not alter generated code (renames, types, docs,
attributes, visibility) can skip the gate when it is shown to be
code-neutral. Build both engines before and after (`bun run build` in
`packages/wasm` and in `packages/formulas`), then compare each packaged
`.wasm`:

```bash
bun scripts/wasm-compare.ts <before>/sheetwrite_wasm_bg.wasm <after>/sheetwrite_wasm_bg.wasm
```

It passes when the code section is byte-identical and the data section keeps
its length: the only data bytes that may differ are the line and column
numbers of panic locations, which move with source lines. Put its output in
the pull request. Any other difference goes through the gate.
