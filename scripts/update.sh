#!/usr/bin/env bash
# Update installed agent harnesses and their managed packages and plugins.

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
parse_profile "$@"
shift 2
[[ $# == 0 ]] || usage

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
"$REPO/scripts/refresh.sh" --profile "$PROFILE"
