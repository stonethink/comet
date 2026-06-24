# Task 1 Report: Extract Bundle Next Action And Resume Summary

## Scope

- Implemented `determineBundleNextAction` and `buildBundleResumeSummary`
- Moved bundle next-action logic out of `app/commands/bundle.ts`
- Added command-layer JSON/text coverage for `resumeSummary`

## RED Evidence

Command:

```bash
npx vitest run test/domains/bundle/bundle-next-action.test.ts
```

Observed failure:

- `Cannot find module '../../../domains/bundle/next-action.js'`
- Suite failed before running tests, which matches the expected missing-module RED state from the brief

## GREEN Evidence

Command:

```bash
npx vitest run test/domains/bundle/bundle-next-action.test.ts test/domains/bundle/bundle-command.test.ts test/domains/bundle/publish-command.test.ts
```

Observed result:

- `Test Files  3 passed (3)`
- `Tests  26 passed (26)`

## Changed Files

- `domains/bundle/next-action.ts`
- `app/commands/bundle.ts`
- `test/domains/bundle/bundle-next-action.test.ts`
- `test/domains/bundle/bundle-command.test.ts`
- `test/domains/bundle/publish-command.test.ts`

## Self-check

- Followed TDD in order: wrote failing test, verified RED, implemented minimal production code, verified GREEN
- Kept edits scoped to Task 1 files plus this report
- Did not revert unrelated workspace changes
- `bundle status` and `bundle list` now emit `resumeSummary`
- Text status now surfaces current step, user next step, suggested user command, backend command, and preference drift

## Concerns

- The brief contains one internal inconsistency: the sample implementation for eval uses the concrete manifest path when present, while the sample test expects the placeholder command `comet eval run --manifest <generated-skill>/comet/eval.yaml --quick --html`. I implemented the test-specified user-facing command so Task 1 stays aligned with the brief's asserted behavior.
