#!/usr/bin/env bash
# Summarise our skills' usage across every profile: how often each fires,
# when it last did, and which have never fired.
set -euo pipefail
shopt -s nullglob

logs=("$HOME/.agents/usage"/*.jsonl)
skills="$HOME/.agents/skills"

invocation_counts() {
  jq -rs '
    group_by(.skill)
    | map({skill: .[0].skill,
           model: map(select(.invoked_by == "model")) | length,
           user: map(select(.invoked_by == "user")) | length,
           last: map(.occurred_at) | max | .[:10]})
    | sort_by(-(.model + .user), .skill)[]
    | [.model, .user, .last, .skill] | @tsv' "${logs[@]}"
}

never_invoked() {
  local invoked skill name
  invoked=$(jq -r '.skill' "${logs[@]}" | sort -u)
  for skill in "$skills"/*/; do
    name=$(basename "$skill")
    grep -qxF "$name" <<<"$invoked" || printf '%s\n' "$name"
  done
}

if (( ${#logs[@]} == 0 )); then
  echo "No skill invocations logged yet in $HOME/.agents/usage"
  exit 0
fi

{ printf 'model\tuser\tlast used\tskill\n'; invocation_counts; } | column -t -s $'\t'
printf '\nNever invoked:\n'
never_invoked | sed 's/^/  /'
