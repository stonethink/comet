from pathlib import Path

import pytest

from scaffold.python.profiles import (
    COMET_WORKFLOW_PROFILE,
    GENERIC_PROFILE,
    get_profile,
    list_profiles,
    resolve_profile_name,
)
from scaffold.python.tasks import load_task


def test_profile_registry_exposes_generic_and_comet_workflow():
    assert list_profiles() == ["authoring-skill", "comet-workflow", "generic"]

    generic = get_profile(GENERIC_PROFILE)
    comet = get_profile(COMET_WORKFLOW_PROFILE)

    assert generic.name == "generic"
    assert comet.name == "comet-workflow"
    assert "completion" in generic.rubric_dimensions
    assert "main_flow" in comet.rubric_dimensions


def test_get_profile_rejects_unknown_names():
    with pytest.raises(KeyError, match="Profile not found: unknown"):
        get_profile("unknown")


def test_resolve_profile_name_prefers_cli_override():
    task = load_task("comet-full-workflow")

    assert resolve_profile_name(task, override="generic") == "generic"


def test_resolve_profile_name_uses_task_profile_by_default():
    task = load_task("comet-full-workflow")

    assert resolve_profile_name(task) == "comet-workflow"
