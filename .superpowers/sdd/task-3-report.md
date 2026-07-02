# Task 3 Report: Use Analysis Set in Baseline Comparison Reports

## Status

DONE

## Scope and constraints

- Task brief source: `.superpowers/sdd/task-3-brief.md`
- Allowed code files for this task:
  - `eval/local/scripts/compare_baselines.py`
  - `eval/local/tests/scaffold/test_compare_baselines.py`
- I did not edit other product code files.

## TDD record

### Red

Added the four Task 3 regression tests required by the brief:

- `test_compare_report_excludes_hard_noise_from_analysis_metrics`
- `test_compare_report_lists_flagged_runs_without_excluding_them`
- `test_compare_report_reports_insufficient_clean_data`
- `test_html_report_includes_data_quality_summary`

Ran:

```powershell
uv run pytest local/tests/scaffold/test_compare_baselines.py -q
```

Observed expected failure state:

- `4 failed, 8 passed`
- Missing sections/verdicts:
  - `Data quality summary`
  - `Flagged runs`
  - `Insufficient clean data`
  - HTML exposure of the new section

### Green

Implemented Task 3 in `compare_baselines.py`:

- Added `ReportPartitions` plus `_partition_reports(...)`
- Switched primary aggregation to the analysis set
- Kept raw runs for:
  - source evidence
  - excluded/flagged listings
  - raw-vs-analysis sensitivity
  - failure attribution
- Added quality-aware report sections:
  - `Data quality summary`
  - `Excluded runs`
  - `Flagged runs`
  - `Raw vs analysis sensitivity`
- Added clean-data verdict guards:
  - `Insufficient clean data`
  - `Inconclusive due to data quality`
- Made verdict text include workflow analysis-set counts

Re-ran focused test:

```powershell
uv run pytest local/tests/scaffold/test_compare_baselines.py -q
```

Result:

- `12 passed`

## Related verification

Ran:

```powershell
uv run pytest local/tests/scaffold/test_sample_quality.py local/tests/scaffold/test_compare_baselines.py local/tests/scaffold/test_report_style_demo_charts.py -q
```

Result:

- `22 passed`

## Self-review

Reviewed the diff with a code-review lens against the task brief and checked these risk points:

- Analysis metrics now consume only included + flagged runs, never excluded runs
- Flagged runs remain visible and still count toward analysis
- Spend summary and pass/reliability metrics now reflect the analysis set
- Source evidence and failure attribution still inspect raw runs
- Repeated-run suffix normalization remains intact
- HTML rendering still surfaces the new markdown section

No blocking issues found in self-review.

## Commit

- `895762d8 feat(eval): filter noisy runs from comparison metrics`

## Concerns

- None

## Review follow-up: all-analysis-runs-excluded early return

### Root cause

- `build_report()` used `if not aggregated` as the early-return condition.
- `aggregated` is built from the analysis set, so when raw reports existed but every key-treatment run was excluded, the function returned `No report data found` too early.
- That short-circuited the required review-facing sections:
  - `Data quality summary`
  - `Excluded runs`
  - `Source evidence`
  - `Insufficient clean data`

### Fix

- Narrowed the early return in `eval/local/scripts/compare_baselines.py` so it only triggers when there are truly no raw reports loaded.
- When raw reports exist but the analysis set is empty, the report now continues rendering the data-quality sections and verdict logic.

### Regression test

- Added `test_compare_report_keeps_data_quality_sections_when_all_key_runs_are_excluded` to `eval/local/tests/scaffold/test_compare_baselines.py`.
- Red run:

```powershell
uv run pytest local/tests/scaffold/test_compare_baselines.py -q -k all_key_runs_are_excluded
```

- Observed failure before the fix:
  - report returned plain `No report data found`
  - missing `Data quality summary`

- Green verification:

```powershell
uv run pytest local/tests/scaffold/test_compare_baselines.py -q
```

- Result after the fix:
  - `13 passed`

### Commit

- `fcf8a09e fix(eval): keep quality report when analysis set is empty`
