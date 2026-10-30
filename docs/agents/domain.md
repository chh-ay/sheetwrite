# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

**Layout: single-context.** One shared vocabulary across all workspace packages (`packages/*`, `docs`, `bench`, `examples/*`).

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root.
- **Decision issues**: open and closed GitHub issues labelled `proposal` that touch the area you're about to work in (`gh issue list --label proposal --state all`). Design decisions live there, not in `docs/adr/`.

If the glossary doesn't exist, **proceed silently**. Don't flag its absence; don't suggest creating it upfront. The `/domain-modeling` skill creates it lazily when terms get resolved. When a decision resolves, record it in its `proposal` issue (the Decision section of [issue-format.md](issue-format.md)), never as an ADR file.

## File structure

```
/
├── GLOSSARY.md
└── packages/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag decision conflicts

If your output contradicts a decided `proposal` issue, surface it explicitly rather than silently overriding:

> _Contradicts #195 (sheet objects are additive and owned per branch), but worth reopening because…_
