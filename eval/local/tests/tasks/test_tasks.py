"""Generic test runner for comet skill task + treatment combinations.

Usage:
    # Run all default task/treatment combinations
    pytest local/tests/tasks/test_tasks.py -v

    # Run specific task with specific treatment
    pytest local/tests/tasks/test_tasks.py --task=comet-full-workflow --treatment=COMET_FULL -v

    # Run specific task with multiple treatments (comma-separated)
    pytest local/tests/tasks/test_tasks.py --task=comet-full-workflow --treatment=COMET_FULL,CONTROL -v

    # Run with repetitions and parallel workers
    pytest local/tests/tasks/test_tasks.py --task=comet-full-workflow --treatment=COMET_FULL --count=2 -n 2 -v
"""

import uuid

import pytest
from conftest import get_fixtures

from scaffold import NoiseTask, Treatment
from scaffold.python import extract_events, parse_output
from scaffold.python.tasks import list_tasks, load_task
from scaffold.python.treatments import build_treatment_skills, load_treatments
from scaffold.python.validation import run_validators

# Timeouts
CLAUDE_TIMEOUT = 1500  # 25 minutes for Claude to complete task (multi-turn loop)
PYTEST_TIMEOUT = 1800  # 30 minutes total including setup/teardown


# =============================================================================
# PARAMETRIZE HELPERS
# =============================================================================


def expand_treatment_patterns(patterns: list[str], all_treatments: dict) -> list[str]:
    """Expand treatment patterns into matching treatment names."""
    treatment_names = list(all_treatments.keys())
    expanded = []

    for pattern in patterns:
        if pattern.endswith("*"):
            prefix = pattern[:-1]
            matches = [t for t in treatment_names if t.startswith(prefix)]
            if not matches:
                raise ValueError(
                    f"No treatments match pattern: {pattern}. Available: {treatment_names}"
                )
            expanded.extend(matches)
        else:
            if pattern not in all_treatments:
                raise ValueError(f"Treatment not found: {pattern}. Available: {treatment_names}")
            expanded.append(pattern)

    return list(dict.fromkeys(expanded))


def generate_test_params(task_filter: str | None, treatment_filter: str | None):
    """Generate (task_name, treatment_name) pairs based on filters."""
    params = []
    all_treatments = load_treatments()
    all_tasks = list_tasks()

    if task_filter and task_filter not in all_tasks:
        raise ValueError(f"Task not found: {task_filter}. Available: {all_tasks}")

    treatment_list = []
    if treatment_filter:
        patterns = [t.strip() for t in treatment_filter.split(",")]
        treatment_list = expand_treatment_patterns(patterns, all_treatments)

    tasks_to_run = [task_filter] if task_filter else all_tasks

    for task_name in tasks_to_run:
        task = load_task(task_name)
        if treatment_list:
            for treatment_name in treatment_list:
                params.append((task_name, treatment_name))
        else:
            for treatment_name in task.default_treatments:
                if treatment_name in all_treatments:
                    params.append((task_name, treatment_name))

    return params


def pytest_generate_tests(metafunc):
    """Dynamically parametrize tests based on CLI options.

    ``--count N`` repeats each (task, treatment) pair N times so the report can
    compute pass-rate distributions instead of a single noisy sample.
    """
    if "task_name" in metafunc.fixturenames and "treatment_name" in metafunc.fixturenames:
        task_filter = metafunc.config.getoption("--task")
        treatment_filter = metafunc.config.getoption("--treatment")
        count = int(metafunc.config.getoption("--count") or 1)
        base_params = generate_test_params(task_filter, treatment_filter)
        # pytest ids stay (task, treatment); the rep number is tracked separately
        # by the experiment plugin's get_rep_number per treatment. To force N
        # distinct test invocations we append a rep suffix to the param id.
        params = []
        for rep in range(count):
            for task_name, treatment_name in base_params:
                params.append(pytest.param(task_name, treatment_name, id=f"{task_name}-{treatment_name}-r{rep+1}"))
        metafunc.parametrize("task_name,treatment_name", params)


# =============================================================================
# TEST
# =============================================================================


@pytest.mark.timeout(PYTEST_TIMEOUT)
def test_task_treatment(task_name, treatment_name):
    """Run a task with a treatment and validate results."""
    fixtures = get_fixtures()
    task = load_task(task_name)
    treatments = load_treatments()
    if treatment_name not in treatments:
        pytest.skip(f"Treatment {treatment_name} not found")
    treatment_cfg = treatments[treatment_name]
    validators = task.load_validators()

    skills = build_treatment_skills(treatment_cfg.skills) if treatment_cfg.skills else {}
    treatment = Treatment(
        description=treatment_cfg.description,
        skills=skills,
        claude_md=treatment_cfg.claude_md if treatment_cfg.claude_md else None,
    )

    fixtures.setup_test_context(
        skills=treatment.skills,
        claude_md=treatment.claude_md,
        environment_dir=task.environment_dir,
    )

    run_id = str(uuid.uuid4())

    template_vars = {"run_id": run_id}
    for var_name, var_template in task.config.setup.template_vars.items():
        template_vars[var_name] = var_template.format(run_id=run_id)

    prompt = task.render_prompt(**template_vars)

    result = fixtures.run_claude(prompt, timeout=CLAUDE_TIMEOUT)

    events = extract_events(parse_output(result.stdout))
    outputs = {
        "run_id": run_id,
        "treatment_name": treatment_name,
        "events": events,
    }

    passed, failed = run_validators(validators, fixtures.test_dir, outputs)

    # Rubric scoring: feed the baseline validator outcome as the "completion"
    # dimension input, then append the eight [RUBRIC] messages as informational
    # checks (they never produce hard failures).
    from scaffold.python.validation.rubric import comet_rubric_validator

    rubric_outputs = dict(outputs)
    rubric_outputs["completion"] = {"passed": passed, "failed": failed}
    rubric_passed, _ = comet_rubric_validator(fixtures.test_dir, rubric_outputs)
    passed = passed + rubric_passed

    fixtures.record_result(events, passed, failed, run_id=run_id)

    if failed:
        pytest.fail(f"Validation failed: {failed}")
