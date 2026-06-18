# LangSmith Tasks

This suite currently reuses `../../local/tasks` through `BENCH_TASKS_DIR`.

Add LangSmith-only tasks here if they need a different corpus, then update
`tests/conftest.py` to point `BENCH_TASKS_DIR` at this directory.
