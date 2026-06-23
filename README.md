<p align="center">
  <a href="https://github.com/rpamis/comet/blob/master/img/title-log.png">
    <picture>
      <source srcset="https://github.com/rpamis/comet/blob/master/img/title-log.png">
      <img src="https://github.com/rpamis/comet/blob/master/img/title-log.png" alt="Comet logo">
    </picture>
  </a>
</p>

<p align="center">
  <a href="https://github.com/rpamis/comet/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/rpamis/comet/ci.yml?branch=master&style=flat-square&label=CI" /></a>
  <a href="https://deepwiki.com/rpamis/comet"><img alt="DeepWiki" src="https://img.shields.io/badge/DeepWiki-rpamis%2Fcomet-blue?style=flat-square" /></a>
  <a href="https://www.npmjs.com/package/@rpamis/comet"><img alt="npm version" src="https://img.shields.io/npm/v/@rpamis/comet?style=flat-square" /></a>
  <a href="https://www.npmjs.com/package/@rpamis/comet"><img alt="npm download count" src="https://img.shields.io/npm/dm/@rpamis/comet?style=flat-square&label=Downloads/mo" /></a>
  <a href="https://www.npmjs.com/package/@rpamis/comet"><img alt="npm weekly download count" src="https://img.shields.io/npm/dw/@rpamis/comet?style=flat-square&label=Downloads/wk" /></a>
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square" /></a>
</p>

# @rpamis/comet

```
 ██████╗ ██████╗ ███╗   ███╗███████╗████████╗
██╔════╝██╔═══██╗████╗ ████║██╔════╝╚══██╔══╝
██║     ██║   ██║██╔████╔██║█████╗     ██║
██║     ██║   ██║██║╚██╔╝██║██╔══╝     ██║
╚██████╗╚██████╔╝██║ ╚═╝ ██║███████╗   ██║
 ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝   ╚═╝
```

> 中文版：[README-zh.md](README-zh.md)
> [Bilibili video](https://www.bilibili.com/video/BV1y4Gi6CEo1/?spm_id_from=333.1387.homepage.video_card.click&vd_source=d22726fe6b108647dbebf1c5d8817377)
> [DouYin](https://www.douyin.com/search/comet?aid=cd8fcc82-498b-4d59-8860-617deb719412&modal_id=7646429015808936293&type=general)

**Comet is a resumable workflow and Skill platform for AI coding.**

It uses one cross-platform runtime to keep OpenSpec artifacts, Superpowers methods, Skill creation, evaluation, and
publishing in one loop, so you can start a change, resume it later, diagnose drift, and ship reusable Skills from one
toolchain.

> [!IMPORTANT]
> **0.4.0-beta.1** — This is the main product jump beyond master (`0.3.9`): Comet is now a Node-only runtime instead of a Bash/WSL-dependent workflow layer, adds stable `comet skill` and `comet eval` user paths, and turns `/comet-any` into a real Skill Factory with next-action guidance, readiness gates, generated `comet/eval.yaml`, and a clearer publish evidence chain.
>
> **0.3.9** — Review mode (`off|standard|thorough`) controls Build/Verify code review with project defaults; init/update now use optional dependency prompts, broader CLI i18n, stronger phase guards, and macOS executable bits.
>
> **0.3.8** — Adds Kimi Code support, safe multi-platform `comet uninstall`, extended subagent dispatch, shared progressive-loading references, update checks, and pre-commit formatting.
>
> **0.3.7** — Adds CodeGraph semantic indexing, Beta context compression, active context compression, token optimizations, `auto_transition`, phase guards, optional TDD, and safer archive/verification flow.
>
> See [NEWS.md](NEWS.md) for details.

## Why Comet

Comet keeps the public workflow simple while moving the fragile parts into a shared runtime:

- **Node-only runtime** — all bundled Comet scripts run through Node.js, so the same workflow works on macOS, Linux,
  and Windows without Bash, Git Bash, or WSL.
- **Resumable workflow** — `/comet` and the Classic state projection track where a change stopped, so long-running work
  resumes from the current phase instead of forcing the agent to reconstruct progress from scratch.
- **Skill platform** — Comet installs workflow Skills, can author reusable Skill packages, and can turn them into
  distributable Bundles through `/comet-any`.
- **Diagnostics-aware guardrails** — `status`, `doctor`, and guard/verify flows share the same runtime evidence path, so
  malformed state and missing workflow evidence are surfaced as user-visible diagnostics instead of silent drift.

## Install

Requirements:

- Node.js 20+
- npm/npx
- Git

```bash
npm install -g @rpamis/comet
```

## Quick Start

```bash
cd your-project
comet init
```

`comet init` will:

1. Prompt you to select AI platforms (auto-detects existing configs)
2. Choose install scope: project-level (current directory) or global (home directory)
3. Select language for Comet skills: English or 中文
4. Select npm dependencies to install/upgrade — [OpenSpec](https://github.com/Fission-AI/OpenSpec) CLI, [Superpowers](https://github.com/obra/superpowers) (via `npx skills add`), and [CodeGraph](https://github.com/colbymchenry/codegraph) CLI. Items not yet detected default to checked; already-installed items default to unchecked so you can opt in to upgrades.
5. Install the selected dependencies and deploy their skills
6. Deploy Comet skills (in your chosen language) to selected platforms
7. Create `docs/superpowers/specs/` and `docs/superpowers/plans/` working directories for project-scope installs

> [!TIP]
> Superpowers v6.0.0+ is recommended — about 2× faster and ~50% fewer tokens than older versions.
> To upgrade Comet itself later: `comet update` or `npm install -g @rpamis/comet@latest`.

## Task Paths

- **Start a Comet workflow** — `comet init` to install the runtime and Skills, then invoke `/comet` from your agent surface.
- **Create or optimize a reusable Skill** — `/comet-any` is the main user path. It now generates a stable composed Skill Bundle rather than only a `SKILL.md`, and the ordinary path is `/comet-any -> comet eval -> comet publish -> distribute`. Use `comet publish status` or `comet publish review` for normal release readiness, and reach for the `comet bundle` Advanced Bundle backend only when you are debugging the backend state directly.
- **Evaluate a local or generated Skill** — `comet eval collect --manifest ./comet/eval.yaml` for discovery, then `comet eval run --manifest ./comet/eval.yaml --html` for a real run with a browsable summary.
- **Diagnose a stuck workflow** — `comet status` for the current phase and next command, then `comet doctor` when state, runtime evidence, or install health looks wrong.
- **Resume a deterministic Skill Run** — `comet skill run`, follow the printed `Pending action`, then `comet skill resume` or `comet skill eval` using the `Next:` hint.

## Support for OpenClaw and Hermes, and other AI platforms

For platforms that use the generic `skills` CLI directly, you can install the Comet skill package with:

```bash
npx skills add rpamis/comet
```

## Screenshots

<p align="center">
  <img src="https://github.com/rpamis/comet/blob/master/img/runner.png" alt="runner">
</p>

<p align="center">Auto-install OpenSpec & Superpowers, one-click dev environment setup</p>
<p align="center">Multi-phase Skill entry, auto-detects current Spec stage, auto-triggers core flow, manual review at key nodes</p>

## Commands

<details>
<summary><code>comet init [path]</code> — Initialize Comet workflow</summary>

Initializes OpenSpec, Superpowers, and Comet skills for selected AI coding platforms.

| Option              | Description                                                                    |
| ------------------- | ------------------------------------------------------------------------------ |
| `--yes`             | Non-interactive mode, auto-select detected platforms (or all if none detected) |
| `--scope <scope>`   | Install scope: `project` or `global`                                           |
| `--language <lang>` | Skill language: `en` or `zh` (skips interactive language prompt)               |
| `--skip-existing`   | Skip already installed components                                              |
| `--overwrite`       | Overwrite already installed components                                         |
| `--json`            | Output structured JSON                                                         |

When multiple existing components are found on the same platform, interactive init offers one bulk choice: overwrite
all, skip all, or choose per component.

</details>

<details>
<summary><code>comet status [path]</code> — Show active changes and next workflow command</summary>

Displays active changes, task progress, the recommended next Comet workflow command, the current step, runtime mode,
and diagnostic recovery hints when a change is malformed or missing required evidence.

| Option   | Description                                                               |
| -------- | ------------------------------------------------------------------------- |
| `--json` | Output active changes with `nextCommand`, `currentStep`, and runtime data |

</details>

<details>
<summary><code>comet doctor [path]</code> — Diagnose Comet installation health</summary>

Checks project/global installation health, working directories, installed skills, scripts, and active change
diagnostics. `comet doctor` reports diagnostic status for malformed `.comet.yaml` files, current step / runtime mode
for valid changes, and runtime evidence gaps that block safe resume.

| Option            | Description                                                     |
| ----------------- | --------------------------------------------------------------- |
| `--json`          | Output structured diagnostic results                            |
| `--scope <scope>` | Diagnose `auto`, `project`, or `global` scope (default: `auto`) |

</details>

<details>
<summary><code>comet update [path]</code> — Update Comet package and skills</summary>

Updates the npm package and refreshes installed Comet skills in detected project/global targets.

| Option              | Description                                   |
| ------------------- | --------------------------------------------- |
| `--json`            | Output npm and skill update results as JSON   |
| `--language <lang>` | Override detected skill language (`en`, `zh`) |
| `--scope <scope>`   | Update only `global` or `project` scope       |

</details>

<details>
<summary><code>comet uninstall [path]</code> — Remove Comet skills, rules, and hooks</summary>

Safely removes Comet-distributed skills, rules, and hooks from all detected platforms. Preserves user-defined hooks and non-Comet configuration.

| Option            | Description                                |
| ----------------- | ------------------------------------------ |
| `--force`         | Skip confirmation prompt                   |
| `--scope <scope>` | Uninstall only `global` or `project` scope |
| `--json`          | Output removal results as JSON             |

```bash
comet uninstall              # Interactive — shows targets, asks for confirmation
comet uninstall --force      # Non-interactive — removes everything immediately
comet uninstall --scope project  # Only remove project-level installations
```

</details>

<details>
<summary><code>comet skill &lt;command&gt;</code> — Low-level Skill utilities for authoring and running Comet Skill packages</summary>

Discovers explicit Skill directories, project overrides under `.comet/skills/`, and built-in Skills. Manual Runs
persist an immutable Skill snapshot and pending action; the current Agent or platform executes that action and submits
its outcome through `resume`.

```bash
comet skill install ./my-skill --project .
comet skill validate my-skill --project .
comet skill inspect my-skill --json
comet skill run my-skill --change ./changes/demo
comet skill run my-skill --run-id demo-run --project .
comet skill resume --change ./changes/demo
comet skill resume --run-id demo-run --project .
comet skill resume --change ./changes/demo --status succeeded --summary "Done" --artifact report=report.md
comet skill eval --change ./changes/demo --scope completion
comet skill resume --change ./changes/demo --upgrade my-skill --project .
```

All six subcommands support `--json`. Runs can bind to a `--change` directory or use `--run-id` under
`.comet/runs/<run-id>`. `run` supports deterministic Skills in Plan 3; adaptive execution requires an Agent candidate.
Project Skills override built-ins by name, and invalid overrides fail closed instead of silently falling back. Text mode
also prints direct `Pending action` and `Next:` recovery hints so users do not have to infer what to do after a paused
Run or failed eval.

</details>

<details>
<summary><code>comet eval &lt;command&gt;</code> — Run Skill evals through the shared harness</summary>

Provides one stable CLI entry point for local Skills and `comet/eval.yaml`, always launching from the repository
`eval/` root so users do not have to cd manually, reconstruct pytest arguments, or remember `--collect-only`.

```bash
comet eval collect --manifest ./comet/eval.yaml
comet eval run --manifest ./comet/eval.yaml --html
comet eval run --skill-path ./assets/skills/comet-any --skill-name comet-any --quick
```

Use `collect` for discovery and preflight only; use `run` for actual local eval execution. `--manifest` fits
Bundle/Engine outputs, while `--skill-path` is the direct path for a local Skill. With `--skill-path`, `--quick`
defaults to `generic-skill-smoke` for a low-cost smoke path first.

</details>

<details>
<summary><code>comet publish &lt;command&gt;</code> — User-facing release path for <code>/comet-any</code> outputs</summary>

`comet publish` is the ordinary user-facing release facade. It reuses the existing Bundle state and readiness contract without introducing a second state model.
For Skills generated by `/comet-any`, run `comet eval` first, then use these commands for readiness, human approval, publish, and distribution.

```bash
comet publish list --project . --json
comet publish status my-bundle --project . --json
comet publish review my-bundle --platform claude --json
comet publish approve my-bundle --reviewer alice --json
comet publish run my-bundle --platform claude --json
comet publish distribute my-bundle --platform claude --scope project --confirm-executables --json
```

The intended mental model is:

- `/comet-any` creates, resumes, and optimizes the Skill
- `comet eval` validates the generated output
- `comet publish` handles readiness, human approval, publish, and distribution

</details>

<details>
<summary><code>comet bundle &lt;command&gt;</code> — Advanced Bundle backend for <code>/comet-any</code> and Bundle release operators</summary>

Creates platform-independent Skill Bundles from new goals or existing candidate Skills. Bundle drafts are deterministic:
they compile into native platform Skill/rule/hook install plans, can carry optional Engine metadata, require structured
Eval evidence, and must receive human approval before publishing or distribution.

For most users, `/comet-any` is the main user path. Use the Bundle CLI directly when you are auditing backend state,
repairing a blocked draft, or intentionally operating the release pipeline by hand.

```bash
comet bundle candidates --project . --json
comet bundle list --project . --json
comet bundle factory-init my-bundle --file ./plan.json --json
comet bundle factory-resolve my-bundle --candidate review-flow --source ./skills/review-flow --json
comet bundle factory-generate my-bundle --json
comet bundle draft create my-bundle --project .
comet bundle draft optimize ./bundle-source --project .
comet bundle status my-bundle --json
comet bundle compile my-bundle --platform claude --json
comet bundle eval-plan my-bundle --level quick --json
comet bundle eval-record my-bundle --result ./eval.json --json
comet bundle review-summary my-bundle --platform claude --json
comet bundle review my-bundle --approve --reviewer alice --json
comet bundle publish my-bundle --platform claude --json
comet bundle distribute my-bundle --platform claude --scope project --confirm-executables --json
```

`/comet-any` is the Comet Skill Factory: users describe the workflow they want to create or optimize, and Comet turns
that request into a reviewable stable composed Skill Bundle draft backed by real local Skill evidence. It reads
`.comet/skills.txt`, locates real Skill contents, preserves the recommended call order when possible, and uses CLI
backends for validation, Eval, publishing, and optional distribution; see the Skill creation guide for the detailed
control-plane contract. Missing or ambiguous candidates pause for `factory-resolve` first, review and
publish stay gated by structured evidence, and distribution supports both `project` and `global` scopes. `comet bundle list`
lists recoverable authoring states; `comet bundle status` prints `Next action`, the reason, and a suggested command in
text mode; JSON output includes `nextAction` so `/comet-any`, `comet publish`, and other automation can resume the correct next step
deterministically. Treat the full command list above as an advanced backend reference, not the ordinary first-run path for
`/comet-any`.

</details>

| Command           | Description  |
| ----------------- | ------------ |
| `comet --help`    | Show help    |
| `comet --version` | Show version |

## Supported Platforms

`comet init` supports 30 AI coding platforms:

<details>
<summary>View full platform list</summary>

| Platform           | Skills Dir    | Platform      | Skills Dir   |
| ------------------ | ------------- | ------------- | ------------ |
| Claude Code        | `.claude/`    | Cursor        | `.cursor/`   |
| Codex              | `.codex/`     | OpenCode      | `.opencode/` |
| Windsurf           | `.windsurf/`  | Cline         | `.cline/`    |
| RooCode            | `.roo/`       | Continue      | `.continue/` |
| GitHub Copilot     | `.github/`    | Gemini CLI    | `.gemini/`   |
| Amazon Q Developer | `.amazonq/`   | Qwen Code     | `.qwen/`     |
| Kilo Code          | `.kilocode/`  | Auggie        | `.augment/`  |
| Kimi Code          | `.kimi-code/` | Kiro          | `.kiro/`     |
| Lingma             | `.lingma/`    | Junie         | `.junie/`    |
| CodeBuddy          | `.codebuddy/` | CoStrict      | `.cospec/`   |
| Crush              | `.crush/`     | Factory Droid | `.factory/`  |
| iFlow              | `.iflow/`     | Pi            | `.pi/`       |
| Qoder              | `.qoder/`     | Antigravity   | `.agents/`   |
| Bob Shell          | `.bob/`       | ForgeCode     | `.forge/`    |
| Trae               | `.trae/`      | ZCode         | `.zcode/`    |

</details>

Some platforms use different project and global directories. For example, OpenCode global installs use
`.config/opencode`, Lingma global installs use `.lingma`, and Antigravity global installs use `.gemini/antigravity`.
ZCode is built on OpenCode and reads skills from `.zcode/`; OpenSpec output is mirrored from `.opencode/` into
`.zcode/` during install.

## Skills

After `comet init`, three groups of skills are installed to the selected platform's `skills/` directory:

### Comet Skills

<details>
<summary>View Comet skills</summary>

| Skill            | Description                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| `/comet`         | Main entry — auto-detects phase and dispatches to sub-commands                                        |
| `/comet-open`    | Phase 1: Open a change (proposal, design, task breakdown)                                             |
| `/comet-design`  | Phase 2: Deep design (brainstorming, Design Doc)                                                      |
| `/comet-build`   | Phase 3: Plan and build (implementation plan, code commits)                                           |
| `/comet-verify`  | Phase 4: Verify and finish (testing, verification report)                                             |
| `/comet-archive` | Phase 5: Archive (delta spec sync, status annotation)                                                 |
| `/comet-hotfix`  | Preset: Quick bug fix (skips brainstorming)                                                           |
| `/comet-tweak`   | Preset: OpenSpec-chained medium change (delta spec is first-class, skips brainstorming and full plan) |
| `/comet-any`     | Comet Skill Factory — create/optimize distributable Comet-native Skills                               |

</details>

### Guard & Automation Scripts

<details>
<summary>View script list</summary>

| Script                    | Purpose                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `comet-env.mjs`           | Script discovery helper — prints the bundled scripts directory so skills can resolve sibling launcher paths |
| `comet-guard.mjs`         | Phase transition guard — validates exit conditions, `--apply` auto-updates `.comet.yaml`                    |
| `comet-handoff.mjs`       | Design handoff — generates deterministic context packages from OpenSpec artifacts with SHA256 tracing       |
| `comet-archive.mjs`       | One-command archive — validates state, syncs specs, moves to archive, updates status                        |
| `comet-yaml-validate.mjs` | Schema validator — validates `.comet.yaml` structure and field values                                       |
| `comet-hook-guard.mjs`    | Phase write guard — PreToolUse hook, blocks file writes during open/design/archive phases                   |
| `comet-state.mjs`         | Unified state management — init/set/get/check/scale, agents' exclusive YAML interface                       |

All scripts are thin Node.js facades over the bundled `comet-runtime.mjs` (generated from TypeScript). They run
through `node` on every platform, so Comet requires only Node.js — no Bash, Git Bash, or WSL.

</details>

### OpenSpec Skills

Spec lifecycle management: propose, explore, sync, verify, archive, and more.

### Superpowers Skills

Development methodology: brainstorming, TDD, subagent-driven development, code review, plan writing, and more.

See [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) for the 0.4.0 runtime model, state split,
diagnostic path, and Bundle/Skill architecture details.

## Workflow

```
/comet
  ↓ auto-detect
/comet-open  -->  /comet-design  -->  /comet-build  -->  /comet-verify  -->  /comet-archive
(OpenSpec)         (Superpowers)       (Superpowers)       (Both)           (OpenSpec)

/comet-hotfix (preset path, skips brainstorming)
  open  -->  build  -->  verify  -->  archive

/comet-tweak (lightweight preset, chains OpenSpec, delta spec is first-class)
  open  -->  build  -->  verify  -->  archive
```

### Five Phases

| Phase              | Command          | Owner       | Artifacts                            |
| ------------------ | ---------------- | ----------- | ------------------------------------ |
| 1. Open            | `/comet-open`    | OpenSpec    | proposal.md, design.md, tasks.md     |
| 2. Deep Design     | `/comet-design`  | Superpowers | Design Doc, delta spec               |
| 3. Plan & Build    | `/comet-build`   | Superpowers | Implementation plan, code commits    |
| 4. Verify & Finish | `/comet-verify`  | Both        | Verification report, branch handling |
| 5. Archive         | `/comet-archive` | OpenSpec    | delta→main spec sync, archive        |

### Core Principles

- **Brainstorming is non-skippable** — every change must go through deep design (except hotfix/tweak)
- **Delta specs are living documents** — freely editable during Phase 3, synced at archive
- **Keep tasks.md in sync** — check off each task as completed
- **Commit frequently** — one commit per task, message reflects design intent
- **Verify before archive** — `/comet-verify` must pass before `/comet-archive`

### State Management

Comet uses a decoupled state architecture with separate files:

| File                    | Owner    | Purpose                                             |
| ----------------------- | -------- | --------------------------------------------------- |
| `.openspec.yaml`        | OpenSpec | Spec lifecycle, change metadata                     |
| `.comet.yaml`           | Comet    | Workflow phase, execution mode, verification status |
| `.comet/run-state.json` | Engine   | Run identity and execution state (machine-owned)    |

`.comet.yaml` holds all user-facing Classic workflow fields and a `run_id` link. The Engine stores Run fields
(`current_step`, `skill`, `iteration`, `run_status`, etc.) separately in `.comet/run-state.json` (camelCase JSON).
Legacy changes with Run fields embedded in `.comet.yaml` are auto-migrated on first read.

All states and execution phases are updated via scripts, and each phase verifies that tasks are truly complete before
advancing. Compared to storing complex state rules only in Skill text, this script-backed state machine gives Comet more
reliable phase transitions, correct YAML, and easier breakpoint recovery; agents can read the current Spec situation
through Comet's built-in commands.

<details>
<summary>View key .comet.yaml fields</summary>

**Key Fields in `.comet.yaml`:**

```yaml
workflow: full
auto_transition: true
phase: build
skill: comet-classic # Resolved Skill package name
run_id: <uuid> # Links to .comet/run-state.json
review_mode: standard # off | standard | thorough
build_mode: subagent-driven-development
build_pause: null
isolation: branch
verify_mode: null
tdd_mode: null
subagent_dispatch: null
design_doc: docs/superpowers/specs/YYYY-MM-DD-topic-design.md
plan: docs/superpowers/plans/YYYY-MM-DD-feature.md
verify_result: pending
verification_report: null
branch_status: pending
verified_at: null
archived: false
direct_override: false
build_command: null
verify_command: null
handoff_context: openspec/changes/<name>/.comet/handoff/design-context.json
handoff_hash: <sha256>
```

In full workflow, `build_mode`, `build_pause`, `isolation`, `verify_mode`, `tdd_mode`, and `subagent_dispatch` may
temporarily be `null`; `build_mode` and `isolation` must be resolved before `build → verify`. `auto_transition` controls automatic vs manual skill invocation after phase completion — see [AUTO-TRANSITION.md](docs/AUTO-TRANSITION.md). `build_pause` records an internal build-phase pause point:
`null` means no pause, while `plan-ready` means the plan has been generated and the user paused before choosing
isolation and execution mode. It is not an execution mode and must not be written into `build_mode`.
`verification_report` stays `null` until verification writes a report, and `verify-pass` requires that report to exist
plus `branch_status: handled`. Fields after `archived` in the example are optional or script-derived: `direct_override`
is only needed for full-workflow direct builds, project commands may be absent unless configured, and
`handoff_context` / `handoff_hash` are recorded by `comet-handoff.mjs` before leaving design. Projects can configure
`build_command` / `verify_command` in the change or repo root, and guard will run those commands first and print failure
output. Configured commands use a restricted shell grammar: command words, quotes, paths, and `&&` for sequential steps
are allowed; `;`, pipes, bare `&`, `$`, and backticks are rejected. `review_mode` controls automatic code review during
Build/Verify (`off` skips, `standard` reviews key changes, `thorough` reviews everything); can be set project-wide in
`.comet/config.yaml`.

</details>

### Reliability Features

Comet ensures agent execution reliability through automated state transitions:

<details>
<summary>View reliability features</summary>

1. **Entry Verification** — Each phase validates preconditions before execution
   - Checks file existence, state consistency, and phase transitions
   - Outputs `[HARD STOP]` with actionable suggestions if validation fails

2. **Automated State Transitions** — `comet-guard.mjs --apply` updates `.comet.yaml` automatically
   - All phase transitions (open → design/build → verify → archive) use `guard --apply`
   - No manual state editing required — eliminates write-verification errors
   - `comet-state.mjs` is the agents' exclusive interface for state operations
   - Guard and archive scripts use `comet-state.mjs` internally for state management

3. **Schema Validation** — `comet-yaml-validate.mjs` ensures data integrity
   - Validates required and optional fields
   - Validates enum values, including `direct_override`
   - Validates `design_doc`, `plan`, and `handoff_context` paths exist, plus `handoff_hash` format
   - Detects unknown/typos fields

4. **Build Decision Enforcement** — Guard and state transitions both block skipped build choices
   - `isolation` must be `branch` or `worktree`
   - `build_mode` must be selected before leaving build
   - `build_pause: plan-ready` is a recoverable pause after plan generation, not a `build_mode`
   - Full workflow `build_mode: direct` requires `direct_override: true`

5. **Verification Evidence** — Guard enforces proof before phase advance
   - `verify-pass` transition requires `verification_report` pointing to an existing report file
   - `branch_status` must be `handled` before verify can pass
   - Guard checks `verification_report exists` and `branch_status=handled` as hard prerequisites
   - Prevents false phase advances when verification or branch handling was skipped

6. **Archive Automation** — `comet-archive.mjs` handles the full archive flow in one command
   - Validates entry state, merges delta specs into main specs through OpenSpec
   - Annotates design doc and plan frontmatter
   - Moves change to archive directory and updates `archived: true`
   - Supports `--dry-run` for preview

</details>

## Project Structure

```
your-project/
├── .comet/
│   └── config.yaml              # Project-level global config (context_compression, review_mode, auto_transition)
├── .claude/skills/              # Platform skills dir (Comet + OpenSpec + Superpowers)
│   ├── comet/SKILL.md
│   │   └── scripts/
│   │       ├── comet-guard.mjs       # Phase transition guard (--apply auto-updates state)
│   │       ├── comet-env.mjs         # Script discovery helper
│   │       ├── comet-handoff.mjs     # Design handoff (OpenSpec → Superpowers context tracing)
│   │       ├── comet-archive.mjs     # One-command archive automation
│   │       ├── comet-yaml-validate.mjs # Schema validator
│   │       ├── comet-hook-guard.mjs   # Phase write guard (PreToolUse hook)
│   │       └── comet-state.mjs       # Unified state management (init/set/get/check/scale)
│   ├── comet-*/SKILL.md
│   ├── openspec-*/SKILL.md
│   └── brainstorming/SKILL.md
├── openspec/                    # OpenSpec — WHAT
│   ├── config.yaml
│   └── changes/
│       └── <name>/
│           ├── .openspec.yaml       # OpenSpec state
│           ├── .comet.yaml          # Comet workflow state (Classic fields + run_id link)
│           ├── .comet/
│           │   └── run-state.json   # Engine Run state (machine-owned, auto-migrated)
│           ├── proposal.md
│           ├── design.md
│           ├── specs/<capability>/spec.md
│           └── tasks.md
└── docs/superpowers/            # Superpowers — HOW
    ├── specs/                   # Design documents
    └── plans/                   # Implementation plans
```

<details>
<summary>Context Compression (Beta)</summary>

Comet supports context compression at the Design → Build handoff. When enabled, `comet-handoff.mjs` generates a compact
context package that reduces Build-phase input tokens by **25–30%** without affecting implementation correctness.

| Mode   | Behavior                                 | Token Savings |
| ------ | ---------------------------------------- | ------------- |
| `off`  | Full Spec excerpts in handoff context    | Baseline      |
| `beta` | Design Doc + SHA256 hash references only | ~25–30%       |

Key findings from benchmark testing:

- **Test pass rate**: 100% across all tiers (compression does not affect correctness)
- **Spec coverage**: 100% (off) vs 95% (beta) — minor edge-case detail loss
- **Scaling**: Larger tasks yield higher absolute savings (up to 15,000 tokens for large-tier tasks)

Enable in `.comet/config.yaml`: `context_compression: beta`

See [CONTEXT-COMPRESSION.md](docs/CONTEXT-COMPRESSION.md) for the full benchmark report, compression principles, and
reproduction steps.

</details>

<details>
<summary>Auto Transition</summary>

`auto_transition` controls whether Comet automatically invokes the next skill after a phase completes, or pauses for
manual handoff. Phase advancement itself always happens — this setting only affects skill invocation.

| Value   | Behavior                                                      |
| ------- | ------------------------------------------------------------- |
| `true`  | Auto-invoke the next skill after each phase (default)         |
| `false` | Pause after each phase; user manually triggers the next skill |

Three-layer configuration with precedence: `COMET_AUTO_TRANSITION` env var > `.comet/config.yaml` (project) > `.comet.yaml` (change).

See [AUTO-TRANSITION.md](docs/AUTO-TRANSITION.md) for configuration details, workflow mapping, and FAQ.

</details>

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) | [中文版](CONTRIBUTING-zh.md) for development setup, commit
conventions, PR process, branch workflow, and guidance for adding platforms,
skills, scripts, or changelog entries.

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.

## Roadmap

Track our development progress and upcoming features on the [Comet Roadmap](https://github.com/orgs/rpamis/projects/1).

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=rpamis/comet&type=Date)](https://star-history.com/#rpamis/comet&Date)

## Contributors

<a href="https://github.com/rpamis/comet/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=rpamis/comet&columns=12&anon=1" />
</a>

## License

[MIT](LICENSE)

## Community

<table align="center">
  <tr>
    <td align="center" width="180">
      <img src="https://github.com/rpamis/comet/blob/master/img/douyin.png" width="120" height="120"><br>
      <b>DouYin (Recommended)</b>
    </td>
    <td align="center" width="180">
      <img src="https://github.com/rpamis/comet/blob/master/img/wechat.jpg" width="120" height="120"><br>
      <b>WeChat</b>
    </td>
    <td align="center" width="180">
      <img src="https://github.com/rpamis/comet/blob/master/img/qq.jpg" width="120" height="120"><br>
      <b>QQ</b>
    </td>
  </tr>
</table>

## Reference

[LINUX DO - 新的理想型社区](https://linux.do/)
