# Local Eval Suite

This suite runs Comet and arbitrary local Skill benchmarks with local logs and Docker validation.
It does not require LangSmith credentials.

Run from `eval/`:

```bash
uv run pytest local/tests/tasks/test_tasks.py --task=comet-fix-median --treatment=COMET_FULL -v
uv run pytest local/tests/tasks/test_tasks.py --task=comet-full-workflow --treatment=CONTROL,COMET_FULL -v
uv run pytest local/tests/tasks/test_tasks.py -v
```

Quick generic smoke run:

```bash
uv run pytest local/tests/tasks/test_tasks.py --task=generic-skill-smoke --treatment=CONTROL -v
```

Task index:

```text
tasks/index.yaml
```

Reports and artifacts are written to:

```text
logs/experiments/
```

Report outputs default to Markdown only (`summary.md`). To enable browsable HTML
or disable Markdown, pass a JSON/YAML report config:

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

You can also set `COMET_EVAL_REPORT_CONFIG=/path/to/report-config.json`.
