## Task 2 完成记录

### 变更
- 在 `eval/local/tests/conftest.py` 中新增 `infer_sample_quality` 引入，并新增 `_build_report_payload(...)`，在每条 run report 中加入 `sample_quality`。
- 将 `record_result(...)` 的签名扩展为 `returncode/stdout/stderr`，并改用 `_build_report_payload(...)` 组装保存的 JSON。
- 在 `eval/local/tests/tasks/test_tasks.py` 中将本次任务运行的 `CompletedProcess` 元数据 (`returncode`, `stdout`, `stderr`) 透传到 `fixtures.record_result(...)`。
- 在 `eval/local/tests/scaffold/test_conftest_helpers.py` 补充 `test_build_report_payload_persists_sample_quality` 与 `test_build_report_payload_marks_timeout_as_excluded` 两个元测试，覆盖 `sample_quality` 的持久化与超时排除逻辑。

### 验证
- `uv run pytest local/tests/scaffold/test_conftest_helpers.py::test_build_report_payload_persists_sample_quality local/tests/scaffold/test_conftest_helpers.py::test_build_report_payload_marks_timeout_as_excluded --basetemp .\\.pytest_tmp -q`  
  结果：`2 passed`（先前预期的 `AttributeError` 未再出现）
- `uv run pytest local/tests/scaffold/test_conftest_helpers.py local/tests/scaffold/test_logging.py --basetemp .\\.pytest_tmp -q`  
  结果：`3 failed, 23 passed`  
  失败为现存环境依赖问题：`run_shell` 走到 `C:\WINDOWS\system32\bash.exe`（WSL 风格）执行 `setup.sh` 失败，不属于本任务改动范围（未修改 `scaffold/shell/setup.sh` 或相关 shell 依赖）。

### 自检
- 已按 Task 2 约定仅修改 3 个指定测试文件，未触及 Task 1 文件。
- 新增的 `sample_quality` 字段来源于 `infer_sample_quality(...).to_dict()`，结构与既有 `SampleQuality` 接口对齐。
- `record_result` 仍保持对 `experiment_logger` 的空值保护，行为兼容现有测试调用路径。
