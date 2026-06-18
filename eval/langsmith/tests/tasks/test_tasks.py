"""LangSmith suite task runner.

The LangSmith suite intentionally reuses the local task runner while setting
LangSmith-specific paths and environment in tests/conftest.py.
"""

import importlib.util
from pathlib import Path

_LOCAL_TEST_TASKS = (
    Path(__file__).resolve().parents[3] / "local" / "tests" / "tasks" / "test_tasks.py"
)
_spec = importlib.util.spec_from_file_location("_comet_local_test_tasks", _LOCAL_TEST_TASKS)
_local_test_tasks = importlib.util.module_from_spec(_spec)
assert _spec and _spec.loader
_spec.loader.exec_module(_local_test_tasks)

for _name in dir(_local_test_tasks):
    if _name.startswith("test_") or _name == "pytest_generate_tests":
        globals()[_name] = getattr(_local_test_tasks, _name)
