#!/usr/bin/env node
// comet-hook-guard.mjs — Comet PreToolUse phase-write guard launcher.
// Thin Node facade: delegates to the bundled comet-runtime.mjs so the hook
// never needs bash. Reads the tool payload from stdin (or FILE_PATH) and exits
// 2 to block a disallowed write, 0 to allow. Equivalent to
// `node comet-runtime.mjs hook-guard "$@"`.
//
// English blocked-message contract is implemented in the TypeScript runtime.
// Required diagnostics include:
//   Current phase:
//   Target file:
//   does not allow source writes
import { main } from './comet-runtime.mjs';

try {
  process.exitCode = await main(['hook-guard', ...process.argv.slice(2)]);
} catch (error) {
  // Hook-entry backstop: an exception outside main() (corrupt bundle, import
  // failure, unexpected throw) must not exit with an ambiguous code. Fail
  // closed (exit 2) so the user/model sees the hook fault instead of silently
  // allowing a write that phase guard should have vetted.
  process.stderr.write(
    `[COMET-HOOK] crash: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 2;
}
