"""Unit tests for comet eval treatment loading."""

from pathlib import Path

import pytest

from scaffold.python.treatments import (
    TreatmentConfig,
    build_treatment_skills,
    list_treatments,
    load_treatments,
    load_treatments_yaml,
)


BASIC_TREATMENT_YAML = """
_common_section: &common |
  Shared guidance.

CONTROL:
  description: "No skills baseline"
  skills: []

INLINE_COMET:
  description: "Inline skill treatment"
  claude_md: "Use the comet workflow."
  skills:
    - skill: inline_comet
      name: inline-comet
      content: *common
  noise_tasks:
    - DISTRACTOR
"""


@pytest.fixture
def treatment_file(tmp_path: Path) -> Path:
    path = tmp_path / "treatments.yaml"
    path.write_text(BASIC_TREATMENT_YAML)
    return path


def test_load_treatments_yaml_skips_anchor_keys(treatment_file: Path):
    treatments = load_treatments_yaml(treatment_file)

    assert list(treatments) == ["CONTROL", "INLINE_COMET"]
    assert treatments["INLINE_COMET"].noise_tasks == ["DISTRACTOR"]
    assert treatments["INLINE_COMET"].claude_md == "Use the comet workflow."


def test_build_treatment_skills_accepts_inline_content_and_generated_names():
    skills = build_treatment_skills(
        [
            {"skill": "snake_case_skill", "content": "Inline content"},
            {"skill": "ignored", "name": "explicit-name", "content": "Explicit content"},
        ]
    )

    assert "snake-case-skill" in skills
    assert "snake_case_skill" not in skills
    assert skills["snake-case-skill"]["sections"] == ["Inline content"]
    assert skills["explicit-name"]["sections"] == ["Explicit content"]


def test_load_treatments_keeps_comet_core_categories_only():
    treatments = load_treatments()

    assert set(treatments) == {"CONTROL", "COMET_FULL"}
    assert all(isinstance(treatment, TreatmentConfig) for treatment in treatments.values())


def test_list_treatments_is_sorted_for_stable_cli_output():
    assert list_treatments() == ["COMET_FULL", "CONTROL"]
