#!/bin/sh
# Tells an agent started inside Herdr how to delegate so its sub-agents show
# up there. Outside Herdr it says nothing, so other sessions pay no context.
[ -n "$HC_TERMINAL_ID" ] || exit 0

context=$(cat <<EOF
You are running inside Herdr as terminal $HC_TERMINAL_ID.

Subagents are started with \`hc\` exclusively in this environment.

- Start: \`hc run --bg --name review --cwd /path/to/repo claude "Review only src/x.rs. Report with hc send $HC_TERMINAL_ID when done or stuck."\`
- Model: where the built-in tool takes \`model\` and \`effort\`, pass them to the agent instead, e.g. \`claude --model <fable|opus|sonnet|haiku> --effort <low|medium|high|xhigh|max> "<task>"\`. Subagents use the defaults without a model specified, which is also fine.
- Wait: \`hc wait --children all\`, never \`sleep\`.
- Collect: \`hc read review\`.
- Clean up what you started: \`hc kill review; hc rm review\`.
EOF
)

jq -nc --arg context "$context" \
  '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $context}}'
