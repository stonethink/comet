---
name: comet-any
description: "Create or optimize platform-independent multi-Skill Bundles. Use /comet-any to read candidate Skills, generate a Bundle draft, run Eval, require human review, publish, and optionally distribute."
---

# Comet Any - Multi-Skill Bundle Authoring

`/comet-any` turns multiple existing Skills or a new workflow into a platform-independent Comet Skill Bundle. A Bundle can include multiple entry Skills, internal Skill components, rules, hooks, scripts, references, assets, and optional Engine metadata; after distribution, the target platform executes native Skills, rules, hooks, and scripts.

<IMPORTANT>
This Skill must not claim generated Skills require Engine execution. Engine is only optional metadata or future runtime information; after distribution, the target platform executes the Skill, rules, hooks, and scripts natively.
</IMPORTANT>

## References

- `comet-any/reference/bundle-authoring.md`: Bundle authoring state, candidate reads, and CLI lifecycle.
- `comet-any/reference/eval-provider.md`: Eval choices, evidence format, and creator/provider fallback gates.

## Hard Gates

- Modify only the approved `assets/skills/comet-any/` English variant at this stage; do not change the approved Chinese behavior except for parity tests or manifest release wiring.
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

If the user has not provided `<name>`, ask for the Bundle name or ask whether to derive it from candidate Skills. If state exists, resume from it; if not, continue to the next step.

### 2. Choose create/optimize and Language

Ask the user to choose:

- `create`: create a new Bundle from a goal.
- `optimize`: optimize existing Skill candidates into a Bundle.

Also confirm the default language and locales. Record at least the default locale; for multilingual Bundles, explain which files are overridden by locale overlays.

### 3. Read Preferences or Scan Candidates

Read `.comet/skills.txt` first. If it exists, preserve its order and run:

```bash
comet bundle candidates --json
```

If preferences are absent, scan platform Skill directories and still use `comet bundle candidates --json` to obtain available, missing, and ambiguous candidates.

### 4. Resolve Missing or Ambiguous Candidates

List every `missing` and `ambiguous` item, then pause and ask the user how to handle it. Do not silently ignore missing candidates, and do not choose among multiple sources on the user's behalf.

### 5. Read Real Candidate Implementations

Read candidate `SKILL.md`, then read referenced references, rules, scripts, and hooks as needed. This step only reads real implementation files; never execute candidate scripts.

### 6. Clarify the Bundle Goal

Confirm with the user:

- Bundle goal and usage scenario.
- Which Skills are multiple entry Skills and which are internal Skill components.
- Shared resources, security boundaries, Hook/script side effects.
- Target platforms, required/optional capabilities, and capability gaps strategy.
- Whether optional Engine metadata is needed.

### 7. Initialize the Draft Through CLI

create mode:

```bash
comet bundle draft create <name> --json
```

optimize mode:

```bash
comet bundle draft optimize <bundle> --json
```

Then run:

```bash
comet bundle status <name> --json
```

### 8. Invoke Native Creator or Request Fallback Authorization

Prefer native `skill-creator` to generate or optimize Bundle content. If the native creator is unavailable, explain the difference and risk first, then ask whether the user allows the Comet fallback. Use the fallback only after explicit approval.

### 9. Adapt Creator Output into Bundle Source

Write creator output into the draft directory as `bundle.yaml`, `skills/`, `rules/`, `hooks/`, `scripts/`, `references/`, `assets/`, and related resources. Multiple entry Skills and internal Skill components must be explicitly marked in the manifest.

### 10. Compile and Validate

Run at least one reference-platform compile:

```bash
comet bundle compile <name> --platform <id> --json
```

If there are capability gaps or executable disclosures, show them to the user. Required capability gaps block that platform; optional capability gaps require the user to explicitly choose skip.

### 11. Show Eval Workload and Ask skip/quick/full

Run:

```bash
comet bundle eval-plan <name> --level quick --json
comet bundle eval-plan <name> --level full --json
```

Explain quick/full token workload, estimated runs, and coverage. Then ask the user to choose `skip / quick / full Eval`. If the user chooses skip, keep the state in draft and do not continue to ready.

### 12. Record Eval Evidence

After the user chooses quick/full, call the Eval provider, produce a structured result file, then run:

```bash
comet bundle eval-record <name> --result <file> --json
```

If Eval fails or the hash does not match, stop and return to draft repair.

### 13. Show Review Summary and Wait for Explicit Approval

Summarize Bundle entries, internal Skill components, capability gaps, executable disclosures, Eval result, and target platforms. Wait for explicit approval or rejection.

Approve:

```bash
comet bundle review <name> --approve --reviewer <reviewer> --json
```

Reject:

```bash
comet bundle review <name> --reject --reviewer <reviewer> --json
```

### 14. Publish

Only after the current hash has passed Eval and received human approval, run:

```bash
comet bundle publish <name> --platform <reference-platform> --json
```

### 15. Ask Whether to Distribute

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
