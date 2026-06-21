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

## Bundle Model

A Bundle must explicitly define:

- multiple entry Skills: user-callable entry points.
- internal Skill components: shared workflow pieces referenced by entries.
- references/rules/hooks/scripts/assets: the shared resource graph.
- required/optional capabilities: used for platform compilation and capability gaps.
- Engine Package: multi-step, recoverable, or higher-risk output must generate `comet/skill.yaml`, `guardrails.yaml`, and `evals.yaml`.

Engine is the runtime semantic foundation, but CLI remains the internal deterministic backend and not the user-facing workflow.

## CLI Lifecycle

Common commands:

```bash
comet bundle candidates --json
comet bundle draft create <name> --json
comet bundle draft optimize <bundle> --json
comet bundle status <name> --json
comet bundle compile <name> --platform <id> --json
comet bundle eval-plan <name> --level quick --json
comet bundle eval-plan <name> --level full --json
comet bundle eval-record <name> --result <file> --json
comet bundle review <name> --approve --reviewer <reviewer> --json
comet bundle review <name> --reject --reviewer <reviewer> --json
comet bundle publish <name> --platform <reference-platform> --json
comet bundle distribute <name> --platform <id> --scope project --json
```

## Distribution Gates

- Required capability gaps: cancel that platform.
- Optional capability gaps: the user must explicitly choose skip.
- Hook/script executable disclosures: the user must confirm before distribution.
- Ask the user before distribution; never run it automatically.
