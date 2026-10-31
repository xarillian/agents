#!/bin/sh
# Agents that find a workaround for a failed call tend to skip the papercuts
# skill, so every failure hands the decision back to the skill.
cat <<'EOF'
{"hookSpecificOutput":{"hookEventName":"PostToolUseFailure","additionalContext":"That tool call failed. Invoke the papercuts skill; it decides whether this friction is worth recording."}}
EOF
