"""Evidence references for eval reports."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class EvalArtifactReference:
    kind: str
    path: str


def _safe_name(treatment_name: str) -> str:
    return treatment_name.lower().replace("-", "_")


def build_eval_artifact_references(
    base_dir: Path,
    treatment_name: str,
    rep: int,
) -> dict[str, str]:
    name = _safe_name(treatment_name)
    return {
        "events": str(base_dir / "events" / f"{name}_rep{rep}.json"),
        "raw_stdout": str(base_dir / "raw" / f"{name}_rep{rep}_stdout.json"),
        "raw_stderr": str(base_dir / "raw" / f"{name}_rep{rep}_stderr.txt"),
        "report": str(base_dir / "reports" / f"{name}_rep{rep}_report.json"),
        "artifacts": str(base_dir / "artifacts" / f"{name}_rep{rep}"),
    }
