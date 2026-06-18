#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/comet-env.sh"

# English blocked-message contract is implemented in the TypeScript runtime.
# Required diagnostics include:
#   Current phase:
#   Target file:
#   does not allow source writes

exec node "$COMET_RUNTIME" hook-guard "$@"
