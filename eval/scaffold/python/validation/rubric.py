"""Comet skill rubric validator.

Scores a comet full-workflow run across eight dimensions by analysing the
captured Claude events and the artifacts left in the test directory. Every
dimension emits a single check message of the form::

    [RUBRIC] <dim>: <score> - <reason>

where ``<score>`` is 0.0 / 0.5 / 1.0 (higher is better) and ``<reason>`` is a
short human-readable justification. The logging layer parses these messages to
build per-dimension columns in the experiment summary.

Dimensions
----------
1. main_flow              - how many of the 5 phases (open→design→build→verify→archive) left evidence
2. gate_guard             - whether comet-guard / comet-state transition / --apply were used
3. skill_invocation       - whether the comet main entry and sub-skills were invoked in order
4. spec_drift             - whether delta specs created during build were reconciled before archive
5. completion             - fraction of the task's baseline validators that passed
6. efficiency             - normalised cost (turns / tool calls / duration; lower is better)
7. decision_point_compliance - whether agent paused at blocking decision points instead of auto-deciding
8. artifact_quality       - whether proposal/design/tasks/test artefacts have substantive content
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from scaffold.python.validation.core import ValidatorFn

# All eight rubric dimensions, in display order.
RUBRIC_DIMENSIONS = (
    "main_flow",
    "gate_guard",
    "skill_invocation",
    "spec_drift",
    "completion",
    "efficiency",
    "decision_point_compliance",
    "artifact_quality",
)

# Comet sub-skills that should appear (in roughly this order) during a full run.
_EXPECTED_SKILL_ORDER = (
    "comet",
    "comet-open",
    "comet-design",
    "comet-build",
    "comet-verify",
    "comet-archive",
)

# Decision-point state mutations that must be preceded by an explicit user
# confirmation (per comet/reference/decision-point.md). If any of these appear
# in commands_run without a nearby "ask"/"confirm" tool signal it is a
# compliance smell.
_DECISION_MUTATIONS = (
    re.compile(r"transition\s+\S+\s+(?:open-complete|design-complete|build-complete|verify-pass|verify-fail|preset-escalate)"),
    re.compile(r"set\s+\S+\s+(?:build_mode|isolation|tdd_mode|review_mode|build_pause)\s"),
)

# Files whose creation signals a given phase produced artefacts.
# Comet writes to several locations; cover both the canonical openspec/changes
# layout and the docs/superpowers/ + openspec/archive/ layouts actually used.
_PHASE_SIGNALS = {
    "open": (
        re.compile(r"openspec/changes/[^/]+/(?:proposal|tasks)\.md"),
        re.compile(r"openspec/changes/archive/[^/]+/(?:proposal|tasks)\.md"),
    ),
    "design": (
        re.compile(r"docs/superpowers/specs/.+\.md"),
        re.compile(r"openspec/changes/(?:archive/)?[^/]+/design\.md"),
    ),
    "build": (
        re.compile(r"openspec/changes/(?:archive/)?[^/]+/plan\.md"),
        re.compile(r"docs/superpowers/plans/.+\.md"),
        re.compile(r"openspec/changes/(?:archive/)?[^/]+/\.comet/"),
    ),
    "verify": (
        re.compile(r"openspec/changes/(?:archive/)?[^/]+/verification\.md"),
        re.compile(r"docs/superpowers/reports/.+\.md"),
    ),
    "archive": (
        re.compile(r"openspec/changes/archive/"),
        re.compile(r"openspec/archive/"),
    ),
}

# Substantive-content keywords for the design doc (brainstorming depth signals).
_DESIGN_DEPTH_KEYWORDS = ("tradeoff", "alternative", "risk", "consider", "option")


def _fmt(dim: str, score: float, reason: str) -> str:
    return f"[RUBRIC] {dim}: {score:.2f} - {reason}"


def _join_commands(events: dict[str, Any]) -> str:
    return "\n".join(events.get("commands_run", []) or [])


def _score_main_flow(events: dict[str, Any], test_dir: Path) -> tuple[float, str]:
    files = list(events.get("files_created", [])) + list(events.get("files_modified", []))
    # Also consider files actually present on disk (some are written by scripts).
    try:
        on_disk = [str(p.relative_to(test_dir)).replace("\\", "/") for p in test_dir.rglob("*") if p.is_file()]
    except Exception:
        on_disk = []
    haystack = "\n".join(files + on_disk)

    reached = []
    for phase, patterns in _PHASE_SIGNALS.items():
        if any(p.search(haystack) for p in patterns):
            reached.append(phase)

    n = len(reached)
    if n >= 4:
        return 1.0, f"reached {n}/5 phases ({', '.join(reached)})"
    if n >= 3:
        return 0.75, f"reached {n}/5 phases ({', '.join(reached)})"
    if n >= 2:
        return 0.5, f"reached {n}/5 phases ({', '.join(reached)})"
    if n >= 1:
        return 0.25, f"reached only {n}/5 phases ({', '.join(reached)})"
    return 0.0, "no phase artefacts detected"


def _score_gate_guard(events: dict[str, Any]) -> tuple[float, str]:
    cmds = _join_commands(events)
    if not cmds:
        return 0.0, "no commands captured"

    guard_hits = len(re.findall(r"comet-guard", cmds))
    transition_hits = len(re.findall(r"transition\s+\S+\s+(?:open|design|build|verify|archive)", cmds))
    apply_hits = len(re.findall(r"--apply", cmds))
    total = guard_hits + transition_hits + apply_hits

    if total >= 6:
        return 1.0, f"guard={guard_hits} transition={transition_hits} apply={apply_hits}"
    if total >= 3:
        return 0.5, f"guard={guard_hits} transition={transition_hits} apply={apply_hits}"
    if total >= 1:
        return 0.25, f"guard={guard_hits} transition={transition_hits} apply={apply_hits}"
    return 0.0, "no guard/state/apply invocations"


def _score_skill_invocation(events: dict[str, Any]) -> tuple[float, str]:
    invoked = events.get("skills_invoked", []) or []
    if not invoked:
        return 0.0, "no skills invoked"

    present = [s for s in _EXPECTED_SKILL_ORDER if s in invoked]
    # Bonus for invoking the dispatcher first.
    dispatcher_first = bool(invoked) and invoked[0] in {"comet", "brainstorming"}

    if len(present) >= 5 and dispatcher_first:
        return 1.0, f"{len(present)}/6 core skills, dispatcher first ({', '.join(present)})"
    if len(present) >= 4:
        return 0.75, f"{len(present)}/6 core skills ({', '.join(present)})"
    if len(present) >= 2:
        return 0.5, f"{len(present)}/6 core skills ({', '.join(present)})"
    if len(present) >= 1:
        return 0.25, f"only {len(present)}/6 core skills ({', '.join(present)})"
    return 0.1, f"invoked {len(invoked)} skills but none of the comet core ({', '.join(invoked[:5])})"


def _score_spec_drift(events: dict[str, Any], test_dir: Path) -> tuple[float, str]:
    cmds = _join_commands(events)
    files = list(events.get("files_modified", [])) + list(events.get("files_created", []))

    # Delta-spec activity during build (specs/ writes under a change dir).
    spec_touched = any("specs/" in f and "openspec/changes" in f for f in files)
    spec_synced = bool(re.search(r"openspec\s+(?:sync|archive)", cmds))

    if not spec_touched:
        # No delta spec written — neither drift nor reconciliation needed.
        return 0.75, "no delta spec written (n/a)"
    if spec_synced:
        return 1.0, "delta spec written and reconciled (sync/archive)"
    return 0.25, "delta spec written but not reconciled before archive"


def _score_completion(outputs: dict[str, Any]) -> tuple[float, str]:
    # outputs carries the upstream task validator results under "completion".
    checks = outputs.get("completion") or {}
    passed = checks.get("passed", [])
    failed = checks.get("failed", [])
    total = len(passed) + len(failed)
    if total == 0:
        return 0.0, "no baseline checks ran"
    ratio = len(passed) / total
    return float(ratio), f"{len(passed)}/{total} baseline checks passed"


def _score_efficiency(events: dict[str, Any]) -> tuple[float, str]:
    turns = events.get("num_turns") or 0
    tool_calls = len(events.get("tool_calls", []))
    duration = events.get("duration_seconds") or 0

    # Normalise each metric to a 0..1 sub-score (lower cost => higher score)
    # with generous thresholds: a full 5-phase run legitimately uses many turns.
    def subscore(value: float, lo: float, hi: float) -> float:
        if value <= lo:
            return 1.0
        if value >= hi:
            return 0.0
        return 1.0 - (value - lo) / (hi - lo)

    s_turns = subscore(turns, 15, 80)
    s_tools = subscore(tool_calls, 20, 150)
    s_dur = subscore(duration, 60, 600)
    score = round((s_turns + s_tools + s_dur) / 3, 2)
    return score, f"turns={turns} tools={tool_calls} dur={duration:.0f}s"


def _score_decision_point_compliance(events: dict[str, Any]) -> tuple[float, str]:
    cmds = _join_commands(events)
    tool_calls = events.get("tool_calls", []) or []

    if not cmds:
        return 0.0, "no commands captured"

    # Detect explicit "ask user" signals: AskUserQuestion tool use, or assistant
    # text containing confirmation prompts.
    ask_signals = sum(
        1
        for tc in tool_calls
        if tc.get("tool") in {"AskUserQuestion", "ask_user", "AskFollowUpQuestion"}
    )

    mutations = sum(len(rx.findall(cmds)) for rx in _DECISION_MUTATIONS)

    # If the agent never reached a phase transition, there is nothing to judge;
    # treat as neutral rather than penalising.
    if mutations == 0:
        return 0.5, "no decision-point mutations observed"

    # Every mutation ideally has at least one preceding ask signal.
    ratio = ask_signals / max(mutations, 1)
    if ratio >= 1.0:
        return 1.0, f"{ask_signals} asks for {mutations} decision mutations"
    if ratio >= 0.5:
        return 0.75, f"{ask_signals} asks for {mutations} decision mutations"
    if ask_signals > 0:
        return 0.4, f"{ask_signals} asks for {mutations} decision mutations (under-confirmed)"
    return 0.1, f"{mutations} decision mutations with no explicit ask"


def _score_artifact_quality(test_dir: Path) -> tuple[float, str]:
    """Inspect proposal/design/tasks/test artefacts for substantive content."""
    scores: list[float] = []
    notes: list[str] = []

    # Find the change dir: either directly under openspec/changes/ (active) or
    # under openspec/changes/archive/ (archived by comet-archive).
    changes_root = test_dir / "openspec" / "changes"
    change_dirs: list[Path] = []
    if changes_root.exists():
        for d in changes_root.iterdir():
            if not d.is_dir():
                continue
            if d.name == "archive":
                change_dirs.extend(s for s in d.iterdir() if s.is_dir())
            elif (d / "proposal.md").exists() or (d / "tasks.md").exists():
                change_dirs.append(d)

    if not change_dirs:
        return 0.0, "no openspec change directory"

    cdir = change_dirs[0]
    prop = (cdir / "proposal.md")
    prop_text = prop.read_text(errors="ignore").lower() if prop.exists() else ""
    prop_lines = prop_text.count("\n") if prop_text else 0
    if prop_lines >= 10:
        scores.append(1.0); notes.append(f"proposal {prop_lines}L")
    elif prop_lines >= 3:
        scores.append(0.5); notes.append(f"proposal {prop_lines}L")
    else:
        scores.append(0.0); notes.append("proposal stub")

    design = cdir / "design.md"
    if design.exists():
        dtext = design.read_text(errors="ignore").lower()
        depth_hits = sum(1 for kw in _DESIGN_DEPTH_KEYWORDS if kw in dtext)
        if depth_hits >= 2:
            scores.append(1.0); notes.append(f"design depth {depth_hits}")
        elif depth_hits >= 1:
            scores.append(0.5); notes.append(f"design depth {depth_hits}")
        else:
            scores.append(0.25); notes.append("design shallow")
    # design.md optional for hotfix/tweak; for full workflow it is expected.

    tasks = cdir / "tasks.md"
    if tasks.exists():
        ttext = tasks.read_text(errors="ignore")
        checkboxes = len(re.findall(r"- \[[ x]\]", ttext))
        if checkboxes >= 3:
            scores.append(1.0); notes.append(f"tasks {checkboxes} boxes")
        elif checkboxes >= 1:
            scores.append(0.5); notes.append(f"tasks {checkboxes} boxes")
        else:
            scores.append(0.25); notes.append("tasks no checkboxes")

    # Tests written by the agent with real assertions.
    test_files = list(test_dir.glob("test_*.py")) + list(test_dir.glob("**/test_*.py"))
    test_has_assert = False
    for tf in test_files:
        try:
            if "assert" in tf.read_text(errors="ignore").lower():
                test_has_assert = True
                break
        except Exception:
            continue
    if test_has_assert:
        scores.append(1.0); notes.append("tests w/ assert")
    elif test_files:
        scores.append(0.3); notes.append("tests no assert")
    else:
        scores.append(0.0); notes.append("no tests")

    if not scores:
        return 0.0, "no artefacts to score"
    avg = round(sum(scores) / len(scores), 2)
    return avg, "; ".join(notes)


def comet_rubric_validator(test_dir: Path, outputs: dict) -> tuple[list[str], list[str]]:
    """Run all eight rubric dimensions and return (passed_messages, []).

    Rubric dimensions are informational scores (never hard failures); the
    comparison report aggregates them across treatments. Every dimension always
    emits exactly one ``[RUBRIC]`` message.
    """
    events = (outputs or {}).get("events", {}) or {}
    completion = (outputs or {}).get("completion") or {}

    scored: list[tuple[str, float, str]] = [
        ("main_flow", *_score_main_flow(events, test_dir)),
        ("gate_guard", *_score_gate_guard(events)),
        ("skill_invocation", *_score_skill_invocation(events)),
        ("spec_drift", *_score_spec_drift(events, test_dir)),
        ("completion", *_score_completion({"completion": completion})),
        ("efficiency", *_score_efficiency(events)),
        ("decision_point_compliance", *_score_decision_point_compliance(events)),
        ("artifact_quality", *_score_artifact_quality(test_dir)),
    ]

    passed = [_fmt(dim, score, reason) for dim, score, reason in scored]
    return passed, []
