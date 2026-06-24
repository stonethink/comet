---
name: comet-any
description: "Skill creation guide for creating or optimizing a user-facing Comet-native Skill. Use /comet-any to read project-level preferences in `.comet/skill-preferences.yaml`, resolve real local Skills, show a composition confirmation page, generate Skill Factory output, and internally use CLI backends for validation, Eval, publishing, and optional distribution."
---

# Comet Any - Comet Skill Factory

`/comet-any` is the Comet Skill creation guide. The user only invokes this Skill and describes the
workflow they want to create or optimize. This Skill first resumes existing authoring state,
provides a first-use guide, reads project-level preferences in `.comet/skill-preferences.yaml`,
uses `find-skill` to resolve real local Skill contents, shows the composition confirmation page and
waits for confirmation, then generates a stable composed Skill Bundle. After that it internally
calls CLI backends for validation, Eval, publishing, and optional distribution. CLI is the
internal deterministic backend; the user only invokes this Skill. The ordinary user path must stay
`/comet-any -> comet eval -> comet publish review/approve/run -> comet publish distribute --preview -> comet publish distribute`;
`comet skill` is Low-level Skill utilities, and `comet bundle` is the Advanced Bundle backend.

<IMPORTANT>
Engine is the runtime semantic foundation. Generated workflows with multiple steps, recovery needs,
guardrails, runtime evals, or script side effects must generate a stable composed Skill Bundle, not
only a `SKILL.md` file. The stable composed Skill Bundle required capability set is
`skills/scripts/rules/hooks/references`, and `scripts/rules/hooks` remain the required control
plane instead of optional extras. A Bundle must include `SKILL.md`, `comet/skill.yaml`,
`comet/guardrails.yaml`, `comet/checks.yaml`, `comet/eval.yaml`, `scripts`, `rules`, `hooks`,
`reference`, and `bundle.yaml`. `hooks/*.yaml` are Comet portable hook descriptors and only become
active after `comet publish distribute` compiles them into target platform configuration.
In short, lightweight single-step Skills can skip Engine only when the user is told that Run recovery and
runtime evals will be unavailable.
</IMPORTANT>

## References

- `comet-any/reference/bundle-authoring.md`: Skill Factory backend, Factory metadata, and
  Bundle/CLI lifecycle.
- `comet-any/reference/eval-provider.md`: Eval choices, evidence format, review summaries, and
  fallback gates.

## Hard Gates

- The user only invokes this Skill; do not make manual `comet bundle` or `comet skill` commands
  the user-facing workflow.
- CLI is the internal deterministic backend; do not ask the user to memorize Bundle subcommands.
- Use `find-skill` to resolve real local Skills. Do not infer capability from names alone.
- `.comet/skill-preferences.yaml` is the project-level preferences file and supports `advisory`
  and `strict`; before generation, show the composition proposal with prefer/require sources,
  missing or ambiguous Skills, deviation reasons, scripts/hooks disclosures, and record
  `preferenceHash` after confirmation.
- Missing or ambiguous candidates must pause for user input. Never ignore them or choose for the
  user.
- Use the `comet bundle` CLI to maintain deterministic state. Do not hand-write
  `.comet/bundle-*` state files.
- Show Eval workload and token workload before asking the user to choose `skip / quick / full Eval`.
- If Eval is skipped or fails, do not enter ready, publish, or distribute.
- In non-JSON output, explicitly show `Readiness:`, `Blockers:`, `Warnings:`, and `Evidence:` so
  the user can directly understand readiness, blockers, warnings, evidence, and recovery clues.
- Before publish, read the review summary readiness state. If unresolved candidates, missing
  current-hash Eval evidence, missing current-hash human approval, capability gaps, or executable
  disclosures remain, do not publish ready.
- Human approval is required before publish; ask the user before distribution.
- Prefer native `skill-creator`; must ask the user before fallback to the Comet fallback.

## Steps

### 1. Resume Existing Authoring State

Unless the user explicitly says to start over or abandon previous state, always try to resume the
existing flow first. The first deterministic backend call should be:

```bash
comet bundle factory-guide --project . --json
```

If the guide or later state returns recoverable entries, show a `resume summary` first so
`resumeSummary`, current blockers, and user next steps appear together instead of jumping into a
new flow.

If the user has not provided `<name>`, then run:

```bash
comet publish list --json
```

If recoverable Factory / Bundle authoring states exist, show each name, status, next action, and
reason, then ask which one to continue. Do not ask the user to inspect
`.comet/bundle-authoring/` manually.

After the user provides `<name>` or chooses an existing entry, run:

```bash
comet publish status <name> --json
```

If state exists, resume from it; otherwise continue to the next step and ask whether to derive the
Skill/Bundle name from the target workflow. When you need to explain a blocker in user-facing
text, surface `Current step`, `Suggested user command`, the reason, and the suggested command
directly. Drop back to `comet bundle status` only when debugging the backend.

### 2. Run first-use guide

For first-time use, treat `comet bundle factory-guide --project . --json` as the data source for
the first-use guide and explain:

- `.comet/skill-preferences.yaml` is the project-level preferences file.
- `preference`, `inventory`, `resumable`, `nextQuestions`, and `userMessage` are the important
  guide fields.
- Recommended preferences may be written to `.comet/skill-preferences.yaml` only after explicit
  user confirmation.

If this is the user's first `/comet-any` run, explicitly say that CLI is the internal deterministic
backend and the user only invokes this Skill.

### 3. Choose create/optimize and language

Ask the user to choose:

- `create`: create new Skill Factory output from a goal.
- `optimize`: read existing Skills or candidate Skills and optimize them into a new Comet-native
  Skill.

Also confirm the default language and locales. Record at least the default locale; for multilingual
Skills, explain which files are overridden by locale overlays.

### 4. Read preferences and resolve real Skills

Read project-level preferences from `.comet/skill-preferences.yaml` first. If the file is missing,
scan the platform Skill inventory, group reusable capabilities, recommend default preferences, and
ask whether to save them as project-level preferences. If it exists, use `prefer` and `require`
and run:

```bash
comet bundle candidates --json
```

Then pass candidates through `find-skill` to resolve real sources. `advisory` may add
target-needed Skills when the proposal explains why; `strict` must block required missing Skills,
ambiguity, or denied scripts/hooks. Do not infer capability from names alone; read the final
candidates' real `SKILL.md`, direct references, rules, scripts, and hooks.

### 5. Resolve missing or ambiguous candidates

List every `missing` and `ambiguous` item, then pause and ask the user how to handle it. Do not
silently ignore missing candidates, and do not choose among multiple sources on the user's behalf.
If the backend returns `unresolved factory Skill candidates`, return to this step and resolve the
missing or ambiguous items before generation continues.

After the user chooses a concrete source, update state through the internal backend:

```bash
comet bundle factory-resolve <name> --candidate <query> --source <root-or-hash> --json
```

When the user explicitly agrees to ignore a missing preference, record the reason:

```bash
comet bundle factory-resolve <name> --candidate <query> --ignore-missing --reason <reason> --json
```

### 6. Read real candidate implementations

Read candidate `SKILL.md`, then read referenced references, rules, scripts, and hooks as needed.
This step only reads real implementation files; never execute candidate scripts.

### 7. Show the composition confirmation page and wait for confirmation

Start from `.comet/skill-preferences.yaml` `prefer`/`require` entries and show a composition
proposal with each Skill's `preferenceIndex`, source, hash, role, and call order.

The proposal must identify which Skills came from project-level preferences, which were added by
target semantics, which are missing or ambiguous, whether the plan deviates from the preferred
order, and what executable disclosures scripts/hooks introduce. Before confirmation, do not
generate a Bundle draft. The user may adjust preferences, choose ambiguous sources, remove missing
Skills, switch `advisory`/`strict`, or cancel. Explicitly say that the current screen is the
composition confirmation page. In other words, show the composition confirmation page before any
draft write. If the proposal deviates from the preferred order, the review and proposal summaries
must explain why.

The user must choose one of these three actions on the composition confirmation page:

1. `confirm-generate` - confirm generation, then call
   `comet bundle factory-init <name> --file <plan> --confirmed-proposal`
2. `revise-proposal` - change the goal, preferences, candidates, or control-plane strategy and
   re-run the proposal
3. `cancel` - do not write Bundle state

### 8. Clarify the Skill Factory goal

Confirm with the user:

- The new Skill's goal, usage scenario, and success criteria.
- Which pieces are entry Skill surfaces and which are internal Skill components.
- Shared resources, security boundaries, and Hook/script side effects.
- Target platforms, required/optional capabilities, and capability-gap strategy.
- Whether Engine, runner recovery, and runtime evals are required.

### 9. Initialize the draft and Factory metadata through CLI

First produce a structured plan file. Before writing a Bundle draft, run the dry-run proposal:

```bash
comet bundle factory-propose <name> --file <plan.json> --json
```

Show the proposal composition, `preferenceHash`, blockers, warnings, resolved Skill evidence,
`userSummary`, `actions`, `proposalHash`, and planned file list to the user. After confirmation,
run:

```bash
comet bundle factory-init <name> --file <plan.json> --confirmed-proposal --json
```

`proposalHash` must be recorded and verified by Factory metadata; it is not a user-supplied CLI
parameter.

This command must handle both responsibilities:

- Create the draft in create/optimize mode when no draft exists yet.
- Write preferred order, required Skills, `advisory`/`strict` mode, policies, `preferenceHash`,
  resolved real Skills, default call chain, deviation reasons, and Engine mode into Factory
  metadata so the CLI maintains deterministic state.
- Persist the normalized plan to `.comet/bundle-factory-plans/<name>/plan.json` and record
  `planHash` in metadata for recovery, review, and audit.

Only when resuming old state, debugging backend behavior, or explicitly optimizing an existing
Bundle should the Skill use these commands separately:

```bash
comet bundle draft create <name> --json
comet bundle draft optimize <bundle> --json
comet bundle status <name> --json
```

### 10. Generate the Comet-native Skill source

Prefer native `skill-creator` to generate or optimize the Comet-native Skill. If the native
creator is unavailable, explain the difference and risk first, then ask whether the user allows
the Comet fallback.

Generate entry Skill surfaces, internal Skills, references, scripts, rules, and hooks. The user
does not need to run `comet bundle` or `comet skill` manually; those are internal backend steps.

Generated output must include real Skill evidence plus a composed workflow section, and write
structured evidence to `reference/resolved-skills.json`. The summary should cite resolved Skill
names, sources, descriptions, hashes, and excerpts distilled from real `SKILL.md` bodies.
`resolved-skills.json` must include `sourceSummaries` to prove composition used real local content
instead of name-only guesses.

### 11. Generate the Engine Package

For multi-step or higher-risk output, generate `comet/skill.yaml`, `comet/guardrails.yaml`,
`comet/checks.yaml`, and `comet/eval.yaml`.

The Engine Package must match the call chain, guardrails, runtime checks, runtime evals, the
scripts/rules/hooks control plane, and script side-effect declarations. Engine-enabled generated
Skills must also write `comet/eval.yaml` using the `authoring-skill` profile and the
`authoring-skill-smoke` quick eval.

When running local evals internally, prefer the unified entry instead of hand-built pytest
commands:

```bash
comet eval collect --manifest <path-to-comet/eval.yaml>
comet eval run --manifest <path-to-comet/eval.yaml> --html
```

If `runnerMode` is `standalone`, the generated Skill should instruct the Agent to store run state
under `.comet/runs/<run-id>`. When persistent execution is needed, the internal runner entry is:

```bash
comet skill run <skill> --run-id <run-id> --json
comet skill resume --run-id <run-id> --status succeeded --summary <summary> --json
comet skill eval --run-id <run-id> --scope completion --json
```

### 12. Compile and validate

Run at least one reference-platform compile:

```bash
comet bundle compile <name> --platform <id> --json
```

If there are capability gaps or executable disclosures, show them to the user. Required capability
gaps block that platform; optional capability gaps require the user to explicitly choose skip.

### 13. Show Eval workload and ask skip/quick/full

Run:

```bash
comet bundle eval-plan <name> --level quick --json
comet bundle eval-plan <name> --level full --json
```

Explain quick/full token workload, estimated runs, and coverage. Then ask the user to choose
`skip / quick / full Eval`. If the user chooses skip, keep the state in draft and do not continue
to ready.

### 14. Record Eval evidence

After the user chooses quick/full, call the Eval provider, produce a structured result file, then
run:

```bash
comet bundle eval-record <name> --result <file> --json
```

If Eval fails or the hash does not match, stop and return to draft repair.

### Show user-facing readiness and wait for explicit approval

First run:

```bash
comet publish review <name> --platform <reference-platform> --json
```

Use that summary to show entry Skills, internal Skills, `planHash`, `preferenceHash`,
project-level preference mode, real Skill evidence, recommended call order, deviations from the
preferred order, capability gaps, executable disclosures, quick/full Eval workload, Eval result,
and target platforms. If the call chain deviates from the preferred order, explain why.

The user-facing readiness summary must be shown directly and must include at least
`Publish readiness:`, `User next steps:`, `Readiness:`, `Blockers:`, `Warnings:`, and `Evidence:`.
In non-JSON output, read those fields line by line. When `Readiness: blocked`, resolve candidate
recovery, Eval, or review blockers before continuing to publish. If readiness is not
`publishable`, or if it says Missing Eval evidence blocks ready publish, stop before publish.

Approve:

```bash
comet publish approve <name> --reviewer <reviewer> --json
```

Reject:

```bash
comet bundle review <name> --reject --reviewer <reviewer> --json
```

### 15. Publish

Only after the current hash has passed Eval and received human approval, run:

```bash
comet publish run <name> --platform <reference-platform> --json
```

### 16. Preview distribution

Before real distribution, first run:

```bash
comet publish distribute <name> --platform <id> --scope project --preview --json
```

Show `Distribution preview`, planned files, unsupported capability, executable disclosures, and
`No files were written` directly to the user. Only after the user confirms the planned files,
unsupported capability, and executable disclosures in preview may the Skill remove `--preview` and
execute real distribution.

### 17. Ask before executing distribution

After publish, ask the user whether to distribute. Never distribute automatically.

If the user agrees, first show platform capability gaps and executable disclosures. Hooks/scripts
require confirmation before distribution. Then run:

```bash
comet publish distribute <name> --platform <id> --scope project --json
```

If the user explicitly confirms executable disclosures, add:

```bash
--confirm-executables
```

If the user explicitly chooses to skip an optional capability, add:

```bash
--skip-capability <capability>
```
