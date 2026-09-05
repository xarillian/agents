#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="technicolor"

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

## == pi.dev ==
if ! command -v pi >/dev/null; then
    echo "pi.dev is not installed; installing..."
    curl -fsSL https://pi.dev/install.sh | sh
fi

mkdir -p ~/.pi/agent
rm -f ~/.pi/agent/settings.json ~/.pi/agent/AGENTS.md
rm -rf ~/.pi/agent/extensions ~/.pi/agent/themes
ln -s "$REPO/config/pi/settings.json" ~/.pi/agent/settings.json
ln -s "$REPO/AGENTS.md" ~/.pi/agent/AGENTS.md
ln -s "$REPO/config/pi/themes" ~/.pi/agent/themes

pi update --all

## == Claude Code ==
if ! command -v claude >/dev/null; then
    echo "claude code is not installed; installing..."
    curl -fsSL https://claude.ai/install.sh | sh
fi

claude update

mkdir -p ~/.claude/skills
rm -f ~/.claude/settings.json

claude plugin marketplace remove claude-plugins-official || true
claude plugin marketplace remove openai-codex || true
claude plugin marketplace remove xarillian-agents || true

claude plugin marketplace add anthropics/claude-plugins-official
claude plugin marketplace add openai/codex-plugin-cc
claude plugin marketplace add "$REPO"

sed -n \
    '/"enabledPlugins": {/,/}/ s/^[[:space:]]*"\([^"]*\)": true,*/\1/p' \
    "$REPO/config/claude/settings.json" |
while IFS= read -r plugin; do
    claude plugin install "$plugin" --scope user --yes
done

rm -f ~/.claude/settings.json ~/.claude/CLAUDE.md
ln -s "$REPO/config/claude/settings.json" ~/.claude/settings.json
ln -s "$REPO/AGENTS.md" ~/.claude/CLAUDE.md

chmod +x "$REPO/config/claude/hooks/strip-attribution.sh"
rm -rf ~/.claude/hooks
ln -s "$REPO/config/claude/hooks" ~/.claude/hooks

for skill in "$REPO"/skills/*; do
    name="$(basename "$skill")"
    [[ "$name" == "workstation" ]] && continue
    rm -rf ~/.claude/skills/"$name"
    ln -s "$skill" ~/.claude/skills/"$name"
done
rm -rf ~/.claude/skills/workstation
ln -s "$WORKSTATION" ~/.claude/skills/workstation

## == Codex ==
if ! command -v codex >/dev/null; then
    echo "codex is not installed; installing..."
    curl -fsSL https://chatgpt.com/codex/install.sh | sh
fi

codex update

mkdir -p ~/.codex/skills
rm -f ~/.codex/config.toml ~/.codex/hooks.json ~/.codex/AGENTS.md
ln -s "$REPO/config/codex/config.toml" ~/.codex/config.toml
ln -s "$REPO/config/codex/hooks.json" ~/.codex/hooks.json
ln -s "$REPO/AGENTS.md" ~/.codex/AGENTS.md

for skill in "$REPO"/skills/*; do
    name="$(basename "$skill")"
    [[ "$name" == "workstation" ]] && continue
    rm -rf ~/.codex/skills/"$name"
    ln -s "$skill" ~/.codex/skills/"$name"
done
rm -rf ~/.codex/skills/workstation
ln -s "$WORKSTATION" ~/.codex/skills/workstation
