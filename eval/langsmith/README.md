# LangSmith Eval Suite

This suite runs the Comet task corpus with LangSmith tracing enabled.

By default it reuses:

- `../local/tasks`
- `../local/treatments`
- `../local/skills`

Reports and artifacts are written to:

```text
logs/experiments/
```

Run from `eval/`:

```bash
uv run pytest langsmith/tests/tasks/test_tasks.py --task=comet-hotfix --treatment=COMET_FULL -v
```

Set `LANGSMITH_API_KEY` in `eval/.env` or `eval/langsmith/.env`.
