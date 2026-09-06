#!/usr/bin/env bash
# Regerate instructions and link this repo's config, packages
# and skills into local agent harnesses.

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
}

link_config_tree() {
    local source="$1"
    local destination="$2"
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

        mkdir -p "$(dirname "$target")"
        rm -rf "$target"
        ln -s "$path" "$target"
    done < <(find "$source" -mindepth 1 -print0)
}

if (($#)); then
    [[ $# == 2 && "$1" == "--profile" ]] || {
        echo "usage: $0 [--profile technicolor|treetops]"
        exit 1
    }
    PROFILE="$2"
fi

[[ "$PROFILE" == "technicolor" || "$PROFILE" == "treetops" ]] || {
    echo "unknown profile: $PROFILE"
    exit 1
}

WORKSTATION="$REPO/profiles/$PROFILE/workstation"
rm -rf "$REPO/skills/workstation"
ln -s "$WORKSTATION" "$REPO/skills/workstation"

sed '/^# User Context$/,$d' "$REPO/AGENTS.base.md" > "$REPO/AGENTS.md"
cat "$REPO/profiles/$PROFILE/user-context.md" >> "$REPO/AGENTS.md"

link_config_tree "$REPO/config/pi" "$HOME/.pi"
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

link_config_tree "$REPO/config/claude" "$HOME/.claude"
mkdir -p ~/.claude/skills
rm -f ~/.claude/CLAUDE.md
ln -s "$REPO/AGENTS.md" ~/.claude/CLAUDE.md

link_config_tree "$REPO/config/codex" "$HOME/.codex"
mkdir -p ~/.codex/skills
rm -f ~/.codex/AGENTS.md
ln -s "$REPO/AGENTS.md" ~/.codex/AGENTS.md

prune_repo_links ~/.claude/skills "$REPO/skills"
prune_repo_links ~/.codex/skills "$REPO/skills"
for skill in "$REPO"/skills/*; do
    name="$(basename "$skill")"
    [[ "$name" == "workstation" ]] && continue
    rm -rf ~/.claude/skills/"$name" ~/.codex/skills/"$name"
    ln -s "$skill" ~/.claude/skills/"$name"
    ln -s "$skill" ~/.codex/skills/"$name"
done

rm -rf ~/.claude/skills/workstation ~/.codex/skills/workstation
ln -s "$WORKSTATION" ~/.claude/skills/workstation
ln -s "$WORKSTATION" ~/.codex/skills/workstation
