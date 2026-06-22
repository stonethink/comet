"""Tests for generated Skill eval manifest loading."""

from pathlib import Path

import pytest

from scaffold.python.manifests import load_eval_manifest


def test_load_eval_manifest_parses_skill_package_metadata(tmp_path: Path):
    package = tmp_path / "my-skill"
    package.mkdir()
    (package / "SKILL.md").write_text("---\nname: my-skill\n---\n\nBody.", encoding="utf-8")
    comet_dir = package / "comet"
    comet_dir.mkdir()
    manifest_path = comet_dir / "eval.yaml"
    manifest_path.write_text(
        """
apiVersion: comet.eval/v1alpha1
kind: SkillEvalManifest
metadata:
  name: my-skill
  description: Demo manifest
skill:
  name: my-skill
  source: ..
  profile: generic
evaluation:
  recommendedTasks:
    - generic-skill-smoke
  requiredSkills:
    - my-skill
  expectedArtifacts:
    - result.md
interaction:
  mode: auto_user
  maxTurns: 8
  simulatorPrompt: Answer concisely.
""",
        encoding="utf-8",
    )

    manifest = load_eval_manifest(manifest_path)

    assert manifest.name == "my-skill"
    assert manifest.skill_name == "my-skill"
    assert manifest.skill_path == package.resolve()
    assert manifest.profile == "generic"
    assert manifest.recommended_tasks == ["generic-skill-smoke"]
    assert manifest.required_skills == ["my-skill"]
    assert manifest.expected_artifacts == ["result.md"]
    assert manifest.interaction.mode == "auto_user"
    assert manifest.interaction.max_turns == 8
    assert manifest.interaction.simulator_prompt == "Answer concisely."


def test_load_eval_manifest_rejects_wrong_kind(tmp_path: Path):
    manifest_path = tmp_path / "eval.yaml"
    manifest_path.write_text(
        "apiVersion: comet.eval/v1alpha1\nkind: Other\nmetadata:\n  name: bad\n",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match="SkillEvalManifest"):
        load_eval_manifest(manifest_path)
