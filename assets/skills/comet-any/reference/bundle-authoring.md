# Bundle Authoring Reference

## Skill Factory Backend

`comet bundle` is the internal deterministic backend for `/comet-any`. The user does not need to run
Bundle CLI directly. This Skill must adapt creator output into a Comet-native Skill Package before
passing it to the Bundle backend for compile, Eval, publish, and distribution.

The order in `.comet/skills.txt` must be preserved as Factory metadata. If the generated call chain
deviates from that order, the review summary must include the reason.

## Authoring Modes

`/comet-any` supports two modes:

- `create`: create a new multi-Skill Bundle from the user's goal.
- `optimize`: read existing candidate Skills and organize them into a publishable Bundle.

Both modes must use `comet bundle` commands to maintain state. Do not write internal JSON state directly.

## Candidate Reads

1. Prefer project `.comet/skills.txt`.
2. Use `find-skill` to resolve real local Skill sources and contents.
3. If preferences are absent, scan platform Skill directories.
4. Use `comet bundle candidates --json` to obtain `available`, `missing`, and `ambiguous`.
5. For every available candidate, read candidate `SKILL.md`.
6. Pause and ask the user about missing or ambiguous candidates.

Candidate scripts are read-only inputs and must never be executed.
`factory-generate` fails closed with `unresolved factory Skill candidates` while any candidate is
`missing` or `ambiguous`. `/comet-any` must ask the user to choose a concrete source, remove the
missing item, or update preferences before using `comet bundle factory-resolve` to update Factory
metadata.

## Bundle Model

A Bundle must explicitly define:

- multiple entry Skills: user-callable entry points.
- internal Skill components: shared workflow pieces referenced by entries.
- references/rules/hooks/scripts/assets: the shared resource graph.
- required/optional capabilities: used for platform compilation and capability gaps.
- Engine Package: multi-step, recoverable, or higher-risk output must generate `comet/skill.yaml`, `guardrails.yaml`, and `evals.yaml`.
- Engine Eval manifest: Engine-enabled generated Skills must also write `comet/eval.yaml` using the `authoring-skill` profile and the `authoring-skill-smoke` quick eval.
- real Skill evidence: generated output must include `reference/resolved-skills.json` with resolved Skill sources, descriptions, hashes, references, script summaries, and `sourceSummaries` distilled from `SKILL.md` bodies.

Engine is the runtime semantic foundation, but CLI remains the internal deterministic backend and not the user-facing workflow.

## CLI Lifecycle

`factory-init` expects a stable `plan.json` shape. Recommended minimum form:

```json
{
  "goal": "Create a review-oriented Comet-native Skill.",
  "preferredSkills": ["brainstorming", "writing-plans"],
  "callChain": [
    "brainstorming",
    { "skill": "writing-plans", "preferenceIndex": 1 }
  ],
  "deviations": [
    {
      "skill": "writing-plans",
      "expectedIndex": 1,
      "actualIndex": 0,
      "reason": "The user already provided a concrete workflow."
    }
  ],
  "engineMode": "deterministic",
  "runnerMode": "standalone",
  "mode": "create",
  "creator": "native",
  "defaultLocale": "zh",
  "locales": ["zh", "en"]
}
```

Field rules:

- `goal`: the user-readable outcome the Skill should create.
- `preferredSkills`: explicit preferred order; if omitted, infer from `.comet/skills.txt` and `callChain`.
- `callChain`: the recommended execution chain. String items are the common case; object items are for explicit `preferenceIndex`.
- `deviations`: required whenever `callChain` deviates from preferred order so the review summary can explain it directly.
- `mode=optimize` requires `sourceRoot`.
- `engineMode=none` implies `engineEnabled=false` by default; other modes default to enabled.

After reading the plan, `factory-init` writes the normalized result to
`.comet/bundle-factory-plans/<name>/plan.json` and records `planPath` plus `planHash` in Factory
metadata. Later `/comet-any` review summaries should cite those fields as the plan evidence for the
current generated output. If the plan changes, run `factory-init` again.

Common commands:

```bash
comet bundle candidates --json
comet bundle factory-init <name> --file <plan.json> --json
comet bundle factory-resolve <name> --candidate <query> --source <root-or-hash> --json
comet bundle factory-resolve <name> --candidate <query> --ignore-missing --reason <reason> --json
comet bundle draft create <name> --json
comet bundle draft optimize <bundle> --json
comet bundle status <name> --json
comet bundle compile <name> --platform <id> --json
comet bundle eval-plan <name> --level quick --json
comet bundle eval-plan <name> --level full --json
comet bundle eval-record <name> --result <file> --json
comet bundle review-summary <name> --platform <reference-platform> --json
comet bundle review <name> --approve --reviewer <reviewer> --json
comet bundle review <name> --reject --reviewer <reviewer> --json
comet bundle publish <name> --platform <reference-platform> --json
comet bundle distribute <name> --platform <id> --scope project --json
```

Before publishing, read the review summary readiness state. If unresolved candidates, current-hash
Eval evidence, current-hash human approval, capability gaps, or executable disclosures are missing,
do not publish a ready Bundle. Missing Eval evidence blocks ready publish. Non-JSON output must also
explicitly show `Readiness:`, `Blockers:`, `Warnings:`, and `Evidence:`. If `Readiness: blocked`,
handle candidate recovery, Eval, or review blockers before continuing to publish.

## Runner Modes

When `runnerMode=change`, generated Skill run state is bound to an OpenSpec change directory. When
`runnerMode=standalone`, the generated Skill must not assume a change exists; the internal runner
uses `.comet/runs/<run-id>` for the same Run state, trajectory, artifacts, snapshot, and Eval
evidence.

Common internal commands:

```bash
comet skill run <skill> --run-id <run-id> --json
comet skill resume --run-id <run-id> --json
comet skill resume --run-id <run-id> --status succeeded --summary <summary> --json
comet skill eval --run-id <run-id> --scope completion --json
```

## Distribution Gates

- Required capability gaps: cancel that platform.
- Optional capability gaps: the user must explicitly choose skip.
- Hook/script executable disclosures: the user must confirm before distribution.
- Ask the user before distribution; never run it automatically.
