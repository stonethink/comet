# Local Eval Suite

This suite runs Comet skill benchmarks with local logs and Docker validation.
It does not require LangSmith credentials.

Run from `eval/`:

```bash
uv run pytest local/tests/tasks/test_tasks.py --task=comet-hotfix --treatment=COMET_FULL -v
uv run pytest local/tests/tasks/test_tasks.py --task=comet-full-workflow --treatment=CONTROL,COMET_FULL -v
uv run pytest local/tests/tasks/test_tasks.py -v
```

Task index:

```text
tasks/index.yaml
```

Reports and artifacts are written to:

```text
logs/experiments/
```
