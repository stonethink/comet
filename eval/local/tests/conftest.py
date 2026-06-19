"""Shared pytest fixtures and experiment logging plugin.

Generates rich experiment logs in logs/experiments/ including:
- summary.md: Full markdown report with tables and details
- events/: Parsed events from each test run
- raw/: Raw Claude CLI output
- reports/: Per-run validation reports
- artifacts/: Files Claude generated and their execution output
- metadata.json: Experiment metadata

Supports pytest-xdist parallel execution via worker coordination.
"""

import json
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from dotenv import load_dotenv

from scaffold import run_claude_in_docker, run_node_in_docker, run_python_in_docker, run_shell
from scaffold.python import (
    ExperimentLogger,
    TreatmentResult,
    save_events,
    save_raw,
    save_report,
    strip_ansi,
)
from scaffold.python.skill_parser import SCRIPT_EXTENSIONS

# =============================================================================
# CONSTANTS
# =============================================================================

PROJECT_ROOT = Path(__file__).parent.parent
EVAL_ROOT = PROJECT_ROOT.parent

# Shared files for xdist worker coordination
XDIST_EXPERIMENT_FILE = PROJECT_ROOT / ".pytest_experiment_id"
DOCKER_BUILD_LOCK = PROJECT_ROOT / ".pytest_docker_build.lock"

# Global plugin instance (set during pytest_configure)
_plugin: "ExperimentPlugin | None" = None

# Cache discovered scripts (computed once on first call)
_KNOWN_SCRIPTS: list[str] | None = None


# =============================================================================
# PYTEST HOOKS
# =============================================================================


def pytest_addoption(parser):
    """Add CLI options for task and treatment selection."""
    parser.addoption(
        "--task",
        action="store",
        default=None,
        help="Run specific task (e.g., --task=comet-full-workflow)",
    )
    parser.addoption(
        "--treatment",
        action="store",
        default=None,
        help="Run specific treatment (e.g., --treatment=COMET_FULL)",
    )


def pytest_configure(config):
    """Register experiment plugin (decision deferred to sessionstart)."""
    global _plugin
    _plugin = ExperimentPlugin(config)
    config.pluginmanager.register(_plugin, "experiment_plugin")


# =============================================================================
# EXPERIMENT PLUGIN
# =============================================================================


class ExperimentPlugin:
    """Pytest plugin that generates rich experiment logs in logs/experiments/."""

    def __init__(self, config):
        self.config = config
        self.logger: ExperimentLogger | None = None
        self.start_time = None
        self.run_counter: dict[str, int] = {}
        self.is_xdist_worker = hasattr(config, "workerinput")
        self.is_xdist_master = (
            not hasattr(config, "workerinput")
            and (getattr(config.option, "numprocesses", None) or 0) > 0
        )
        self.worker_id = (
            config.workerinput.get("workerid", "master") if self.is_xdist_worker else "master"
        )

    def pytest_sessionstart(self, session):
        """Create or join experiment logger at session start."""
        if _is_unit_tests_only(self.config):
            return

        name = _get_experiment_name(session)
        use_coordination = self.is_xdist_worker or self.is_xdist_master
        experiment_id = _get_or_create_experiment_id(name, use_coordination)

        self.logger = ExperimentLogger(experiment_name=name, experiment_id=experiment_id)
        self.start_time = time.time()

        print(f"\n{'=' * 60}")
        print(f"EXPERIMENT: {self.logger.experiment_id}")
        print(f"Logging to: {self.logger.base_dir}")
        print(f"{'=' * 60}\n")

    def pytest_sessionfinish(self, session, exitstatus):
        """Generate and save summary at session end."""
        if not self.logger:
            return

        if self.is_xdist_worker:
            return

        if self.is_xdist_master:
            time.sleep(1)

        self._reload_results_from_reports()

        if self.logger.results:
            self.logger.finalize()
            self._print_summary()

        _cleanup_experiment_coordination()

    def get_rep_number(self, treatment_name: str) -> int:
        """Get the next repetition number for a treatment."""
        if treatment_name not in self.run_counter:
            self.run_counter[treatment_name] = 0
        self.run_counter[treatment_name] += 1
        return self.run_counter[treatment_name]

    def _reload_results_from_reports(self):
        """Reload results from saved report files (aggregates all workers)."""
        reports_dir = self.logger.reports_dir
        if not reports_dir.exists():
            return

        self.logger.results.clear()

        for report_file in sorted(reports_dir.glob("*.json")):
            try:
                report = json.loads(report_file.read_text())
                treatment_name = report.get("name", "unknown")
                result = TreatmentResult(
                    name=treatment_name,
                    passed=report.get("passed", False),
                    checks_passed=report.get("checks_passed", []),
                    checks_failed=report.get("checks_failed", []),
                    events_summary=report.get("events_summary", {}),
                    run_id=report.get("run_id", ""),
                )
                if treatment_name not in self.logger.results:
                    self.logger.results[treatment_name] = []
                self.logger.results[treatment_name].append(result)
            except Exception:
                pass

    def _print_summary(self):
        """Print summary to console."""
        print(f"\n{'=' * 120}")
        print("  RESULTS")
        print(f"{'=' * 120}\n")

        print(f"{'Treatment':<25} {'Checks':<15} {'Turns':<8} {'Dur':<8} {'Skills':<40}")
        print("-" * 120)

        for treatment, runs in self.logger.results.items():
            for r in runs:
                checks_passed = len(r.checks_passed)
                checks_total = checks_passed + len(r.checks_failed)
                check_pct = (checks_passed / checks_total * 100) if checks_total > 0 else 0
                checks_str = f"{checks_passed}/{checks_total} ({check_pct:.0f}%)"
                turns = str(r.turns) if r.turns else "?"
                dur = f"{r.duration:.0f}s" if r.duration else "?"
                skills = r.events_summary.get("skills_invoked", [])
                skills_str = ", ".join(skills) if skills else "none"
                if len(skills_str) > 38:
                    skills_str = skills_str[:35] + "..."
                print(f"{treatment:<25} {checks_str:<15} {turns:<8} {dur:<8} {skills_str:<40}")

        print("-" * 120)
        total_passed = sum(
            sum(len(r.checks_passed) for r in runs) for runs in self.logger.results.values()
        )
        total_checks = sum(
            sum(len(r.checks_passed) + len(r.checks_failed) for r in runs)
            for runs in self.logger.results.values()
        )
        if total_checks:
            print(
                f"Total: {total_passed}/{total_checks} checks passed ({total_passed / total_checks * 100:.1f}%)"
            )
        print(f"{'=' * 120}")


# =============================================================================
# EXPERIMENT PLUGIN HELPERS
# =============================================================================


def _is_unit_tests_only(config) -> bool:
    """Check if running ONLY unit tests (scaffold/scripts - don't need experiment logs)."""
    args = [a for a in (config.args or []) if not a.startswith("-")]
    if not args:
        return False
    return all("scripts" in arg or "scaffold" in arg for arg in args)


def _get_experiment_name(session) -> str:
    """Determine experiment name from task name parameter."""
    items = getattr(session, "items", None)
    if not items:
        return "experiment"

    first_item = items[0]
    if hasattr(first_item, "callspec") and "task_name" in first_item.callspec.params:
        return first_item.callspec.params["task_name"].replace("-", "_")

    return "experiment"


def _get_or_create_experiment_id(name: str, use_coordination: bool) -> str:
    """Get shared experiment ID or create new one."""
    if not use_coordination:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return f"{name}_{timestamp}"

    lock_file = XDIST_EXPERIMENT_FILE.with_suffix(".lock")

    with file_lock(lock_file):
        if XDIST_EXPERIMENT_FILE.exists():
            data = json.loads(XDIST_EXPERIMENT_FILE.read_text())
            return data["experiment_id"]

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        experiment_id = f"{name}_{timestamp}"
        XDIST_EXPERIMENT_FILE.write_text(
            json.dumps(
                {
                    "experiment_id": experiment_id,
                    "created_at": datetime.now().isoformat(),
                }
            )
        )
        return experiment_id


def _cleanup_experiment_coordination():
    """Remove coordination files after experiment."""
    for f in [XDIST_EXPERIMENT_FILE, XDIST_EXPERIMENT_FILE.with_suffix(".lock")]:
        try:
            f.unlink(missing_ok=True)
        except Exception:
            pass


# =============================================================================
# SESSION-SCOPED FIXTURES
# =============================================================================


@pytest.fixture(scope="session")
def project_root():
    """Project root directory."""
    return PROJECT_ROOT


@pytest.fixture(scope="session")
def worker_id(request):
    """Get pytest-xdist worker ID, or 'master' if not using xdist."""
    if hasattr(request.config, "workerinput"):
        return request.config.workerinput["workerid"]
    return "master"


@pytest.fixture(scope="session", autouse=True)
def verify_environment(project_root, request):
    """Verify Docker, Claude CLI, and API keys are available."""
    if _is_unit_tests_only(request.config):
        return

    load_dotenv(EVAL_ROOT / ".env")
    load_dotenv(project_root / ".env")

    result = run_shell("docker.sh", "check", check=False)
    if result.returncode != 0:
        pytest.skip("Docker not available")

    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        pytest.skip("ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN not set")

    if shutil.which("claude") is None:
        pytest.skip("Claude CLI not available")


@pytest.fixture(scope="session", autouse=True)
def prebuild_docker_image(request):
    """Pre-build Docker image once per session to avoid race conditions."""
    if _is_unit_tests_only(request.config):
        yield
        return

    tasks_dir = PROJECT_ROOT / "tasks"
    if tasks_dir.exists():
        for task_dir in tasks_dir.iterdir():
            if task_dir.is_dir():
                env_dir = task_dir / "environment"
                if env_dir.exists() and (env_dir / "Dockerfile").exists():
                    image = _build_docker_image_with_lock(env_dir)
                    if image:
                        print(f"\nPre-built Docker image: {image}")

    yield

    try:
        DOCKER_BUILD_LOCK.unlink(missing_ok=True)
    except Exception:
        pass


# =============================================================================
# FUNCTION-SCOPED FIXTURES
# =============================================================================


@pytest.fixture
def test_dir(tmp_path):
    """Create isolated test directory (pytest manages cleanup)."""
    return tmp_path


@pytest.fixture
def experiment_logger():
    """Get the experiment logger for the current session."""
    return _plugin.logger if _plugin else None


@pytest.fixture
def setup_test_context(test_dir):
    """Factory fixture to set up test context with skills and CLAUDE.md."""

    def _setup(skills: dict = None, claude_md: str = None, environment_dir: Path = None):
        if claude_md:
            with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
                f.write(claude_md)
                temp_file = f.name
            try:
                run_shell("setup.sh", "write-claude-md", str(test_dir), temp_file)
            finally:
                os.unlink(temp_file)

        for skill_name, cfg in (skills or {}).items():
            if not cfg:
                continue

            if isinstance(cfg, dict):
                sections = cfg.get("sections") or cfg.get("all", [])
                scripts_dir = cfg.get("scripts_dir")
                script_filter = cfg.get("script_filter")
            else:
                sections, scripts_dir, script_filter = cfg, None, None

            if not sections:
                continue

            content = "\n\n".join(s for s in sections if s and s.strip())
            with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
                f.write(content)
                skill_file = f.name

            filtered_dir = _filter_scripts(scripts_dir, script_filter)
            is_temp_dir = filtered_dir and filtered_dir != scripts_dir

            try:
                args = ["write-skill", str(test_dir), skill_name, skill_file]
                if filtered_dir:
                    args.append(str(filtered_dir))
                run_shell("setup.sh", *args)
            finally:
                os.unlink(skill_file)
                if is_temp_dir and filtered_dir.exists():
                    shutil.rmtree(filtered_dir)

        if environment_dir and environment_dir.exists():
            run_shell("setup.sh", "copy-env", str(test_dir), str(environment_dir))

        return test_dir

    return _setup


@pytest.fixture
def run_claude(test_dir, experiment_logger, request):
    """Factory fixture to run Claude in Docker and capture artifacts.

    For comet-category tasks the single-shot ``run-claude`` is replaced by the
    multi-turn ``run-claude-loop`` driver, which simulates a user replying at
    the workflow's decision points so the full open→archive flow can complete.
    """
    default_model = os.environ.get("BENCH_CC_MODEL")
    # Detect comet tasks by node id (parametrised task name contains "comet").
    node_id = getattr(request, "node", None).nodeid if hasattr(request, "node") else ""
    use_loop = "comet" in node_id.lower()
    max_turns = os.environ.get("BENCH_LOOP_MAX_TURNS", "12")

    def _run(prompt: str, timeout: int = 600, model: str = None):
        mdl = model or default_model
        if use_loop:
            loop_args = ["run-claude-loop", test_dir, prompt, "--max-turns", str(max_turns)]
            if mdl:
                loop_args += ["--model", mdl]
            result = run_shell("docker.sh", *loop_args, timeout=timeout + 60, check=False)
        else:
            result = run_claude_in_docker(test_dir, prompt, timeout=timeout, model=mdl)

        if experiment_logger and hasattr(request, "node"):
            treatment_name = _get_treatment_name(request.node)
            rep = _plugin.get_rep_number(treatment_name) if _plugin else 1
            save_raw(
                experiment_logger.base_dir,
                treatment_name,
                rep,
                result.stdout,
                result.stderr,
            )

        return result

    return _run


@pytest.fixture
def record_result(test_dir, experiment_logger, request):
    """Factory fixture to record validation results and save artifacts."""

    def _record(
        events: dict[str, Any],
        passed: list[str],
        failed: list[str],
        run_id: str = "",
    ):
        if not experiment_logger:
            return

        treatment_name = _get_treatment_name(request.node)
        rep = _plugin.run_counter.get(treatment_name, 1) if _plugin else 1
        base_dir = experiment_logger.base_dir

        save_events(base_dir, treatment_name, rep, events)
        _save_artifacts(base_dir, treatment_name, rep, test_dir)

        scripts_used = _extract_scripts_used(events)

        report = {
            "name": treatment_name,
            "rep": rep,
            "passed": len(failed) == 0,
            "run_id": run_id,
            "checks_passed": passed,
            "checks_failed": failed,
            "events_summary": {
                "duration_seconds": events.get("duration_seconds"),
                "num_turns": events.get("num_turns"),
                "tool_calls": len(events.get("tool_calls", [])),
                "files_created": events.get("files_created", []),
                "skills_invoked": events.get("skills_invoked", []),
                "scripts_used": scripts_used,
            },
            "timestamp": datetime.now().isoformat(),
        }
        save_report(base_dir, treatment_name, rep, report)

        experiment_logger.add_result(
            treatment_name,
            TreatmentResult(
                name=treatment_name,
                passed=len(failed) == 0,
                checks_passed=passed,
                checks_failed=failed,
                events_summary={
                    "num_turns": events.get("num_turns"),
                    "duration_seconds": events.get("duration_seconds"),
                    "tool_calls": len(events.get("tool_calls", [])),
                    "skills_invoked": events.get("skills_invoked", []),
                    "scripts_used": scripts_used,
                },
                run_id=run_id,
            ),
        )

    return _record


# Fixture bundle accessor
_current_fixtures: SimpleNamespace | None = None


def get_fixtures() -> SimpleNamespace:
    """Get the current test's fixtures bundle."""
    if _current_fixtures is None:
        raise RuntimeError("get_fixtures() called outside of test context")
    return _current_fixtures


@pytest.fixture(scope="function", autouse=True)
def fixtures(
    verify_environment,
    test_dir,
    setup_test_context,
    run_claude,
    record_result,
):
    """Bundle test fixtures and make them accessible via get_fixtures()."""
    global _current_fixtures
    _current_fixtures = SimpleNamespace(
        test_dir=test_dir,
        setup_test_context=setup_test_context,
        run_claude=run_claude,
        record_result=record_result,
    )
    yield _current_fixtures
    _current_fixtures = None


# =============================================================================
# FIXTURE HELPERS
# =============================================================================


def _get_treatment_name(node) -> str:
    """Extract treatment name from pytest node."""
    nodeid = node.nodeid
    if "[" in nodeid:
        return nodeid.split("[")[1].rstrip("]")
    return nodeid.split("::")[-1]


def _filter_scripts(scripts_dir: Path, script_filter: str) -> Path | None:
    """Filter scripts by extension and return a temp dir with filtered scripts."""
    if not scripts_dir or not scripts_dir.exists():
        return None

    if script_filter is None or script_filter == "all":
        return scripts_dir

    extensions = SCRIPT_EXTENSIONS.get(script_filter)
    if extensions is None:
        return scripts_dir

    temp_dir = Path(tempfile.mkdtemp(prefix="scripts_"))
    copied_any = False

    for script in scripts_dir.iterdir():
        if script.is_file() and script.suffix in extensions:
            shutil.copy2(script, temp_dir / script.name)
            copied_any = True

    if not copied_any:
        shutil.rmtree(temp_dir)
        return None

    return temp_dir


def _build_docker_image_with_lock(environment_dir: Path) -> str | None:
    """Build Docker image with file locking to prevent race conditions."""
    if not environment_dir or not (environment_dir / "Dockerfile").exists():
        return None

    with file_lock(DOCKER_BUILD_LOCK):
        result = run_shell("docker.sh", "build", str(environment_dir), timeout=300, check=False)
        if result.returncode == 0:
            return result.stdout.strip()
        return None


@contextmanager
def file_lock(path: Path):
    """Cross-platform exclusive file lock for pytest-xdist coordination."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a+b") as lock_file:
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(lock_file.fileno(), msvcrt.LK_LOCK, 1)
            try:
                yield
            finally:
                lock_file.seek(0)
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


def _discover_skill_scripts() -> list[str]:
    """Dynamically discover all script files from skills directories."""
    scripts = set()
    skills_dir = PROJECT_ROOT / "skills"

    if not skills_dir.exists():
        return []

    for scripts_dir in skills_dir.rglob("scripts"):
        if scripts_dir.is_dir():
            for script in scripts_dir.iterdir():
                if script.is_file() and script.suffix in {".py", ".ts", ".js"}:
                    scripts.add(script.name)

    return sorted(scripts)


def _get_known_scripts() -> list[str]:
    """Get known scripts, discovering them on first call."""
    global _KNOWN_SCRIPTS
    if _KNOWN_SCRIPTS is None:
        _KNOWN_SCRIPTS = _discover_skill_scripts()
    return _KNOWN_SCRIPTS


def _extract_scripts_used(events: dict) -> list[str]:
    """Extract which skill scripts were used from events."""
    commands = " ".join(events.get("commands_run", [])).lower()
    files_read = " ".join(events.get("files_read", [])).lower()
    all_activity = commands + " " + files_read

    return [s for s in _get_known_scripts() if s.lower() in all_activity]


def _save_artifacts(base_dir: Path, treatment_name: str, rep: int, test_dir: Path):
    """Save Claude's generated files as artifacts."""
    artifacts_dir = base_dir / "artifacts" / f"{treatment_name.lower()}_rep{rep}"
    claude_dir = artifacts_dir / "claude"
    execution_dir = artifacts_dir / "execution"
    claude_dir.mkdir(parents=True, exist_ok=True)
    execution_dir.mkdir(parents=True, exist_ok=True)

    from scaffold.python.utils import TEST_CONTEXT_FILE, TEST_RESULTS_FILE

    exclude_dirs = {
        ".claude",
        "node_modules",
        "__pycache__",
        "scaffold",
        "validation",
        "data",
    }
    exclude_files = {
        "Dockerfile",
        "requirements.txt",
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        TEST_CONTEXT_FILE,
        TEST_RESULTS_FILE,
    }

    claude_files = []
    for item in test_dir.rglob("*"):
        if not item.is_file():
            continue
        if item.name.startswith("."):
            continue
        if item.name in exclude_files:
            continue
        if any(excl in item.parts for excl in exclude_dirs):
            continue
        try:
            rel_path = item.relative_to(test_dir)
            dest = claude_dir / rel_path
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(item, dest)
            claude_files.append(item)
        except Exception:
            pass

    for py_file in claude_files:
        if py_file.suffix == ".py" and py_file.parent == test_dir:
            try:
                success, output = run_python_in_docker(test_dir, py_file.name, timeout=300)
                status = "success" if success else "error"
                output_file = execution_dir / f"{py_file.stem}_{status}.txt"
                output_file.write_text(strip_ansi(output))
            except Exception as e:
                error_file = execution_dir / f"{py_file.stem}_error.txt"
                error_file.write_text(str(e))
