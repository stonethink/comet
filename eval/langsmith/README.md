# LangSmith Eval Suite

This suite runs the Comet and generic Skill task corpus with LangSmith tracing enabled.

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
uv run pytest langsmith/tests/tasks/test_tasks.py --task=comet-fix-median --treatment=COMET_FULL -v
```

Generated Skill manifest example:

```bash
uv run pytest langsmith/tests/tasks/test_tasks.py \
  --eval-manifest=/path/to/my-skill/comet/eval.yaml -v
```

Set `LANGSMITH_API_KEY` in `eval/.env` or `eval/langsmith/.env`.
