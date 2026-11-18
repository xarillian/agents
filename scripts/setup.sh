#!/usr/bin/env bash
# Install and provision the Pi, Claude Code, and Codex harnesses.

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
parse_profile "$@"
shift 2
[[ $# == 0 ]] || usage

## == pi.dev ==
if ! command -v pi >/dev/null; then
    echo "pi.dev is not installed; installing..."
    curl -fsSL https://pi.dev/install.sh | sh
fi

## == Claude Code ==
if ! command -v claude >/dev/null; then
    echo "claude code is not installed; installing..."
    curl -fsSL https://claude.ai/install.sh | sh
fi

## == Codex ==
if ! command -v codex >/dev/null; then
    echo "codex is not installed; installing..."
    curl -fsSL https://chatgpt.com/codex/install.sh | sh
fi

"$REPO/scripts/update.sh" --profile "$PROFILE"
