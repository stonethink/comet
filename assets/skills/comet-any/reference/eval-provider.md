# Eval Provider Reference

## Provider priority

Prefer native `skill-creator` generation and Eval capabilities. If the native capability is
unavailable, ask the user before fallback to the Comet fallback. Never enable fallback by default.

## Eval choices

Before any provider action, show:

- `quick` estimated runs, covered components, and token workload.
- `full` estimated runs, covered components, and token workload.
- the three choices: `skip / quick / full Eval`.

If Eval is skipped or fails, do not enter ready, generate an install candidate, or install/enable.

For ordinary users, the Eval path remains single-purpose: daily evaluation goes through
`comet eval`. `/comet-any` may internally call `comet bundle eval-plan` and
`comet bundle eval-record` to plan and record evidence, but must not present them as replacement
user-facing Eval commands.

## Result recording

The Eval provider must produce structured JSON, then record it with:

```bash
comet bundle eval-record <name> --result <file> --json
```

The result must bind to the current Bundle hash, cover every entry Skill, and include Bundle
compile and safety evidence. Old-hash evidence may remain on disk but cannot advance state.

## Human review

Passing Eval still requires human approval. The review summary must include at least:

First run `comet publish review <name> --platform <reference-platform> --json`, then use its
output to show:

- Bundle name, version, and hash.
- Multiple entry and internal Skill lists.
- `planHash`, `preferenceHash`, and `reference/resolved-skills.json` real Skill evidence,
  including project-level preference mode, required Skills, `sourceSummaries`, and the composed
  workflow summary.
- Recommended call order and `preferenceIndex`.
- Every item that deviates from the preferred order, plus the reason.
- Whether `.comet/skill-preferences.yaml` drifted after Factory initialization; `advisory` mode
  warns, while `strict` mode blocks.
- Whether the stable composed Skill Bundle required capability set
  `skills/scripts/rules/hooks/references` is complete, and whether `scripts/rules/hooks` remain
  the required control plane.
- Whether `comet/skill.yaml`, `comet/guardrails.yaml`, `comet/checks.yaml`, and `comet/eval.yaml`
  were generated.
- Whether `hooks/*.yaml` are treated only as portable hook descriptors until
  `comet publish distribute` compiles them for the target platform.
- Capability gaps and executable disclosures.
- Eval choice, token workload, and result summary.
- `Validate this Skill` and the next action so the user knows why the candidate can become ready
  or is blocked.

Readiness blockers stop ready/install. If missing current-hash Eval evidence, missing human approval,
required capability gaps, or unconfirmed executable disclosures remain, the flow must stop in
review and cannot continue to ready.

Only after explicit approval may the agent run `comet publish approve` and then generate the install
candidate.

## Install preview

Before real installation, preview is mandatory:

```bash
comet publish distribute <name> --platform <id> --scope project --preview --json
```

Preview is a required check, not an optional extra. It should show:

- `Install preview`
- planned files
- unsupported capability
- executable disclosures
- `No files were written`

Only after the user confirms the preview result may the Skill remove `--preview` and execute real
installation.
