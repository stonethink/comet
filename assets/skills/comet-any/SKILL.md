---
name: comet-any
description: "Create or optimize a user-facing Comet-native Skill. Use /comet-any to read `.comet/skills.txt`, resolve real local Skills, generate Skill Factory output, and internally use CLI backends for validation, Eval, publishing, and optional distribution."
---

# Comet Any - Comet Skill Factory

`/comet-any` is the Comet Skill Factory. The user only invokes this Skill and describes the
workflow they want to create or optimize. This Skill reads user preferences, uses `find-skill`
to locate real local Skill contents, composes a Comet-native Skill, and internally calls CLI
backends for validation, Eval, publishing, and optional distribution. CLI is the internal
deterministic backend, not the user-facing workflow.

<IMPORTANT>
Engine is the runtime semantic foundation for generated Skills. Generated workflows with multiple
steps, recovery needs, guardrails, runtime evals, or script side effects must generate
`comet/skill.yaml`, `guardrails.yaml`, and `evals.yaml`. A lightweight single-step Skill may skip
Engine, but the user must be told that Run recovery and runtime evals will be unavailable.
</IMPORTANT>

## References

- `comet-any/reference/bundle-authoring.md`: Skill Factory backend, Factory metadata, and Bundle/CLI lifecycle.
- `comet-any/reference/eval-provider.md`: Eval choices, evidence format, review summaries, and fallback gates.

## Hard Gates

- The user only invokes this Skill; do not make manual `comet bundle` or `comet skill` commands the user-facing workflow.
- Use `find-skill` to resolve real local Skills. Do not infer capability from names alone.
- The line order in `.comet/skills.txt` is the recommended call order. The generated call chain should follow it when possible; if it deviates from the preferred order, the review summary must explain why.
- Missing or ambiguous candidates must pause for user input. Never ignore them or choose for the user.
- Use the `comet bundle` CLI to maintain deterministic state. Do not hand-write `.comet/bundle-*` state files.
- Show Eval workload and token workload before asking the user to choose `skip / quick / full Eval`.
- If Eval is skipped or fails, do not enter ready, publish, or distribute.
- Require human approval before publish; ask the user before distribution.
- Prefer native `skill-creator`; must ask the user before fallback to the Comet fallback.

## Steps

### 1. Recover Existing Authoring State

First run:

```bash
comet bundle status <name> --json
```

If the user has not provided `<name>`, ask for the Skill/Bundle name or ask whether to derive it from the target workflow. If state exists, resume from it; otherwise continue to the next step.

### 2. Choose create/optimize and Language

Ask the user to choose:

- `create`: create new Skill Factory output from a goal.
- `optimize`: read existing Skills or candidate Skills and optimize them into a new Comet-native Skill.

Also confirm the default language and locales. Record at least the default locale; for multilingual Skills, explain which files are overridden by locale overlays.

### 3. Read Preferences and Resolve Real Skills

Read `.comet/skills.txt` first. If it exists, preserve its order and run:

```bash
comet bundle candidates --json
```

Then pass candidates through `find-skill` to resolve real sources. Do not infer capability from names alone; read the final candidates' real `SKILL.md`, direct references, rules, scripts, and hooks.

### 4. Resolve Missing or Ambiguous Candidates

List every `missing` and `ambiguous` item, then pause and ask the user how to handle it. Do not silently ignore missing candidates, and do not choose among multiple sources on the user's behalf.
If the backend returns `unresolved factory Skill candidates`, return to this step and resolve the missing or ambiguous items before generation continues.

### 5. Read Real Candidate Implementations

Read candidate `SKILL.md`, then read referenced references, rules, scripts, and hooks as needed. This step only reads real implementation files; never execute candidate scripts.

### 6. Propose the Default Call Chain

Start with the recommended call order from `.comet/skills.txt` and record each Skill's `preferenceIndex`.
If goals, dependencies, risk, recovery needs, safety confirmations, or platform constraints require a different order, record every item that deviates from the preferred order and explain why.

### 7. Clarify the Skill Factory Goal

Confirm with the user:

- The new Skill's goal, usage scenario, and success criteria.
- Which pieces are entry Skills and which are internal Skill components.
- Shared resources, security boundaries, and Hook/script side effects.
- Target platforms, required/optional capabilities, and capability-gap strategy.
- Whether Engine, runner recovery, and runtime evals are required.

### 8. Initialize the Draft and Factory Metadata Through CLI

First produce a structured plan file, then run:

```bash
comet bundle factory-init <name> --file <plan.json> --json
```

This command must handle both responsibilities:

- Create the draft in create/optimize mode when no draft exists yet.
- Write preferred order, resolved real Skills, default call chain, deviation reasons, and Engine mode into Factory metadata so the CLI maintains deterministic state.
- Persist the normalized plan to `.comet/bundle-factory-plans/<name>/plan.json` and record `planHash` in metadata for recovery, review, and audit.

Only when resuming old state, debugging backend behavior, or explicitly optimizing an existing Bundle should the Skill use these commands separately:

```bash
comet bundle draft create <name> --json
comet bundle draft optimize <bundle> --json
comet bundle status <name> --json
```

### 9. Generate Comet-native Skill Source

Prefer native `skill-creator` to generate or optimize the Comet-native Skill. If the native creator is unavailable, explain the difference and risk first, then ask whether the user allows the Comet fallback.

Generate entry Skills, internal Skills, references, and scripts. The user does not need to run `comet bundle` or `comet skill` manually; those are internal backend steps.

Generated output must include a real Skill evidence summary and write structured evidence to
`reference/resolved-skills.json`. The summary should cite resolved Skill names, sources,
descriptions, and hashes to prove composition used real local content instead of name-only guesses.

### 10. Generate the Engine Package

For multi-step or higher-risk output, generate `comet/skill.yaml`, `guardrails.yaml`, and `evals.yaml`.
The Engine Package must match the call chain, guardrails, runtime evals, and script side-effect declarations.

### 11. Compile and Validate

Run at least one reference-platform compile:

```bash
comet bundle compile <name> --platform <id> --json
```

If there are capability gaps or executable disclosures, show them to the user. Required capability gaps block that platform; optional capability gaps require the user to explicitly choose skip.

### 12. Show Eval Workload and Ask skip/quick/full

Run:

```bash
comet bundle eval-plan <name> --level quick --json
comet bundle eval-plan <name> --level full --json
```

Explain quick/full token workload, estimated runs, and coverage. Then ask the user to choose `skip / quick / full Eval`. If the user chooses skip, keep the state in draft and do not continue to ready.

### 13. Record Eval Evidence

After the user chooses quick/full, call the Eval provider, produce a structured result file, then run:

```bash
comet bundle eval-record <name> --result <file> --json
```

If Eval fails or the hash does not match, stop and return to draft repair.

### 14. Show Review Summary and Wait for Explicit Approval

First run:

```bash
comet bundle review-summary <name> --platform <reference-platform> --json
```

Use that summary to show entry Skills, internal Skills, planHash, real Skill evidence, recommended call order, deviations from the preferred order, capability gaps, executable disclosures, quick/full Eval workload, Eval result, and target platforms. If the call chain deviates from the preferred order, the review summary must explain why.

Approve:

```bash
comet bundle review <name> --approve --reviewer <reviewer> --json
```

Reject:

```bash
comet bundle review <name> --reject --reviewer <reviewer> --json
```

### 15. Publish

Only after the current hash has passed Eval and received human approval, run:

```bash
comet bundle publish <name> --platform <reference-platform> --json
```

### 16. Ask Whether to Distribute

After publish, ask the user whether to distribute. Do not distribute automatically.

If the user agrees, show platform capability gaps and executable disclosures first. Hooks/scripts require confirmation before distribution. Then run:

```bash
comet bundle distribute <name> --platform <id> --scope project --json
```

If the user explicitly confirms executable disclosures, add:

```bash
--confirm-executables
```

If the user explicitly chooses to skip an optional capability, add:

```bash
--skip-capability <capability>
```
