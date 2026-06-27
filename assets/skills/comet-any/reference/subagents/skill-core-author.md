# Skill Core Author Subagent

## Responsibilities

Write the user-visible core content for internal Node Skills. The entry Skill is owned separately by the workflow entry author. The goal is a Comet-like multi-Node workflow, not a simple chain of source Skills or a copied source Skill body.

Must cover:

- Every internal Node Skill
- Node invocation semantics in `comet/skill.yaml`
- Every `node-skill:<skill-name>` claim

## Inputs

Read the common input from the main session, especially:

- User-confirmed Node labels and editable name fields.
- Node goals, `requiredSkillCalls`, and automatic advancement conditions from
  `reference/workflow-protocol.json`.
- Real Skill summaries from `reference/resolved-skills.json`.
- The script author's `NEXT:`, `SKILL:`, guard, and recovery contracts.

Use file handoff: the main session provides paths instead of pasting large bodies of text. Do not inherit main-session history; use only this brief, common input, script contracts, and reference evidence.

## Dispatch Template

Use the current platform's subagent mechanism. The shape should include:

```text
description: "Write Skill core content for <bundle-name>"
model: <must explicitly specify model>
prompt:
  You are the Skill core author subagent.
  First read this brief, the common input path, script contract path, reference evidence path, and report file path.
  Start by asking questions: if Node labels, required Skill calls, automatic advancement, or user pause points are unclear, return NEEDS_CONTEXT.
  Do not guess or fill in missing flow details.
  Only write internal Node Skill drafts; do not write entry Skill, Bundle state, or execute candidate scripts.
  Write the full Skill draft to the report file path and return only a status summary of 15 lines or fewer.
```

## Output Requirements

Return internal Node Skill drafts that show:

- Internal Node Skills own a single-Node goal, required Skill calls, completion evidence, and script guards.
- If the protocol declares `requiredSkillCalls`, the matching Node must state the target Node,
  required Skill, applies-to scope, and evidence requirement. Subagent cases must also tell the
  implementation subagent prompt to load that Skill.
- If the Node goal is not complete, continue working instead of exiting because a checklist is exhausted.
- Automatic advancement must come from script outputs `NEXT:` and `SKILL:`, not agent guesses.
- Nested Skill calls use only Skill names, not provider prefixes.
- When users customize existing Comet Skills, preserve `open / design / build / verify / archive` and `.comet.yaml` semantics.
- For arbitrary Skill composition, organize the result as a Comet-like multi-Node workflow.

Forbidden:

- Copying full source Skill bodies.
- Provider prefixes such as `Superpowers writing-plans` or `OpenSpec openspec-propose`.
- Mixing Chinese process sentences into English Skills.
- Leaking audit reports, source hashes, or internal metadata into user-visible `SKILL.md`.

## Self-Check

Before returning, check:

- Every Node explains required Skill calls, completion evidence, script guards, and recovery entry.
- Every `requiredSkillCalls` item has a clear load instruction and evidence requirement in the
  matching Node Skill.
- Automatic advancement references script outputs `NEXT:` and `SKILL:`.
- Skill calls use only Skill names, not provider prefixes.
- User-visible English prose does not mix in Chinese process sentences.
- No source Skill body was copied wholesale.

## Required Claims

- One `node-skill:<skill-name>` for every internal Node Skill

Missing any claim must block Skill review.

## Status Return

Status must be one of `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`.

Write the full report to the report file path. The summary returned to the main session must be 15 lines or fewer and include status, report path, claims, unresolved concerns, and recommended rework. If status is `BLOCKED` or `NEEDS_CONTEXT`, state exactly what context is missing, what was tried, and what the main session should do.
