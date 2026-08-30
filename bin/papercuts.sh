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

model=''
project=''
cause=''
log_file="$HOME/.agents/workflow/PAPERCUTS.yaml"
temporary_file=''

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

log_file=$(realpath -m "$log_file")
log_directory=$(dirname "$log_file")
mkdir -p "$log_directory"

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

lock_file="$log_file.lock"
exec 9>>"$lock_file"
flock -x 9

trap '[[ -n "$temporary_file" ]] && rm -f "$temporary_file"' EXIT
temporary_file=$(mktemp "$log_directory/.papercuts.XXXXXX")

if [[ ! -e "$log_file" ]]; then
  printf 'version: 1\npapercuts:\n' >"$temporary_file"
elif ! yq -e '(.version == 1) and (.papercuts | type == "array")' "$log_file" >/dev/null; then
  fail "invalid papercuts log: $log_file"
elif yq -e '(.papercuts | length) == 0' "$log_file" >/dev/null; then
  printf 'version: 1\npapercuts:\n' >"$temporary_file"
else
  cp "$log_file" "$temporary_file"
  printf '\n' >>"$temporary_file"
fi

{
  printf '  - occurred_at: %s\n' "$(yaml_string "$(date --iso-8601=seconds)")"
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

yq -e '(.version == 1) and (.papercuts | type == "array") and all(.papercuts[]; has("occurred_at") and has("project") and has("model") and has("cwd") and has("summary") and has("suspected_cause"))' "$temporary_file" >/dev/null || fail "refusing to write invalid papercuts log: $log_file"

mv "$temporary_file" "$log_file"
temporary_file=''
