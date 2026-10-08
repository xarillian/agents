#!/usr/bin/env bash
# Install and provision the Pi, Claude Code, and Codex harnesses.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="technicolor"

if (($#)); then
    [[ $# == 2 && "$1" == "--profile" ]] || {
        echo "usage: $0 [--profile technicolor|treetops|kaleidoscope]"
        exit 1
    }
    PROFILE="$2"
fi

[[ "$PROFILE" == "technicolor" || "$PROFILE" == "treetops" || "$PROFILE" == "kaleidoscope" ]] || {
    echo "unknown profile: $PROFILE"
    exit 1
}

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

"$REPO/update.sh" --profile "$PROFILE"
