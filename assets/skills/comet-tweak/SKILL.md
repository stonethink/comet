---
name: comet-tweak
description: "Comet preset path: OpenSpec-chained lightweight workflow (tweak). Skip brainstorming and full plan, directly open → OpenSpec apply → verify → archive. Delta spec is a first-class normal artifact. Applicable for changes that fit a single OpenSpec change and do not need the full design workflow."
---

# Comet Preset Path: Tweak

Tweak is a preset workflow of Comet's five-phase capabilities, not an independent parallel process. It chains OpenSpec's core flow, reusing open, build, verify, archive capabilities, only skipping Superpowers brainstorming and full plan.

Applicable for OpenSpec-chained lightweight changes, such as configuration adjustments, documentation or prompt optimization, and spec-driven (including delta spec) medium changes that do not need the full `/comet` deep design workflow. Delta spec is a first-class normal artifact in tweak; needing delta spec alone does not constitute an upgrade reason.

**Applicable conditions** (all must be met):
1. Can fit a **single OpenSpec change**
2. Does not need a Superpowers Design Doc and full plan to clarify the approach
3. Does not involve cross-module or cross-layer architecture coordination
4. Task scope is estimable (file count and task count are hints only, not hard upgrade conditions; see Upgrade Assessment below)

**Not applicable**: If the change process hits a qualitative-change signal (see "Upgrade Assessment" section), the user decides whether to upgrade to the full `/comet` workflow.

---

## Process (preset workflow, 4 phases)

### 0. Output Language Constraint

Streamlined OpenSpec artifacts must use the language of the user request that triggered this workflow.

Execution chain: open → OpenSpec apply → verify → archive. Tweak provides default decisions for each phase: streamlined open, direct build through OpenSpec apply, scale- and delta-spec-driven verification weight, and final archive confirmation after verification passes.

Locate Comet scripts before starting:

```bash
COMET_ENV="${COMET_ENV:-$(find . "$HOME"/.*/skills "$HOME/.config" "$HOME/.gemini" -path '*/comet/scripts/comet-env.mjs' -type f -print -quit 2>/dev/null)}"
if [ -z "$COMET_ENV" ]; then
  echo "ERROR: comet-env.mjs not found. Ensure the comet skill is installed." >&2
  return 1
fi
COMET_SCRIPTS_DIR="$(node "$COMET_ENV")"
COMET_STATE="$COMET_SCRIPTS_DIR/comet-state.mjs"
COMET_GUARD="$COMET_SCRIPTS_DIR/comet-guard.mjs"
COMET_HANDOFF="$COMET_SCRIPTS_DIR/comet-handoff.mjs"
COMET_ARCHIVE="$COMET_SCRIPTS_DIR/comet-archive.mjs"
COMET_RUNTIME="$COMET_SCRIPTS_DIR/comet-runtime.mjs"
```

### 1. Quick Open (preset open)

Reuse Comet open capability to create change, but use tweak defaults: do not execute `openspec-explore` long exploration, directly enter streamlined change creation.

**Immediately execute:** Use the Skill tool to load the `openspec-new-change` skill. Skipping this step is prohibited.

After the skill loads, follow its guidance to create streamlined artifacts:
  - `proposal.md` — change motivation + goals + scope
  - `design.md` — brief implementation description (no solution comparison needed)
  - `tasks.md` — task list (keep to a reasonable size; count itself does not trigger upgrade, see "Upgrade Assessment")
  - `delta spec` (optional) — if the change affects existing spec acceptance scenarios, create it as a normal artifact (only `## MODIFIED Requirements` or `## ADDED Requirements`). Delta spec is the core artifact of OpenSpec brownfield changes; needing delta spec alone does not constitute an upgrade reason

Initialize Comet state file:

```bash
node "$COMET_STATE" init <name> tweak
```

Verify initialized state:

```bash
node "$COMET_STATE" check <name> open
```

Run phase guard to transition open → build:

```bash
node "$COMET_GUARD" <change-name> open --apply
```

### 2. OpenSpec Apply Build (tweak-only preset build)

Use tweak defaults: `build_mode: direct`. Skip Superpowers `brainstorming` and `writing-plans`, and let OpenSpec's apply action execute the current change's tasks.

<IMPORTANT>
This apply path belongs only to tweak. Full `/comet` or `workflow: full` must not use tweak's `openspec-apply-change` build path; full must still generate a Design Doc through `/comet-design`, then let `/comet-build` use Superpowers `writing-plans`, execution-method selection, and the corresponding execution skill to build.
</IMPORTANT>

Before continuing or starting changes, handle uncommitted changes through `comet/reference/dirty-worktree.md`. If attribution shows a qualitative-change signal or file-count tripwire is hit, handle it through this file's "Upgrade Assessment".

**Immediately execute:** Use the Skill tool to load the `openspec-apply-change` skill. Skipping this step is prohibited.

After the skill loads, use the current `<change-name>` as input and follow `openspec-apply-change` to execute the OpenSpec apply flow:

1. Run or follow `openspec status --change "<name>" --json` to confirm the schema and task artifact
2. Run or follow `openspec instructions apply --change "<name>" --json` to read OpenSpec's apply instructions, `contextFiles`, task progress, and dynamic instruction
3. Read every context file listed by the apply instructions; do not implement from stale conversation context or a handwritten tasks loop alone
4. Complete unchecked tasks one by one according to the apply instructions, keeping changes minimal and focused
5. After each completed task:
   - Run the project formatter (e.g., `mvn spotless:apply`, `npm run format`)
   - Run related tests to confirm pass
   - Mark the corresponding task complete according to `openspec-apply-change`
   - Commit code, commit message format: `tweak: <brief change description>`
6. After all tasks complete, explicitly run relevant project tests and build commands

During tweak execution, whenever running programs, tests, builds, or manual verification results in crashes, abnormal behavior, test failures, or build failures, you must use the Skill tool to load the Superpowers `systematic-debugging` skill. Do not propose or implement source code fixes before completing root cause investigation.

For specific investigation, minimal failing test, fix verification, and keeping the current change verification loop, follow `comet/reference/debug-gate.md`.

**Upgrade assessment check**: Continuously judge throughout build, and do a consolidated re-check before running the build→verify guard. Assessment uses a three-layer division of labor (see "Upgrade Assessment" section): qualitative-change signals rely on agent semantic recognition, file count is only a hint delegated to the user, and the scale script only governs verification weight. When a qualitative-change signal or file-count tripwire is hit, **do not upgrade on your own or decide to continue on your own** — must pause per `comet/reference/decision-point.md` and delegate the decision to the user: continue the tweak lightweight flow, or upgrade to the full `/comet`.

7. Run phase guard to transition build → verify:

```bash
node "$COMET_GUARD" <change-name> build --apply
```

State automatically updates to `phase: verify`, `verify_result: pending`, then enter verification.

### 3. Verification (preset verify)

Reuse `/comet-verify`; let comet-verify's scale assessment decide lightweight or full verification.

**Immediately execute:** Use the Skill tool to load the `comet-verify` skill. Skipping this step is prohibited.

**Delta-spec verification routing**: tweak accepts delta spec as a normal artifact. If this change created a delta spec, explicitly set full verification mode before entering comet-verify, to run OpenSpec-native verification (`openspec-verify-change`) covering delta-spec consistency:

```bash
node "$COMET_STATE" set <change-name> verify_mode full
```

A tweak without delta spec usually meets lightweight verification conditions (≤ 3 tasks, changed files below the scale threshold); comet-verify's scale assessment selects the lightweight verification path (6 quick checks). If the user wants to add review, run `node "$COMET_STATE" set <name> review_mode standard` or `thorough` before verification.

After verification passes, record `.comet.yaml` `verify_result` as `pass` according to `/comet-verify` rules, must not skip this status before archiving. After verification passes, still enter `/comet-archive`'s final archive confirmation; do not automatically run the archive script.

### 4. Archive (preset archive)

Reuse `/comet-archive`. Must satisfy `verify_result: pass` in `.comet.yaml` before archiving, and wait for `/comet-archive`'s final archive confirmation.

**Immediately execute:** Use the Skill tool to load the `comet-archive` skill to archive. Skipping this step is prohibited.

---

## Continuous Execution Mode

<IMPORTANT>
Tweak workflow is **one-time continuous execution**. After invoking `/comet-tweak`, agent must automatically advance through tweak steps, without pausing to wait for user input mid-way.

Exception: when `.comet.yaml` has `auto_transition: false`, after each phase guard advances `phase`, do not auto-invoke the next skill. In this case, use `node "$COMET_STATE" next <name>` output and pause for manual continuation as instructed.

The following situations must pause and wait for user confirmation:

1. Encountering an upgrade-assessment signal (see "Upgrade Assessment" section). **Must use the current platform's available user input/confirmation mechanism to pause and wait for the user to explicitly choose**: continue the tweak lightweight flow, or upgrade to the full `/comet` workflow
2. verify phase (comet-verify) verification-failure and branch-handling decisions
3. Final archive confirmation (before comet-archive runs the archive script)

Execution order: quick open → build (with upgrade assessment) → verification → archive → complete

After each phase completes, immediately enter next phase. Within each phase, must still call corresponding Comet/OpenSpec/Superpowers skill according to above requirements; if the called skill has its own user decision points, follow that skill's rules.
</IMPORTANT>

---

## Upgrade Assessment

tweak's scope assessment uses a three-layer division of labor, avoiding "using pure file count as a hard upgrade condition" that both wrongly blocks normal small changes and fails to catch "a big refactor split into many small files":

### 1. Qualitative-change signals (agent semantic recognition; hitting any one pauses)

Continuously judge the following signals throughout build. When any is hit, **do not upgrade on your own or decide to continue on your own** — must pause per `comet/reference/decision-point.md` and delegate the decision to the user:

| Qualitative-change signal | Explanation |
|---------------------------|-------------|
| Cross-module coordinated change | Requires cross-component, cross-layer coordinated edits |
| Needs split into multiple OpenSpec changes | A single OpenSpec change can no longer carry the work; it needs multiple capabilities or independent delivery units |
| Database schema change | Structural adjustment |
| Introduces new public API | Produces a new external interface |
| Hits deep architecture issues | The fix requires an architecture-level solution, not a local change |

**Decision point (user chooses one of two)**:
- **Option A — Continue the tweak lightweight flow**: user confirms scope is manageable and tweak can carry it; continue open → build → verify → archive
- **Option B — Upgrade to full `/comet`**: user believes deep design is needed; upgrade to the full flow to supplement Design Doc and Superpowers plan

### 2. File-count tripwire (user decides; not an automatic upgrade)

When changed files exceed a hint threshold (e.g., > 6 files), the agent **does not upgrade on its own or decide to continue on its own**; instead it pauses and lets the user decide: continue tweak, or upgrade to the full `/comet`. File count is a hint trigger, not a hard upgrade condition — many files do not equal a qualitative change, and using count as a hard block both wrongly blocks normal small changes and fails to catch "a big refactor split into many small files".

### 3. Verification weight (scale script decides)

`comet-state scale` only decides `verify_mode` (verification weight); it does not block the flow or trigger an upgrade. Running a heavier verification is safe and will not stall development.

---

When a qualitative-change signal or file-count tripwire is hit, **must follow the `comet/reference/decision-point.md` protocol to pause and wait for the user to explicitly choose**. Do not directly enter `/comet-design`, and do not automatically supplement Design Doc.

When the user chooses to upgrade (Option B), use the state machine's legal upgrade channel — a single command completes the preset → full conversion and rewinds to the design phase:

```bash
node "$COMET_STATE" transition <name> preset-escalate
```

This command atomically sets `workflow`/`classic_profile` to `full`, rewinds `phase` to `design`, and clears `design_doc` (satisfying the comet-design entry requirement). Then supplement the Design Doc on the current change basis: **Immediately use the Skill tool to load the `comet-design` skill**, and proceed normally with the full workflow.

When the user chooses to continue (Option A), continue the tweak flow and record the reason the user confirmed continuing.

---

## Exit Conditions

- Change completed, tests pass
- Change archived
- If spec changed, synced to main spec
- **Phase guard**: Before build → verify run `node "$COMET_GUARD" <change-name> build --apply`; before verify → archive follow `/comet-verify` and run `node "$COMET_GUARD" <change-name> verify --apply`

## Automatic Handoff to Next Phase

Follow `comet/reference/auto-transition.md`. Key command:

```bash
node "$COMET_STATE" next <name>
```

- `NEXT: auto` → invoke the skill pointed to by `SKILL` to continue tweak workflow (`phase: build` returns `comet-tweak`, `verify` returns `comet-verify`, `archive` returns `comet-archive`)
- `NEXT: manual` → do not invoke the next skill; prompt user to manually run `/<SKILL>` per `HINT`
- `NEXT: done` → workflow is complete, no further action needed
