#!/usr/bin/env bash
# Update installed agent harnesses and their managed packages and plugins.

set -euo pipefail

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
