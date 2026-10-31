#!/usr/bin/env bash
# Summarise skill-usage.jsonl: how often each skill fires, and which of our
# own skills never have.
set -euo pipefail

log="$HOME/.agents/workflow/skill-usage.jsonl"
skills="$HOME/.agents/skills"

invocation_counts() {
  jq -rs '
    group_by(.skill)
    | map({skill: .[0].skill,
           model: map(select(.invoked_by == "model")) | length,
           user: map(select(.invoked_by == "user")) | length})
    | sort_by(-(.model + .user), .skill)[]
    | [.model, .user, .skill] | @tsv' "$log"
}

never_invoked() {
  local invoked skill name
  invoked=$(jq -r '.skill' "$log" | sort -u)
  for skill in "$skills"/*/; do
    name=$(basename "$skill")
    grep -qxF "$name" <<<"$invoked" || printf '%s\n' "$name"
  done
}

if [[ ! -s "$log" ]]; then
  echo "No skill invocations logged yet: $log"
  exit 0
fi

{ printf 'model\tuser\tskill\n'; invocation_counts; } | column -t -s $'\t'
printf '\nNever invoked:\n'
never_invoked | sed 's/^/  /'
