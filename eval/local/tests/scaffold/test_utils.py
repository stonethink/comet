"""Unit tests for eval scaffold utilities."""

from pathlib import Path

from scaffold.python import utils


def test_execution_validator_converts_structured_checks(monkeypatch, tmp_path: Path):
    def fake_run_eval_in_docker(*_args, **_kwargs):
        return {
            "checks": [
                {"check": "openspec_artifacts", "status": "passed", "message": "found"},
                {"check": "median_fix", "status": "passed", "message": "all tests pass"},
                {"check": "tests_written", "status": "failed", "message": "missing assertions"},
            ]
        }

    monkeypatch.setattr(utils, "run_eval_in_docker", fake_run_eval_in_docker)

    validator = utils.make_execution_validator(
        validation_dir=tmp_path,
        test_scripts="test_task.py",
        target_artifacts=[],
    )

    passed, failed = validator(tmp_path, {"run_id": "abc"})

    assert passed == [
        "openspec_artifacts: found",
        "median_fix: all tests pass",
    ]
    assert failed == ["tests_written: missing assertions"]


def test_run_shell_decodes_subprocess_output_as_utf8(monkeypatch):
    captured = {}

    def fake_run(cmd, **kwargs):
        captured["cmd"] = cmd
        captured["kwargs"] = kwargs

    monkeypatch.setattr(utils.subprocess, "run", fake_run)

    utils.run_shell("docker.sh", "check", check=False)

    assert captured["kwargs"]["encoding"] == "utf-8"
    assert captured["kwargs"]["errors"] == "replace"
