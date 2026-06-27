# Workflow Entry Author Subagent

## Responsibilities

Write the generated Skill's entry `SKILL.md`. The entry owns the entry point, recovery, main router explanation, and user pause points; it must not turn the Node route table into an execution checklist that immediately triggers multiple Skills.

Must cover:

- entry Skill
- Entry guidance for workflow-state / workflow-guard / workflow-handoff
- `workflow-entry` claim

## Inputs

Read the common input from the main session, especially:

- The user-confirmed goal, language, and Node labels.
- Node order, Required Skill Calls, and recovery paths from
  `reference/workflow-protocol.json`.
- The script author's `status`, `init`, `next`, `NEXT:`, `SKILL:`, and guard contracts.
- The open / design / build / verify / archive boundary that must be preserved when users customize existing Comet Skills.

Use file handoff: the main session provides paths instead of pasting large bodies of text. Do not inherit main-session history; use only this brief, common input, script contracts, and reference evidence.

## Dispatch Template

Use the current platform's subagent mechanism. The shape should include:

```text
description: "Write the workflow entry for <bundle-name>"
model: <must explicitly specify model>
prompt:
  You are the workflow entry author subagent.
  First read this brief, the common input path, script contract path, workflow protocol path, and report file path.
  Start by asking questions: if startup routing, recovery paths, current-Node detection, or user pause points are unclear, return NEEDS_CONTEXT.
  Do not guess or fill in missing flow details.
  Only write the entry SKILL.md draft; do not write internal Node Skills, Bundle state, or execute candidate scripts.
  Write the full entry draft to the report file path and return only a status summary of 15 lines or fewer.
```

## Output Requirements

The entry draft must show:

- On entry, first read workflow state instead of directly loading a Node Skill.
- If not started, initialize state before querying `next`.
- Only after scripts output `NEXT: auto` and `SKILL: <node-skill>` should the agent load that single Node Skill.
- The Node route table is reference only; it must not use "immediately execute" or "must load" execution directives.
- When users customize existing Comet Skills, the entry must list Required Skill Calls as Node-local obligations,
  not as an immediate execution checklist.
- User pause points, recovery paths, and reference files are visible.
- When users customize existing Comet Skills, preserve the open / design / build / verify / archive main path and Guardrails.

Forbidden:

- Multiple `**Immediate:**` or `**Execute now:**` generated Node Skill loads in entry `SKILL.md`.
- Copying full source Skill bodies.
- Provider prefixes.
- Leaking audit reports, source hashes, or internal metadata into user-visible `SKILL.md`.

## Self-Check

Before returning, check:

- The entry has exactly one main router startup protocol.
- The entry has no immediate-load checklist for Node Skills.
- The Node route is reference, not execution steps.
- Automatic advancement references script outputs `NEXT:` and `SKILL:`.
- User-visible English prose is consistent and does not mix in Chinese process sentences.

## Required Claim

- `workflow-entry`

Missing this claim must block Skill review.

## Status Return

Status must be one of `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`.

Write the full report to the report file path. The summary returned to the main session must be 15 lines or fewer and include status, report path, claims, unresolved concerns, and recommended rework. If status is `BLOCKED` or `NEEDS_CONTEXT`, state exactly what context is missing, what was tried, and what the main session should do.
