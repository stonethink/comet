# Eval Provider Reference

## Provider Priority

Prefer native `skill-creator` generation and Eval capabilities. If the native capability is unavailable, ask the user before fallback to the Comet fallback. Never enable fallback by default.

## Eval Choices

Before any provider action, show:

- `quick` estimated runs, covered components, and token workload.
- `full` estimated runs, covered components, and token workload.
- the three choices: `skip / quick / full Eval`.

If Eval is skipped or fails, do not enter ready, publish, or distribute.

## Result Recording

The Eval provider must produce structured JSON, then record it with:

```bash
comet bundle eval-record <name> --result <file> --json
```

The result must bind to the current Bundle hash, cover every entry Skill, and include Bundle compile and safety evidence. Old-hash evidence may remain on disk but cannot advance state.

## Human Review

Passing Eval still requires human approval. The review summary must include at least:

First run `comet bundle review-summary <name> --platform <reference-platform> --json`, then use its output to show:

- Bundle name, version, and hash.
- Multiple entry and internal Skill lists.
- `planHash` and `reference/resolved-skills.json` real Skill evidence.
- Recommended call order and `preferenceIndex`.
- Every item that deviates from the preferred order, plus the reason.
- Whether `comet/skill.yaml`, `guardrails.yaml`, and `evals.yaml` were generated.
- Capability gaps and executable disclosures.
- Eval choice, token workload, and result summary.

Only after explicit approval may the agent run `comet bundle review --approve` and publish.
