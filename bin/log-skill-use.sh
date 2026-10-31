#!/bin/sh
# Records each skill invocation so under-triggered skills show up over time.
# Prints nothing, since hook output can reach the model's context, and exits 1
# on failure: jq's own exit 2 would make Claude Code block the skill.
log="$HOME/.agents/workflow/skill-usage.jsonl"
mkdir -p "$(dirname "$log")" || exit 1
jq -c --arg at "$(date +%Y-%m-%dT%H:%M:%S%z)" '
  {occurred_at: $at}
  + (if .hook_event_name == "UserPromptExpansion"
     then {skill: .command_name, invoked_by: "user"}
     else {skill: .tool_input.skill, invoked_by: "model"} end)
  + {cwd, session_id}' >>"$log" || exit 1
