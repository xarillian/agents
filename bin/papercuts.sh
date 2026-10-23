#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: papercuts.sh -m MODEL [-p PROJECT] [-c CAUSE] SUMMARY

Submit one papercut to ~/.agents/workflow/PAPERCUTS.yaml.

  -m MODEL    Exact active model identifier (required)
  -p PROJECT  Project name; defaults to the containing Git repository
  -c CAUSE    Likely cause or fix
EOF
}

fail() {
  printf 'papercuts: %s\n' "$*" >&2
  exit 1
}

yaml_string() {
  local value=$1
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\t'/\\t}
  value=${value//$'\r'/\\r}
  value=${value//$'\n'/\\n}
  printf '"%s"' "$value"
}

iso_timestamp() {
  local offset
  offset=$(date +%z)
  printf '%s%s:%s' "$(date +%Y-%m-%dT%H:%M:%S)" "${offset:0:3}" "${offset:3:2}"
}

acquire_lock() {
  local requested=$1 attempt
  for attempt in {1..50}; do
    if mkdir "$requested" 2>/dev/null; then
      lock_directory=$requested
      return 0
    fi
    sleep 0.1
  done
  fail "timed out waiting for lock; remove it if stale: $requested"
}

release_lock_and_cleanup() {
  [[ -n "$temporary_file" ]] && rm -f "$temporary_file"
  [[ -n "$lock_directory" ]] && rmdir "$lock_directory" 2>/dev/null
  return 0
}

model=''
project=''
cause=''
log_file="$HOME/.agents/workflow/PAPERCUTS.yaml"
# `yq` is kislyuk's jq wrapper under pacman and mikefarah's Go rewrite under
# Homebrew. They name an array's type differently, and mikefarah binds `|`
# tighter than `and`/`or`, hence the extra parentheses.
papercuts_log_shape='(.version == 1) and (.papercuts | (type == "array" or type == "!!seq"))'
papercuts_have_fields='([.papercuts[] | (has("occurred_at") and has("project") and has("model") and has("cwd") and has("summary") and has("suspected_cause"))] | all)'
temporary_file=''
lock_directory=''

while getopts ':m:p:c:h' option; do
  case "$option" in
    m) model=$OPTARG ;;
    p) project=$OPTARG ;;
    c) cause=$OPTARG ;;
    h)
      usage
      exit 0
      ;;
    :) fail "option -$OPTARG requires a value" ;;
    \?)
      usage >&2
      fail "unknown option: -$OPTARG"
      ;;
  esac
done
shift "$((OPTIND - 1))"

[[ -n "$model" ]] || fail 'a model is required (-m)'
[[ $# -eq 1 ]] || {
  usage >&2
  fail 'provide exactly one summary'
}

summary=$1
[[ -n "$summary" ]] || fail 'the summary cannot be empty'
[[ "$summary" != *$'\n'* ]] || fail 'the summary must be one line'
[[ "$cause" != *$'\n'* ]] || fail 'the cause must be one line'

mkdir -p "$(dirname "$log_file")"
if [[ -e "$log_file" ]]; then
  log_file=$(realpath "$log_file")
else
  log_file="$(realpath "$(dirname "$log_file")")/$(basename "$log_file")"
fi
log_directory=$(dirname "$log_file")

if git_root=$(env -u GIT_DIR -u GIT_WORK_TREE git -C "$log_directory" rev-parse --show-toplevel 2>/dev/null); then
  tracked_path=${log_file#"$git_root"/}
  if [[ "$tracked_path" != "$log_file" ]]; then
    if env -u GIT_DIR -u GIT_WORK_TREE git -C "$git_root" ls-files --error-unmatch -- "$tracked_path" >/dev/null 2>&1; then
      fail "refusing to write to Git-tracked file: $log_file"
    elif [[ $? -ne 1 ]]; then
      fail "cannot inspect Git tracking status: $log_file"
    fi
  fi
else
  ancestor=$log_directory
  while [[ "$ancestor" != / ]]; do
    [[ -e "$ancestor/.git" ]] && fail "cannot inspect Git tracking status: $log_file"
    ancestor=$(dirname "$ancestor")
  done
fi

if [[ -z "$project" ]]; then
  if repo_root=$(env -u GIT_DIR -u GIT_WORK_TREE git rev-parse --show-toplevel 2>/dev/null); then
    project=$(basename "$repo_root")
  else
    project=$(basename "$PWD")
  fi
fi

trap release_lock_and_cleanup EXIT
acquire_lock "$log_file.lock"
temporary_file=$(mktemp "$log_directory/.papercuts.XXXXXX")

if [[ ! -e "$log_file" ]]; then
  printf 'version: 1\npapercuts:\n' >"$temporary_file"
elif ! yq -e "$papercuts_log_shape" "$log_file" >/dev/null; then
  fail "invalid papercuts log: $log_file"
elif [[ $(yq '.papercuts | length' "$log_file") == 0 ]]; then
  printf 'version: 1\npapercuts:\n' >"$temporary_file"
else
  cp "$log_file" "$temporary_file"
  printf '\n' >>"$temporary_file"
fi

{
  printf '  - occurred_at: %s\n' "$(yaml_string "$(iso_timestamp)")"
  printf '    project: %s\n' "$(yaml_string "$project")"
  printf '    model: %s\n' "$(yaml_string "$model")"
  printf '    cwd: %s\n' "$(yaml_string "$PWD")"
  printf '    summary: %s\n' "$(yaml_string "$summary")"
  if [[ -n "$cause" ]]; then
    printf '    suspected_cause: %s\n' "$(yaml_string "$cause")"
  else
    printf '    suspected_cause: null\n'
  fi
} >>"$temporary_file"

yq -e "$papercuts_log_shape and $papercuts_have_fields" "$temporary_file" >/dev/null || fail "refusing to write invalid papercuts log: $log_file"

mv "$temporary_file" "$log_file"
temporary_file=''
