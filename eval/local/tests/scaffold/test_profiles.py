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
    node_skill = tmp_path / "authoring-skill-open"
    node_skill.mkdir()
    (package / "SKILL.md").write_text(
        "# Demo\n\n## Workflow Nodes\n- `authoring-skill-open`\n\n## 用户停顿点\n- Confirm before exit.\n\n## 自动推进与恢复\n- scripts/workflow-guard.mjs\n\n## 参考\n- `reference/workflow-protocol.json`\n- `reference/resolved-skills.json`\n",
        encoding="utf-8",
    )
    (node_skill / "SKILL.md").write_text(
        "# Node\n\n## Node Goal\n- open\n",
        encoding="utf-8",
    )
    (package / "reference" / "resolved-skills.json").write_text(
        '{"sourceSummaries":[{"name":"demo-source"}]}',
        encoding="utf-8",
    )
    (package / "reference" / "workflow-protocol.json").write_text(
        '{"name":"authoring-skill","nodes":[{"id":"open","disabled":false}]}',
        encoding="utf-8",
    )
    (package / "reference" / "authoring-lanes.json").write_text(
        '{"lanes":[{"lane":"skill-core"},{"lane":"script-contract"},{"lane":"reference"},{"lane":"pause-points"},{"lane":"eval"},{"lane":"skill-review"}],"review":{"passed":true,"blockingFindings":[]}}',
        encoding="utf-8",
    )
    (package / "reference" / "skill-review.md").write_text(
        "# Skill Review\n\nStatus: Review passed\n",
        encoding="utf-8",
    )
    for name in ("skill.yaml", "guardrails.yaml", "checks.yaml"):
        (package / "comet" / name).write_text("name: demo\n", encoding="utf-8")
    (package / "comet" / "eval.yaml").write_text(
        "evaluation:\n"
        "  recommendedTasks:\n"
        "    - workflow-route-conformance\n"
        "  generatedNodeSkills:\n"
        "    - authoring-skill-open\n"
        "  routeConformance:\n"
        "    task: workflow-route-conformance\n"
        "    expectedNodeOrder:\n"
        "      - open\n",
        encoding="utf-8",
    )

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
        "generated_node_skills": ["authoring-skill-open"],
        "route_conformance_expected_node_order": ["open"],
    }

    passed, failed = run_profile_rubric("authoring-skill", tmp_path, outputs)

    assert failed == []
    assert any("[RUBRIC] generated_package: 1.00" in msg for msg in passed)
    assert any("[RUBRIC] resolved_skill_evidence: 1.00" in msg for msg in passed)
    assert any("[RUBRIC] engine_contract: 1.00" in msg for msg in passed)
    assert any("[RUBRIC] workflow_route_conformance: 1.00" in msg for msg in passed)
    assert any("[RUBRIC] authoring_lanes: 1.00" in msg for msg in passed)
    assert any("[RUBRIC] review_gate: 1.00" in msg for msg in passed)
    assert any("[RUBRIC] weighted_score:" in msg for msg in passed)


def test_authoring_profile_allows_lightweight_package_without_engine_files(tmp_path: Path):
    package = tmp_path / "authoring-skill"
    (package / "reference").mkdir(parents=True)
    node_skill = tmp_path / "authoring-skill-open"
    node_skill.mkdir()
    (package / "SKILL.md").write_text(
        "# Demo\n\n## Workflow Nodes\n- `authoring-skill-open`\n\n## 用户停顿点\n- Confirm before exit.\n\n## 自动推进与恢复\n- scripts/workflow-guard.mjs\n\n## 参考\n- `reference/workflow-protocol.json`\n- `reference/resolved-skills.json`\n",
        encoding="utf-8",
    )
    (node_skill / "SKILL.md").write_text(
        "# Node\n\n## Node Goal\n- open\n",
        encoding="utf-8",
    )
    (package / "reference" / "resolved-skills.json").write_text(
        '{"sourceSummaries":[{"name":"demo-source"}]}',
        encoding="utf-8",
    )
    (package / "reference" / "workflow-protocol.json").write_text(
        '{"name":"authoring-skill","nodes":[{"id":"open","disabled":false}]}',
        encoding="utf-8",
    )
    (package / "reference" / "authoring-lanes.json").write_text(
        '{"lanes":[{"lane":"skill-core"},{"lane":"script-contract"},{"lane":"reference"},{"lane":"pause-points"},{"lane":"eval"},{"lane":"skill-review"}],"review":{"passed":true,"blockingFindings":[]}}',
        encoding="utf-8",
    )
    (package / "reference" / "skill-review.md").write_text(
        "# Skill Review\n\nStatus: Review passed\n",
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
        "generated_node_skills": ["authoring-skill-open"],
        "route_conformance_expected_node_order": ["open"],
    }

    passed, failed = run_profile_rubric("authoring-skill", tmp_path, outputs)

    assert failed == []
    assert any("[RUBRIC] engine_contract: 1.00 - Engine disabled for lightweight package" in msg for msg in passed)


# ---------------------------------------------------------------------------
# N/A dimension scoring tests
# ---------------------------------------------------------------------------


def test_generic_rubric_na_dimensions_emit_na_format(tmp_path: Path):
    """When required_skills and expected_artifacts are empty, those dimensions
    should emit N/A instead of a numeric score."""
    outputs = {
        "completion": {"passed": ["ok"], "failed": []},
        "events": {
            "skills_invoked": [],
            "num_turns": 1,
            "tool_calls": [],
            "duration_seconds": 5,
            "commands_run": [],
        },
        "required_skills": [],
        "expected_artifacts": [],
        "interaction": {"mode": "none"},
    }

    passed, failed = run_profile_rubric("generic", tmp_path, outputs)

    assert any("[RUBRIC] skill_invocation: N/A -" in msg for msg in passed)
    assert any("[RUBRIC] artifact_presence: N/A -" in msg for msg in passed)
    # Numeric dimensions should still have scores.
    assert any("[RUBRIC] completion: 1.00" in msg for msg in passed)
    assert any("[RUBRIC] efficiency:" in msg for msg in passed)
    assert not any("skill_invocation: 0.50" in msg for msg in passed)
    assert not any("artifact_presence: 0.50" in msg for msg in passed)


def test_generic_rubric_skips_na_dimensions_from_weighted_score(tmp_path: Path):
    """The weighted score should only average over applicable dimensions,
    not dilute with 0.5 for unconfigured ones."""
    outputs_all_na = {
        "completion": {"passed": ["ok"], "failed": []},
        "events": {
            "skills_invoked": [],
            "num_turns": 1,
            "tool_calls": [],
            "duration_seconds": 5,
            "commands_run": [],
        },
        "required_skills": [],
        "expected_artifacts": [],
        "interaction": {"mode": "none"},
    }
    outputs_with_skills = {
        "completion": {"passed": ["ok"], "failed": []},
        "events": {
            "skills_invoked": ["target-skill"],
            "num_turns": 1,
            "tool_calls": [],
            "duration_seconds": 5,
            "commands_run": [],
        },
        "required_skills": ["target-skill"],
        "expected_artifacts": ["result.md"],
        "interaction": {"mode": "none"},
    }
    (tmp_path / "result.md").write_text("done")

    passed_na, _ = run_profile_rubric("generic", tmp_path, outputs_all_na)
    passed_full, _ = run_profile_rubric("generic", tmp_path, outputs_with_skills)

    def _extract_weighted(passed_list: list[str]) -> float:
        for msg in passed_list:
            if "[RUBRIC] weighted_score:" in msg:
                return float(msg.split("weighted_score:")[1].strip())
        return 0.0

    score_na = _extract_weighted(passed_na)
    score_full = _extract_weighted(passed_full)

    # Both should produce valid scores between 0 and 1.
    assert 0.0 <= score_na <= 1.0
    assert 0.0 <= score_full <= 1.0
    # When all checks pass and no N/A dimensions, score should be 1.0.
    assert score_full == 1.00


def test_generic_rubric_with_required_skills_scores_numeric(tmp_path: Path):
    """When required_skills is configured, skill_invocation should be numeric."""
    outputs = {
        "completion": {"passed": ["ok"], "failed": []},
        "events": {
            "skills_invoked": ["target-skill"],
            "num_turns": 1,
            "tool_calls": [],
            "duration_seconds": 5,
            "commands_run": [],
        },
        "required_skills": ["target-skill"],
        "expected_artifacts": [],
        "interaction": {"mode": "none"},
    }

    passed, _ = run_profile_rubric("generic", tmp_path, outputs)

    assert any("[RUBRIC] skill_invocation: 1.00" in msg for msg in passed)
    assert any("[RUBRIC] artifact_presence: N/A -" in msg for msg in passed)


# ---------------------------------------------------------------------------
# LLM judge prompt tests
# ---------------------------------------------------------------------------


def test_generic_llm_judge_prompt_includes_custom_criteria(tmp_path: Path):
    """The judge prompt should include rubric_criteria from task config."""
    from scaffold.python.generic_llm_judge import _build_generic_judge_prompt

    (tmp_path / "output.txt").write_text("hello world")
    outputs = {
        "completion": {"passed": ["ok"], "failed": []},
        "rubric_criteria": [
            "The function handles edge cases",
            "Error messages are user-friendly",
        ],
    }

    prompt = _build_generic_judge_prompt(tmp_path, outputs)

    assert "The function handles edge cases" in prompt
    assert "Error messages are user-friendly" in prompt
    assert "custom_0" in prompt
    assert "custom_1" in prompt
    assert "task_completion" in prompt
    assert "output_quality" in prompt
    assert "instruction_adherence" in prompt


def test_generic_llm_judge_prompt_without_custom_criteria(tmp_path: Path):
    """Without custom criteria, prompt should have exactly 3 standard dimensions."""
    from scaffold.python.generic_llm_judge import _build_generic_judge_prompt

    (tmp_path / "output.txt").write_text("hello world")
    outputs = {"completion": {"passed": ["ok"], "failed": []}}

    prompt = _build_generic_judge_prompt(tmp_path, outputs)

    assert "EXACTLY 3 lines" in prompt
    assert "custom_0" not in prompt
    assert "task_completion" in prompt


def test_generic_llm_judge_collects_workspace_files(tmp_path: Path):
    """The artifact collector should find non-hidden files."""
    from scaffold.python.generic_llm_judge import _collect_workspace_artifacts

    (tmp_path / "result.md").write_text("# Result\nDone")
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "main.py").write_text("print('hello')")
    (tmp_path / ".git").mkdir()
    (tmp_path / ".git" / "config").write_text("ignored")

    artifacts = _collect_workspace_artifacts(tmp_path)

    assert "result.md" in artifacts
    assert str(Path("src") / "main.py") in artifacts
    assert ".git" not in artifacts


def test_generic_llm_judge_parses_output(tmp_path: Path):
    """judge_generic_artifacts should parse [RUBRIC-JUDGE] lines correctly."""
    from unittest.mock import patch
    from scaffold.python.generic_llm_judge import judge_generic_artifacts

    mock_output = (
        "[RUBRIC-JUDGE] task_completion: 0.80 - output present and mostly correct\n"
        "[RUBRIC-JUDGE] output_quality: 0.90 - well-structured code\n"
        "[RUBRIC-JUDGE] instruction_adherence: 1.00 - all constraints followed\n"
    )
    outputs = {"completion": {"passed": [], "failed": []}}

    with patch(
        "scaffold.python.generic_llm_judge._run_judge",
        return_value=mock_output,
    ):
        scores = judge_generic_artifacts(tmp_path, outputs)

    assert scores["task_completion"] == (0.80, "output present and mostly correct")
    assert scores["output_quality"] == (0.90, "well-structured code")
    assert scores["instruction_adherence"] == (1.00, "all constraints followed")


def test_generic_llm_judge_parses_custom_dimensions(tmp_path: Path):
    """Custom rubric criteria should produce custom_N dimensions in output."""
    from unittest.mock import patch
    from scaffold.python.generic_llm_judge import judge_generic_artifacts

    mock_output = (
        "[RUBRIC-JUDGE] task_completion: 1.00 - done\n"
        "[RUBRIC-JUDGE] output_quality: 0.80 - good\n"
        "[RUBRIC-JUDGE] instruction_adherence: 1.00 - ok\n"
        "[RUBRIC-JUDGE] custom_0: 0.90 - handles edge cases well\n"
        "[RUBRIC-JUDGE] custom_1: 0.70 - error messages could improve\n"
    )
    outputs = {
        "completion": {"passed": [], "failed": []},
        "rubric_criteria": ["edge cases", "error messages"],
    }

    with patch(
        "scaffold.python.generic_llm_judge._run_judge",
        return_value=mock_output,
    ):
        scores = judge_generic_artifacts(tmp_path, outputs)

    assert "custom_0" in scores
    assert "custom_1" in scores
    assert scores["custom_0"] == (0.90, "handles edge cases well")
