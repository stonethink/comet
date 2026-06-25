# Comet Any Workflow Compiler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `/comet-any` generation into two paths: Comet slot overlay and arbitrary Skill workflow kernel.

**Architecture:** `domains/factory/protocol.ts` compiles `FactorySkillPackagePlan` into a typed `WorkflowSpec`. `domains/factory/package.ts` renders that spec into clean user-facing Skills, protocol references, scripts, and eval manifests. Comet overlay keeps Comet's protected phase lifecycle while generic workflow kernel owns generated workflow state.

**Tech Stack:** TypeScript, Node.js generated scripts, Vitest, YAML package metadata.

## Global Constraints

- Do not modify original Superpowers or OpenSpec Skills.
- Generated frontmatter descriptions must be English and contain no colon.
- Do not paste source Skill bodies into the entry Skill.
- Do not preserve compatibility with the old generated Factory engine; it has not shipped.
- Keep generated workflow state under `.comet/runs/<workflow>/state.json` only for generic workflow kernel.
- Use tests before production code.

---

### Task 1: Rebaseline Tests Around Two Product Paths

**Files:**

- Modify: `test/domains/factory/factory-package.test.ts`
- Modify: `test/domains/factory/factory-control-plane-scripts.test.ts`

**Interfaces:**

- Consumes: `generateFactorySkillPackage(plan)`
- Produces: failing tests for `comet-overlay` and `workflow-kernel`

- [ ] Add a Comet overlay regression test for `grill-me` after design.
- [ ] Assert the entry Skill contains `## 决策核心` and customized slot wording.
- [ ] Assert the entry Skill does not contain `Generated Source Evidence`, `Generated Variant Routing`, or `Workflow Protocol`.
- [ ] Assert the design stage wraps `grill-me` as a pressure-test substep with evidence gates.
- [ ] Add a generic workflow kernel test for two arbitrary Skills.
- [ ] Assert generic output contains route, gates, pause points, recovery, and nested invocation wording.
- [ ] Run the focused tests and confirm they fail for the expected reasons.

### Task 2: Compile WorkflowSpec With Explicit Kind

**Files:**

- Modify: `domains/factory/protocol.ts`
- Test: `test/domains/factory/factory-package.test.ts`

**Interfaces:**

- Consumes: `FactorySkillPackagePlan`
- Produces: `compileWorkflowSpec(plan): FactoryWorkflowSpec`

- [ ] Add `kind: 'comet-overlay' | 'workflow-kernel'`.
- [ ] For `customize-comet`, compile protected phase stages `open`, `design`, `build`, `verify`, `archive`.
- [ ] Attach non-Comet Skills to phase slots using `stageNames.phase` and `stageNames.step`.
- [ ] For arbitrary Skills, compile one generated stage per source Skill.
- [ ] Keep route-conformance eval metadata for both paths.

### Task 3: Render Clean Comet Overlay Skills

**Files:**

- Modify: `domains/factory/package.ts`
- Test: `test/domains/factory/factory-package.test.ts`

**Interfaces:**

- Consumes: `FactoryWorkflowSpec` with `kind: 'comet-overlay'`
- Produces: entry `SKILL.md` and Comet phase stage wrappers

- [ ] Replace pasted Comet entry rendering with a clean protected-template renderer.
- [ ] Render customized slots in the decision core and phase route.
- [ ] Render Comet phase stage Skills from Comet-aware wrappers.
- [ ] For inserted external Skills, render nested invocation, evidence requirements, and incomplete behavior.
- [ ] Keep source bodies only in `reference/`, not in user-facing Skill bodies.

### Task 4: Render Generic Workflow Kernel Skills

**Files:**

- Modify: `domains/factory/package.ts`
- Modify: `domains/factory/protocol.ts`
- Test: `test/domains/factory/factory-package.test.ts`

**Interfaces:**

- Consumes: `FactoryWorkflowSpec` with `kind: 'workflow-kernel'`
- Produces: clean generic entry and stage wrappers

- [ ] Render a Comet-like decision core without OpenSpec-specific claims.
- [ ] Render each arbitrary Skill as a stage with purpose, input, evidence, gate, pause, recovery, and next-stage rule.
- [ ] Avoid source body dumps in the main stage text.
- [ ] Store source audit material under `reference/`.

### Task 5: Replace Runtime Scripts With The New Generated Engine

**Files:**

- Modify: `domains/factory/package.ts`
- Modify: `domains/bundle/factory.ts`
- Test: `test/domains/factory/factory-control-plane-scripts.test.ts`
- Test: `test/domains/bundle/bundle-command.test.ts`

**Interfaces:**

- Consumes: `reference/workflow-protocol.json`
- Produces: generated scripts and manifest resources

- [ ] Generate one script family from `workflow-protocol.json` for both paths.
- [ ] Remove assumptions that copied Comet runtime scripts know inserted slots.
- [ ] Make `comet-check.mjs` validate generated route resources, stage wrappers, and slot wrappers.
- [ ] Update bundle manifest resources.

### Task 6: Regenerate Real Experiment And Verify

**Files:**

- Generated draft under `.comet/bundle-drafts/comet-grill-fullbody/`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Consumes: `node bin/comet.js bundle factory-generate comet-grill-fullbody --json`
- Produces: inspectable generated Skill package

- [ ] Regenerate `comet-grill-fullbody`.
- [ ] Inspect entry and design stage `SKILL.md`.
- [ ] Search generated user-facing `SKILL.md` files for banned generated/debug sections.
- [ ] Run focused factory tests.
- [ ] Run `pnpm format:check`.
- [ ] Run `pnpm build`.
- [ ] Update `CHANGELOG.md` under the current version.
