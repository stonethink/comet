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


def test_dynamic_treatment_config_from_eval_manifest(tmp_path: Path):
    package = tmp_path / "manifest-skill"
    package.mkdir()
    (package / "SKILL.md").write_text("---\nname: manifest-skill\n---\n\nBody.", encoding="utf-8")
    stage = tmp_path / "manifest-skill-open"
    stage.mkdir()
    (stage / "SKILL.md").write_text("---\nname: manifest-skill-open\n---\n\nStage.", encoding="utf-8")
    comet_dir = package / "comet"
    comet_dir.mkdir()
    manifest = comet_dir / "eval.yaml"
    manifest.write_text(
        """
apiVersion: comet.eval/v1alpha1
kind: SkillEvalManifest
metadata:
  name: manifest-skill
skill:
  name: manifest-skill
  source: ..
  profile: generic
evaluation:
  recommendedTasks:
    - generic-skill-smoke
    - workflow-route-conformance
  requiredSkills:
    - manifest-skill
  generatedNodeSkills:
    - manifest-skill-open
  routeConformance:
    task: workflow-route-conformance
    expectedNodeOrder:
      - open
interaction:
  mode: none
""",
        encoding="utf-8",
    )

    class Config:
        def getoption(self, name):
            return {"--eval-manifest": str(manifest)}.get(name)

    cfg = conftest._get_dynamic_treatment_config(Config())

    assert cfg.name == "DYNAMIC_SKILL"
    assert cfg.skills[0]["name"] == "manifest-skill"
    assert cfg.skills[0]["source"] == "path"
    assert cfg.skills[0]["profile"] == "generic"
    assert cfg.skills[0]["generated_node_skills"] == ["manifest-skill-open"]
    assert cfg.skills[0]["route_conformance_expected_node_order"] == ["open"]
    assert cfg.skills[1]["name"] == "manifest-skill-open"
    assert cfg.skills[1]["path"] == str(stage.resolve())


def test_snapshot_dynamic_skill_package_copies_package_and_node_skills(tmp_path: Path):
    source_root = tmp_path / "source"
    package = source_root / "manifest-skill"
    package.mkdir(parents=True)
    (package / "SKILL.md").write_text("---\nname: manifest-skill\n---\n\nBody.", encoding="utf-8")
    (package / "reference").mkdir()
    (package / "reference" / "workflow-protocol.json").write_text("{}", encoding="utf-8")
    stage = source_root / "manifest-skill-open"
    stage.mkdir()
    (stage / "SKILL.md").write_text("---\nname: manifest-skill-open\n---\n\nStage.", encoding="utf-8")
    test_dir = tmp_path / "workspace"
    test_dir.mkdir()

    relative_package = conftest._snapshot_dynamic_skill_package(
        test_dir,
        {
            "path": str(package),
            "generated_node_skills": ["manifest-skill-open"],
        },
    )

    assert relative_package == "_eval_target_skills/manifest-skill"
    assert (test_dir / relative_package / "SKILL.md").exists()
    assert (test_dir / "_eval_target_skills" / "manifest-skill-open" / "SKILL.md").exists()
