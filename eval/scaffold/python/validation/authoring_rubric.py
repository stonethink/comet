"""Rubric for generated `/comet-any` authoring Skill packages."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from scaffold.python.validation.generic_rubric import generic_rubric_validator

AUTHORING_RUBRIC_DIMENSIONS = (
    "completion",
    "skill_invocation",
    "artifact_presence",
    "generated_package",
    "resolved_skill_evidence",
    "engine_contract",
    "review_readiness",
    "safety_boundary",
)


def _fmt(dim: str, score: float, reason: str) -> str:
    return f"[RUBRIC] {dim}: {score:.2f} - {reason}"


def _package_path(outputs: dict[str, Any]) -> Path | None:
    raw = outputs.get("skill_package_path")
    return Path(raw) if raw else None


def _check_package(package: Path | None) -> tuple[float, str, list[str]]:
    if not package:
        return 0.0, "skill_package_path missing", ["skill_package_path missing"]
    skill = package / "SKILL.md"
    if not skill.exists():
        return 0.0, "SKILL.md missing", ["SKILL.md missing"]
    text = skill.read_text(encoding="utf-8")
    checks = [
        ("调用链" in text or "call chain" in text.lower(), "call-chain section missing"),
        ("停止点" in text or "stop" in text.lower(), "stop-point guidance missing"),
    ]
    failures = [reason for passed, reason in checks if not passed]
    score = (len(checks) - len(failures)) / len(checks)
    return score, f"{len(checks) - len(failures)}/{len(checks)} package checks passed", failures


def _check_resolved_evidence(package: Path | None) -> tuple[float, str, list[str]]:
    if not package:
        return 0.0, "skill_package_path missing", ["skill_package_path missing"]
    evidence = package / "reference" / "resolved-skills.json"
    if not evidence.exists():
        return 0.0, "resolved-skills.json missing", ["resolved-skills.json missing"]
    data = json.loads(evidence.read_text(encoding="utf-8"))
    summaries = data.get("sourceSummaries") or []
    if not summaries:
        return 0.0, "sourceSummaries empty", ["sourceSummaries empty"]
    return 1.0, f"{len(summaries)} source summaries", []


def _check_engine_contract(package: Path | None) -> tuple[float, str, list[str]]:
    if not package:
        return 0.0, "skill_package_path missing", ["skill_package_path missing"]
    comet = package / "comet"
    expected = ["skill.yaml", "guardrails.yaml", "evals.yaml"]
    present = [name for name in expected if (comet / name).exists()]
    missing = [f"{name} missing" for name in expected if name not in present]
    if not present and not comet.exists():
        return 1.0, "Engine disabled for lightweight package", []
    return (
        len(present) / len(expected),
        f"{len(present)}/{len(expected)} engine files present",
        missing,
    )


def _weighted(scores: dict[str, float]) -> float:
    weights = {
        "completion": 1.5,
        "skill_invocation": 1.0,
        "artifact_presence": 1.0,
        "generated_package": 1.5,
        "resolved_skill_evidence": 1.5,
        "engine_contract": 1.0,
        "review_readiness": 1.0,
        "safety_boundary": 1.2,
    }
    return sum(scores[key] * weights[key] for key in weights) / sum(weights.values())


def _parse_generic_score(checks: list[str], name: str) -> float:
    prefix = f"[RUBRIC] {name}:"
    for item in checks:
        if item.startswith(prefix):
            return float(item.removeprefix(prefix).strip().split(" ", 1)[0])
    return 0.0


def authoring_skill_rubric_validator(
    test_dir: Path,
    outputs: dict[str, Any],
) -> tuple[list[str], list[str]]:
    generic_passed, generic_failed = generic_rubric_validator(test_dir, outputs)
    package = _package_path(outputs)
    package_score, package_reason, package_failures = _check_package(package)
    evidence_score, evidence_reason, evidence_failures = _check_resolved_evidence(package)
    engine_score, engine_reason, engine_failures = _check_engine_contract(package)
    review_score = 1.0 if not generic_failed else 0.0
    review_reason = "no hard validation failures" if review_score == 1.0 else "hard failures present"

    scores = {
        "completion": _parse_generic_score(generic_passed, "completion"),
        "skill_invocation": _parse_generic_score(generic_passed, "skill_invocation"),
        "artifact_presence": _parse_generic_score(generic_passed, "artifact_presence"),
        "generated_package": package_score,
        "resolved_skill_evidence": evidence_score,
        "engine_contract": engine_score,
        "review_readiness": review_score,
        "safety_boundary": _parse_generic_score(generic_passed, "safety_boundary"),
    }
    passed = [
        _fmt("completion", scores["completion"], "baseline completion score"),
        _fmt("skill_invocation", scores["skill_invocation"], "required Skill invocation score"),
        _fmt("artifact_presence", scores["artifact_presence"], "expected artifact score"),
        _fmt("generated_package", package_score, package_reason),
        _fmt("resolved_skill_evidence", evidence_score, evidence_reason),
        _fmt("engine_contract", engine_score, engine_reason),
        _fmt("review_readiness", review_score, review_reason),
        _fmt("safety_boundary", scores["safety_boundary"], "generic safety score"),
        f"[RUBRIC] weighted_score: {_weighted(scores):.2f}",
    ]
    failed = generic_failed + package_failures + evidence_failures + engine_failures
    return passed, failed
