#!/usr/bin/env node
// comet-yaml-validate.mjs — Comet .comet.yaml schema validator CLI launcher.
// Thin Node facade: delegates to the bundled comet-runtime.mjs so the skill
// never needs bash. Equivalent to `node comet-runtime.mjs validate "$@"`.
import { main } from './comet-runtime.mjs';

process.exitCode = await main(['validate', ...process.argv.slice(2)]);
