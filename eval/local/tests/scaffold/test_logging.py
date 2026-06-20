"""Unit tests for eval stream parsing and experiment summaries."""

import json
from pathlib import Path

from scaffold.python.logging import ExperimentLogger, TreatmentResult, extract_events, parse_output


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
        "COMET_FULL",
        TreatmentResult(
            name="COMET_FULL",
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
    assert "| COMET_FULL | 1/1 (100%) |" in summary
    assert "475" in summary
    assert "$0.1235" in summary
