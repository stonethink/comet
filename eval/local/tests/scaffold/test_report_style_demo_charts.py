from pathlib import Path

from local.scripts.generate_report_style_demo_charts import generate_charts


def test_generate_report_style_demo_charts_writes_bilingual_svgs(tmp_path: Path):
    written = generate_charts(tmp_path)

    expected = {
        "rubric_delta.zh.svg",
        "rubric_delta.en.svg",
        "quality_cost.zh.svg",
        "quality_cost.en.svg",
        "task_outcomes.zh.svg",
        "task_outcomes.en.svg",
    }
    assert {path.name for path in written} == expected

    zh_rubric = (tmp_path / "rubric_delta.zh.svg").read_text(encoding="utf-8")
    en_rubric = (tmp_path / "rubric_delta.en.svg").read_text(encoding="utf-8")
    assert "图 1. Rubric 维度相对 0.3.9 的变化" in zh_rubric
    assert "Figure 1. Rubric dimension deltas relative to 0.3.9" in en_rubric
