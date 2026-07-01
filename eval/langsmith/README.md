# LangSmith 评估套件

这个套件在启用 LangSmith tracing 的情况下运行 Comet 和通用 Skill 任务集。

默认复用：

- `../local/tasks`
- `../local/treatments`
- `../local/skills`

报告和产物写入：

```text
logs/experiments/
```

从 `eval/` 目录运行：

```bash
uv run pytest langsmith/tests/tasks/test_tasks.py --task=comet-fix-median --treatment=COMET_FULL_040_BETA -v
```

生成 Skill manifest 示例：

```bash
uv run pytest langsmith/tests/tasks/test_tasks.py \
  --eval-manifest=/path/to/my-skill/comet/eval.yaml -v
```

在 `eval/.env` 或 `eval/langsmith/.env` 中设置 `LANGSMITH_API_KEY`。
