#!/bin/sh
# Records each skill invocation twice: in full to a private log, and, for
# skills this repo defines, as a reduced row in a tracked per-profile file,
# so usage history survives clearing the private log.
# Prints nothing for Claude Code (hook output can reach the model's context)
# and `{}` for Antigravity (its PostToolUse contract expects a JSON object).
# Exits 1 on failure: jq's own exit 2 would make Claude Code block the skill.
agents="$HOME/.agents"
private_log="$agents/insights/skill-usage.jsonl"
antigravity=false
[ "${1:-}" = "--antigravity" ] && antigravity=true

# Other plugins' skill names stay out of the public repo.
is_ours() {
  case $1 in
    *:*) [ -d "$agents/harnesses/claude/plugins/${1%%:*}" ] ;;
    *) [ -e "$agents/skills/$1" ] || [ -e "$agents/commands/$1.md" ] ;;
  esac
}

finish() {
  $antigravity && printf '{}\n'
  exit "$1"
}

event=$(cat) || finish 1

if $antigravity; then
  case "$event" in
    *'/SKILL.md"'*) ;;
    *) finish 0 ;;
  esac
  row=$(printf '%s' "$event" | jq -c --arg at "$(date +%Y-%m-%dT%H:%M:%S%z)" '
    select((.error // "") == "")
    | (.toolCall.args.Path // "") as $p
    | (try ($p | capture("/skills/(?<skill>[^/]+)/SKILL\\.md$").skill) catch empty) as $skill
    | {occurred_at: $at, skill: $skill, invoked_by: "model",
       cwd: (.cwd // .workspacePaths[0] // ""), session_id: .conversationId}') || finish 1
  [ -n "$row" ] || finish 0
else
  row=$(printf '%s' "$event" | jq -c --arg at "$(date +%Y-%m-%dT%H:%M:%S%z)" '
    {occurred_at: $at}
    + (if .hook_event_name == "UserPromptExpansion"
       then {skill: .command_name, invoked_by: "user"}
       else {skill: .tool_input.skill, invoked_by: "model"} end)
    + {cwd, session_id}') || finish 1
fi

mkdir -p "$(dirname "$private_log")" || finish 1
printf '%s\n' "$row" >>"$private_log" || finish 1

is_ours "$(printf '%s' "$row" | jq -r .skill)" || finish 0
# refresh.sh links build/host-context.md into the active profile, so its directory
# names the profile; hostnames vary in case and form across machines.
profile=$(basename "$(dirname "$(readlink "$agents/build/host-context.md")")") || finish 1
public_log="$agents/profiles/$profile/usage.jsonl"
mkdir -p "$(dirname "$public_log")" || finish 1
printf '%s' "$row" | jq -c '{occurred_at, skill, invoked_by}' >>"$public_log" || finish 1
finish 0
