#!/bin/sh
# Records each skill invocation twice: in full to a private log, and, for
# skills this repo defines, as a reduced row in a tracked per-profile file,
# so usage history survives clearing the private log.
# Prints nothing, since hook output can reach the model's context, and exits 1
# on failure: jq's own exit 2 would make Claude Code block the skill.
agents="$HOME/.agents"
private_log="$agents/insights/skill-usage.jsonl"

# Other plugins' skill names stay out of the public repo.
is_ours() {
  case $1 in
    *:*) [ -d "$agents/plugins/${1%%:*}" ] ;;
    *) [ -e "$agents/skills/$1" ] || [ -e "$agents/commands/$1.md" ] ;;
  esac
}

event=$(cat) || exit 1
row=$(printf '%s' "$event" | jq -c --arg at "$(date +%Y-%m-%dT%H:%M:%S%z)" '
  {occurred_at: $at}
  + (if .hook_event_name == "UserPromptExpansion"
     then {skill: .command_name, invoked_by: "user"}
     else {skill: .tool_input.skill, invoked_by: "model"} end)
  + {cwd, session_id}') || exit 1

mkdir -p "$(dirname "$private_log")" || exit 1
printf '%s\n' "$row" >>"$private_log" || exit 1

is_ours "$(printf '%s' "$row" | jq -r .skill)" || exit 0
# refresh.sh links host-context.md into the active profile, so its directory
# names the profile; hostnames vary in case and form across machines.
profile=$(basename "$(dirname "$(readlink "$agents/host-context.md")")") || exit 1
public_log="$agents/usage/$profile.jsonl"
mkdir -p "$(dirname "$public_log")" || exit 1
printf '%s' "$row" | jq -c '{occurred_at, skill, invoked_by}' >>"$public_log" || exit 1
