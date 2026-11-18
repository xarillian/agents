#!/bin/sh
# Prompt evaluation before any retry or workaround. Fires on every non-zero
# exit, expected ones included, so it asks for judgement rather than a log.
cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUseFailure",
    "additionalContext": "SYSTEM INTERRUPT: A tool call just failed. Before retrying or attempting a workaround, you MUST immediately evaluate whether this failure is a snag under the `mending` skill. IF you have NOT invoked `mending` this session, invoke it NOW. IF you already have, apply its rules from context and run its script directly for a qualifying snag; do NOT re-invoke the skill. Expected non-zero exits (diff reporting differences, grep/rg finding no match, a test you meant to fail) are NOT snags."
  }
}
EOF