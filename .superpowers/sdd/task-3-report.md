# Task 3 Report: Align public docs with the real 0.4.0 user model

## Scope

- Updated `README.md`
- Updated `README-zh.md`
- Updated `docs/architecture/ARCHITECTURE.md`
- Updated `test/ts/readme.test.ts`

## What changed

- Reframed both READMEs around the real 0.4.0 public model: Node-only runtime, resumable workflow, and Skill platform.
- Rewrote the README value summary from the older dual-star narrative into concise user-facing outcomes.
- Documented `comet status` as exposing current step, runtime mode, and diagnostic recovery hints.
- Documented `comet doctor` as checking active change diagnostics, malformed state, and missing runtime evidence.
- Clarified `/comet-any` as the Comet Skill Factory that produces reviewable Bundle drafts backed by real Skill evidence.
- Updated architecture docs to explain why `status`, `doctor`, and `/comet-any` now have that public behavior.
- Added focused README assertions to lock the new public model and bilingual parity in tests.

## TDD evidence

### RED

Command:

```bash
npx vitest run test/ts/readme.test.ts
```

Result:

- Failed as expected.
- New failures:
  - `documents status and doctor as diagnostics-aware user commands`
  - `keeps English and Chinese README feature summaries aligned`

### GREEN

Command:

```bash
npx vitest run test/ts/readme.test.ts
```

Result:

- Passed: `1 passed`
- Passed: `5 passed`

## Extra verification

Command:

```bash
git diff --check -- README.md README-zh.md docs/architecture/ARCHITECTURE.md test/ts/readme.test.ts
```

Result:

- Passed with no diff-check errors.

## Notes

- Kept the README surface user-facing and moved architecture-level explanation into `docs/architecture/ARCHITECTURE.md`.
- Kept English and Chinese summaries aligned on the same product model.

## Commit

- Final commit subject: `docs: align public docs with comet runtime model`
