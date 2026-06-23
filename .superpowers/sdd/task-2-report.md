# Task 2 Report

## Summary

- Implemented user-facing Classic diagnostics output updates in `status` and `doctor` without changing the shared diagnostics source.
- Kept code changes within the requested command/test files and added this report file.

## Changes

- `app/commands/status.ts`
  - Preserve shared `runtimeEval` data in status payloads.
  - For invalid changes in text output, print a concise recovery hint:
    - `next: inspect .comet.yaml and rerun comet doctor`
  - For valid changes in text output, print a concise `runtime_eval` summary.

- `app/commands/doctor.ts`
  - Preserve `.comet.yaml` validity reporting from `inspectClassicChange(...)`.
  - Add a dedicated user-facing `runtime_eval: <change>` line for valid changes in text and JSON output.

- `test/app/status.test.ts`
  - Added a failing-first test covering the invalid-change recovery hint in text output.

- `test/app/doctor.test.ts`
  - Added a failing-first test covering runtime eval evidence in doctor text output.

## TDD Evidence

1. Added new tests first.
2. Ran targeted tests and confirmed failure:

```bash
npx vitest run test/app/status.test.ts test/app/doctor.test.ts
```

Result: failed exactly on the new expectations:
- missing `next: inspect .comet.yaml and rerun comet doctor`
- missing `runtime_eval:`

3. Implemented the minimal command-surface output changes.
4. Re-ran the same targeted tests and confirmed pass:

```bash
npx vitest run test/app/status.test.ts test/app/doctor.test.ts
```

Result: `2 passed`, `9 passed`

## Verification

- Focused test command:

```bash
npx vitest run test/app/status.test.ts test/app/doctor.test.ts
```

- Final result:
  - Exit code `0`
  - `Test Files  2 passed (2)`
  - `Tests  9 passed (9)`

## Scope / Constraints

- Did not modify the shared diagnostics truth source: `domains/comet-classic/classic-diagnostics.ts`
- Did not modify files outside the requested command/test scope, except this required report file.
- Changelog not updated because this task is an in-branch development step rather than a master-bound user-visible release entry.

## Commit

- Planned commit message:

```bash
feat: improve classic diagnostics user output
```
