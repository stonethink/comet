"""Unit tests for eval stream parsing and experiment summaries."""

import json
from pathlib import Path

from scaffold.python.logging import (
    ExperimentLogger,
    TreatmentResult,
    extract_events,
    parse_output,
    rubric_columns,
    save_raw,
)
from scaffold.python.report_outputs import ReportOutputConfig


def test_extract_events_captures_token_usage_and_cost():
    stdout = "\n".join(
        [
            json.dumps({"type": "assistant", "message": {"content": []}}),
            json.dumps(
                {
                    "type": "result",
                    "duration_ms": 1200,
                    "num_turns": 3,
                    "total_cost_usd": 0.123456,
                    "usage": {
                        "input_tokens": 100,
                        "output_tokens": 25,
                        "cache_read_input_tokens": 300,
                        "cache_creation_input_tokens": 50,
                    },
                    "modelUsage": {
                        "mimo-v2.5-pro": {
                            "inputTokens": 100,
                            "outputTokens": 25,
                            "cacheReadInputTokens": 300,
                            "cacheCreationInputTokens": 50,
                            "costUSD": 0.123456,
                        }
                    },
                }
            ),
        ]
    )

    events = extract_events(parse_output(stdout))

    assert events["input_tokens"] == 100
    assert events["output_tokens"] == 25
    assert events["cache_read_input_tokens"] == 300
    assert events["cache_creation_input_tokens"] == 50
    assert events["total_tokens"] == 475
    assert events["total_cost_usd"] == 0.123456
    assert events["model_usage"]["mimo-v2.5-pro"]["costUSD"] == 0.123456


def test_experiment_summary_includes_token_and_cost_columns(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("BENCH_LOGS_DIR", str(tmp_path))
    logger = ExperimentLogger(experiment_name="token-cost")
    logger.add_result(
        "COMET_FULL_040_BETA",
        TreatmentResult(
            name="COMET_FULL_040_BETA",
            passed=True,
            checks_passed=["baseline"],
            checks_failed=[],
            events_summary={
                "num_turns": 2,
                "duration_seconds": 12,
                "tool_calls": 3,
                "total_tokens": 475,
                "total_cost_usd": 0.123456,
            },
        ),
    )

    summary = logger.generate_summary()

    assert "| Treatment | Checks |" in summary
    assert "Tokens" in summary
    assert "Cost" in summary
    assert "| COMET_FULL_040_BETA | 1/1 (100%) |" in summary
    assert "475" in summary
    assert "$0.1235" in summary


def test_experiment_finalize_honors_html_report_output_config(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("BENCH_LOGS_DIR", str(tmp_path))
    logger = ExperimentLogger(
        experiment_name="html-summary",
        report_outputs=ReportOutputConfig(markdown=False, html=True),
    )
    logger.add_result(
        "COMET_FULL_040_BETA",
        TreatmentResult(
            name="COMET_FULL_040_BETA",
            passed=True,
            checks_passed=["baseline"],
            checks_failed=[],
        ),
    )

    output_path = logger.finalize()
    summary_md = logger.base_dir / "summary.md"
    summary_html = logger.base_dir / "summary.html"
    metadata = json.loads((logger.base_dir / "metadata.json").read_text())

    assert output_path == summary_html
    assert not summary_md.exists()
    assert "<html" in summary_html.read_text().lower()
    assert "Experiment Results Summary" in summary_html.read_text()
    assert metadata["report_outputs"]["html"].endswith("summary.html")
    assert "markdown" not in metadata["report_outputs"]


def test_save_raw_writes_utf8_output(tmp_path: Path):
    save_raw(tmp_path, "COMET_FULL_040_BETA", 1, '{"text":"中文 �"}\n', "stderr 中文")

    stdout_path = tmp_path / "raw" / "COMET_FULL_040_BETA_rep1_stdout.json"
    stderr_path = tmp_path / "raw" / "COMET_FULL_040_BETA_rep1_stderr.txt"

    assert "中文" in stdout_path.read_text(encoding="utf-8")
    assert "stderr 中文" == stderr_path.read_text(encoding="utf-8")


def test_rubric_columns_accept_profile_dimensions():
    columns = rubric_columns(("completion", "skill_invocation", "weighted_score"))

    assert [column.name for column in columns] == [
        "completion",
        "skill_invocation",
        "weighted_score",
        "RubricAvg",
    ]


def test_rubric_average_excludes_weighted_score():
    columns = rubric_columns(("completion", "skill_invocation", "weighted_score"))
    avg_column = next(column for column in columns if column.name == "RubricAvg")
    result = TreatmentResult(
        name="COMET_FULL_040_BETA",
        passed=True,
        checks_passed=[
            "[RUBRIC] completion: 0.00 - failed",
            "[RUBRIC] skill_invocation: 1.00 - ok",
            "[RUBRIC] weighted_score: 1.00",
        ],
        checks_failed=[],
    )

    assert avg_column.get_value(result) == "0.50"


def test_treatment_result_exposes_eval_metadata():
    result = TreatmentResult(
        name="DYNAMIC_SKILL",
        passed=True,
        checks_passed=[],
        checks_failed=[],
        events_summary={
            "profile": "generic",
            "skill_sources": [{"name": "demo", "hash": "sha256:abc"}],
            "eval_manifest": "demo/comet/eval.yaml",
            "interaction": {"mode": "none"},
            "artifact_references": {"report": "logs/reports/demo_report.json"},
            "failure_attribution": [{"bucket": "task", "check": "validator missing", "reason": "task or validator path assumption failed"}],
        },
    )

    assert result.events_summary["profile"] == "generic"
    assert result.events_summary["skill_sources"][0]["hash"] == "sha256:abc"
    assert result.events_summary["artifact_references"]["report"].endswith("demo_report.json")
    assert result.events_summary["failure_attribution"][0]["bucket"] == "task"
