"""Tests for pytest fixture helper behavior."""

from pathlib import Path

import conftest
from scaffold.python.tasks import load_task


def test_file_lock_context_manager_allows_exclusive_writes(tmp_path: Path):
    lock_file = tmp_path / "coordination.lock"
    data_file = tmp_path / "coordination.txt"

    with conftest.file_lock(lock_file):
        data_file.write_text("held")

    assert data_file.read_text() == "held"


def test_unit_test_detection_handles_scaffold_and_script_paths():
    class Config:
        args = ["local/tests/scaffold/test_tasks.py", "-q"]

    assert conftest._is_unit_tests_only(Config()) is True


def test_unit_test_detection_keeps_task_runs_as_experiments():
    class Config:
        args = ["local/tests/tasks/test_tasks.py", "--task=comet-hotfix"]

    assert conftest._is_unit_tests_only(Config()) is False


def test_dynamic_treatment_config_from_skill_path(tmp_path: Path):
    skill_dir = tmp_path / "demo-skill"
    skill_dir.mkdir()
    (skill_dir / "SKILL.md").write_text(
        "---\nname: demo-skill\ndescription: Demo.\n---\n\nDemo body.",
        encoding="utf-8",
    )

    class Config:
        def getoption(self, name):
            values = {
                "--skill-path": str(skill_dir),
                "--skill-name": "demo-skill",
                "--profile": "generic",
            }
            return values.get(name)

    cfg = conftest._get_dynamic_treatment_config(Config())

    assert cfg.name == "DYNAMIC_SKILL"
    assert cfg.description == "Dynamic Skill target: demo-skill"
    assert cfg.skills == [
        {
            "name": "demo-skill",
            "source": "path",
            "path": str(skill_dir),
            "profile": "generic",
        }
    ]


def test_resolve_interaction_config_prefers_cli_mode():
    task = load_task("comet-full-workflow")

    class Config:
        def getoption(self, name):
            values = {
                "--interaction-mode": "none",
                "--max-turns": "5",
                "--simulator-prompt": "Use CLI override.",
            }
            return values.get(name)

    interaction = conftest._resolve_interaction_config(task, "comet-workflow", Config())

    assert interaction.mode == "none"
    assert interaction.max_turns == 5
    assert interaction.simulator_prompt == "Use CLI override."


def test_resolve_interaction_config_uses_profile_default_prompt():
    task = load_task("comet-full-workflow")

    class Config:
        def getoption(self, name):
            return {
                "--interaction-mode": "auto_user",
                "--max-turns": None,
                "--simulator-prompt": None,
            }.get(name)

    interaction = conftest._resolve_interaction_config(task, "generic", Config())

    assert interaction.mode == "auto_user"
    assert interaction.max_turns == 12
    assert interaction.simulator_prompt is not None
