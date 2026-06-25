# Comet Any Authoring Subagents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/comet-any` Factory authoring lanes from static artifact builders into a subagent-ready authoring contract with mandatory review claims.

**Architecture:** Keep the public generation entrypoint stable, but deepen the internal seam around `FactoryArtifactAuthor`. Each lane receives a complete authoring context, returns artifacts plus semantic claims, and is reviewed through a mandatory `skill-review` gate. The current implementation uses deterministic local adapters; the interface can later be backed by real subagents without changing package assembly.

**Tech Stack:** TypeScript, Vitest, existing Bundle/Factory domain modules.

## Global Constraints

- Do not modify `assets/skills/comet/scripts/` or `domains/comet-classic/`.
- Preserve `/comet` protected overlay behavior: open/design/build/verify/archive remain intact.
- Keep `Bundle`, `Factory`, and `composition` as backend terms; generated user-facing Skill text should stay Skill Maker oriented.
- Use TDD: write failing tests before production code.
- Update `CHANGELOG.md` under the current `0.4.0-beta.1` beta train unless the package version changes.

---

### Task 1: Make authoring lanes subagent-ready

**Files:**

- Modify: `domains/factory/artifacts.ts`
- Modify: `domains/factory/authoring.ts`
- Test: `test/domains/factory/factory-authoring-lanes.test.ts`

**Interfaces:**

- Consumes: `FactoryWorkflowSpec`, `FactorySkillPackagePlan`, resolved source summaries, stage plans.
- Produces: `FactoryArtifactAuthor`, `FactoryArtifactProposal`, and `FactoryArtifactClaim` with author metadata.

- [ ] Add tests proving lane authors receive `plan`, `workflow`, `stagePlans`, `sourceSummaries`, and `protocolHash`.
- [ ] Add `FactoryArtifactAuthorKind = deterministic-adapter | subagent`.
- [ ] Add `FactoryArtifactClaim` and `FactoryArtifactAuthorMetadata`.
- [ ] Update deterministic author adapter to record author metadata and claims.
- [ ] Run the focused authoring lane test.

### Task 2: Make review a mandatory semantic gate

**Files:**

- Modify: `domains/factory/review.ts`
- Modify: `domains/factory/package.ts`
- Test: `test/domains/factory/factory-authoring-lanes.test.ts`

**Interfaces:**

- Consumes: proposals with artifacts and claims.
- Produces: blocking findings for missing review lane, missing review artifacts, stale protocol hash, and missing semantic claims.

- [ ] Add tests that final review blocks missing `skill-review` lane and missing claims.
- [ ] Require final review artifacts `reference/skill-review.md` and `reference/authoring-lanes.json`.
- [ ] Add semantic claim checks for entry Skill, every stage Skill, workflow state/guard/handoff scripts, workflow protocol, decision points, recovery, eval manifest, and review report.
- [ ] Keep pre-review available so the review lane can be generated from the first-pass review.

### Task 3: Move assembly responsibility out of package internals

**Files:**

- Modify: `domains/factory/package.ts`

**Interfaces:**

- Consumes: authoring lane proposals.
- Produces: `FactoryPackageDraft` with final proposals, artifacts, review result, and review metadata.

- [ ] Build proposals with deterministic adapters that model subagent outputs.
- [ ] Generate review proposal as an explicit `skill-review` lane.
- [ ] Include claims in `reference/authoring-lanes.json`.
- [ ] Keep `generateFactorySkillPackage(plan)` as the external interface.

### Task 4: Verify and document behavior

**Files:**

- Modify: `CHANGELOG.md`

**Interfaces:**

- Consumes: test and real generated package evidence.
- Produces: updated changelog entry and verified working tree.

- [ ] Run focused Factory/Bundle tests.
- [ ] Run `pnpm format:check`, `pnpm lint`, `pnpm build`, and targeted generation smoke if needed.
- [ ] Confirm no diff under `assets/skills/comet/scripts` or `domains/comet-classic`.
- [ ] Update changelog under `0.4.0-beta.1`.
