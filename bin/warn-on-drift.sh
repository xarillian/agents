#!/bin/sh
# Warns at session start when this machine's agent setup has drifted from the
# repo, either because it hasn't pulled new commits or because someone edited
# AGENTS.base.md after refresh.sh generated AGENTS.md. It prints nothing
# otherwise, since you stop reading a warning that appears every session.
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
