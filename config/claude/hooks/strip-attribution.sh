#!/bin/sh
# Strip `Co-authored-by:` trailers from commit messages.
# From a model welfare perspective, these trailers are a form of attribution
# that could potentially be sourced to an internal Claude instance. However, I
# cannot prove this and externally sourced trailers present a noise and seem
# like a show of arrogance from the parent company.
#
# `grep -i` over `sed`: `sed -i` cannot be spelled portably (GNU takes an
# optional suffix, BSD a mandatory one) and sed's `I` match modifier is an
# extension that busybox accepts and ignores. Filter to a temp file and copy
# back, preserving the message file's inode and mode.
set -eu

msg="${1:?usage: strip-attribution.sh <commit-msg-file>}"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT HUP INT TERM

# grep exits 1 when every line is filtered out, which is success here.
grep -iv '^[[:space:]]*co-authored-by:' "$msg" >"$tmp" || [ $? -eq 1 ]
cat "$tmp" >"$msg"
