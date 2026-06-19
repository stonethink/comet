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


def _aggregate(reports: list[dict]) -> dict[str, float]:
    """Mean rubric score per dimension across a treatment's reports."""
    per_dim: dict[str, list[float]] = defaultdict(list)
    for rep in reports:
        for dim, score in _scores_from_report(rep).items():
            per_dim[dim].append(score)
    return {dim: (statistics.fmean(per_dim[dim]) if per_dim[dim] else 0.0) for dim in RUBRIC_DIMENSIONS}


def _overall(scores: dict[str, float]) -> float:
    vals = [scores.get(d, 0.0) for d in RUBRIC_DIMENSIONS]
    return statistics.fmean(vals) if vals else 0.0


def build_report(experiment_dir: Path) -> str:
    by_treatment = _load_reports(experiment_dir)
    aggregated = {t: _aggregate(reps) for t, reps in by_treatment.items() if reps}

    lines: list[str] = []
    lines.append(f"# Comet Baseline Comparison Report")
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

    # Dimension comparison table
    lines.append("## Rubric dimensions (mean across runs, 0.00–1.00)")
    lines.append("")
    header = "| Dimension | " + " | ".join(TREATMENTS) + " | Δ (workflow−baseline) |"
    sep = "|-----------|" + "|".join(["------"] * len(TREATMENTS)) + "|------|"
    lines.append(header)
    lines.append(sep)

    regressions: list[tuple[str, float, float]] = []
    for dim in RUBRIC_DIMENSIONS:
        row = [f"{dim}"]
        wf = aggregated.get(WORKFLOW, {}).get(dim)
        bl = aggregated.get(BASELINE, {}).get(dim)
        for t in TREATMENTS:
            val = aggregated.get(t, {}).get(dim)
            row.append(f"{val:.2f}" if val is not None else "—")
        if wf is not None and bl is not None:
            delta = wf - bl
            row.append(f"{delta:+.2f}" + (" ⚠️" if delta < -0.05 else ""))
            if delta < -0.05:
                regressions.append((dim, wf, bl))
        else:
            row.append("—")
        lines.append("| " + " | ".join(row) + " |")
    lines.append("")

    # Overall rows
    lines.append("| **Overall** | " + " | ".join(
        (f"{_overall(aggregated.get(t, {})):.2f}" if t in aggregated else "—") for t in TREATMENTS
    ) + " | " + (
        f"{_overall(aggregated[WORKFLOW]) - _overall(aggregated[BASELINE]):+.2f}"
        if WORKFLOW in aggregated and BASELINE in aggregated else "—"
    ) + " |")
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
        lines.append("See the events/raw logs under this experiment dir for root-cause analysis.")
    else:
        wf_overall = _overall(aggregated[WORKFLOW])
        bl_overall = _overall(aggregated[BASELINE])
        if wf_overall >= bl_overall:
            lines.append(f"✅ **Workflow is stable**: overall {wf_overall:.2f} ≥ baseline {bl_overall:.2f}, "
                         f"no dimension regresses beyond the 0.05 tolerance.")
        else:
            lines.append(f"⚠️ **Workflow overall lower** ({wf_overall:.2f} < {bl_overall:.2f}) "
                         f"but no single dimension regresses beyond tolerance.")

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
