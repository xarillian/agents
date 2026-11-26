#!/bin/sh
# Warns at session start when this machine's .agent dir or AGENTS.base.md
# is out of sync with remote or needs to be refreshed.
repo="$HOME/.agents"
warnings=""
antigravity=false
[ "${1:-}" = "--antigravity" ] && antigravity=true

warn() {
  warnings="${warnings:+$warnings }$1"
}

# Being offline is not drift. If the fetch fails, the check compares against
# the last upstream it fetched.
git -C "$repo" fetch --quiet 2>/dev/null
behind=$(git -C "$repo" rev-list --count 'HEAD..@{upstream}' 2>/dev/null)
if [ "${behind:-0}" -gt 0 ]; then
  warn "~/.agents is $behind commit(s) behind origin; pull, then run scripts/refresh.sh."
fi

if [ "$repo/AGENTS.base.md" -nt "$repo/build/AGENTS.md" ]; then
  warn "AGENTS.base.md changed after AGENTS.md was generated; run scripts/refresh.sh."
fi

if [ -z "$warnings" ]; then
  $antigravity && printf '{}\n'
  exit 0
fi

if $antigravity; then
  jq -nc --arg message "$warnings" '{injectSteps: [{systemMessage: {systemMessage: $message}}]}'
else
  jq -nc --arg message "$warnings" '{systemMessage: $message}'
fi
