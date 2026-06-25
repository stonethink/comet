# Comet Any Workflow Compiler Design

> **Status:** Approved for implementation on 2026-06-25.

## Goal

Rewrite `/comet-any` so it compiles Skills into usable workflow Skills instead of copying source `SKILL.md` files together.

There are two product paths:

1. **Customize /comet**: preserve the original Comet workflow boundary and insert, replace, or disable Skills at explicit Comet slots.
2. **Create or upgrade a Skill**: compile arbitrary user-provided Skills into a Comet-like workflow with routing, gates, pause points, recovery, and eval metadata.

Both paths should feel like Comet to the user: nested Skill invocation, automatic progression, script-backed gates, continuation when a stage is incomplete, cross-session recovery, explicit user pause points, and evidence-backed completion.

## Non-Goals

- Do not modify original Superpowers, OpenSpec, or source Skill directories.
- Do not treat source `SKILL.md` files as text templates to paste into the generated entry Skill.
- Do not preserve old `/comet-any` generated engine compatibility. The generated engine has not shipped and can be replaced.
- Do not expose Bundle, Factory, or composition jargon in generated user-facing Skills.
- Do not require users to author low-level protocol JSON.

## Core Decision

`/comet-any` becomes a compiler with two render targets.

### Path 1: Customize /comet

This path is a **Comet slot overlay**. The compiler starts from the protected Comet five-phase skeleton:

```text
open -> design -> build -> verify -> archive
```

User-provided Skills are attached to named slots inside those phases:

```text
design.after-brainstorming -> grill-me
build.before-implementation -> writing-plans
build.after-implementation -> requesting-code-review
```

The generated entry `SKILL.md` remains a Comet-style workflow entry. It does not contain debug reports, raw source evidence, or generated metadata sections. It explains the customized phase route and says which slots are customized.

Generated Comet stage Skills are rendered from Comet-aware templates:

- keep the Comet phase purpose, guard, `.comet.yaml` state, handoff, decision points, and auto-transition behavior
- insert external Skills as controlled substeps
- keep the phase incomplete until the inserted substep has produced its required evidence
- route to the next Comet phase through the customized route, not through original hard-coded Comet text

For `grill-me` after design, the design phase should read as:

1. run the normal Comet design protocol
2. pause on the design confirmation point
3. run `grill-me` as a design pressure-test substep
4. require recorded pressure-test findings or acceptance before design can complete
5. then continue to build

### Path 2: Create or upgrade arbitrary Skill

This path is a **Comet-like workflow kernel**. It does not copy Comet's OpenSpec-specific text. Instead it generates a workflow entry and internal stage Skills that borrow Comet's usable properties:

- a decision core with a clear route
- mandatory nested Skill invocation wording
- entry and exit gates for each stage
- incomplete-stage continuation
- user pause-point options
- `.comet/runs/<workflow>/state.json` recovery
- `workflow-state.mjs`, `workflow-guard.mjs`, and `workflow-handoff.mjs`
- route-conformance eval metadata

Source Skills are used as capabilities, not prose templates. The generated stage wraps each source Skill with a stage objective, input context, required evidence, and next-stage rule. The source body can be stored under `reference/` for audit, but it must not be pasted into the user-facing workflow in a way that overrides the generated route.

## Shared WorkflowSpec

Both paths compile into a `WorkflowSpec`, but the spec has an explicit `kind`:

```ts
type WorkflowKind = 'comet-overlay' | 'workflow-kernel';

interface WorkflowSpec {
  schemaVersion: 1;
  kind: WorkflowKind;
  name: string;
  goal: string;
  stages: WorkflowStage[];
  decisions: WorkflowDecision[];
  recovery: WorkflowRecovery;
  evals: WorkflowEval[];
}
```

For `comet-overlay`, stages are the protected Comet phases and inserted Skills appear as `slots` inside those stages. The implementation may replace the previous generated control plane instead of adapting it.

For `workflow-kernel`, stages come from the user-provided Skill sequence and each stage has its own generated Skill wrapper.

## Generated Output Rules

### Entry Skill

- Frontmatter description is English, trigger-only, and contains no colon.
- No `Generated Variant Routing`, `Generated Source Evidence`, or debug-report sections.
- It starts with the workflow identity and decision core.
- It states the route, automatic progression rule, stop/pause points, recovery path, and script gates.
- For Comet overlay, it looks like a customized Comet entry.
- For generic workflow kernel, it looks like a Comet-like workflow entry without OpenSpec-specific claims.

### Stage Skills

- Stage Skills are wrappers, not source body dumps.
- Every wrapper has:
  - purpose
  - entry check
  - steps
  - nested source Skill invocation
  - evidence requirements
  - incomplete behavior
  - next-stage rule
  - recovery note
- Comet overlay stage wrappers keep `.comet.yaml` and Comet guard semantics.
- Generic kernel stage wrappers use generated workflow state and guard scripts.

### References

`reference/` stores audit material:

- `workflow-protocol.json`
- `resolved-skills.json`
- `composition-report.md`
- source excerpts or source bodies when needed for review

Audit material must not leak into the main user-facing `SKILL.md`.

### Scripts

For `workflow-kernel`, generated scripts own the workflow state:

- `workflow-state.mjs`
- `workflow-guard.mjs`
- `workflow-handoff.mjs`

For `comet-overlay`, generated scripts define the customized route and slot completion rules. They do not need to be compatible with previously generated Factory scripts.

## Acceptance Criteria

- `Customize /comet` with `grill-me` produces a Comet-looking entry Skill, not a pasted debug report.
- The grill step appears as a design phase substep and cannot be bypassed by `/comet-design -> /comet-build` text.
- Generic Skill composition produces a Comet-like workflow with gates, pause points, recovery, and route-conformance evals.
- Generated user-facing `SKILL.md` files do not contain `Generated Source Evidence`, raw resolved JSON summaries, or unresolved backend vocabulary.
- Source Skills with tiny bodies, such as `grill-me`, become useful workflow steps through generated objectives and evidence gates.
- Tests cover both product paths.
