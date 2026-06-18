# Comet Skill Eval

Minimal benchmark harness for evaluating the Comet skill workflow.

The eval tree is split into two selectable suites:

```text
eval/
  scaffold/      # shared Python runner, Docker helpers, skill/treatment/task loaders
  local/         # local benchmark suite; no LangSmith credential required
  langsmith/     # LangSmith benchmark entrypoint; writes logs under langsmith/logs
```

## Local Suite

Use this when you want local experiment logs and Docker-based validation only.

```bash
cd eval
uv run pytest local/tests/tasks/test_tasks.py --task=comet-hotfix --treatment=COMET_FULL -v
uv run pytest local/tests/tasks/test_tasks.py --task=comet-full-workflow --treatment=CONTROL,COMET_FULL -v
uv run pytest local/tests/tasks/test_tasks.py -v
```

Local results are written to:

```text
eval/local/logs/experiments/
```

## LangSmith Suite

Use this when you want the same Comet task corpus with LangSmith tracing enabled.
The LangSmith suite reuses `local/tasks`, `local/treatments`, and `local/skills`
by default, and writes its own reports under `langsmith/logs`.

```bash
cd eval
uv run pytest langsmith/tests/tasks/test_tasks.py --task=comet-hotfix --treatment=COMET_FULL -v
```

Required environment:

```bash
ANTHROPIC_API_KEY=...
LANGSMITH_API_KEY=...
LANGSMITH_TRACING=true
TRACE_TO_LANGSMITH=true
```

LangSmith results are written locally to:

```text
eval/langsmith/logs/experiments/
```

## Current Tasks

The initial local task corpus lives in `eval/local/tasks/index.yaml`:

- `comet-full-workflow`
- `comet-hotfix`
- `comet-phase-guard`

## Requirements

- Python 3.11+
- `uv` or an equivalent environment with dependencies from `pyproject.toml`
- Docker
- Claude Code CLI (`claude`)
- `ANTHROPIC_API_KEY`
- `LANGSMITH_API_KEY` only for the LangSmith suite
