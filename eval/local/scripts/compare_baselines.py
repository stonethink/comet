"""Compare comet baseline treatments across the eight rubric dimensions.

Reads experiment reports from ``local/logs/experiments/<id>/reports/*.json`` and
emits a markdown comparison report highlighting where the workflow (v3) baseline
scores below the 0.3.9 baseline.

Usage::

    uv run python local/scripts/compare_baselines.py [--experiment <id>]

If ``--experiment`` is omitted the most recent experiment directory is used.
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from collections import defaultdict
from pathlib import Path

from scaffold.python.paths import get_logs_dir
from scaffold.python.validation.rubric import RUBRIC_DIMENSIONS

RUBRIC_RE = re.compile(r"\[RUBRIC\]\s+(\S+):\s*([0-9.]+)")
RUBRIC_JUDGE_RE = re.compile(r"\[RUBRIC-JUDGE\]\s+(\S+):\s*([0-9.]+)")

# Treatments we compare. CONTROL is included for context but not used in the
# pass/fail decision.
TREATMENTS = ("CONTROL", "COMET_FULL", "COMET_FULL_039")
WORKFLOW = "COMET_FULL"
BASELINE = "COMET_FULL_039"


def _latest_experiment(logs: Path) -> Path | None:
    exp_root = logs / "experiments"
    if not exp_root.exists():
        return None
    dirs = sorted([d for d in exp_root.iterdir() if d.is_dir()], key=lambda p: p.stat().st_mtime)
    return dirs[-1] if dirs else None


def _load_reports(experiment_dir: Path) -> dict[str, list[dict]]:
    """Group report JSON files by treatment name.

    Report ``name`` fields carry the ``<task>-<TREATMENT>`` form (e.g.
    ``comet-full-workflow-COMET_FULL``); we key by the canonical treatment id
    (``COMET_FULL``) so the rest of the script can use the short names.
    """
    reports_dir = experiment_dir / "reports"
    by_treatment: dict[str, list[dict]] = defaultdict(list)
    if not reports_dir.exists():
        return by_treatment
    for rf in sorted(reports_dir.glob("*.json")):
        try:
            data = json.loads(rf.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        raw_name = data.get("name", "unknown")
        # Match the canonical treatment id by suffix (TREATMENTS are uppercase).
        name = raw_name
        for t in TREATMENTS:
            if raw_name.endswith(t):
                name = t
                break
        by_treatment[name].append(data)
    return by_treatment


def _scores_from_report(report: dict) -> dict[str, float]:
    """Parse rubric scores from a single report's passed checks."""
    scores: dict[str, float] = {}
    for check in report.get("checks_passed", []):
        m = RUBRIC_RE.search(check)
        if m:
            try:
                scores[m.group(1)] = float(m.group(2))
            except ValueError:
                continue
    return scores


def _judge_scores_from_report(report: dict) -> dict[str, float]:
    """Parse [RUBRIC-JUDGE] overlay scores (if LLM judge ran)."""
    scores: dict[str, float] = {}
    for check in report.get("checks_passed", []):
        m = RUBRIC_JUDGE_RE.search(check)
        if m:
            try:
                scores[m.group(1)] = float(m.group(2))
            except ValueError:
                continue
    return scores


def _aggregate_judge(reports: list[dict]) -> dict[str, dict[str, float]]:
    """Judge-overlay distribution stats (same shape as _aggregate)."""
    per_dim: dict[str, list[float]] = defaultdict(list)
    for rep in reports:
        for dim, score in _judge_scores_from_report(rep).items():
            per_dim[dim].append(score)
    result: dict[str, dict[str, float]] = {}
    for dim in ("artifact_quality", "spec_drift", "main_flow"):
        vals = per_dim.get(dim, [])
        n = len(vals)
        if not vals:
            result[dim] = {"mean": 0.0, "stdev": 0.0, "min": 0.0, "max": 0.0, "pass_rate": 0.0, "n": 0}
            continue
        result[dim] = {
            "mean": statistics.fmean(vals),
            "stdev": statistics.pstdev(vals) if len(vals) > 1 else 0.0,
            "min": min(vals), "max": max(vals),
            "pass_rate": sum(1 for v in vals if v >= 0.5) / n, "n": n,
        }
    return result


def _aggregate(reports: list[dict]) -> dict[str, dict[str, float]]:
    """Per-dimension distribution stats across a treatment's reports.

    Returns ``{dim: {mean, stdev, min, max, pass_rate, n}}`` where pass_rate is
    the fraction of runs scoring >= 0.5 on that dimension (a "mostly passed"
    threshold) and n is the run count with a score for that dimension.
    """
    per_dim: dict[str, list[float]] = defaultdict(list)
    for rep in reports:
        for dim, score in _scores_from_report(rep).items():
            per_dim[dim].append(score)
    result: dict[str, dict[str, float]] = {}
    for dim in RUBRIC_DIMENSIONS:
        vals = per_dim.get(dim, [])
        n = len(vals)
        if not vals:
            result[dim] = {"mean": 0.0, "stdev": 0.0, "min": 0.0, "max": 0.0, "pass_rate": 0.0, "n": 0}
            continue
        mean = statistics.fmean(vals)
        stdev = statistics.pstdev(vals) if len(vals) > 1 else 0.0
        result[dim] = {
            "mean": mean,
            "stdev": stdev,
            "min": min(vals),
            "max": max(vals),
            "pass_rate": sum(1 for v in vals if v >= 0.5) / n,
            "n": n,
        }
    return result


def _overall(agg: dict[str, dict[str, float]]) -> float:
    """Mean of per-dimension means (treats each dimension equally)."""
    vals = [agg.get(d, {}).get("mean", 0.0) for d in RUBRIC_DIMENSIONS]
    return statistics.fmean(vals) if vals else 0.0


def _fmt_dim(stats: dict[str, float] | None, with_dist: bool = False) -> str:
    """Format a dimension cell. With distribution: 'mean±std (pass%)'."""
    if not stats or stats.get("n", 0) == 0:
        return "—"
    mean = stats["mean"]
    if not with_dist or stats["n"] < 2:
        return f"{mean:.2f}"
    return f"{mean:.2f}±{stats['stdev']:.2f} ({stats['pass_rate']*100:.0f}%)"


# --- Attribution (improvement 2) -------------------------------------------
# Classify a failed check into one of three buckets:
#   workflow  - the skill guidance is wrong/missing (skill not invoked, guard not used)
#   task      - the task/validator itself is ambiguous or buggy
#   model     - the LLM failed despite correct skill invocation
_ATTRIBUTION_RULES = [
    # (regex on failed-check text, bucket, reason)
    (re.compile(r"skill.*(not invoke|not found)|did not invoke", re.I), "workflow",
     "skill was not invoked — workflow guidance failed to trigger the skill"),
    (re.compile(r"guard|state|apply|transition", re.I), "workflow",
     "guard/state machinery not exercised — workflow did not drive phase transitions"),
    (re.compile(r"--sentences|sentence_feature|wordcount", re.I), "model",
     "feature implementation incomplete despite workflow running — likely model capability"),
    (re.compile(r"openspec_artifacts|not found in.*archive|directory not found", re.I), "task",
     "artifact path/layout mismatch — likely task/validator path assumption"),
    (re.compile(r"comet_state|\.comet\.yaml", re.I), "workflow",
     "comet state file missing — workflow did not initialise state machine"),
    (re.compile(r"tests_exist|no.*tests", re.I), "model",
     "tests not written despite workflow running — model capability"),
]


def _attribute_failure(check_text: str) -> tuple[str, str]:
    """Return (bucket, reason) for a failed check."""
    for rx, bucket, reason in _ATTRIBUTION_RULES:
        if rx.search(check_text):
            return bucket, reason
    return "model", "unclassified failure — defaulting to model capability"


def _attributions(reports: list[dict]) -> dict[str, list[str]]:
    """Bucket all failed checks across a treatment's runs by attribution."""
    buckets: dict[str, list[str]] = defaultdict(list)
    for rep in reports:
        for fail in rep.get("checks_failed", []):
            # Skip rubric informational checks (they never fail, but be safe)
            if "[RUBRIC]" in fail:
                continue
            bucket, reason = _attribute_failure(fail)
            buckets[bucket].append(f"{fail}  →  [{bucket}] {reason}")
    return buckets


def build_report(experiment_dir: Path) -> str:
    by_treatment = _load_reports(experiment_dir)
    aggregated = {t: _aggregate(reps) for t, reps in by_treatment.items() if reps}

    lines: list[str] = []
    lines.append("# Comet Baseline Comparison Report")
    lines.append("")
    lines.append(f"- Experiment: `{experiment_dir.name}`")
    lines.append(f"- Treatments with data: {', '.join(sorted(aggregated)) or 'none'}")
    lines.append("")

    if not aggregated:
        lines.append("No report data found. Run the eval suite first.")
        return "\n".join(lines)

    # Per-treatment run counts
    lines.append("## Run counts")
    lines.append("")
    lines.append("| Treatment | Runs |")
    lines.append("|-----------|------|")
    for t in TREATMENTS:
        if t in by_treatment:
            lines.append(f"| {t} | {len(by_treatment[t])} |")
    lines.append("")

    has_dist = any(len(by_treatment.get(t, [])) >= 2 for t in TREATMENTS)

    # Dimension comparison table
    label = "(mean±stdev, pass-rate across runs; 0.00–1.00)" if has_dist else "(mean, 0.00–1.00)"
    lines.append(f"## Rubric dimensions {label}")
    lines.append("")
    header = "| Dimension | " + " | ".join(TREATMENTS) + " | Δ (workflow−baseline) |"
    sep = "|-----------|" + "|".join(["------"] * len(TREATMENTS)) + "|------|"
    lines.append(header)
    lines.append(sep)

    regressions: list[tuple[str, float, float]] = []
    for dim in RUBRIC_DIMENSIONS:
        row = [f"{dim}"]
        wf_stats = aggregated.get(WORKFLOW, {}).get(dim)
        bl_stats = aggregated.get(BASELINE, {}).get(dim)
        for t in TREATMENTS:
            row.append(_fmt_dim(aggregated.get(t, {}).get(dim), with_dist=has_dist))
        if wf_stats and bl_stats:
            delta = wf_stats["mean"] - bl_stats["mean"]
            row.append(f"{delta:+.2f}" + (" ⚠️" if delta < -0.05 else ""))
            if delta < -0.05:
                regressions.append((dim, wf_stats["mean"], bl_stats["mean"]))
        else:
            row.append("—")
        lines.append("| " + " | ".join(row) + " |")
    lines.append("")

    # Overall rows
    lines.append("| **Overall** | " + " | ".join(
        (f"{_overall(aggregated[t]):.2f}" if t in aggregated else "—") for t in TREATMENTS
    ) + " | " + (
        f"{_overall(aggregated[WORKFLOW]) - _overall(aggregated[BASELINE]):+.2f}"
        if WORKFLOW in aggregated and BASELINE in aggregated else "—"
    ) + " |")
    lines.append("")

    # --- Attribution (improvement 2) ---
    lines.append("## Failure attribution")
    lines.append("")
    lines.append("Each failed baseline check is bucketed as **workflow** (skill guidance issue), "
                 "**task** (task/validator issue), or **model** (LLM capability issue).")
    lines.append("")
    any_failures = False
    for t in TREATMENTS:
        attr = _attributions(by_treatment.get(t, []))
        total = sum(len(v) for v in attr.values())
        if total == 0:
            continue
        any_failures = True
        lines.append(f"### {t} ({total} failure(s))")
        lines.append("")
        for bucket in ("workflow", "task", "model"):
            items = attr.get(bucket, [])
            if not items:
                continue
            lines.append(f"- **{bucket}** ({len(items)}):")
            for item in items:
                lines.append(f"  - {item}")
        lines.append("")
    if not any_failures:
        lines.append("_No baseline check failures across treatments._")
        lines.append("")

    # Verdict
    lines.append("## Verdict")
    lines.append("")
    if WORKFLOW not in aggregated or BASELINE not in aggregated:
        lines.append(f"Insufficient data: need both `{WORKFLOW}` and `{BASELINE}` runs.")
    elif regressions:
        lines.append(f"❌ **Workflow regresses on {len(regressions)} dimension(s) vs 0.3.9 baseline:**")
        lines.append("")
        for dim, wf, bl in regressions:
            lines.append(f"- **{dim}**: workflow {wf:.2f} < baseline {bl:.2f} (Δ {wf - bl:+.2f})")
        lines.append("")
        lines.append("See the failure-attribution section above and the events/raw logs for root-cause analysis.")
    else:
        wf_overall = _overall(aggregated[WORKFLOW])
        bl_overall = _overall(aggregated[BASELINE])
        if wf_overall >= bl_overall:
            lines.append(f"✅ **Workflow is stable**: overall {wf_overall:.2f} ≥ baseline {bl_overall:.2f}, "
                         f"no dimension regresses beyond the 0.05 tolerance.")
        else:
            lines.append(f"⚠️ **Workflow overall lower** ({wf_overall:.2f} < {bl_overall:.2f}) "
                         f"but no single dimension regresses beyond tolerance.")
    if has_dist:
        lines.append("")
        lines.append(f"_Distribution stats computed from ≥2 runs per treatment._")

    # --- LLM-judge overlay (improvement 3) ---
    judge_aggregated = {t: _aggregate_judge(reps) for t, reps in by_treatment.items() if reps}
    has_judge = any(stats.get(d, {}).get("n", 0) > 0 for stats in judge_aggregated.values() for d in ("artifact_quality", "spec_drift", "main_flow"))
    if has_judge:
        lines.append("")
        lines.append("## LLM-judge overlay (rule vs judge)")
        lines.append("")
        lines.append("Independent LLM re-scored the three qualitative dimensions by reading the actual "
                     "artifacts. Large rule-vs-judge gaps flag heuristic weaknesses.")
        lines.append("")
        lines.append("| Dimension | Treatment | Rule | Judge | Gap |")
        lines.append("|-----------|-----------|------|-------|-----|")
        for dim in ("artifact_quality", "spec_drift", "main_flow"):
            for t in TREATMENTS:
                rule = aggregated.get(t, {}).get(dim, {}).get("mean") if aggregated.get(t, {}).get(dim, {}).get("n") else None
                judge = judge_aggregated.get(t, {}).get(dim, {}).get("mean") if judge_aggregated.get(t, {}).get(dim, {}).get("n") else None
                if rule is None and judge is None:
                    continue
                gap = f"{judge - rule:+.2f}" if (rule is not None and judge is not None) else "—"
                lines.append(f"| {dim} | {t} | {rule:.2f} | {judge:.2f} | {gap} |")
        lines.append("")

    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--experiment", default=None, help="Experiment id (defaults to latest)")
    parser.add_argument("--out", default=None, help="Output path (defaults to <experiment>/comparison_report.md)")
    args = parser.parse_args(argv)

    logs = get_logs_dir()
    if args.experiment:
        experiment_dir = logs / "experiments" / args.experiment
        if not experiment_dir.exists():
            print(f"Experiment not found: {experiment_dir}", file=sys.stderr)
            return 1
    else:
        experiment_dir = _latest_experiment(logs)
        if experiment_dir is None:
            print("No experiments found under logs/experiments/", file=sys.stderr)
            return 1

    report = build_report(experiment_dir)
    out_path = Path(args.out) if args.out else experiment_dir / "comparison_report.md"
    out_path.write_text(report)
    print(report)
    print(f"\nWrote: {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
