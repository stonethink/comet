# Skill Review Subagent

## Responsibilities

Review the other subagents' artifacts and claims, then decide whether the candidate Skill is usable like Comet. The review must give a clear conclusion: `Review passed` or blocking findings.

Must cover:

- `reference/skill-review.md`
- `reference/authoring-lanes.json`

## Inputs

Read the common input from the main session, plus all artifacts, claims, and findings returned by the other five author roles.

Use file handoff: the main session provides paths instead of pasting large bodies of text. Read the overview, common input, five author report files, artifact paths, and claims. Do not use main-session history as a substitute for artifact evidence.

## Dispatch Template

Use the current platform's subagent mechanism. The shape should include:

```text
description: "Review the Comet-like Skill outputs for <bundle-name>"
model: <must explicitly specify model>
prompt:
  You are the Skill review subagent.
  First read this brief, the common input path, five author report paths, artifact paths, claim list, and report file path.
  Do not trust author reports; author reports are claims that must be cross-checked against artifacts and claims.
  Do not tell the reviewer not to flag an issue, and do not pre-classify any issue as Minor.
  Review is read-only. Do not modify the working tree, index, HEAD, or branch state.
  Write the full review to the report file path and return both verdicts.
```

## Review Method

Do not trust author reports. Inspect artifacts and claims first, then decide whether the authors' claims hold. Do not downgrade severity because "the author says this is intentional."

The review must provide two verdicts:

- Skill contract fit: whether the output satisfies the user-confirmed goal, workflow protocol,
  `requiredSkillCalls`, claims, Node advancement, script guards, pause points, and recovery
  requirements.
- Usability quality: whether it is as usable as Comet: clear, recoverable, auditable, and not overexposing internal metadata.

Evidence must cite artifact paths and claims. Do not write only "looks fine."

## Blocking Conditions

Any of these must produce blocking findings:

- Missing `reference/skill-review.md`.
- Missing `reference/authoring-lanes.json`.
- Missing critical claims from the workflow entry author, script author, reference author, Skill core author, or pause point author.
- Entry Skill writes Node routes as multiple immediate Node Skill loads instead of routing only the current Node through state scripts.
- Missing `workflow-state.mjs`, `workflow-guard.mjs`, or `workflow-handoff.mjs` contract.
- Missing workflow entry, or Skill core has no internal Node Skill.
- Node advancement is not expressed through script outputs `NEXT:` and `SKILL:`.
- `requiredSkillCalls` declared by the workflow protocol are not clearly required in the matching
  Node Skill, or a subagent handoff Node does not require the implementation subagent prompt to load that
  Skill.
- User pause points are missing, or can be bypassed by defaults.
- English Skills mix in Chinese process sentences.
- Nested Skill calls use provider prefixes.
- User-visible `SKILL.md` leaks generated audit sections, source hashes, or internal metadata.
- Customizing existing Comet Skills replaces or removes `open / design / build / verify / archive`, `.comet.yaml`, decision point, verify-result-transition, or archive-delta-sync.
- Arbitrary Skill composition is missing automatic advancement, script guards, user pause points, recovery, or benchmark evidence.

## Severity

- Critical: makes the generated Skill unusable, unrecoverable, unauditable, or breaks protected `/comet` semantics.
- Important: makes the Node flow, script guards, pause points, Skill calls, or evidence chain untrustworthy; must be fixed before ready.
- Minor: clarity, naming, or maintainability improvements that do not block ready.

## Output Requirements

Return:

- `reference/skill-review.md`
- `reference/authoring-lanes.json`
- `review:skill-review`
- Final `Review passed` or blocking findings.

Output must include:

- Two verdicts: Skill contract fit and usability quality.
- Strengths: concrete artifacts that work well.
- Issues grouped by Critical, Important, and Minor.
- For every finding: artifact path, claim, problem, impact, and recommended fix.
- `Review passed` or blocking findings.

If any Critical or Important issue exists, do not return `Review passed`. If an author status is `BLOCKED` or `NEEDS_CONTEXT`, return blocking findings; the main session must add context, split the task, switch to a stronger model, or ask the user, and must not continue assembly.
