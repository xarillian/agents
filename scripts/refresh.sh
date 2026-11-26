#!/usr/bin/env bash
# Regenerate instructions, link this repo's config, packages and
# skills into local agent harnesses, and install any packages and
# plugins they are missing.

# Sourcing would leave `set -euo pipefail` armed in the caller's shell,
# which then dies on the next failing prompt hook.
[[ "${BASH_SOURCE[0]}" == "$0" ]] || {
    echo "refresh.sh must be run, not sourced: ~/.agents/scripts/refresh.sh --profile <name>" >&2
    return 1
}

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
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

link_folders() {
    local source="$1"
    shift
    local folder
    local name
    local destination

    [[ -d "$source" ]] || return 0
    for folder in "$source"/*; do
        [[ -d "$folder" ]] || continue
        name="$(basename "$folder")"
        for destination in "$@"; do
            mkdir -p "$destination"
            rm -rf "${destination:?}/$name"
            ln -s "$folder" "$destination/$name"
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

# Antigravity only inlines `@[label](path)` includes; bare `@path` stays a reference.
build_antigravity_agents() {
    awk '
        /^@[^[:space:]]+$/ {
            path = substr($0, 2)
            label = path
            sub(/^.*\//, "", label)
            sub(/\.[^.]+$/, "", label)
            printf "@[%s](%s)\n", label, path
            next
        }
        { print }
    ' "$1"
}

# Antigravity exposes skills as slash commands; commands/*.md omit `name:`.
build_antigravity_commands() {
    local destination="$1"
    local command
    local name

    rm -rf "$destination"
    mkdir -p "$destination"
    for command in "$REPO"/commands/*.md; do
        [[ -f "$command" ]] || continue
        name="$(basename "$command" .md)"
        mkdir -p "$destination/$name"
        awk -v name="$name" '
            NR == 1 && /^---$/ { in_fm = 1; print; next }
            in_fm && /^name:/ { has_name = 1 }
            in_fm && /^---$/ { if (!has_name) print "name: " name; in_fm = 0 }
            { print }
        ' "$command" > "$destination/$name/SKILL.md"
    done
    return 0
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

    for package in "$REPO"/harnesses/pi/packages/*; do
        [[ -d "$package" ]] || continue
        name="$(basename "$package")"
        pi_package_installed "$name" && continue
        (cd ~/.pi/agent && pi install "./packages/$name")
    done
    return 0
}

CLAUDE_SETTINGS="$REPO/harnesses/claude/settings.json"

# A link, so whatever Claude Code saves (approvals, /model) lands in the repo.
install_claude_settings() {
    rm -f ~/.claude/settings.json
    ln -s "$CLAUDE_SETTINGS" ~/.claude/settings.json
}

# Settings are shared by every profile, but the Andgo marketplace is only
# reachable from treetops; its plugins are skipped everywhere else.
marketplace_reachable() {
    [[ "$1" != andgo-plugins || "$PROFILE" == treetops ]]
}

reachable_marketplace_sources() {
    local name
    local source

    while IFS=$'\t' read -r name source; do
        marketplace_reachable "$name" && echo "$source"
    done < <(jq -r '.extraKnownMarketplaces | to_entries[]
        | [.key, (.value.source | .repo // .url // .path)] | @tsv' "$CLAUDE_SETTINGS")
    return 0
}

add_claude_marketplaces() {
    local source

    while IFS= read -r source; do
        claude plugin marketplace add "$source"
    done < <(reachable_marketplace_sources)
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
        marketplace_reachable "${plugin#*@}" || continue
        claude plugin install "$plugin" --scope user --yes
    done < <(enabled_claude_plugins)
    return 0
}

parse_profile "$@"
shift 2
[[ $# == 0 ]] || usage

require_command pi
require_command claude
require_command jq

mkdir -p "$BUILD" "$BUILD/antigravity"
strip_frontmatter "$REPO/AGENTS.base.md" > "$BUILD/AGENTS.md"
rm -f "$BUILD/host-context.md"
ln -s "$REPO/profiles/$PROFILE/host-context.md" "$BUILD/host-context.md"
build_antigravity_agents "$BUILD/AGENTS.md" > "$BUILD/antigravity/AGENTS.md"
build_antigravity_commands "$BUILD/antigravity/commands"

link_config_tree "$REPO/harnesses/pi/config" "$HOME/.pi" .json
mkdir -p ~/.pi/agent/packages
prune_repo_links ~/.pi/agent/packages "$REPO/harnesses/pi/packages"
rm -f ~/.pi/agent/AGENTS.md
ln -s "$BUILD/AGENTS.md" ~/.pi/agent/AGENTS.md
for package in "$REPO"/harnesses/pi/packages/*; do
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

# Linked beside what Antigravity writes there itself (config.json, projects/).
mkdir -p ~/.gemini/config ~/.gemini/antigravity-cli
rm -f ~/.gemini/AGENTS.md ~/.gemini/antigravity-cli/statusline.sh
ln -s "$BUILD/antigravity/AGENTS.md" ~/.gemini/AGENTS.md
ln -s "$REPO/harnesses/antigravity/footer/footer.mjs" ~/.gemini/antigravity-cli/statusline.sh
link_config_tree "$REPO/harnesses/antigravity/config" ~/.gemini/config

for skills in ~/.claude/skills ~/.pi/agent/skills ~/.gemini/config/skills; do
    prune_repo_links "$skills" "$REPO/skills"
    prune_repo_links "$skills" "$REPO/profiles"
done
prune_repo_links ~/.gemini/config/skills "$BUILD/antigravity/commands"

# pi already reads ~/.agents/skills itself.
link_folders "$REPO/skills" ~/.claude/skills ~/.gemini/config/skills
link_folders "$REPO/profiles/$PROFILE/skills" ~/.claude/skills ~/.pi/agent/skills ~/.gemini/config/skills
link_folders "$BUILD/antigravity/commands" ~/.gemini/config/skills

# Linked beside what Herdr writes there itself (shipped layouts, mods and
# themes, click state). Mods are linked whole: Herdr's reload watch skips
# symlinked files, so a mod made of links would never hot-reload.
HERDR_HOME="${XDG_CONFIG_HOME:-$HOME/.config}/herdr-app"
link_config_tree "$REPO/harnesses/herdr/config" "$HERDR_HOME"
prune_repo_links "$HERDR_HOME" "$REPO/profiles"
[[ -d "$REPO/profiles/$PROFILE/herdr" ]] && link_config_tree "$REPO/profiles/$PROFILE/herdr" "$HERDR_HOME"
prune_repo_links "$HERDR_HOME/mods" "$REPO/harnesses/herdr/mods"
link_folders "$REPO/harnesses/herdr/mods" "$HERDR_HOME/mods"
