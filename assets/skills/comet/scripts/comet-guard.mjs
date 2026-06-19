#!/usr/bin/env node
// comet-guard.mjs — Comet phase guard CLI launcher.
// Thin Node facade: delegates to the bundled comet-runtime.mjs so the skill
// never needs bash. Equivalent to `node comet-runtime.mjs guard "$@"`.
import { main } from './comet-runtime.mjs';

process.exitCode = await main(['guard', ...process.argv.slice(2)]);
