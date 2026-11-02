#!/bin/sh
# Warns at session start when this machine's .agent dir or AGENTS.base.md
# is out of sync with remote or needs to be refreshed.
repo="$HOME/.agents"
warnings=""

warn() {
  warnings="${warnings:+$warnings }$1"
}

# Being offline is not drift. If the fetch fails, the check compares against
# the last upstream it fetched.
git -C "$repo" fetch --quiet 2>/dev/null
behind=$(git -C "$repo" rev-list --count 'HEAD..@{upstream}' 2>/dev/null)
if [ "${behind:-0}" -gt 0 ]; then
  warn "~/.agents is $behind commit(s) behind origin; pull, then run refresh.sh."
fi

if [ "$repo/AGENTS.base.md" -nt "$repo/AGENTS.md" ]; then
  warn "AGENTS.base.md changed after AGENTS.md was generated; run refresh.sh."
fi

[ -n "$warnings" ] || exit 0
jq -nc --arg message "$warnings" '{systemMessage: $message}'
