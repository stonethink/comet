#!/usr/bin/env node

// src/compat/classic-cli.ts
import { pathToFileURL } from "url";
var CLASSIC_COMMANDS = [
  "state",
  "validate",
  "guard",
  "handoff",
  "archive",
  "hook-guard"
];
function isClassicCommand(value) {
  return CLASSIC_COMMANDS.includes(value);
}
function commandError(command) {
  if (!command) {
    return {
      exitCode: 64,
      stderr: `Usage: comet-runtime <${CLASSIC_COMMANDS.join("|")}> [args]`
    };
  }
  return {
    exitCode: 64,
    stderr: `Unknown Classic command: ${command}`
  };
}
async function dispatch(command, args, options, handlers) {
  if (!command || !isClassicCommand(command)) return commandError(command);
  const handler = handlers[command];
  if (!handler) {
    return {
      exitCode: 70,
      stderr: `Classic command is not implemented: ${command}`
    };
  }
  try {
    return await handler(args, options);
  } catch (error) {
    return {
      exitCode: 70,
      stderr: error instanceof Error ? error.message : String(error)
    };
  }
}
function jsonResult(command, result) {
  return {
    exitCode: result.exitCode,
    stdout: JSON.stringify({
      command: command ?? null,
      exitCode: result.exitCode,
      ...result.stdout === void 0 ? {} : { stdout: result.stdout },
      ...result.stderr === void 0 ? {} : { stderr: result.stderr }
    }) + "\n"
  };
}
async function runClassicCli(argv, handlers = {}) {
  const json = argv.includes("--json");
  const args = argv.filter((argument) => argument !== "--json");
  const command = args.shift();
  const result = await dispatch(command, args, { json }, handlers);
  return json ? jsonResult(command, result) : result;
}
async function main(argv = process.argv.slice(2)) {
  const result = await runClassicCli(argv);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr)
    process.stderr.write(result.stderr + (result.stderr.endsWith("\n") ? "" : "\n"));
  return result.exitCode;
}
var entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  void main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
export {
  CLASSIC_COMMANDS,
  main,
  runClassicCli
};
