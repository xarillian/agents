#!/bin/sh
# Tells an agent started inside Herdr how to delegate so its sub-agents show
# up there. Outside Herdr it says nothing, so other sessions pay no context.
antigravity=false
[ "${1:-}" = "--antigravity" ] && antigravity=true

if [ -z "${HC_TERMINAL_ID:-}" ]; then
  $antigravity && printf '{}\n'
  exit 0
fi

if $antigravity; then
  start_cmd="hc run --bg --name review --cwd /path/to/repo agy -i \"Review only src/x.rs. Report with hc send $HC_TERMINAL_ID when done or stuck.\""
  model_example="agy --model <model> --effort <low|medium|high|xhigh|max> -i \"<task>\""
else
  start_cmd="hc run --bg --name review --cwd /path/to/repo claude \"Review only src/x.rs. Report with hc send $HC_TERMINAL_ID when done or stuck.\""
  model_example="claude --model <fable|opus|sonnet|haiku> --effort <low|medium|high|xhigh|max> \"<task>\""
fi

context=$(cat <<EOF
You are running inside Herdr as terminal $HC_TERMINAL_ID.

Subagents are started with \`hc\` exclusively in this environment.

- Start: \`$start_cmd\`
- Model: where the built-in tool takes \`model\` and \`effort\`, pass them to the agent instead, e.g. \`$model_example\`. Subagents use the defaults without a model specified, which is also fine.
- Wait: \`hc wait --children all\`, never \`sleep\`.
- Collect: \`hc read review\`.
- Clean up what you started: \`hc kill review; hc rm review\`.
EOF
)

if $antigravity; then
  jq -nc --arg context "$context" '{injectSteps: [{systemMessage: {systemMessage: $context}}]}'
else
  jq -nc --arg context "$context" \
    '{hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: $context}}'
fi
