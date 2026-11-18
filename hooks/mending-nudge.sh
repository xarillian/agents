#!/bin/sh
# Force immediate evaluation before allowing any retry or workaround.
cat <<'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUseFailure",
    "additionalContext": "SYSTEM INTERRUPT: A tool call just failed. Before retrying or attempting a workaround, you MUST immediately invoke the `mending` skill to evaluate this failure."
  }
}
EOF