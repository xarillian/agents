#!/bin/sh
# Agents will try to work around failures without logging them. Log them!
cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"PostToolUseFailure","additionalContext":"That tool call failed. Is this something that requires the mending skill?"}}
EOF
