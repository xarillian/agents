#!/usr/bin/env bash
# Regenerate instructions, link this repo's config, packages and
# skills into local agent harnesses, and install any packages and
# plugins they are missing.

# Sourcing would leave `set -euo pipefail` armed in the caller's shell,
# which then dies on the next failing prompt hook.
[[ "${BASH_SOURCE[0]}" == "$0" ]] || {
    echo "refresh.sh must be run, not sourced: ~/.agents/refresh.sh --profile <name>" >&2
    return 1
}

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD="$REPO/build"

prune_repo_links() {
    local destination="$1"
    local source="$2"
    local path
    local link_target

    [[ -d "$destination" ]] || return 0
    while IFS= read -r -d '' path; do
        link_target="$(readlink "$path")"
        [[ "$link_target" == "$source/"* ]] && rm -f "$path"
    done < <(find "$destination" -type l -print0)
    return 0
}

link_config_tree() {
    local source="$1"
    local destination="$2"
    local suffix="${3:-}"
    local path
    local relative_path
    local target

    mkdir -p "$destination"
    prune_repo_links "$destination" "$source"

    while IFS= read -r -d '' path; do
        relative_path="${path#"$source"/}"
        target="$destination/$relative_path"

        if [[ -d "$path" ]]; then
            mkdir -p "$target"
            continue
        fi

        [[ -z "$suffix" || "$path" == *"$suffix" ]] || continue

        mkdir -p "$(dirname "$target")"
        rm -rf "$target"
        ln -s "$path" "$target"
    done < <(find "$source" -mindepth 1 -print0)
    return 0
}

link_skills() {
    local source="$1"
    shift
    local skill
    local name
    local destination

    [[ -d "$source" ]] || return 0
    for skill in "$source"/*; do
        [[ -d "$skill" ]] || continue
        name="$(basename "$skill")"
        for destination in "$@"; do
            mkdir -p "$destination"
            rm -rf "${destination:?}/$name"
            ln -s "$skill" "$destination/$name"
        done
    done
    return 0
}

link_commands() {
    local destination="$1"
    local command
    local name

    mkdir -p "$destination"
    prune_repo_links "$destination" "$REPO/commands"
    for command in "$REPO"/commands/*.md; do
        [[ -f "$command" ]] || continue
        name="$(basename "$command")"
        rm -rf "$destination/$name"
        ln -s "$command" "$destination/$name"
    done
    return 0
}

# Frontmatter versions the source; harnesses would load it as instructions.
strip_frontmatter() {
    awk 'NR == 1 && /^---$/ { front = 1; next } front && /^---$/ { front = 0; next } !front' "$1"
}

require_command() {
    command -v "$1" >/dev/null || {
        echo "$1 is not installed; run setup.sh first" >&2
        exit 1
    }
}

# `pi install` rewrites every matching entry's spelling, so packages already
# listed are left alone to keep settings.json from churning on each refresh.
pi_package_installed() {
    jq -e --arg source "packages/$1" \
        '.packages // [] | any((.source? // .) | ltrimstr("./") == $source)' \
        ~/.pi/agent/settings.json >/dev/null
}

install_pi_packages() {
    local package
    local name

    for package in "$REPO"/packages/*; do
        [[ -d "$package" ]] || continue
        name="$(basename "$package")"
        pi_package_installed "$name" && continue
        (cd ~/.pi/agent && pi install "./packages/$name")
    done
    return 0
}

# Settings layer the profile's overlay over the shared file. Arrays
# concatenate, so a profile adds permissions instead of replacing them.
CLAUDE_SETTINGS="$BUILD/claude-settings.json"
MERGE_LAYERS='
def merge($a; $b):
    if ($a | type) == "object" and ($b | type) == "object" then
        reduce ($b | keys_unsorted[]) as $key ($a; .[$key] = merge($a[$key]; $b[$key]))
    elif ($a | type) == "array" and ($b | type) == "array" then $a + ($b - $a)
    else $b end;
reduce .[] as $layer ({}; merge(.; $layer))'

claude_overlay() {
    echo "$REPO/profiles/$PROFILE/claude.settings.json"
}

build_claude_settings() {
    local layers=("$REPO/config/claude/settings.json")

    [[ -f "$(claude_overlay)" ]] && layers+=("$(claude_overlay)")
    jq -s "$MERGE_LAYERS" "${layers[@]}" >"$CLAUDE_SETTINGS"
}

# Permissions Claude Code granted in ~/.claude/settings.json that neither
# layer holds yet, as {"allow": [...], ...}.
unpulled_permissions() {
    [[ -f ~/.claude/settings.json ]] || { echo '{}'; return 0; }
    jq -n --slurpfile live ~/.claude/settings.json --slurpfile built "$CLAUDE_SETTINGS" '
        ($built[0].permissions // {}) as $known
        | $live[0].permissions // {}
        | with_entries(select(.value | type == "array") | .value -= ($known[.key] // []))
        | with_entries(select(.value != []))'
}

# A permission approved on one machine lands in that machine's overlay;
# promote it to the shared file by hand when every machine wants it.
pull_claude_settings() {
    local new
    local overlay

    new="$(unpulled_permissions)"
    [[ "$new" != "{}" ]] || { echo "no new Claude Code permissions to pull"; return 0; }
    overlay="$(claude_overlay)"
    [[ -f "$overlay" ]] || echo '{}' >"$overlay"
    jq --argjson new "$new" '
        reduce ($new | keys[]) as $key (.; .permissions[$key] = ((.permissions[$key] // []) + $new[$key]))' \
        "$overlay" >"$overlay.tmp"
    mv "$overlay.tmp" "$overlay"
    echo "pulled into ${overlay#"$REPO"/}:"
    jq -r '.[][]' <<<"$new" | sed 's/^/  /'
    build_claude_settings
}

# Claude Code writes approvals into its settings file, and replacing it
# would drop them, so refuse until they are pulled.
check_claude_settings_pulled() {
    local new

    new="$(unpulled_permissions)"
    [[ "$new" == "{}" ]] && return 0
    echo "~/.claude/settings.json has permissions the repo lacks:" >&2
    jq -r '.[][]' <<<"$new" | sed 's/^/  /' >&2
    echo "rerun with --pull-settings to keep them, or remove them from ~/.claude/settings.json" >&2
    exit 1
}

# A copy, not a link: Claude Code's own edits must not reach the repo
# until they are pulled.
install_claude_settings() {
    rm -f ~/.claude/settings.json
    cp "$CLAUDE_SETTINGS" ~/.claude/settings.json
}

claude_marketplace_sources() {
    jq -r '.extraKnownMarketplaces[].source | .repo // .url // .path' "$CLAUDE_SETTINGS"
}

add_claude_marketplaces() {
    local source

    while IFS= read -r source; do
        claude plugin marketplace add "$source"
    done < <(claude_marketplace_sources)
    claude plugin marketplace update "$(jq -r .name "$REPO/.claude-plugin/marketplace.json")"
    return 0
}

# Builtin plugins ship inside Claude Code; enabling them in settings is
# the whole install.
enabled_claude_plugins() {
    jq -r '.enabledPlugins | to_entries[]
        | select(.value and (.key | endswith("@builtin") | not)) | .key' \
        "$CLAUDE_SETTINGS"
}

install_claude_plugins() {
    local installed
    local plugin

    installed="$(claude plugin list --json | jq -r '.[].id')"
    while IFS= read -r plugin; do
        grep -qxF "$plugin" <<<"$installed" && continue
        claude plugin install "$plugin" --scope user --yes
    done < <(enabled_claude_plugins)
    return 0
}

usage() {
    echo "usage: $0 --profile technicolor|treetops|kaleidoscope [--pull-settings]" >&2
    exit 1
}

[[ $# -ge 2 && "$1" == "--profile" ]] || usage
PROFILE="$2"
shift 2
PULL_SETTINGS=false
case "${1:-}" in
    "") ;;
    --pull-settings) PULL_SETTINGS=true; shift ;;
    *) usage ;;
esac
[[ $# == 0 ]] || usage

[[ "$PROFILE" == "technicolor" || "$PROFILE" == "treetops" || "$PROFILE" == "kaleidoscope" ]] || {
    echo "unknown profile: $PROFILE"
    exit 1
}

require_command pi
require_command claude
require_command jq

mkdir -p "$BUILD"
strip_frontmatter "$REPO/AGENTS.base.md" > "$BUILD/AGENTS.md"
rm -f "$BUILD/host-context.md"
ln -s "$REPO/profiles/$PROFILE/host-context.md" "$BUILD/host-context.md"

build_claude_settings
if $PULL_SETTINGS; then
    pull_claude_settings
fi
check_claude_settings_pulled

link_config_tree "$REPO/config/pi" "$HOME/.pi" .json
mkdir -p ~/.pi/agent/packages
prune_repo_links ~/.pi/agent/packages "$REPO/packages"
rm -f ~/.pi/agent/AGENTS.md
ln -s "$BUILD/AGENTS.md" ~/.pi/agent/AGENTS.md
for package in "$REPO"/packages/*; do
    [[ -d "$package" ]] || continue
    name="$(basename "$package")"
    rm -rf ~/.pi/agent/packages/"$name"
    ln -s "$package" ~/.pi/agent/packages/"$name"
done
link_commands ~/.pi/agent/prompts
install_pi_packages

mkdir -p ~/.claude
install_claude_settings
rm -f ~/.claude/CLAUDE.md
ln -s "$BUILD/AGENTS.md" ~/.claude/CLAUDE.md
link_commands ~/.claude/commands
add_claude_marketplaces
install_claude_plugins

link_config_tree "$REPO/config/codex" "$HOME/.codex"
rm -f ~/.codex/AGENTS.md
ln -s "$BUILD/AGENTS.md" ~/.codex/AGENTS.md

for skills in ~/.claude/skills ~/.codex/skills ~/.pi/agent/skills; do
    prune_repo_links "$skills" "$REPO/skills"
    prune_repo_links "$skills" "$REPO/profiles"
done

# pi already reads ~/.agents/skills itself.
link_skills "$REPO/skills" ~/.claude/skills ~/.codex/skills
link_skills "$REPO/profiles/$PROFILE/skills" ~/.claude/skills ~/.codex/skills ~/.pi/agent/skills
