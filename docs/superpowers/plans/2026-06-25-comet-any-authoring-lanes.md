# Comet Any Authoring Lanes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `/comet-any` generation into authoring lanes whose reviewed proposals assemble into Comet-like generated Skills.

**Architecture:** Keep `compileWorkflowSpec(plan)` as the protocol compiler. Add a small authoring Interface around deterministic lane authors, a reviewer, and an assembler. `generateFactorySkillPackage(plan)` remains the public Interface while internals split Skill core, script contract, reference, pause points, eval, and review responsibilities.

**Tech Stack:** TypeScript, Node.js generated scripts, YAML, Vitest.

## Global Constraints

- Do not modify `domains/comet-classic/` TypeScript runtime.
- Do not modify generated Comet Classic runtime launchers or `assets/skills/comet/scripts/comet-runtime.mjs`.
- Do not directly modify Superpowers, OpenSpec, or source Skill directories.
- Generated frontmatter descriptions must be English and contain no colon.
- Generated Chinese user-visible workflow prose must stay Chinese.
- Use bare Skill names in generated nested load instructions.
- Use tests before production code.

---

### Task 1: Lock Authoring Lane Behavior With Tests

**Files:**

- Create: `test/domains/factory/factory-authoring-lanes.test.ts`

**Interfaces:**

- Consumes: `draftFactorySkillArtifacts(plan)`
- Consumes: `reviewFactoryArtifactProposals(input)`
- Produces: failing tests for lane proposals, review reports, and blocking review findings.

- [ ] Add a test that generates a simple workflow draft and asserts proposals exist for `skill-core`, `script-contract`, `reference`, `pause-points`, `eval`, and `skill-review`.
- [ ] Assert every proposal carries the current protocol hash.
- [ ] Assert the generated artifact list contains `reference/authoring-lanes.json` and `reference/skill-review.md`.
- [ ] Add a test that sends a bad `skill-core` proposal containing `Generated Source Evidence`, provider-prefixed Skill wording, English flow prose, and a missing script reference.
- [ ] Assert reviewer returns blocking findings for each violation.
- [ ] Run the new test file and confirm it fails because the new Interface does not exist yet.

### Task 2: Add Authoring Lane Types and Orchestrator

**Files:**

- Create: `domains/factory/artifacts.ts`
- Create: `domains/factory/authoring.ts`

**Interfaces:**

- Produces: `FactoryAuthoringLane`
- Produces: `FactoryPackageArtifact`
- Produces: `FactoryArtifactProposal`
- Produces: `FactoryArtifactAuthor`
- Produces: `workflowProtocolHash(workflow)`
- Produces: `runFactoryAuthoringLanes(input, authors)`

- [ ] Define lane names as a closed union.
- [ ] Define artifact proposals with `lane`, `protocolHash`, `artifacts`, and optional findings.
- [ ] Define a deterministic author adapter that can wrap artifact-producing functions.
- [ ] Make the orchestrator reject protocol hash drift before assembly.
- [ ] Run `factory-authoring-lanes.test.ts` and confirm the missing Interface failures move to reviewer/package behavior.

### Task 3: Add Blocking Reviewer

**Files:**

- Create: `domains/factory/review.ts`
- Test: `test/domains/factory/factory-authoring-lanes.test.ts`

**Interfaces:**

- Consumes: `FactoryArtifactProposal[]`
- Produces: `GeneratedPackageReview`
- Produces: `renderSkillReviewMarkdown(review)`

- [ ] Require `skill-core`, `script-contract`, `reference`, and `pause-points`.
- [ ] Require `eval` when Engine files are generated.
- [ ] Block stale proposal hashes.
- [ ] Block generated audit sections inside user-visible `SKILL.md`.
- [ ] Block provider-prefixed Skill target wording.
- [ ] Block known English workflow-prose leaks in generated Chinese Skill files.
- [ ] Block script references that have no matching generated script artifact.
- [ ] Block Comet overlay protocols that do not contain the five protected phases.
- [ ] Render a concise review markdown report.
- [ ] Run the new test file and confirm reviewer-specific tests pass after implementation.

### Task 4: Assemble Package From Lane Proposals

**Files:**

- Modify: `domains/factory/package.ts`
- Test: `test/domains/factory/factory-package.test.ts`
- Test: `test/domains/factory/factory-control-plane-scripts.test.ts`

**Interfaces:**

- Produces: `draftFactorySkillArtifacts(plan)`
- Keeps: `generateFactorySkillPackage(plan)`

- [ ] Move final artifact collection into `draftFactorySkillArtifacts(plan)`.
- [ ] Create deterministic lane proposals from existing renderers.
- [ ] Add `reference/authoring-lanes.json` and `reference/skill-review.md`.
- [ ] Make `generateFactorySkillPackage(plan)` refuse to write when review has blocking findings.
- [ ] Write artifacts through a single assembler loop.
- [ ] Keep sibling internal Skill writes under the generated `skills/` root.
- [ ] Update `comet-check.mjs` required files to include review artifacts.
- [ ] Run focused factory tests and fix regressions.

### Task 5: Regenerate Experiments and Verify

**Files:**

- Modify: `CHANGELOG.md`
- Generated drafts under `.comet/bundle-drafts/`

**Interfaces:**

- Consumes: `node bin/comet.js bundle factory-generate <name> --json`
- Produces: inspectable generated Skill packages.

- [ ] Regenerate the Comet + `grill-me` experiment.
- [ ] Regenerate a non-Comet arbitrary Skill composition experiment.
- [ ] Validate generated packages with `node bin/comet.js skill validate`.
- [ ] Smoke generated workflow scripts for blocked exit and next-stage output.
- [ ] Update `CHANGELOG.md` under the existing current version.
- [ ] Run `pnpm format:check`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm build`.
- [ ] Run `pnpm test`.
- [ ] Commit the completed change.
