"""Configurable report output helpers for eval summaries."""

from __future__ import annotations

import html
import json
import os
import re
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
    safe_title = html.escape(title)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{safe_title}</title>
  <style>
    :root {{
      color-scheme: light dark;
      --bg: #f8fafc;
      --fg: #111827;
      --muted: #4b5563;
      --panel: #ffffff;
      --border: #d1d5db;
      --code: #f3f4f6;
    }}
    @media (prefers-color-scheme: dark) {{
      :root {{
        --bg: #0f172a;
        --fg: #e5e7eb;
        --muted: #9ca3af;
        --panel: #111827;
        --border: #374151;
        --code: #1f2937;
      }}
    }}
    body {{
      margin: 0;
      background: var(--bg);
      color: var(--fg);
      font: 15px/1.55 ui-sans-serif, system-ui, -apple-system,
        BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    main {{
      max-width: 1120px;
      margin: 0 auto;
      padding: 32px 24px 48px;
    }}
    h1, h2, h3, h4, h5, h6 {{
      line-height: 1.25;
      margin: 1.6em 0 0.55em;
    }}
    h1 {{ font-size: 2rem; margin-top: 0; }}
    h2 {{ border-bottom: 1px solid var(--border); padding-bottom: 0.25rem; }}
    p, ul, table {{ margin: 0 0 1rem; }}
    ul {{ padding-left: 1.4rem; }}
    table {{
      width: 100%;
      border-collapse: collapse;
      display: block;
      overflow-x: auto;
      background: var(--panel);
      border: 1px solid var(--border);
    }}
    th, td {{
      padding: 0.5rem 0.65rem;
      border: 1px solid var(--border);
      text-align: left;
      vertical-align: top;
      white-space: nowrap;
    }}
    th {{ font-weight: 650; }}
    code {{
      background: var(--code);
      border-radius: 4px;
      padding: 0.1rem 0.25rem;
      font-size: 0.92em;
    }}
    .muted {{ color: var(--muted); }}
  </style>
</head>
<body>
  <main>
{body}
  </main>
</body>
</html>
"""


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
