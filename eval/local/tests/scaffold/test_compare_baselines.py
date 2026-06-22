"""Unit tests for baseline comparison reporting."""

import json
from pathlib import Path

from local.scripts.compare_baselines import build_report, main


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


def test_compare_report_honors_html_report_output_config(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("BENCH_LOGS_DIR", str(tmp_path))
    experiment = tmp_path / "experiments" / "exp1"
    reports = experiment / "reports"
    reports.mkdir(parents=True)
    _write_report(reports, "CONTROL", 100, 0.01)
    _write_report(reports, "COMET_FULL", 200, 0.02)
    _write_report(reports, "COMET_FULL_039", 300, 0.03)
    config = tmp_path / "report-config.json"
    config.write_text(json.dumps({"report_outputs": {"markdown": False, "html": True}}))

    result = main(["--experiment", "exp1", "--report-config", str(config)])

    assert result == 0
    assert not (experiment / "comparison_report.md").exists()
    html_report = experiment / "comparison_report.html"
    assert html_report.exists()
    assert "Comet Baseline Comparison Report" in html_report.read_text(encoding="utf-8")


def test_compare_report_uses_structured_failure_attribution(tmp_path: Path):
    experiment = tmp_path / "experiment"
    reports = experiment / "reports"
    reports.mkdir(parents=True)
    _write_report(reports, "CONTROL", 100, 0.01)
    _write_report(reports, "COMET_FULL_039", 300, 0.03)
    workflow = {
        "name": "comet-full-workflow-COMET_FULL",
        "passed": False,
        "checks_passed": [],
        "checks_failed": ["Required skill not invoked: comet"],
        "events_summary": {
            "total_tokens": 200,
            "total_cost_usd": 0.02,
            "failure_attribution": [
                {
                    "bucket": "harness",
                    "check": "Required skill not invoked: comet",
                    "reason": "target Skill was never invoked",
                }
            ],
        },
    }
    (reports / "comet_full_report.json").write_text(json.dumps(workflow))

    report = build_report(experiment)

    assert "**harness**" in report
    assert "[harness] target Skill was never invoked" in report


def test_compare_report_lists_source_evidence(tmp_path: Path):
    experiment = tmp_path / "experiment"
    reports = experiment / "reports"
    reports.mkdir(parents=True)
    _write_report(reports, "CONTROL", 100, 0.01)
    _write_report(reports, "COMET_FULL_039", 300, 0.03)
    workflow = {
        "name": "comet-full-workflow-COMET_FULL",
        "passed": True,
        "run_id": "run-123",
        "checks_passed": ["[RUBRIC] weighted_score: 1.00 - ok"],
        "checks_failed": [],
        "events_summary": {
            "profile": "comet-workflow",
            "skill_sources": [{"name": "comet", "hash": "sha256:abc"}],
            "eval_manifest": "demo/comet/eval.yaml",
            "artifact_references": {"report": "reports/comet_full_report.json"},
            "total_tokens": 200,
            "total_cost_usd": 0.02,
        },
    }
    (reports / "comet_full_report.json").write_text(json.dumps(workflow))

    report = build_report(experiment)

    assert "## Source evidence" in report
    assert "`run-123`" in report
    assert "comet-workflow" in report
    assert "sha256:abc" in report
    assert "reports/comet_full_report.json" in report
