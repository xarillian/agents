#!/bin/sh
# Agents will try to work around failures without logging them. Log them!
cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"PostToolUseFailure","additionalContext":"That tool call failed. Invoke the papercuts skill; it decides whether this friction is worth recording."}}
EOF
