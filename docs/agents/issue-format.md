# Issue format

Every issue uses one format, whether it comes from the web form or from `gh issue create`. The web forms in `.github/ISSUE_TEMPLATE/` produce these sections; anyone (or any agent) writing an issue from the CLI writes the same sections by hand.

## Title

- One plain sentence that states the problem or the change, in the product's own words: `Wrapped text splits emoji sequences`, `Pivot tables update only the groups an edit touches`.
- No type prefix (`[Bug]:`, `Feature:`), no release prefix (`0.6.0:`), no area prefix (`Docs:`). Labels and the milestone carry those.
- Never name the tool, skill, model or agent that found or will do the work, and never quote a tool's scoring vocabulary (rule numbers, pass or fail tiers, lint codes). Name the work and the observed fact: "120 labels set in uppercase with letter-spacing", not a rule code. The same applies to bodies and comments.

## Labels

Every issue has exactly one **type**, one or more **areas**, and one **state**. Maintainers add a priority when they triage.

| Axis | Labels |
|---|---|
| Type | `bug`, `enhancement`, `proposal`, `documentation`, `question`, `tracker` |
| Area | `area:engine`, `area:formulas`, `area:grid`, `area:shell`, `area:xlsx`, `area:charts`, `area:pivots`, `area:collab`, `area:frameworks`, `area:docs`, `area:showcases`, `area:packages`, `area:bench`, `area:ci` |
| State | `needs-triage` (new), `needs-info`, `triaged`, `ready-for-agent`, `ready-for-human`, `wontfix` |
| Priority | `prio:p0` broken for most users, `prio:p1` this release, `prio:p2` normal, `prio:p3` nice to have |

The release goes in the **milestone** (`0.6.0`), never in the title.

## Links between issues

- A child of a tracker or map starts its body with `Part of #<n>`; prefer GitHub sub-issues where they are enabled.
- Blocking uses GitHub issue dependencies; where they are unavailable, the body starts with `Blocked by: #<n>, #<n>`.
- Wayfinding work keeps its `wayfinder:*` labels alongside the type label ([issue-tracker.md](issue-tracker.md) § Wayfinding operations).

## Bodies

Write in Simplified Technical English: short sentences, plain words, conclusion first. Use `file:line` for code, measured numbers with their unit and how they were measured, and `#123` for related issues and PRs. Omit a section only when it says "if any".

### Bug

```markdown
## Problem
What happens, in one or two sentences.

## Steps to reproduce
1. …

## Expected
What should happen.

## Actual
What happens instead. Paste errors or output in a code block.

## Environment
Sheetwrite packages and versions, engine (`@sheetwrite/wasm` or `@sheetwrite/formulas`), framework, browser or Node, bundler.

## Workaround (if any)
```

### Enhancement

```markdown
## Problem
What the user cannot do today, and why the current API does not cover it.

## Proposal
The observable result. Numbered options when there is more than one way.

## Acceptance
How we know it is done: behavior, numbers, tests.

## Alternatives / workaround today (if any)
```

### Proposal (design decision)

Designs are decided in issues, not in files.

```markdown
## Context
What forces a decision now.

## Options
1. … (cost, risk)
2. …

## Decision
The chosen option and why. Write "Open" until decided.

## Contract
Interfaces, ownership and limits other work depends on.

## Open questions (if any)
```

### Documentation

```markdown
## Problem
Which page, what is wrong or missing, who is affected.

## Proposal
What the page should say or how the docs should be organized.

## Pages
Links to every affected page.
```

### Tracker

A release or program tracker holds checklists only. Each item links its own issue or PR: `- [ ] Pivot tables (#194)`. Decisions and discussion live in the linked issues.
