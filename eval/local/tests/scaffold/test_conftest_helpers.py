"""Tests for pytest fixture helper behavior."""

import importlib.util
import json
import os
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
  draftHash: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
skill:
  name: manifest-skill
  source: ..
  profile: generic
evaluation:
  recommendedTasks:
    - generic-skill-smoke
    - workflow-route-conformance
    - workflow-overlay-contract
  baselineTreatments:
    - CONTROL
    - COMET_FULL
  qualityGates:
    minWeightedScore: 0.8
    minPassAt1: 0.6
    maxInstabilityGap: 0.4
  requiredOutputSchemas:
    - comet.grill-me.v1
  expectedEvidence:
    - node: design
      check: augmentation:design.grill-me
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
    assert cfg.skills[0]["baseline_treatments"] == ["CONTROL", "COMET_FULL"]
    assert cfg.skills[0]["quality_gates"] == {
        "minWeightedScore": 0.8,
        "minPassAt1": 0.6,
        "maxInstabilityGap": 0.4,
    }
    assert cfg.skills[0]["required_output_schemas"] == ["comet.grill-me.v1"]
    assert cfg.skills[0]["expected_evidence"] == [
        {"node": "design", "check": "augmentation:design.grill-me"}
    ]
    assert cfg.skills[0]["draft_hash"] == "a" * 64
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


def test_workflow_overlay_contract_validator_rejects_missing_contract_files(tmp_path: Path):
    package = tmp_path / "overlay-skill"
    package.mkdir()
    comet_dir = package / "comet"
    comet_dir.mkdir()
    (comet_dir / "eval.yaml").write_text(
        """
apiVersion: comet.eval/v1alpha1
kind: SkillEvalManifest
metadata:
  name: overlay-skill
  draftHash: cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
skill:
  name: overlay-skill
  source: ..
  profile: authoring-skill
evaluation:
  recommendedTasks:
    - workflow-overlay-contract
    - comet-full-workflow
    - comet-fix-median
  baselineTreatments:
    - CONTROL
    - COMET_FULL
  qualityGates:
    minWeightedScore: 0.8
    minPassAt1: 0.6
    maxInstabilityGap: 0.4
  requiredOutputSchemas:
    - comet.grill-me.v1
  expectedEvidence:
    - node: design
      check: augmentation:design.grill-me
      enforcement: guarded
""",
        encoding="utf-8",
    )

    workspace = tmp_path / "workspace"
    workspace.mkdir()
    (workspace / "_test_context.json").write_text(
        json.dumps(
            {
                "skill_package_path": str(package),
                "baseline_treatments": ["CONTROL", "COMET_FULL"],
                "quality_gates": {
                    "minWeightedScore": 0.8,
                    "minPassAt1": 0.6,
                    "maxInstabilityGap": 0.4,
                },
                "required_output_schemas": ["comet.grill-me.v1"],
                "expected_evidence": [
                    {
                        "node": "design",
                        "check": "augmentation:design.grill-me",
                        "enforcement": "guarded",
                    }
                ],
                "draft_hash": "c" * 64,
            }
        ),
        encoding="utf-8",
    )

    validator_path = (
        Path(__file__).parents[2]
        / "tasks"
        / "workflow-overlay-contract"
        / "validation"
        / "test_workflow_overlay_contract.py"
    )
    spec = importlib.util.spec_from_file_location(
        "workflow_overlay_contract_validator",
        validator_path,
    )
    validator = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(validator)

    old_cwd = Path.cwd()
    try:
        os.chdir(workspace)
        validator.main()
        results = json.loads((workspace / "_test_results.json").read_text(encoding="utf-8"))
    finally:
        os.chdir(old_cwd)

    failures = "\n".join(results["failed"])
    assert "reference/workflow-protocol.json missing" in failures
    assert "scripts/workflow-state.mjs missing" in failures
    assert "scripts/workflow-guard.mjs missing" in failures
    assert "scripts/workflow-handoff.mjs missing" in failures
