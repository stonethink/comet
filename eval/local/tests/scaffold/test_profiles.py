from pathlib import Path

import pytest

from scaffold.python.profiles import (
    AUTHORING_SKILL_PROFILE,
    COMET_WORKFLOW_PROFILE,
    GENERIC_PROFILE,
    get_profile,
    list_profiles,
    resolve_profile_name,
    run_profile_rubric,
)
from scaffold.python.tasks import load_task


def test_profile_registry_exposes_generic_and_comet_workflow():
    assert list_profiles() == ["authoring-skill", "comet-workflow", "generic"]

    generic = get_profile(GENERIC_PROFILE)
    comet = get_profile(COMET_WORKFLOW_PROFILE)
    authoring = get_profile(AUTHORING_SKILL_PROFILE)

    assert generic.name == "generic"
    assert comet.name == "comet-workflow"
    assert authoring.name == "authoring-skill"
    assert "completion" in generic.rubric_dimensions
    assert "main_flow" in comet.rubric_dimensions
    assert "generated_package" in authoring.rubric_dimensions


def test_get_profile_rejects_unknown_names():
    with pytest.raises(KeyError, match="Profile not found: unknown"):
        get_profile("unknown")


def test_resolve_profile_name_prefers_cli_override():
    task = load_task("comet-full-workflow")

    assert resolve_profile_name(task, override="generic") == "generic"


def test_resolve_profile_name_uses_task_profile_by_default():
    task = load_task("comet-full-workflow")

    assert resolve_profile_name(task) == "comet-workflow"


def test_generic_profile_scores_completion_skill_artifact_and_efficiency(tmp_path: Path):
    (tmp_path / "result.md").write_text("done")
    outputs = {
        "completion": {"passed": ["validator ok"], "failed": []},
        "events": {
            "skills_invoked": ["target-skill"],
            "num_turns": 3,
            "tool_calls": [{"tool": "Read", "input": {}}],
            "duration_seconds": 12,
            "commands_run": [],
        },
        "required_skills": ["target-skill"],
        "expected_artifacts": ["result.md"],
        "interaction": {"mode": "none"},
    }

    passed, failed = run_profile_rubric("generic", tmp_path, outputs)

    assert failed == []
    assert any("[RUBRIC] completion: 1.00" in msg for msg in passed)
    assert any("[RUBRIC] skill_invocation: 1.00" in msg for msg in passed)
    assert any("[RUBRIC] artifact_presence: 1.00" in msg for msg in passed)
    assert any("[RUBRIC] weighted_score:" in msg for msg in passed)


def test_generic_profile_can_fail_required_skill_invocation(tmp_path: Path):
    outputs = {
        "completion": {"passed": [], "failed": ["validator failed"]},
        "events": {"skills_invoked": [], "commands_run": []},
        "required_skills": ["target-skill"],
        "expected_artifacts": [],
        "require_skill_invocation": True,
        "interaction": {"mode": "none"},
    }

    passed, failed = run_profile_rubric("generic", tmp_path, outputs)

    assert any("Required skill not invoked: target-skill" in msg for msg in failed)
    assert any("[RUBRIC] skill_invocation: 0.00" in msg for msg in passed)


def test_authoring_profile_scores_generated_package_and_engine_contract(tmp_path: Path):
    package = tmp_path / "authoring-skill"
    (package / "reference").mkdir(parents=True)
    (package / "comet").mkdir(parents=True)
    (package / "SKILL.md").write_text(
        "# Demo\n\n## 调用链\n- step\n\n## 停止点\n- stop here\n",
        encoding="utf-8",
    )
    (package / "reference" / "resolved-skills.json").write_text(
        '{"sourceSummaries":[{"name":"demo-source"}]}',
        encoding="utf-8",
    )
    for name in ("skill.yaml", "guardrails.yaml", "evals.yaml"):
        (package / "comet" / name).write_text("name: demo\n", encoding="utf-8")

    outputs = {
        "completion": {"passed": ["validator ok"], "failed": []},
        "events": {
            "skills_invoked": ["comet-any"],
            "num_turns": 4,
            "tool_calls": [{"tool": "Read", "input": {}}],
            "duration_seconds": 20,
            "commands_run": [],
        },
        "required_skills": ["comet-any"],
        "expected_artifacts": [],
        "interaction": {"mode": "auto_user", "max_turns": 8},
        "skill_package_path": str(package),
    }

    passed, failed = run_profile_rubric("authoring-skill", tmp_path, outputs)

    assert failed == []
    assert any("[RUBRIC] generated_package: 1.00" in msg for msg in passed)
    assert any("[RUBRIC] resolved_skill_evidence: 1.00" in msg for msg in passed)
    assert any("[RUBRIC] engine_contract: 1.00" in msg for msg in passed)
    assert any("[RUBRIC] weighted_score:" in msg for msg in passed)


def test_authoring_profile_allows_lightweight_package_without_engine_files(tmp_path: Path):
    package = tmp_path / "authoring-skill"
    (package / "reference").mkdir(parents=True)
    (package / "SKILL.md").write_text(
        "# Demo\n\n## call chain\n- step\n\n## stop\n- done\n",
        encoding="utf-8",
    )
    (package / "reference" / "resolved-skills.json").write_text(
        '{"sourceSummaries":[{"name":"demo-source"}]}',
        encoding="utf-8",
    )

    outputs = {
        "completion": {"passed": ["validator ok"], "failed": []},
        "events": {
            "skills_invoked": ["comet-any"],
            "num_turns": 2,
            "tool_calls": [],
            "duration_seconds": 10,
            "commands_run": [],
        },
        "required_skills": ["comet-any"],
        "expected_artifacts": [],
        "interaction": {"mode": "auto_user", "max_turns": 8},
        "skill_package_path": str(package),
    }

    passed, failed = run_profile_rubric("authoring-skill", tmp_path, outputs)

    assert failed == []
    assert any("[RUBRIC] engine_contract: 1.00 - Engine disabled for lightweight package" in msg for msg in passed)
