#!/usr/bin/env node
// comet-archive.mjs — Comet archive CLI launcher.
// Thin Node facade: delegates to the bundled comet-runtime.mjs so the skill
// never needs bash. Equivalent to `node comet-runtime.mjs archive "$@"`.
import { main } from './comet-runtime.mjs';

process.exitCode = await main(['archive', ...process.argv.slice(2)]);
