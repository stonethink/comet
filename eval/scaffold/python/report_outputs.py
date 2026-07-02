"""Configurable report output helpers for eval summaries."""

from __future__ import annotations

import html
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ReportOutputConfig:
    """Controls which report formats are written."""

    markdown: bool = True
    html: bool = False


def load_report_output_config(config_path: str | Path | None = None) -> ReportOutputConfig:
    """Load report output settings from a JSON/YAML config file or env var.

    The supported shape is:

        {"report_outputs": {"markdown": true, "html": false}}

    If no file is provided and COMET_EVAL_REPORT_CONFIG is unset, only markdown
    is written to preserve the existing eval behavior.
    """
    selected = config_path or os.environ.get("COMET_EVAL_REPORT_CONFIG")
    if not selected:
        return ReportOutputConfig()

    path = Path(selected)
    data = _read_config_file(path)
    report_outputs = data.get("report_outputs", data)
    if not isinstance(report_outputs, dict):
        raise ValueError("report_outputs must be an object")

    return ReportOutputConfig(
        markdown=_read_bool(report_outputs, "markdown", default=True),
        html=_read_bool(report_outputs, "html", default=False),
    )


def write_report_outputs(
    markdown: str,
    markdown_path: Path,
    config: ReportOutputConfig,
    *,
    title: str,
) -> dict[str, Path]:
    """Write enabled report formats and return paths by format name."""
    written: dict[str, Path] = {}

    if config.markdown:
        markdown_path.parent.mkdir(parents=True, exist_ok=True)
        markdown_path.write_text(markdown, encoding="utf-8")
        written["markdown"] = markdown_path

    if config.html:
        html_path = markdown_path.with_suffix(".html")
        html_path.parent.mkdir(parents=True, exist_ok=True)
        html_path.write_text(render_markdown_html(markdown, title=title), encoding="utf-8")
        written["html"] = html_path

    return written


def preferred_report_path(written: dict[str, Path], fallback: Path) -> Path:
    """Return the most useful path for callers that historically returned one file."""
    return written.get("markdown") or written.get("html") or fallback


def render_markdown_html(markdown: str, *, title: str) -> str:
    """Render enough Markdown for eval reports without adding dependencies."""
    body = _render_markdown_body(markdown)
    figures = _render_paper_figures(markdown)
    safe_title = html.escape(title)
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{safe_title}</title>
  <style>
    :root {{
      color-scheme: light;
      --paper: #f7f4ed;
      --panel: #fffdf8;
      --ink: #191817;
      --muted: #66615a;
      --line: #d7d0c3;
      --grid: #e9e2d6;
      --code: #eee7dc;
      --accent: #a87318;
      --paper-font:
        'Times New Roman', SimSun, 'Songti SC', 'Noto Serif CJK SC',
        'Source Han Serif SC', serif;
    }}
    * {{ box-sizing: border-box; }}
    html {{ background: var(--paper); }}
    body {{
      margin: 0;
      background:
        linear-gradient(90deg, rgba(25, 24, 23, 0.025) 1px, transparent 1px),
        linear-gradient(180deg, rgba(25, 24, 23, 0.025) 1px, transparent 1px),
        var(--paper);
      background-size: 28px 28px;
      color: var(--ink);
      font: 16px/1.6 var(--paper-font);
    }}
    main {{
      width: min(1180px, calc(100vw - 40px));
      margin: 28px auto 48px;
      padding: 38px 42px 48px;
      background: var(--panel);
      border: 1px solid var(--line);
      box-shadow: 0 18px 55px rgba(25, 24, 23, 0.08);
    }}
    .report-kicker {{
      margin: 0 0 10px;
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }}
    h1, h2, h3, h4, h5, h6 {{
      line-height: 1.25;
      margin: 1.6em 0 0.55em;
    }}
    h1 {{
      max-width: 900px;
      margin-top: 0;
      font-size: clamp(32px, 4vw, 52px);
      letter-spacing: 0;
      text-wrap: balance;
    }}
    h2 {{
      border-bottom: 1px solid var(--line);
      padding-bottom: 0.25rem;
      font-size: 1.35rem;
    }}
    h3 {{ font-size: 1.08rem; }}
    p, ul, table {{ margin: 0 0 1rem; }}
    ul {{ padding-left: 1.4rem; }}
    li + li {{ margin-top: 0.25rem; }}
    table {{
      width: 100%;
      border-collapse: collapse;
      display: block;
      overflow-x: auto;
      background: #fff;
      border: 1px solid var(--line);
      font-size: 13px;
    }}
    th, td {{
      padding: 0.5rem 0.7rem;
      border: 1px solid var(--grid);
      text-align: left;
      vertical-align: top;
      white-space: nowrap;
    }}
    th {{
      background: #f5efe4;
      font-weight: 700;
    }}
    code {{
      background: var(--code);
      border-radius: 4px;
      padding: 0.1rem 0.25rem;
      font-size: 0.92em;
      font-family: var(--paper-font);
    }}
    .paper-figures {{
      display: grid;
      gap: 24px;
      margin: 30px 0 34px;
    }}
    .paper-figure {{
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 4px;
      overflow: hidden;
    }}
    .paper-figure header {{
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 18px;
      padding: 16px 18px 12px;
      border-bottom: 1px solid var(--line);
    }}
    .paper-figure h2 {{
      margin: 0;
      padding: 0;
      border: 0;
      font-size: 15px;
    }}
    .paper-figure .kicker {{
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
    }}
    .paper-figure .figure-body {{
      padding: 16px 18px 18px;
    }}
    .paper-figure svg {{
      display: block;
      width: 100%;
      height: auto;
      border: 1px solid var(--grid);
      background: #fff;
    }}
    .caption {{
      margin: 12px 0 0;
      color: var(--muted);
      font-size: 13px;
      text-wrap: pretty;
    }}
    .muted {{ color: var(--muted); }}
    @media (max-width: 760px) {{
      main {{
        width: 100%;
        margin: 0;
        padding: 24px 20px 36px;
        border-left: 0;
        border-right: 0;
      }}
      .paper-figure header {{
        display: block;
      }}
      .paper-figure .kicker {{
        display: block;
        margin-top: 6px;
      }}
    }}
  </style>
</head>
<body>
  <main>
    <p class="report-kicker">Comet Eval Report</p>
{figures}
{body}
  </main>
</body>
</html>
"""


PAPER_FONT = "'Times New Roman', SimSun, 'Songti SC', 'Noto Serif CJK SC', serif"
CURRENT = "#1F5F8B"
BASELINE = "#9F3D2F"
GOOD = "#28745C"
BAD = "#A33A32"
INK = "#1B1A18"
MUTED = "#66615A"
GRID = "#D8D2C7"


def _render_paper_figures(markdown: str) -> str:
    tables = _extract_tables_by_heading(markdown)
    payload = {
        "rubric": _rubric_delta_data(tables),
        "spend": _spend_data(tables),
        "tasks": _task_outcome_data(tables),
    }
    python_rendered = _render_figures_with_python(payload)
    if python_rendered is not None:
        return python_rendered
    return _render_paper_figures_inline(payload, backend="inline-svg")


def _render_figures_with_python(payload: dict[str, Any]) -> str | None:
    if os.environ.get("COMET_EVAL_REPORT_CHART_BACKEND", "").lower() == "inline":
        return None

    python = os.environ.get("COMET_EVAL_PYTHON") or sys.executable
    if not python:
        python = shutil.which("python3") or shutil.which("python")
    if not python:
        return None

    eval_root = Path(__file__).resolve().parents[2]
    env = os.environ.copy()
    env["PYTHONPATH"] = (
        str(eval_root)
        if not env.get("PYTHONPATH")
        else str(eval_root) + os.pathsep + env["PYTHONPATH"]
    )
    try:
        completed = subprocess.run(
            [python, "-m", "scaffold.python.paper_charts"],
            input=json.dumps(payload),
            capture_output=True,
            cwd=eval_root,
            encoding="utf-8",
            env=env,
            check=False,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if completed.returncode != 0:
        return None
    output = completed.stdout
    if 'data-chart-backend="python"' not in output:
        return None
    return output


def _render_paper_figures_inline(payload: dict[str, Any], *, backend: str) -> str:
    rubric = payload.get("rubric") or []
    spend = payload.get("spend") or {}
    tasks = payload.get("tasks") or []
    figures: list[str] = []
    if rubric:
        figures.append(
            _figure_block(
                "Figure 1. Rubric dimension deltas",
                "Mean score difference, higher is better",
                _rubric_delta_svg(rubric),
                "The zero line is the baseline. Blue marks improvements for the "
                "current workflow; red marks regressions.",
            )
        )
    if rubric and spend:
        quality_points = _quality_cost_points(rubric, spend)
        if len(quality_points) >= 2:
            figures.append(
                _figure_block(
                    "Figure 2. Quality-cost frontier",
                    "Rubric score vs token budget",
                    _quality_cost_svg(quality_points),
                    "This figure separates quality from spend so token usage is visible "
                    "as a trade-off, not hidden inside the score.",
                )
            )
    if tasks:
        figures.append(
            _figure_block(
                "Figure 3. Task outcome matrix",
                "Per-task pass/fail evidence",
                _task_outcomes_svg(tasks),
                "The matrix keeps per-task granularity for appendix-style inspection "
                "while preserving the table below as raw evidence.",
            )
        )

    if not figures:
        return ""
    return (
        f'    <section class="paper-figures" aria-label="Paper-style figures" '
        f'data-chart-backend="{html.escape(backend)}">\n'
        + "\n".join(figures)
        + "\n    </section>\n"
    )


def _figure_block(title: str, kicker: str, svg: str, caption: str) -> str:
    return f"""      <article class="paper-figure">
        <header>
          <h2>{html.escape(title)}</h2>
          <span class="kicker">{html.escape(kicker)}</span>
        </header>
        <div class="figure-body">
{_indent(svg, 10)}
          <p class="caption">{html.escape(caption)}</p>
        </div>
      </article>"""


def _extract_tables_by_heading(markdown: str) -> dict[str, list[list[str]]]:
    tables: dict[str, list[list[str]]] = {}
    current_heading = ""
    lines = markdown.splitlines()
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        heading = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if heading:
            current_heading = _plain_text(heading.group(2))
            i += 1
            continue
        if stripped.startswith("|") and stripped.endswith("|"):
            table_lines: list[str] = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                table_lines.append(lines[i].strip())
                i += 1
            rows = [_table_cells(line) for line in table_lines if not _is_table_separator(line)]
            if rows:
                key = current_heading or f"table_{len(tables)}"
                tables.setdefault(key, rows)
            continue
        i += 1
    return tables


def _rubric_delta_data(tables: dict[str, list[list[str]]]) -> list[tuple[str, float]]:
    rows = _find_table(tables, "Rubric dimensions")
    if not rows:
        return []
    header = rows[0]
    try:
        workflow_idx = header.index("COMET_FULL_040_BETA")
        baseline_idx = header.index("COMET_FULL_039")
    except ValueError:
        return []

    data: list[tuple[str, float]] = []
    for row in rows[1:]:
        if len(row) <= max(workflow_idx, baseline_idx):
            continue
        dim = _plain_text(row[0])
        if not dim or dim.lower() == "overall":
            continue
        workflow = _number(row[workflow_idx])
        baseline = _number(row[baseline_idx])
        if workflow is None or baseline is None:
            continue
        data.append((dim, workflow - baseline))
    return data


def _spend_data(tables: dict[str, list[list[str]]]) -> dict[str, tuple[float, float]]:
    rows = _find_table(tables, "Spend summary")
    if not rows:
        return {}
    header = rows[0]
    try:
        treatment_idx = header.index("Treatment")
        tokens_idx = header.index("Tokens")
        cost_idx = header.index("Cost")
    except ValueError:
        return {}

    spend: dict[str, tuple[float, float]] = {}
    for row in rows[1:]:
        if len(row) <= max(treatment_idx, tokens_idx, cost_idx):
            continue
        tokens = _number(row[tokens_idx])
        cost = _number(row[cost_idx])
        if tokens is None or cost is None:
            continue
        spend[_plain_text(row[treatment_idx])] = (tokens / 1_000_000, cost)
    return spend


def _task_outcome_data(
    tables: dict[str, list[list[str]]],
) -> list[tuple[str, bool | None, bool | None]]:
    rows = _find_table(tables, "Task outcomes")
    if not rows:
        return []
    header = rows[0]
    try:
        task_idx = header.index("Task")
        workflow_idx = header.index("COMET_FULL_040_BETA")
        baseline_idx = header.index("COMET_FULL_039")
    except ValueError:
        return []
    tasks: list[tuple[str, bool | None, bool | None]] = []
    for row in rows[1:]:
        if len(row) <= max(task_idx, workflow_idx, baseline_idx):
            continue
        current = _status_value(row[workflow_idx])
        baseline = _status_value(row[baseline_idx])
        tasks.append((_plain_text(row[task_idx]), current, baseline))
    return tasks


def _quality_cost_points(
    rubric: list[tuple[str, float]],
    spend: dict[str, tuple[float, float]],
) -> list[tuple[str, float, float, float]]:
    deltas = [delta for _, delta in rubric]
    delta_mean = sum(deltas) / len(deltas) if deltas else 0.0
    baseline_score = max(0.0, min(1.0, 0.5 - delta_mean / 2))
    workflow_score = max(0.0, min(1.0, baseline_score + delta_mean))
    points: list[tuple[str, float, float, float]] = []
    if "COMET_FULL_039" in spend:
        tokens_m, cost = spend["COMET_FULL_039"]
        points.append(("0.3.9 baseline", tokens_m, cost, baseline_score))
    if "COMET_FULL_040_BETA" in spend:
        tokens_m, cost = spend["COMET_FULL_040_BETA"]
        points.append(("Current workflow", tokens_m, cost, workflow_score))
    return points


def _rubric_delta_svg(data: list[tuple[str, float]]) -> str:
    width, height = 920, max(260, 116 + len(data) * 38)
    x0, y0, plot_w, row_gap = 330, 82, 410, 38
    min_delta = min((delta for _, delta in data), default=-0.2)
    max_delta = max((delta for _, delta in data), default=0.2)
    x_min = min(-0.3, min_delta - 0.08)
    x_max = max(0.3, max_delta + 0.08)
    scale = plot_w / (x_max - x_min)
    zero_x = x0 + (0 - x_min) * scale
    parts = _svg_header(
        width,
        height,
        "Rubric dimension deltas",
        "Current workflow minus 0.3.9 baseline",
    )
    for tick in _ticks(x_min, x_max):
        x = x0 + (tick - x_min) * scale
        klass = "axis" if abs(tick) < 0.0001 else "grid"
        parts.append(
            f'<line class="{klass}" x1="{x:.1f}" y1="68" '
            f'x2="{x:.1f}" y2="{height - 58}" />'
        )
        parts.append(
            f'<text class="tick" x="{x:.1f}" y="{height - 26}" '
            f'text-anchor="middle">{tick:+.1f}</text>'
        )
    for idx, (label, delta) in enumerate(data):
        y = y0 + idx * row_gap
        x = x0 + (delta - x_min) * scale
        color = CURRENT if delta >= 0 else BASELINE
        parts.append(f'<text class="label" x="44" y="{y + 4}">{html.escape(label)}</text>')
        parts.append(
            f'<line x1="{zero_x:.1f}" y1="{y}" x2="{x:.1f}" y2="{y}" '
            f'stroke="{color}" stroke-width="3" />'
        )
        parts.append(f'<circle cx="{x:.1f}" cy="{y}" r="5.2" fill="{color}" />')
        parts.append(
            f'<text class="value" x="850" y="{y + 4}" '
            f'text-anchor="end">{delta:+.2f}</text>'
        )
    parts.append("</svg>")
    return "\n".join(parts)


def _quality_cost_svg(points: list[tuple[str, float, float, float]]) -> str:
    width, height = 820, 460
    left, top, plot_w, plot_h = 86, 72, 620, 300
    max_tokens = max(1.0, max(point[1] for point in points) * 1.15)
    parts = _svg_header(width, height, "Quality-cost frontier", "Upper-left is better")
    for tick in _linear_ticks(0, max_tokens, 4):
        x = left + (tick / max_tokens) * plot_w
        parts.append(
            f'<line class="grid" x1="{x:.1f}" y1="{top}" '
            f'x2="{x:.1f}" y2="{top + plot_h}" />'
        )
        parts.append(
            f'<text class="tick" x="{x:.1f}" y="402" '
            f'text-anchor="middle">{tick:.1f}M</text>'
        )
    for tick in (0.3, 0.5, 0.7, 0.9):
        y = top + (0.9 - tick) / 0.6 * plot_h
        parts.append(
            f'<line class="grid" x1="{left}" y1="{y:.1f}" '
            f'x2="{left + plot_w}" y2="{y:.1f}" />'
        )
        parts.append(
            f'<text class="tick" x="60" y="{y + 4:.1f}" '
            f'text-anchor="end">{tick:.1f}</text>'
        )
    parts.append(
        f'<line class="axis" x1="{left}" y1="{top + plot_h}" '
        f'x2="{left + plot_w}" y2="{top + plot_h}" />'
    )
    parts.append(f'<line class="axis" x1="{left}" y1="{top}" x2="{left}" y2="{top + plot_h}" />')

    coords = []
    for label, tokens_m, cost, score in points:
        x = left + (tokens_m / max_tokens) * plot_w
        y = top + (0.9 - score) / 0.6 * plot_h
        coords.append((x, y, label, tokens_m, cost, score))
    if len(coords) >= 2:
        parts.append(
            f'<line x1="{coords[0][0]:.1f}" y1="{coords[0][1]:.1f}" '
            f'x2="{coords[1][0]:.1f}" y2="{coords[1][1]:.1f}" '
            'stroke="#9B9488" stroke-width="1.5" stroke-dasharray="5 5" />'
        )
    for x, y, label, _tokens_m, cost, score in coords:
        is_current = "Current" in label
        color = CURRENT if is_current else BASELINE
        anchor = "end" if x > left + plot_w * 0.72 else "start"
        text_x = x - 14 if anchor == "end" else x + 14
        parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="8" fill="{color}" />')
        parts.append(
            f'<text class="value" x="{text_x:.1f}" y="{y - 10:.1f}" '
            f'text-anchor="{anchor}">{html.escape(label)}</text>'
        )
        parts.append(
            f'<text class="tick" x="{text_x:.1f}" y="{y + 9:.1f}" '
            f'text-anchor="{anchor}">{score:.2f} / ${cost:.2f}</text>'
        )
    parts.append(
        f'<text class="label" x="{left + plot_w / 2:.1f}" y="438" '
        'text-anchor="middle">Total tokens</text>'
    )
    y_axis = top + plot_h / 2
    parts.append(
        f'<text class="label" x="24" y="{y_axis:.1f}" '
        f'transform="rotate(-90 24 {y_axis:.1f})" '
        'text-anchor="middle">Rubric score</text>'
    )
    parts.append("</svg>")
    return "\n".join(parts)


def _task_outcomes_svg(tasks: list[tuple[str, bool | None, bool | None]]) -> str:
    width, height = 700, max(260, 116 + len(tasks) * 43)
    left, top, cell_w, cell_h, gap = 300, 108, 142, 34, 9
    parts = _svg_header(width, height, "Task outcome matrix", "Green means pass; red means fail")
    for i, label in enumerate(("Current workflow", "0.3.9 baseline")):
        x = left + i * (cell_w + 28) + cell_w / 2
        parts.append(f'<text class="label" x="{x:.1f}" y="86" text-anchor="middle">{label}</text>')
    for row, (task, current, baseline) in enumerate(tasks):
        y = top + row * (cell_h + gap)
        parts.append(f'<text class="label" x="42" y="{y + 22}">{html.escape(task)}</text>')
        for col, passed in enumerate((current, baseline)):
            x = left + col * (cell_w + 28)
            color = "#9B9488" if passed is None else GOOD if passed else BAD
            status = "N/A" if passed is None else "PASS" if passed else "FAIL"
            parts.append(
                f'<rect x="{x}" y="{y}" width="{cell_w}" height="{cell_h}" '
                f'rx="2" fill="{color}" />'
            )
            parts.append(
                f'<text x="{x + cell_w / 2:.1f}" y="{y + 22}" '
                f'text-anchor="middle" fill="#FFFFFF" font-family="{PAPER_FONT}" '
                f'font-size="12" font-weight="700">{status}</text>'
            )
    parts.append("</svg>")
    return "\n".join(parts)


def _svg_header(width: int, height: int, title: str, subtitle: str) -> list[str]:
    return [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'role="img" aria-label="{html.escape(title)}">',
        "<style>",
        f"text {{ font-family: {PAPER_FONT}; }}",
        ".title { fill: #1B1A18; font-size: 18px; font-weight: 700; }",
        ".subtitle, .tick { fill: #66615A; font-size: 12px; }",
        ".label { fill: #1B1A18; font-size: 13px; }",
        ".value { fill: #1B1A18; font-size: 12px; }",
        f".grid {{ stroke: {GRID}; stroke-width: 1; shape-rendering: crispEdges; }}",
        f".axis {{ stroke: {INK}; stroke-width: 1; shape-rendering: crispEdges; }}",
        "</style>",
        f'<rect width="{width}" height="{height}" fill="#FFFFFF" />',
        f'<text class="title" x="32" y="32">{html.escape(title)}</text>',
        f'<text class="subtitle" x="32" y="54">{html.escape(subtitle)}</text>',
    ]


def _find_table(tables: dict[str, list[list[str]]], heading_prefix: str) -> list[list[str]]:
    for heading, rows in tables.items():
        if heading.startswith(heading_prefix):
            return rows
    return []


def _plain_text(value: str) -> str:
    return re.sub(r"[*`_]", "", html.unescape(value)).strip()


def _number(value: str) -> float | None:
    match = re.search(r"-?\d+(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?", _plain_text(value))
    if not match:
        return None
    return float(match.group(0).replace(",", ""))


def _status_value(value: str) -> bool | None:
    normalized = _plain_text(value).upper()
    if normalized == "PASS":
        return True
    if normalized == "FAIL":
        return False
    return None


def _ticks(x_min: float, x_max: float) -> list[float]:
    ticks = [-0.4, -0.2, 0.0, 0.2, 0.4, 0.6, 0.8]
    return [tick for tick in ticks if x_min <= tick <= x_max] or [0.0]


def _linear_ticks(start: float, stop: float, count: int) -> list[float]:
    if count <= 1:
        return [start]
    step = (stop - start) / (count - 1)
    return [start + step * idx for idx in range(count)]


def _indent(text: str, spaces: int) -> str:
    prefix = " " * spaces
    return "\n".join(prefix + line for line in text.splitlines())


def _read_config_file(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"report config not found: {path}")
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() in {".yaml", ".yml"}:
        import yaml

        data = yaml.safe_load(text) or {}
    else:
        data = json.loads(text or "{}")
    if not isinstance(data, dict):
        raise ValueError("report config must be an object")
    return data


def _read_bool(data: dict[str, Any], key: str, *, default: bool) -> bool:
    value = data.get(key, default)
    if isinstance(value, bool):
        return value
    raise ValueError(f"report_outputs.{key} must be true or false")


def _render_markdown_body(markdown: str) -> str:
    lines = markdown.splitlines()
    rendered: list[str] = []
    in_list = False
    i = 0

    def close_list() -> None:
        nonlocal in_list
        if in_list:
            rendered.append("</ul>")
            in_list = False

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            close_list()
            i += 1
            continue

        if stripped.startswith("|") and stripped.endswith("|"):
            close_list()
            table_lines: list[str] = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                table_lines.append(lines[i].strip())
                i += 1
            rendered.extend(_render_table(table_lines))
            continue

        heading = re.match(r"^(#{1,6})\s+(.+)$", stripped)
        if heading:
            close_list()
            level = len(heading.group(1))
            rendered.append(f"<h{level}>{_inline_markdown(heading.group(2))}</h{level}>")
            i += 1
            continue

        bullet = re.match(r"^-\s+(.+)$", stripped)
        if bullet:
            if not in_list:
                rendered.append("<ul>")
                in_list = True
            rendered.append(f"  <li>{_inline_markdown(bullet.group(1))}</li>")
            i += 1
            continue

        close_list()
        rendered.append(f"<p>{_inline_markdown(stripped)}</p>")
        i += 1

    close_list()
    return "\n".join(f"    {line}" for line in rendered)


def _render_table(lines: list[str]) -> list[str]:
    rows = [_table_cells(line) for line in lines if not _is_table_separator(line)]
    if not rows:
        return []

    rendered = ["<table>", "  <thead>", "    <tr>"]
    for cell in rows[0]:
        rendered.append(f"      <th>{_inline_markdown(cell)}</th>")
    rendered.extend(["    </tr>", "  </thead>"])
    if len(rows) > 1:
        rendered.append("  <tbody>")
        for row in rows[1:]:
            rendered.append("    <tr>")
            for cell in row:
                rendered.append(f"      <td>{_inline_markdown(cell)}</td>")
            rendered.append("    </tr>")
        rendered.append("  </tbody>")
    rendered.append("</table>")
    return rendered


def _table_cells(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def _is_table_separator(line: str) -> bool:
    cells = _table_cells(line)
    return bool(cells) and all(re.fullmatch(r":?-{3,}:?", cell.strip()) for cell in cells)


def _inline_markdown(text: str) -> str:
    escaped = html.escape(text)
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
    return escaped
