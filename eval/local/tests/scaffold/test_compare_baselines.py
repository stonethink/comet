"""Unit tests for baseline comparison reporting."""

import json
from pathlib import Path

from local.scripts.compare_baselines import build_report


def _write_report(reports_dir: Path, name: str, tokens: int, cost: float):
    report = {
        "name": f"comet-fix-median-{name}",
        "passed": True,
        "checks_passed": [
            "[RUBRIC] main_flow: 1.00 - ok",
            "[RUBRIC] gate_guard: 1.00 - ok",
            "[RUBRIC] skill_invocation: 1.00 - ok",
            "[RUBRIC] spec_drift: 1.00 - ok",
            "[RUBRIC] completion: 1.00 - ok",
            "[RUBRIC] efficiency: 1.00 - ok",
            "[RUBRIC] decision_point_compliance: 1.00 - ok",
            "[RUBRIC] artifact_quality: 1.00 - ok",
        ],
        "checks_failed": [],
        "events_summary": {
            "total_tokens": tokens,
            "total_cost_usd": cost,
        },
    }
    (reports_dir / f"{name.lower()}_report.json").write_text(json.dumps(report))


def test_compare_report_includes_spend_summary(tmp_path: Path):
    experiment = tmp_path / "experiment"
    reports = experiment / "reports"
    reports.mkdir(parents=True)
    _write_report(reports, "CONTROL", 100, 0.01)
    _write_report(reports, "COMET_FULL", 200, 0.02)
    _write_report(reports, "COMET_FULL_039", 300, 0.03)

    report = build_report(experiment)

    assert "## Spend summary" in report
    assert "| Treatment | Runs | Tokens | Cost | Avg Tokens/Run | Avg Cost/Run |" in report
    assert "| COMET_FULL | 1 | 200 | $0.0200 | 200 | $0.0200 |" in report
