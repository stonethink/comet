from pathlib import Path

from scaffold.python.validation.core import write_test_results


def main():
    passed = []
    failed = []
    skill_files = list(Path(".").rglob("SKILL.md"))
    if skill_files:
        passed.append("SKILL.md present")
    else:
        failed.append("SKILL.md missing")

    if list(Path(".").rglob("reference/resolved-skills.json")):
        passed.append("resolved-skills.json present")
    else:
        failed.append("resolved-skills.json missing")

    engine_roots = [path.parent for path in Path(".").rglob("comet/skill.yaml")]
    for root in engine_roots:
        if (root / "guardrails.yaml").exists() and (root / "evals.yaml").exists():
            passed.append("Engine package files present")
        else:
            failed.append(f"Engine package incomplete at {root}")

    write_test_results({"passed": passed, "failed": failed})


if __name__ == "__main__":
    main()
