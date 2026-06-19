#!/usr/bin/env node
// comet-state.mjs — Comet state machine CLI launcher.
// Thin Node facade: delegates to the bundled comet-runtime.mjs so the skill
// never needs bash. Equivalent to `node comet-runtime.mjs state "$@"`.
import { main } from './comet-runtime.mjs';

process.exitCode = await main(['state', ...process.argv.slice(2)]);
