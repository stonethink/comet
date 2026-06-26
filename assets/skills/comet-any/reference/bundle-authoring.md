# Bundle Authoring Reference

## Skill Factory Backend

`comet bundle` is the internal deterministic backend for `/comet-any`. The user does not need to
run Bundle CLI directly. This Skill must adapt creator output into a Comet-native Skill Package
before passing it to the Bundle backend for compile, Eval, install-candidate generation, and
installation.

For ordinary users, the first layer must be Skill Maker: `Customize /comet`, `Create a new Skill`,
`Upgrade an existing Skill`, and add Skill / replace Skill / turn off Skill. These ordinary users do not
need to understand Bundle, Factory, or composition; `comet bundle` is exposed only as the Advanced
Bundle backend for backend-state auditing.

`.comet/skill-preferences.yaml` is the project-level preferences file. It supports `advisory` /
`strict`, `prefer`, `require`, and missing/ambiguous/deviation/scripts/hooks policies.
`/comet-any` must first show a composition proposal that explains preference sources, semantic
additions, missing or ambiguous Skills, deviation reasons, and executable disclosures. After user
confirmation, Factory metadata must record `preferenceHash`, preference mode, policies, and
required Skills. If the generated call chain deviates from the preferred order, the review summary
must include the reason.

## First-use and resume backend

Before starting a new authoring flow, `/comet-any` must check guide output and resumable state in
this order:

```bash
comet bundle factory-guide --project . --json
comet publish list --json
comet publish status <name> --json
```

`factory-guide` returns the shared JSON used by both the first-use guide and resume entry point.
Important fields:

- `preference`: current project-level preferences, or a recommended default to write into
  `.comet/skill-preferences.yaml`.
- `inventory`: a platform Skill inventory summary used by the first-use guide to explain reusable
  capability in the current project.
- `resumable`: recoverable Factory / Bundle state entries.
- `nextQuestions`: questions that still require user confirmation during first use or resume.
- `userMessage`: guide copy that can be shown directly to the user.

Resume-related output should be surfaced as a `resume summary`, prioritizing `resumeSummary`,
`Current step`, `Suggested user command`, and blocker reason instead of internal state-file paths.

## Authoring starting points

`/comet-any` exposes three starting points to ordinary users:

- `Customize /comet`: adjust steps inside the `/comet` protected boundary; only add Skill,
  replace Skill, or turn off Skill.
- `Create a new Skill`: create a new Comet-native Skill from the user's target.
- `Upgrade an existing Skill`: read existing Skills or candidate Skills and upgrade them into a new
  Comet-native Skill.

Both persisted backend modes must use `comet bundle` commands to maintain state. Do not write
internal JSON state directly.

## Candidate reads

1. Prefer project `.comet/skill-preferences.yaml`.
2. If preferences are absent, scan the platform Skill inventory, group reusable capabilities,
   recommend defaults, and ask whether to save them.
3. Use `find-skill` to resolve real local Skill sources and contents.
4. Use `comet bundle candidates --json` to obtain `available`, `missing`, and `ambiguous`.
5. For every available candidate, read candidate `SKILL.md`.
6. Pause and ask the user about missing or ambiguous candidates.

Candidate scripts are read-only inputs and must never be executed. `factory-generate` fails closed
with `unresolved factory Skill candidates` while any candidate is `missing` or `ambiguous`.
`/comet-any` must ask the user to choose a concrete source, remove the missing item, or update
preferences before using `comet bundle factory-resolve` to update Factory metadata.

## Bundle model

A Bundle must explicitly define:

- multiple entry Skills: user-callable entry points.
- internal Skill components: shared workflow pieces referenced by entries.
- internal stage Skills: every stage in a multi-step workflow should generate one internal Skill;
  the entry Skill only owns the entry point, recovery, and orchestration guidance.
- `stageNames`: records user-confirmed stage names. The proposal must show recommended stage names
  and editable name fields so users can customize multiple internal stage Skill names.
- references/rules/hooks/scripts/assets: the shared resource graph, with `scripts/rules/hooks`
  kept as the required control plane.
- The stable composed Skill Bundle required capability set is
  `skills/scripts/rules/hooks/references`.
- required/optional capabilities: used for platform compilation and capability gaps.
- Engine Package: multi-step, recoverable, or higher-risk output must generate
  `comet/skill.yaml`, `comet/guardrails.yaml`, `comet/checks.yaml`, and `comet/eval.yaml`.
- Engine Eval manifest: Engine-enabled generated Skills must also write `comet/eval.yaml` using
  the `authoring-skill` profile and the `authoring-skill-smoke` quick eval.
- Portable hooks: `hooks/*.yaml` files are Comet portable hook descriptors and become active only
  after `comet publish distribute` compiles them into target-platform configuration.
- real Skill evidence: generated output must include `reference/resolved-skills.json` with
  resolved Skill sources, descriptions, hashes, references, script summaries, and
  `sourceSummaries` distilled from `SKILL.md` bodies.
- project-level preference evidence: generated output must record `preferenceHash`, mode,
  policies, required Skills, and the preference file source.

Engine is the runtime semantic foundation, but CLI remains the internal deterministic backend and
not the user-facing workflow.

## CLI lifecycle

`factory-propose` and `factory-init` expect a stable `plan.json` shape. Recommended minimum form:

```json
{
  "goal": "Create a review-oriented Comet-native Skill.",
  "preferredSkills": ["brainstorming", "writing-plans"],
  "callChain": [
    "brainstorming",
    { "skill": "writing-plans", "preferenceIndex": 1 }
  ],
  "stageNames": [
    {
      "skill": "brainstorming",
      "name": "review-workflow-discovery",
      "label": "Discovery"
    },
    {
      "skill": "writing-plans",
      "name": "review-workflow-plan",
      "label": "Plan"
    }
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
- `preferredSkills`: explicit preferred order; if omitted, infer from
  `.comet/skill-preferences.yaml` and `callChain`.
- `callChain`: the recommended execution chain. String items are the common case; object items are
  for explicit `preferenceIndex`.
- `stageNames`: optional. Each item specifies source `skill`, final internal stage Skill `name`,
  and optional `phase` / `step` / `label`. If omitted, the backend generates recommended stage
  names; custom names must be unique kebab-case values.
- `deviations`: required whenever `callChain` deviates from preferred order so the review summary
  can explain it directly.
- `mode=optimize` requires `sourceRoot`.
- `engineMode=none` implies `engineEnabled=false` by default; other modes default to enabled.

Run `factory-propose` first as a dry run that does not write Bundle authoring state:

```bash
comet bundle factory-propose <name> --file <plan.json> --json
```

It previews the composition proposal, resolved Skills, blockers, warnings, preference mode, and
`preferenceHash`. Proposal output should also provide these user-facing fields directly:

- `userSummary`: composition summary shown to the user.
- `skillMakerSummary.stageNames`: recommended stage names, user-provided names, source Skills, and
  stage labels for rendering editable name fields.
- `actions`: at least `confirm-generate`, `revise-proposal`, and `cancel`.
- `proposalHash`: the hash of the current proposal.

After user confirmation, run `factory-init`. `factory-init` reads the plan, writes the normalized
result to `.comet/bundle-factory-plans/<name>/plan.json`, and records `planPath`, `planHash`, and
`preferenceHash` in Factory metadata. Later `/comet-any` review summaries should cite those fields
as the plan and preference evidence for the current generated output. If the plan or project-level
preferences change, regenerate the composition proposal or run `factory-init` again.

Real initialization must require proposal confirmation:

```bash
comet bundle factory-init <name> --file <plan.json> --confirmed-proposal --json
```

`proposalHash` is recorded by Factory metadata and used to confirm the current proposal; the user
does not pass it as a CLI parameter.

If the proposal still has missing, ambiguous, or composition blockers, create an unresolved Factory
state only for `factory-resolve`; after resolving the blockers, run
`factory-init --confirmed-proposal` again to persist confirmation metadata before
`factory-generate`, review, or publish can continue.

`status` / `list` output should include `resumeSummary` so `/comet-any` and the docs can surface
the resume entry point without making users read internal state files.

Common commands:

```bash
comet bundle candidates --json
comet publish list --json
comet bundle factory-propose <name> --file <plan.json> --json
comet bundle factory-init <name> --file <plan.json> --json
comet bundle factory-resolve <name> --candidate <query> --source <root-or-hash> --json
comet bundle factory-resolve <name> --candidate <query> --ignore-missing --reason <reason> --json
comet bundle factory-init <name> --file <plan.json> --confirmed-proposal --json
comet bundle draft create <name> --json
comet bundle draft optimize <bundle> --json
comet publish status <name> --json
comet bundle compile <name> --platform <id> --json
comet bundle eval-plan <name> --level quick --json
comet bundle eval-plan <name> --level full --json
comet bundle eval-record <name> --result <file> --json
comet publish review <name> --platform <reference-platform> --json
comet publish approve <name> --reviewer <reviewer> --json
comet bundle review <name> --reject --reviewer <reviewer> --json
comet publish run <name> --platform <reference-platform> --json
comet publish distribute <name> --platform <id> --scope project --preview --json
comet publish distribute <name> --platform <id> --scope project --json
```

Before ready, read the review summary readiness state. If unresolved candidates, missing
current-hash Eval evidence, missing current-hash human approval, capability gaps, or executable
disclosures are unresolved, do not mark ready. Missing Eval evidence cannot become ready.
Non-JSON output must also explicitly show `Readiness:`, `Blockers:`, `Warnings:`, and `Evidence:`.
User-facing summaries must also include `Validate this Skill` and the next action. If
`Readiness: blocked`, resolve candidate recovery, Eval, or review blockers before continuing.

## Runner modes

When `runnerMode=change`, generated Skill run state is bound to an OpenSpec change directory. When
`runnerMode=standalone`, the generated Skill must not assume a change exists; the internal runner
uses `.comet/runs/<run-id>` for the same Run state, trajectory, artifacts, snapshot, and Eval
evidence.

Common internal commands:

```bash
comet skill run <skill> --run-id <run-id> --json
comet skill resume --run-id <run-id> --json
comet skill resume --run-id <run-id> --status succeeded --summary <summary> --json
comet skill check --run-id <run-id> --scope completion --json
```

## Installation gates

- Required capability gaps: cancel that platform.
- Optional capability gaps: the user must explicitly choose skip.
- Hook/script executable disclosures: the user must confirm before installation.
- Before real installation, run
  `comet publish distribute <name> --platform <id> --scope project --preview --json`.
- Preview should explicitly show `Install preview`, planned files, unsupported capability,
  executable disclosures, and `No files were written`.
- Ask the user before installation; never run it automatically.
