#!/usr/bin/env node
// comet-handoff.mjs — Comet design handoff generator CLI launcher.
// Thin Node facade: delegates to the bundled comet-runtime.mjs so the skill
// never needs bash. Equivalent to `node comet-runtime.mjs handoff "$@"`.
import { main } from './comet-runtime.mjs';

process.exitCode = await main(['handoff', ...process.argv.slice(2)]);
