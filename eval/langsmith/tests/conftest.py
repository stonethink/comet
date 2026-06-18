"""LangSmith eval suite pytest configuration.

This suite reuses the local task corpus by default and writes reports under
eval/langsmith/logs. LangSmith-specific environment checks live here so local
runs stay free of LangSmith requirements.
"""

import importlib.util
import os
from pathlib import Path

import pytest
from dotenv import load_dotenv

LANGSMITH_ROOT = Path(__file__).resolve().parents[1]
EVAL_ROOT = LANGSMITH_ROOT.parent
LOCAL_ROOT = EVAL_ROOT / "local"

os.environ.setdefault("BENCH_SUITE_ROOT", str(LANGSMITH_ROOT))
os.environ.setdefault("BENCH_TASKS_DIR", str(LOCAL_ROOT / "tasks"))
os.environ.setdefault("BENCH_TREATMENTS_DIR", str(LOCAL_ROOT / "treatments"))
os.environ.setdefault("BENCH_SKILLS_DIR", str(LOCAL_ROOT / "skills"))
os.environ.setdefault("BENCH_LOGS_DIR", str(LANGSMITH_ROOT / "logs"))
os.environ.setdefault("TRACE_TO_LANGSMITH", "true")
os.environ.setdefault("LANGSMITH_TRACING", "true")

load_dotenv(EVAL_ROOT / ".env")
load_dotenv(LANGSMITH_ROOT / ".env", override=True)

_LOCAL_CONFTEST = LOCAL_ROOT / "tests" / "conftest.py"
_spec = importlib.util.spec_from_file_location("_comet_local_conftest", _LOCAL_CONFTEST)
_local_conftest = importlib.util.module_from_spec(_spec)
assert _spec and _spec.loader
_spec.loader.exec_module(_local_conftest)

for _name in dir(_local_conftest):
    if not _name.startswith("__") and _name not in globals():
        globals()[_name] = getattr(_local_conftest, _name)


@pytest.fixture(scope="session", autouse=True)
def verify_langsmith_environment(request):
    """Require LangSmith credentials only for non-unit LangSmith eval runs."""
    if _local_conftest._is_unit_tests_only(request.config):
        return
    if not os.environ.get("LANGSMITH_API_KEY"):
        pytest.skip("LANGSMITH_API_KEY not set")
