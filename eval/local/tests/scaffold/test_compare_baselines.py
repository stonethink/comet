"""Unit tests for baseline comparison reporting."""

import json
from pathlib import Path

from local.scripts.compare_baselines import build_report, main
from scaffold.python.report_outputs import render_markdown_html


def _write_report(reports_dir: Path, name: str, tokens: int, cost: float, passed: bool = True):
    report = {
        "name": f"comet-fix-median-{name}",
        "passed": passed,
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
        "checks_failed": [] if passed else ["validator failed"],
        "events_summary": {
            "total_tokens": tokens,
            "total_cost_usd": cost,
        },
    }
    (reports_dir / f"{name.lower()}_report.json").write_text(json.dumps(report))


def _write_quality_report(
    reports_dir: Path,
    filename: str,
    *,
    name: str,
    weighted_score: float,
    tokens: int,
    cost: float,
    sample_quality: dict,
    passed: bool = True,
):
    report = {
        "name": name,
        "passed": passed,
        "run_id": filename,
        "checks_passed": [f"[RUBRIC] weighted_score: {weighted_score:.2f}"],
        "checks_failed": [] if passed else ["validator failed"],
        "sample_quality": sample_quality,
        "events_summary": {
            "total_tokens": tokens,
            "total_cost_usd": cost,
            "artifact_references": {"report": f"reports/{filename}.json"},
        },
    }
    (reports_dir / f"{filename}.json").write_text(json.dumps(report), encoding="utf-8")


def test_compare_report_includes_spend_summary(tmp_path: Path):
    experiment = tmp_path / "experiment"
    reports = experiment / "reports"
    reports.mkdir(parents=True)
    _write_report(reports, "CONTROL", 100, 0.01)
    _write_report(reports, "COMET_FULL_040_BETA", 200, 0.02)
    _write_report(reports, "COMET_FULL_039", 300, 0.03)

    report = build_report(experiment)

    assert "## Spend summary" in report
    assert "| Treatment | Runs | Tokens | Cost | Avg Tokens/Run | Avg Cost/Run |" in report
    assert "| COMET_FULL_040_BETA | 1 | 200 | $0.0200 | 200 | $0.0200 |" in report


def test_compare_report_normalizes_repeated_run_suffixes(tmp_path: Path):
    experiment = tmp_path / "experiment"
    reports = experiment / "reports"
    reports.mkdir(parents=True)
    report = {
        "name": "comet-fix-median-COMET_FULL_040_BETA-r1",
        "passed": True,
        "checks_passed": ["[RUBRIC] weighted_score: 1.00"],
        "checks_failed": [],
        "events_summary": {"total_tokens": 200, "total_cost_usd": 0.02},
    }
    (reports / "workflow_report.json").write_text(json.dumps(report))

    output = build_report(experiment)

    assert "| COMET_FULL_040_BETA | 1 |" in output
    assert "| comet-fix-median | — | PASS | — |" in output
    html = render_markdown_html(output, title="Comet Baseline Comparison Report")
    assert "Task outcome matrix" in html
    assert "N/A" in html


def test_compare_report_includes_task_outcome_table(tmp_path: Path):
    experiment = tmp_path / "experiment"
    reports = experiment / "reports"
    reports.mkdir(parents=True)
    _write_report(reports, "CONTROL", 100, 0.01)
    _write_report(reports, "COMET_FULL_040_BETA", 200, 0.02)
    _write_report(reports, "COMET_FULL_039", 300, 0.03, passed=False)

    report = build_report(experiment)

    assert "## Task outcomes" in report
    assert "| Task | CONTROL | COMET_FULL_040_BETA | COMET_FULL_039 |" in report
    assert "| comet-fix-median | PASS | PASS | FAIL |" in report


def test_compare_report_honors_html_report_output_config(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("BENCH_LOGS_DIR", str(tmp_path))
    experiment = tmp_path / "experiments" / "exp1"
    reports = experiment / "reports"
    reports.mkdir(parents=True)
    _write_report(reports, "CONTROL", 100, 0.01)
    _write_report(reports, "COMET_FULL_040_BETA", 200, 0.02)
    _write_report(reports, "COMET_FULL_039", 300, 0.03)
    config = tmp_path / "report-config.json"
    config.write_text(json.dumps({"report_outputs": {"markdown": False, "html": True}}))

    result = main(["--experiment", "exp1", "--report-config", str(config)])

    assert result == 0
    assert not (experiment / "comparison_report.md").exists()
    html_report = experiment / "comparison_report.html"
    assert html_report.exists()
    html = html_report.read_text(encoding="utf-8")
    assert "Comet Baseline Comparison Report" in html
    assert "paper-figure" in html
    assert 'data-chart-backend="python"' in html
    assert "Rubric dimension deltas" in html
    assert "Task outcome matrix" in html
    assert "<svg" in html
    assert "matplotlib" not in html.lower()
    assert "chart.js" not in html.lower()


def test_html_report_falls_back_when_python_chart_backend_disabled(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("COMET_EVAL_REPORT_CHART_BACKEND", "inline")
    experiment = tmp_path / "experiment"
    reports = experiment / "reports"
    reports.mkdir(parents=True)
    _write_report(reports, "CONTROL", 100, 0.01)
    _write_report(reports, "COMET_FULL_040_BETA", 200, 0.02)
    _write_report(reports, "COMET_FULL_039", 300, 0.03)

    markdown = build_report(experiment)
    html = render_markdown_html(markdown, title="Comet Baseline Comparison Report")

    assert 'data-chart-backend="inline-svg"' in html
    assert "Task outcome matrix" in html


def test_compare_report_uses_structured_failure_attribution(tmp_path: Path):
    experiment = tmp_path / "experiment"
    reports = experiment / "reports"
    reports.mkdir(parents=True)
    _write_report(reports, "CONTROL", 100, 0.01)
    _write_report(reports, "COMET_FULL_039", 300, 0.03)
    workflow = {
        "name": "comet-full-workflow-COMET_FULL_040_BETA",
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
    (reports / "COMET_FULL_040_BETA_report.json").write_text(json.dumps(workflow))

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
        "name": "comet-full-workflow-COMET_FULL_040_BETA",
        "passed": True,
        "run_id": "run-123",
        "checks_passed": ["[RUBRIC] weighted_score: 1.00 - ok"],
        "checks_failed": [],
        "events_summary": {
            "profile": "comet-workflow",
            "skill_sources": [{"name": "comet", "hash": "sha256:abc"}],
            "eval_manifest": "demo/comet/eval.yaml",
            "artifact_references": {"report": "reports/COMET_FULL_040_BETA_report.json"},
            "total_tokens": 200,
            "total_cost_usd": 0.02,
        },
    }
    (reports / "COMET_FULL_040_BETA_report.json").write_text(json.dumps(workflow))

    report = build_report(experiment)

    assert "## Source evidence" in report
    assert "`run-123`" in report
    assert "comet-workflow" in report
    assert "sha256:abc" in report
    assert "reports/COMET_FULL_040_BETA_report.json" in report


def test_compare_report_overall_uses_weighted_score(tmp_path: Path):
    experiment = tmp_path / "experiment"
    reports = experiment / "reports"
    reports.mkdir(parents=True)

    workflow = {
        "name": "comet-full-workflow-COMET_FULL_040_BETA",
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
            "[RUBRIC] recovery_resilience: 1.00 - ok",
            "[RUBRIC] weighted_score: 0.25",
        ],
        "checks_failed": [],
        "events_summary": {},
    }
    baseline = {
        "name": "comet-full-workflow-COMET_FULL_039",
        "passed": True,
        "checks_passed": [
            "[RUBRIC] main_flow: 0.00 - missing",
            "[RUBRIC] gate_guard: 0.00 - missing",
            "[RUBRIC] skill_invocation: 0.00 - missing",
            "[RUBRIC] spec_drift: 0.00 - missing",
            "[RUBRIC] completion: 0.00 - missing",
            "[RUBRIC] efficiency: 0.00 - missing",
            "[RUBRIC] decision_point_compliance: 0.00 - missing",
            "[RUBRIC] artifact_quality: 0.00 - missing",
            "[RUBRIC] recovery_resilience: 0.00 - missing",
            "[RUBRIC] weighted_score: 0.75",
        ],
        "checks_failed": [],
        "events_summary": {},
    }
    (reports / "workflow_report.json").write_text(json.dumps(workflow))
    (reports / "baseline_report.json").write_text(json.dumps(baseline))

    report = build_report(experiment)

    assert "| **Overall** | — | 0.25 | 0.75 | -0.50 |" in report


def test_compare_report_excludes_hard_noise_from_analysis_metrics(tmp_path: Path):
    experiment = tmp_path / "experiment"
    reports = experiment / "reports"
    reports.mkdir(parents=True)
    _write_report(reports, "CONTROL", 100, 0.01)
    _write_quality_report(
        reports,
        "workflow_clean",
        name="comet-fix-median-COMET_FULL_040_BETA",
        weighted_score=1.0,
        tokens=200,
        cost=0.02,
        sample_quality={
            "status": "included",
            "reason_code": "valid_signal",
            "reason": "clean",
            "include_in_analysis": True,
            "confidence": "high",
            "evidence": ["result event present"],
        },
    )
    _write_quality_report(
        reports,
        "workflow_timeout",
        name="comet-fix-median-COMET_FULL_040_BETA-r1",
        weighted_score=0.0,
        tokens=999,
        cost=9.99,
        sample_quality={
            "status": "excluded",
            "reason_code": "api_timeout",
            "reason": "timeout",
            "include_in_analysis": False,
            "confidence": "high",
            "evidence": ["stderr timeout"],
        },
        passed=False,
    )
    _write_report(reports, "COMET_FULL_039", 300, 0.03)

    report = build_report(experiment)

    assert "## Data quality summary" in report
    assert "| COMET_FULL_040_BETA | 2 | 1 | 0 | 1 |" in report
    assert "| COMET_FULL_040_BETA | 1 |" in report
    assert "| COMET_FULL_040_BETA | 1 | 200 | $0.0200 | 200 | $0.0200 |" in report
    assert "workflow_timeout" in report
    assert "api_timeout" in report
    assert "999" not in report.split("## Spend summary", 1)[1].split("## Source evidence", 1)[0]


def test_compare_report_lists_flagged_runs_without_excluding_them(tmp_path: Path):
    experiment = tmp_path / "experiment"
    reports = experiment / "reports"
    reports.mkdir(parents=True)
    _write_report(reports, "CONTROL", 100, 0.01)
    _write_report(reports, "COMET_FULL_039", 300, 0.03)
    _write_quality_report(
        reports,
        "workflow_flagged",
        name="comet-full-workflow-COMET_FULL_040_BETA",
        weighted_score=0.5,
        tokens=200,
        cost=0.02,
        sample_quality={
            "status": "flagged",
            "reason_code": "harness_trigger_suspect",
            "reason": "target Skill may not have been triggered",
            "include_in_analysis": True,
            "confidence": "medium",
            "evidence": ["target Skill was never invoked"],
        },
    )

    report = build_report(experiment)

    assert "## Flagged runs" in report
    assert "harness_trigger_suspect" in report
    assert "| Treatment | Raw runs | Analysis set | Flagged | Excluded |" in report
    assert "| COMET_FULL_040_BETA | 1 | 1 | 1 | 0 |" in report
    assert "| COMET_FULL_040_BETA | 1 | 200 | $0.0200 | 200 | $0.0200 |" in report


def test_compare_report_reports_insufficient_clean_data(tmp_path: Path):
    experiment = tmp_path / "experiment"
    reports = experiment / "reports"
    reports.mkdir(parents=True)
    _write_report(reports, "CONTROL", 100, 0.01)
    _write_report(reports, "COMET_FULL_039", 300, 0.03)
    _write_quality_report(
        reports,
        "workflow_timeout",
        name="comet-full-workflow-COMET_FULL_040_BETA",
        weighted_score=0.0,
        tokens=999,
        cost=9.99,
        sample_quality={
            "status": "excluded",
            "reason_code": "runner_timeout",
            "reason": "timeout",
            "include_in_analysis": False,
            "confidence": "high",
            "evidence": ["Timeout after 600s"],
        },
        passed=False,
    )

    report = build_report(experiment)

    assert "Insufficient clean data" in report
    assert "COMET_FULL_040_BETA" in report


def test_compare_report_keeps_data_quality_sections_when_all_key_runs_are_excluded(tmp_path: Path):
    experiment = tmp_path / "experiment"
    reports = experiment / "reports"
    reports.mkdir(parents=True)
    _write_quality_report(
        reports,
        "workflow_timeout",
        name="comet-full-workflow-COMET_FULL_040_BETA",
        weighted_score=0.0,
        tokens=999,
        cost=9.99,
        sample_quality={
            "status": "excluded",
            "reason_code": "runner_timeout",
            "reason": "timeout",
            "include_in_analysis": False,
            "confidence": "high",
            "evidence": ["Timeout after 600s"],
        },
        passed=False,
    )
    _write_quality_report(
        reports,
        "baseline_timeout",
        name="comet-full-workflow-COMET_FULL_039",
        weighted_score=0.0,
        tokens=888,
        cost=8.88,
        sample_quality={
            "status": "excluded",
            "reason_code": "api_timeout",
            "reason": "timeout",
            "include_in_analysis": False,
            "confidence": "high",
            "evidence": ["stderr timeout"],
        },
        passed=False,
    )

    report = build_report(experiment)

    assert "## Data quality summary" in report
    assert "## Excluded runs" in report
    assert "## Source evidence" in report
    assert "Insufficient clean data" in report
    assert "No report data found" not in report


def test_html_report_includes_data_quality_summary(tmp_path: Path):
    experiment = tmp_path / "experiment"
    reports = experiment / "reports"
    reports.mkdir(parents=True)
    _write_report(reports, "CONTROL", 100, 0.01)
    _write_report(reports, "COMET_FULL_040_BETA", 200, 0.02)
    _write_report(reports, "COMET_FULL_039", 300, 0.03)

    markdown = build_report(experiment)
    html = render_markdown_html(markdown, title="Comet Baseline Comparison Report")

    assert "Data quality summary" in html
    assert "paper-figure" in html
