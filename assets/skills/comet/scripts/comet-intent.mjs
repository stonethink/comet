#!/usr/bin/env node
// comet-intent.mjs — Comet entry intent routing CLI launcher.
// Thin Node facade: delegates to the bundled comet-runtime.mjs so the skill
// never needs bash. Equivalent to `node comet-runtime.mjs intent "$@"`.
import { main } from './comet-runtime.mjs';

process.exitCode = await main(['intent', ...process.argv.slice(2)]);