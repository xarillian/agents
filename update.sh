#!/usr/bin/env bash
# Update installed agent harnesses and their managed packages and plugins.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="technicolor"

if (($#)); then
    [[ $# == 2 && "$1" == "--profile" ]] || {
        echo "usage: $0 [--profile technicolor|treetops]"
        exit 1
    }
    PROFILE="$2"
fi

[[ "$PROFILE" == "technicolor" || "$PROFILE" == "treetops" ]] || {
    echo "unknown profile: $PROFILE"
    exit 1
}

require_command() {
    command -v "$1" >/dev/null || {
        echo "$1 is not installed; run setup.sh first" >&2
        exit 1
    }
}

require_command pi
require_command claude
require_command codex

pi update --all
claude update
claude plugin marketplace update

claude plugin list --json |
jq -r '.[] | [.id, .scope] | @tsv' |
while IFS=$'\t' read -r plugin scope; do
    claude plugin update "$plugin" --scope "$scope" --yes
done

codex update

# updates can clobber symlinked config (e.g. ~/.claude/settings.json)
# with plain files; re-link everything so local overrides always win.
"$REPO/refresh.sh" --profile "$PROFILE"
