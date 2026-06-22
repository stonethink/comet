# Comet Skill Eval

Minimal benchmark harness for evaluating Comet and arbitrary local Skills through pytest.

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
uv run pytest local/tests/tasks/test_tasks.py --task=comet-fix-median --treatment=COMET_FULL -v
uv run pytest local/tests/tasks/test_tasks.py --task=comet-full-workflow --treatment=CONTROL,COMET_FULL -v
uv run pytest local/tests/tasks/test_tasks.py -v
```

### Arbitrary Local Skill

```bash
cd eval
uv run pytest local/tests/tasks/test_tasks.py \
  --task=generic-skill-smoke \
  --skill-path=/path/to/my-skill \
  --skill-name=my-skill \
  --profile=generic -v
```

### Generated Skill Manifest

```bash
cd eval
uv run pytest local/tests/tasks/test_tasks.py \
  --eval-manifest=/path/to/my-skill/comet/eval.yaml -v
```

### Evidence And Attribution

Each local eval report records the selected profile, Skill source/hash metadata,
interaction config, run id, report output config, artifact references, and
structured failure attribution. Attribution uses four buckets: `harness`,
`workflow`, `task`, and `model`.

Local results are written to:

```text
eval/local/logs/experiments/
```

Local report outputs are configurable. By default eval writes Markdown only
(`summary.md`, and `comparison_report.md` for baseline comparisons). Pass
`--report-config` or set `COMET_EVAL_REPORT_CONFIG` to enable optional HTML:

```json
{
  "report_outputs": {
    "markdown": true,
    "html": true
  }
}
```

```bash
uv run pytest local/tests/tasks/test_tasks.py --report-config report-config.json -v
uv run python local/scripts/compare_baselines.py --report-config report-config.json
```

## LangSmith Suite

Use this when you want the same Comet task corpus with LangSmith tracing enabled.
The LangSmith suite reuses `local/tasks`, `local/treatments`, and `local/skills`
by default, and writes its own reports under `langsmith/logs`.

```bash
cd eval
uv run pytest langsmith/tests/tasks/test_tasks.py --task=comet-fix-median --treatment=COMET_FULL -v
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

The local task corpus lives in `eval/local/tasks/index.yaml`, including the
Comet workflow tasks plus `generic-skill-smoke` and `authoring-skill-smoke`
for arbitrary and generated Skill packages.

## Requirements

- Python 3.11+
- `uv` or an equivalent environment with dependencies from `pyproject.toml`
- Docker
- Claude Code CLI (`claude`)
- `ANTHROPIC_API_KEY`
- `LANGSMITH_API_KEY` only for the LangSmith suite
