import re
from pathlib import Path

import yaml

from scaffold.python.validation.core import load_test_context, write_test_results


HASH_RE = re.compile(r"^[a-f0-9]{64}$")


def _package_root(context: dict) -> Path:
    raw = context.get("skill_package_path")
    if not raw:
        return Path(".")
    path = Path(raw)
    return path if path.is_absolute() else Path(".") / path


def _contains_evidence(actual: list[dict], expected: dict) -> bool:
    return any(
        item.get("node") == expected.get("node")
        and item.get("check") == expected.get("check")
        and (
            "enforcement" not in expected
            or expected.get("enforcement") is None
            or item.get("enforcement") == expected.get("enforcement")
        )
        for item in actual
        if isinstance(item, dict)
    )


def main():
    context = load_test_context()
    package = _package_root(context)
    passed = []
    failed = []

    manifest_path = package / "comet" / "eval.yaml"
    if not manifest_path.exists():
        write_test_results({"passed": [], "failed": ["comet/eval.yaml missing"]})
        return

    try:
        manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
        passed.append("comet/eval.yaml parseable")
    except yaml.YAMLError as exc:
        write_test_results({"passed": [], "failed": [f"comet/eval.yaml invalid: {exc}"]})
        return

    metadata = manifest.get("metadata") or {}
    evaluation = manifest.get("evaluation") or {}

    draft_hash = metadata.get("draftHash") or metadata.get("draft_hash")
    expected_draft_hash = context.get("draft_hash")
    if expected_draft_hash and draft_hash != expected_draft_hash:
        failed.append("metadata.draftHash does not match manifest parser context")
    elif isinstance(draft_hash, str) and HASH_RE.match(draft_hash):
        passed.append("metadata.draftHash is stable sha256 hex")
    else:
        failed.append("metadata.draftHash missing or not 64 hex characters")

    recommended = evaluation.get("recommendedTasks") or []
    required_tasks = [
        "workflow-overlay-contract",
        "comet-full-workflow",
        "comet-fix-median",
    ]
    missing_tasks = [task for task in required_tasks if task not in recommended]
    if missing_tasks:
        failed.append(f"recommendedTasks missing: {', '.join(missing_tasks)}")
    else:
        passed.append("recommendedTasks includes overlay contract suite")

    baseline_treatments = evaluation.get("baselineTreatments") or []
    expected_baselines = context.get("baseline_treatments") or ["CONTROL", "COMET_FULL"]
    if baseline_treatments == expected_baselines:
        passed.append("baselineTreatments match expected overlay baselines")
    else:
        failed.append(
            f"baselineTreatments mismatch: expected {expected_baselines}, got {baseline_treatments}"
        )

    gates = evaluation.get("qualityGates") or {}
    expected_gates = context.get("quality_gates") or {
        "minWeightedScore": 0.8,
        "minPassAt1": 0.6,
        "maxInstabilityGap": 0.4,
    }
    if all(gates.get(key) == value for key, value in expected_gates.items()):
        passed.append("qualityGates declare required minimums")
    else:
        failed.append(f"qualityGates mismatch: expected {expected_gates}, got {gates}")

    required_schemas = evaluation.get("requiredOutputSchemas") or []
    expected_schemas = context.get("required_output_schemas") or []
    missing_schemas = [schema for schema in expected_schemas if schema not in required_schemas]
    if missing_schemas:
        failed.append(f"requiredOutputSchemas missing: {', '.join(missing_schemas)}")
    elif isinstance(required_schemas, list):
        passed.append("requiredOutputSchemas present")
    else:
        failed.append("requiredOutputSchemas is not a list")

    expected_evidence = evaluation.get("expectedEvidence") or []
    context_evidence = context.get("expected_evidence") or []
    missing_evidence = [
        item for item in context_evidence if not _contains_evidence(expected_evidence, item)
    ]
    if missing_evidence:
        failed.append(f"expectedEvidence missing checks: {missing_evidence}")
    elif isinstance(expected_evidence, list):
        passed.append("expectedEvidence present")
    else:
        failed.append("expectedEvidence is not a list")

    write_test_results({"passed": passed, "failed": failed})


if __name__ == "__main__":
    main()
