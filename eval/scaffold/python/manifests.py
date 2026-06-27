"""Eval manifest parser for generated Skill packages."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

from scaffold.python.tasks import InteractionConfig


@dataclass(frozen=True)
class SkillEvalManifest:
    path: Path
    name: str
    description: str
    skill_name: str
    skill_path: Path
    profile: str | None = None
    recommended_tasks: list[str] = field(default_factory=list)
    required_skills: list[str] = field(default_factory=list)
    expected_artifacts: list[str] = field(default_factory=list)
    generated_node_skills: list[str] = field(default_factory=list)
    route_conformance_task: str | None = None
    route_conformance_expected_node_order: list[str] = field(default_factory=list)
    interaction: InteractionConfig = field(default_factory=InteractionConfig)


def _require_mapping(data: dict, field_name: str) -> dict:
    value = data.get(field_name)
    if not isinstance(value, dict):
        raise ValueError(f"Missing mapping field: {field_name}")
    return value


def load_eval_manifest(path: Path | str) -> SkillEvalManifest:
    manifest_path = Path(path).expanduser().resolve()
    data = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
    if data.get("apiVersion") != "comet.eval/v1alpha1":
        raise ValueError("Expected apiVersion comet.eval/v1alpha1")
    if data.get("kind") != "SkillEvalManifest":
        raise ValueError("Expected kind SkillEvalManifest")

    metadata = _require_mapping(data, "metadata")
    skill = _require_mapping(data, "skill")
    evaluation = data.get("evaluation") or {}
    interaction_data = data.get("interaction") or {}
    skill_source = skill.get("source", "..")
    route_conformance = evaluation.get("routeConformance") or {}

    return SkillEvalManifest(
        path=manifest_path,
        name=str(metadata.get("name") or skill.get("name")),
        description=str(metadata.get("description") or ""),
        skill_name=str(skill.get("name") or metadata.get("name")),
        skill_path=(manifest_path.parent / skill_source).resolve(),
        profile=skill.get("profile"),
        recommended_tasks=list(evaluation.get("recommendedTasks") or []),
        required_skills=list(evaluation.get("requiredSkills") or []),
        expected_artifacts=list(evaluation.get("expectedArtifacts") or []),
        generated_node_skills=list(evaluation.get("generatedNodeSkills") or []),
        route_conformance_task=route_conformance.get("task"),
        route_conformance_expected_node_order=list(
            route_conformance.get("expectedNodeOrder") or []
        ),
        interaction=InteractionConfig(
            mode=interaction_data.get("mode", "none"),
            max_turns=int(interaction_data.get("maxTurns", interaction_data.get("max_turns", 12))),
            simulator_prompt=interaction_data.get("simulatorPrompt")
            or interaction_data.get("simulator_prompt"),
        ),
    )
