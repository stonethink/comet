"""Dedicated LLM judge provider configuration."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Mapping


_ANTHROPIC_PROVIDER_KEYS = (
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL_NAME",
    "ANTHROPIC_DEFAULT_SONNET_MODEL_NAME",
)


@dataclass(frozen=True)
class JudgeInvocation:
    env: dict[str, str]
    model_flag: list[str]
    model: str


def build_judge_invocation(
    source_env: Mapping[str, str] | None = None,
) -> JudgeInvocation:
    """Build an isolated Claude CLI invocation environment for LLM-as-judge.

    Judge configuration is intentionally separate from the subject agent's
    ANTHROPIC_* provider settings. This prevents accidentally judging a run
    with the same model or endpoint under test.
    """
    source = source_env if source_env is not None else os.environ
    model = (source.get("BENCH_JUDGE_MODEL") or "").strip()
    if not model:
        raise ValueError("BENCH_JUDGE_MODEL is required when BENCH_LLM_JUDGE=1")

    env = dict(source)
    for key in _ANTHROPIC_PROVIDER_KEYS:
        env.pop(key, None)

    env["ANTHROPIC_MODEL"] = model

    api_key = (source.get("BENCH_JUDGE_API_KEY") or "").strip()
    auth_token = (source.get("BENCH_JUDGE_AUTH_TOKEN") or "").strip()
    base_url = (source.get("BENCH_JUDGE_BASE_URL") or "").strip()

    if api_key:
        env["ANTHROPIC_API_KEY"] = api_key
    if auth_token:
        env["ANTHROPIC_AUTH_TOKEN"] = auth_token
        env.pop("ANTHROPIC_API_KEY", None)
    if base_url:
        env["ANTHROPIC_BASE_URL"] = base_url

    return JudgeInvocation(
        env=env,
        model_flag=["--model", model],
        model=model,
    )
