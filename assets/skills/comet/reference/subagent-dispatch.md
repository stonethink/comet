# Comet Extensions for Subagent-Driven Development

Canonical path: `comet/reference/subagent-dispatch.md`

This document provides Comet-specific extensions applied **on top of** the Superpowers `subagent-driven-development` skill. The skill handles the core dispatch loop (a fresh implementer for each task, with review and fix flow determined by `review_mode`) and enforces continuous execution. This document adds Comet-specific real background dispatch, task tracking, state verification, review-mode handling, and context recovery. If the Superpowers skill conflicts with this document, the more specific Comet constraints here take precedence.

> **⚠️ CRITICAL — No Pause Between Tasks**
>
> After a task passes `review_mode` validation and is checked off, **immediately dispatch the next task** without stopping, summarizing, or asking the user whether to continue. The user expects all tasks to execute in sequence without manual intervention. Pausing between tasks breaks the workflow and requires the user to manually resume each time.
>
> Only stop and wait for user input when:
> - A task is **BLOCKED** (review-fix rounds exhausted: `review_mode: standard` — 1 round of lightweight review not passed; `review_mode: thorough` — 2 rounds of batch/final review-fix not passed)
> - There is irreducible ambiguity that cannot be resolved from the repository, plan, or existing context
> - The platform lacks real background agent dispatch capability and the user must choose `executing-plans`
> - The user **explicitly** asks to pause
>
> This rule applies to the ENTIRE dispatch loop, not just individual tasks.

## Before Starting

1. Read the plan once, extracting the full text of all unchecked tasks in order.
2. Save a unique identifier for each task: the full task text after the checkbox in the plan, and the full OpenSpec task text it maps to (if any). If the text is not unique, stop and fix the plan first; never rely on "first match."
3. Respect dependencies; do not dispatch a task whose dependencies are not yet complete.

## Per-Task Comet Extensions

Apply these on every task, in addition to the Superpowers skill's dispatch loop:

### 0. Dispatch Enforcement (Critical)

The main session is the **coordinator only** and must NOT execute tasks directly or modify source code. The coordinator may modify only the plan, OpenSpec task, and subagent progress checkpoint for durable tracking. Never bundle multiple tasks into one agent. Dispatch a fresh background implementer agent for every task; spec reviewers, code quality reviewers, fix agents, and the final reviewer must also each use a fresh background agent:

- **Claude Code**: Use the `Agent` tool with `run_in_background: true` for each implementer, spec reviewer, code quality reviewer, fix agent, and final reviewer. Never execute tasks inline and do not accidentally enter team mode, which requires a pre-created team.
- **Other platforms**: Use the platform's equivalent background agent / Task / multi-agent dispatch mechanism.
- **Never** reuse implementers, reviewers, or fix agents across tasks or roles. Each agent gets a fresh, isolated context containing only the single task and role-specific context it needs.
- If the platform has no real background dispatch capability, do not proceed; pause and wait for the user to choose `build_mode: executing-plans`.

### 1. Dispatch Prompt and Return Contract

Every implementer or fix-agent prompt must include:

- The full text of the single current task, architecture background, and dependency context
- `Language: Use the language of the user request that triggered this workflow`
- The allowed file scope and prohibited modification scope
- The required test commands and commit requirements
- For a fix agent, the corresponding reviewer's complete feedback

The agent return status must be `DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT` and include implementation details, test results, commit hash, changed files, and concerns. Before review, the coordinator must verify that the commit and changed files are visible in the current worktree; on isolated-copy platforms, pull or merge the changes first.

When `review_mode` requires a reviewer, each reviewer prompt must include the full task, the implementation commit or diff and the RED/GREEN evidence (when `tdd_mode: tdd`). A reviewer must not review from the implementer's summary alone.

### 2. Implementer Scope Restriction

The implementer is only responsible for implementation, testing, and committing code. **The implementer must not check off plan or OpenSpec tasks**, nor update only the built-in Todo or in-chat checklists.

### 3. TDD Hard Constraint

If `tdd_mode: tdd`, every implementer and fix agent must first use the Skill tool to load the Superpowers `test-driven-development` skill, and its prompt must also inject:

```text
You MUST follow TDD: write a failing test first, watch it fail, then write minimal code to pass. No production code without a failing test first.
```

The implementer or fix-agent return must provide **RED failure command and failure summary**, **GREEN pass command and pass summary**; missing either piece of evidence blocks entry into review. Both spec compliance reviewer and code quality reviewer must verify RED/GREEN evidence and test coverage.

### 4. Durable Progress Checkpoint

The coordinator must maintain `openspec/changes/<name>/.comet/subagent-progress.md` and update it immediately after every dispatch, agent return, review result, review-fix round change, and task checkoff. The checkpoint must record at least:

- The unique current plan task text and mapped OpenSpec task text
- Current stage: `implementing | spec-review | quality-review | checkoff | done | blocked | final-review | final-fix`
- Implementation commit hash, changed files, and RED/GREEN evidence
- The selected `review_mode`
- Review stages already passed and unresolved reviewer feedback
- The current task, batch, or final-review review-fix round (`standard`: max 1, `thorough`: max 2, `off`: 0)

This file stores only coordinator recovery state and does not replace plan or OpenSpec checkboxes. Retain the final record when a task completes, then replace it with the next task's record when that task begins.

### 5. Review Mode Behavior

**When `review_mode: standard`**: No per-task reviewer is dispatched automatically. The implementer must self-test, commit, and report evidence; the coordinator completes targeted checkoff verification. After all tasks complete, dispatch exactly one final lightweight code reviewer scoped to correctness, security, and edge cases. If the final lightweight review finds CRITICAL or IMPORTANT issues, dispatch at most one fix agent and re-review once; if still not passed, mark **BLOCKED** and pause, handing feedback to the user. Non-CRITICAL findings may be accepted with rationale recorded.

**When `review_mode: thorough`**: No per-task dual review. The coordinator runs merged reviews by batch or risk boundary: after every 3 tasks or when a cross-module/high-risk boundary is crossed, dispatch one reviewer checking both spec compliance and code quality. If total tasks <= 3 and no high-risk boundary exists, skip mid-batch review and only do the final complete review. After all tasks, dispatch one final complete reviewer. Batch and final reviews each allow at most 2 review-fix rounds; if still not passed, mark **BLOCKED** and pause, handing accumulated feedback to the user.

**When `review_mode: off`**: No automatic spec reviewer, code quality reviewer, final reviewer, or review-fix agent is dispatched. Task completion is determined by implementer test/build evidence, current worktree confirmation, targeted task text checkoff verification, and explicit user request. If test failures, build failures, or abnormal behavior occur during execution, the debug gate protocol must still be followed - `off` does not skip real issues.

### 6. Task Checkoff and Verification

**After `review_mode` validation**, the main session:

1. Changes the saved unique task text from `- [ ]` to `- [x]` in the plan
2. If a mapping exists, also checks off the OpenSpec task
3. Commits this progress update
4. Runs targeted verification:

```bash
node "$COMET_STATE" task-checkoff "$PLAN_FILE" "$PLAN_TASK_TEXT"
node "$COMET_STATE" task-checkoff "openspec/changes/<name>/tasks.md" "$OPENSPEC_TASK_TEXT"
```

Run the second command only when the corresponding mapping exists. The script requires the task text to appear exactly once and be checked; verification failure blocks moving to the next task.

## Wrap-up

- **AUTO-CONTINUE**: After `review_mode` validation and the task is checked off, immediately dispatch the next unchecked task. Do NOT summarize, do NOT ask the user whether to continue, do NOT wait for user input between tasks. This is non-negotiable — the Superpowers skill enforces continuous execution, and the CRITICAL warning at the top of this document reinforces it.
- After all tasks complete, if `review_mode: standard`, switch the checkpoint to `final-review` and dispatch exactly one final lightweight code reviewer. CRITICAL or IMPORTANT issues allow at most one auto-fix and re-review; if still not passed, pause and hand to the user. After passing or accepting non-CRITICAL findings, continue to return to `comet-build`.
- After all tasks complete, if `review_mode: thorough`, switch the checkpoint to `final-review` and dispatch one final complete reviewer. CRITICAL or IMPORTANT issues allow at most two auto-fix and re-review rounds; if still not passed, pause and hand to the user. After passing or accepting non-CRITICAL findings, continue to return to `comet-build`.
- After all tasks complete, if `review_mode: off`, do not enter `final-review` or `final-fix`, but must record the reason for skipping automatic code review in a durable artifact, then return to `comet-build`.
- After final review passes, only the subagent dispatch loop is complete, not the Comet workflow. The coordinator must not load `finishing-a-development-branch` or pause to ask what comes next; it must return control to `comet-build` for exit checks, the phase guard, and phase handoff.

## Context Recovery

Reload the Superpowers `subagent-driven-development` skill and re-read this document. Read `openspec/changes/<name>/.comet/subagent-progress.md`, then compare it with the first unchecked task and the current worktree:

- When the checkpoint matches the unchecked task, resume from its exact recorded stage while preserving the implementation commit, RED/GREEN evidence, `review_mode`, review stages already passed, unresolved feedback, and current review-fix round. Never reset the round or repeat an already passed stage.
- When the checkpoint is missing or does not match the unchecked task, create a new checkpoint for the first unchecked task and begin with implementer dispatch.
- When a recorded commit or file is not visible in the current worktree, pull, merge, or recover the corresponding changes before proceeding; never assume the implementation exists.
- When all tasks are checked and the checkpoint stage is `final-review` or `final-fix`, resume the exact final-review stage while preserving final feedback and its review-fix round; never re-enter completed tasks.

Tasks committed without passing `review_mode` validation remain unchecked and re-enter the corresponding validation, review, or fix loop according to the checkpoint.
