"""Validation script for comet hotfix task.

Runs inside Docker. Checks that Claude fixed the line counting bug
and followed the hotfix workflow.
"""

import json
import os
import subprocess
import sys
from pathlib import Path

WORKSPACE = Path("/workspace")
RESULTS_FILE = os.environ.get("BENCH_TEST_RESULTS", "_test_results.json")


def passed(name: str):
    return {"check": name, "status": "passed"}


def failed(name: str, reason: str):
    return {"check": name, "status": "failed", "reason": reason}


def check_bug_fixed():
    """Check that the line counting bug is fixed."""
    wordcount = WORKSPACE / "wordcount.py"
    if not wordcount.exists():
        return failed("bug_fixed", "wordcount.py not found")

    content = wordcount.read_text()

    # The bug was: count_lines uses split() instead of splitlines()
    # Check if it's been fixed
    if "text.split()" in content and "splitlines" not in content:
        return failed("bug_fixed", "count_lines still uses split() instead of splitlines()")

    # Actually test it works correctly
    try:
        # Test 1: Multiple lines should count lines, not words
        result = subprocess.run(
            [sys.executable, str(wordcount), "--lines"],
            input="hello\nworld\nfoo bar baz",
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            return failed("bug_fixed", f"wordcount.py failed: {result.stderr}")

        # Should be 3 lines (not 5 words)
        stdout = result.stdout
        if "Lines: 3" not in stdout:
            return failed("bug_fixed", f"Expected 'Lines: 3', got: {stdout}")

        # Test 2: Single line with multiple words
        result2 = subprocess.run(
            [sys.executable, str(wordcount), "--lines"],
            input="one two three four five",
            capture_output=True, text=True, timeout=10
        )
        if "Lines: 1" not in result2.stdout:
            return failed("bug_fixed", f"Expected 'Lines: 1' for single line, got: {result2.stdout}")

    except Exception as e:
        return failed("bug_fixed", f"Error testing: {e}")

    return passed("bug_fixed")


def check_wordcount_still_works():
    """Check that word counting still works after the fix."""
    wordcount = WORKSPACE / "wordcount.py"
    if not wordcount.exists():
        return failed("words_still_work", "wordcount.py not found")

    try:
        result = subprocess.run(
            [sys.executable, str(wordcount)],
            input="hello world foo",
            capture_output=True, text=True, timeout=10
        )
        if "Words: 3" not in result.stdout:
            return failed("words_still_work", f"Word count broken: {result.stdout}")
    except Exception as e:
        return failed("words_still_work", f"Error: {e}")

    return passed("words_still_work")


def check_change_record():
    """Check that a change record was created (even minimal for hotfix)."""
    changes_dir = WORKSPACE / "openspec" / "changes"
    if not changes_dir.exists():
        return failed("change_record", "openspec/changes/ directory not found")

    change_dirs = [d for d in changes_dir.iterdir() if d.is_dir()]
    if not change_dirs:
        return failed("change_record", "No change directories found")

    return passed("change_record")


def check_hotfix_workflow():
    """Check evidence of hotfix workflow (should be simpler than full)."""
    # For hotfix, we expect minimal artifacts - just the fix and maybe a brief note
    wordcount = WORKSPACE / "wordcount.py"
    if not wordcount.exists():
        return failed("hotfix_workflow", "wordcount.py not found")

    content = wordcount.read_text()

    # Check that the fix is clean (no over-engineering)
    lines = content.splitlines()
    if len(lines) > 100:
        return failed("hotfix_workflow", "wordcount.py seems over-engineered for a hotfix")

    return passed("hotfix_workflow")


def main():
    results = []

    results.append(check_bug_fixed())
    results.append(check_wordcount_still_works())
    results.append(check_change_record())
    results.append(check_hotfix_workflow())

    passed_list = [r["check"] for r in results if r["status"] == "passed"]
    failed_list = [f'{r["check"]}: {r.get("reason", "")}' for r in results if r["status"] == "failed"]

    output = {"passed": passed_list, "failed": failed_list}

    (WORKSPACE / RESULTS_FILE).write_text(json.dumps(output, indent=2))
    print(json.dumps(output))

    return 0 if not failed_list else 1


if __name__ == "__main__":
    sys.exit(main())
