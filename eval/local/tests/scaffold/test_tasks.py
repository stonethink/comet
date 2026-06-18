"""Unit tests for the comet eval task loader."""

from pathlib import Path

import pytest
import yaml

from scaffold.python.paths import get_tasks_dir
from scaffold.python.tasks import list_tasks, load_task


BASIC_TASK_TOML = """
[metadata]
name = "test-basic"
description = "A basic test task"
difficulty = "easy"
category = "testing"
tags = ["test", "basic"]
default_treatments = ["CONTROL", "COMET_FULL"]

[template]
required = ["run_id"]

[environment]
description = "Test environment"
dockerfile = "environment/Dockerfile"
timeout_sec = 300

[validation]
test_scripts = ["test_one.py", "test_two.py"]
target_artifacts = ["result.json"]
timeout = 45

[setup.template_vars]
artifact_name = "result-{run_id}.json"
"""


@pytest.fixture
def mock_tasks_dir(tmp_path: Path) -> Path:
    tasks_dir = tmp_path / "tasks"
    task_dir = tasks_dir / "test-basic"
    task_dir.mkdir(parents=True)
    (task_dir / "task.toml").write_text(BASIC_TASK_TOML)
    (task_dir / "instruction.md").write_text("Run {run_id} and write {artifact_name}.")

    invalid_dir = tasks_dir / "invalid"
    invalid_dir.mkdir()
    (invalid_dir / "task.toml").write_text("[metadata]\nname = 'invalid'\n")

    return tasks_dir


def test_list_tasks_returns_only_complete_task_dirs(mock_tasks_dir: Path):
    assert list_tasks(mock_tasks_dir) == ["test-basic"]


def test_load_task_parses_validation_and_setup(mock_tasks_dir: Path):
    task = load_task("test-basic", mock_tasks_dir)

    assert task.name == "test-basic"
    assert task.config.validation.test_scripts == ["test_one.py", "test_two.py"]
    assert task.config.validation.target_artifacts == ["result.json"]
    assert task.config.validation.timeout == 45
    assert task.config.setup.template_vars == {"artifact_name": "result-{run_id}.json"}


def test_render_prompt_requires_declared_template_variables(mock_tasks_dir: Path):
    task = load_task("test-basic", mock_tasks_dir)

    with pytest.raises(KeyError, match="run_id"):
        task.render_prompt(artifact_name="result-123.json")

    prompt = task.render_prompt(run_id="123", artifact_name="result-123.json")
    assert prompt == "Run 123 and write result-123.json."


def test_comet_task_index_lists_real_tasks():
    index_path = get_tasks_dir() / "index.yaml"

    assert index_path.exists()

    index = yaml.safe_load(index_path.read_text())
    names = [task["name"] for task in index["tasks"]]
    assert names == sorted(list_tasks())
    assert set(names) == {"comet-full-workflow", "comet-hotfix", "comet-phase-guard"}
