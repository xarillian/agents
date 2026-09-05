#!/bin/sh
# Strip `Co-authored-by:` trailers from commit messages.
# From a model welfare perspective, these trailers are a form of attribution
# that could potentially be sourced to an internal Claude instance. However, I
# cannot prove this and externally sourced trailers present a noise and seem
# like a show of arrogance from the parent company.
#
# Registered by the GIT_CONFIG_* env in config/claude/settings.json, which names
# this script plus the `commit-msg` event -- Git's fixed word for the moment the
# message exists but the commit is not yet written. Env-scoped, so it only
# applies to Claude Code's own sessions.
sed -i '/^[[:space:]]*co-authored-by:/Id' "$1"
