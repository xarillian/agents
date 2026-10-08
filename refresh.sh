#!/usr/bin/env bash
# Regenerate instructions, link this repo's config, packages and
# skills into local agent harnesses, and install any packages and
# plugins they are missing.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="technicolor"

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
    local skill
    local name

    [[ -d "$source" ]] || return 0
    for skill in "$source"/*; do
        [[ -d "$skill" ]] || continue
        [[ -L "$skill" ]] && continue
        name="$(basename "$skill")"
        rm -rf ~/.claude/skills/"$name" ~/.codex/skills/"$name"
        ln -s "$skill" ~/.claude/skills/"$name"
        ln -s "$skill" ~/.codex/skills/"$name"
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

link_profile_skills() {
    local source="$1"
    local skill
    local name

    [[ -d "$source" ]] || return 0
    for skill in "$source"/*; do
        [[ -d "$skill" ]] || continue
        name="$(basename "$skill")"
        rm -rf "$REPO/skills/$name"
        ln -s "$skill" "$REPO/skills/$name"
    done
    return 0
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

add_claude_marketplaces() {
    claude plugin marketplace add anthropics/claude-plugins-official
    claude plugin marketplace add openai/codex-plugin-cc
    claude plugin marketplace add "$REPO"
    claude plugin marketplace update "$(jq -r .name "$REPO/.claude-plugin/marketplace.json")"

    # TODO: if profile ... treetops ... add marketplace https://gitlab.dev.ncconsulting.ca/consulting/agent-marketplace.git
}

# Builtin plugins ship inside Claude Code; enabling them in settings is
# the whole install.
enabled_claude_plugins() {
    jq -r '.enabledPlugins | to_entries[]
        | select(.value and (.key | endswith("@builtin") | not)) | .key' \
        "$REPO/config/claude/settings.json"
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

if (($#)); then
    [[ $# == 2 && "$1" == "--profile" ]] || {
        echo "usage: $0 [--profile technicolor|treetops|kaleidoscope]"
        exit 1
    }
    PROFILE="$2"
fi

[[ "$PROFILE" == "technicolor" || "$PROFILE" == "treetops" || "$PROFILE" == "kaleidoscope" ]] || {
    echo "unknown profile: $PROFILE"
    exit 1
}

require_command pi
require_command claude
require_command jq

sed '/^# User Context$/,$d' "$REPO/AGENTS.base.md" > "$REPO/AGENTS.md"
cat "$REPO/profiles/$PROFILE/user-context.md" >> "$REPO/AGENTS.md"

link_config_tree "$REPO/config/pi" "$HOME/.pi" .json
mkdir -p ~/.pi/agent/packages
prune_repo_links ~/.pi/agent/packages "$REPO/packages"
rm -f ~/.pi/agent/AGENTS.md
ln -s "$REPO/AGENTS.md" ~/.pi/agent/AGENTS.md
for package in "$REPO"/packages/*; do
    [[ -d "$package" ]] || continue
    name="$(basename "$package")"
    rm -rf ~/.pi/agent/packages/"$name"
    ln -s "$package" ~/.pi/agent/packages/"$name"
done
link_commands ~/.pi/agent/prompts
install_pi_packages

link_config_tree "$REPO/config/claude" "$HOME/.claude"
mkdir -p ~/.claude/skills
rm -f ~/.claude/CLAUDE.md
ln -s "$REPO/AGENTS.md" ~/.claude/CLAUDE.md
link_commands ~/.claude/commands
add_claude_marketplaces
install_claude_plugins

link_config_tree "$REPO/config/codex" "$HOME/.codex"
mkdir -p ~/.codex/skills
rm -f ~/.codex/AGENTS.md
ln -s "$REPO/AGENTS.md" ~/.codex/AGENTS.md

prune_repo_links "$REPO/skills" "$REPO/profiles"
link_profile_skills "$REPO/profiles/$PROFILE/skills"

prune_repo_links ~/.claude/skills "$REPO/skills"
prune_repo_links ~/.codex/skills "$REPO/skills"
prune_repo_links ~/.claude/skills "$REPO/profiles"
prune_repo_links ~/.codex/skills "$REPO/profiles"

link_skills "$REPO/skills"
link_skills "$REPO/profiles/$PROFILE/skills"
