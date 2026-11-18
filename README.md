# Agent Harnesses
Personal setup for `pi`, Claude Code, or Codex depending on the machine.

This repo contains setup and update scripts for those harnesses, links 'em to their appropriate dirs, and generated instructions. Bespoke packages for `pi` and plugins for the chassis are stored here, as well.

## Quick Start

```sh
git clone https://github.com/xarillian/agents ~/.agents
cd ~/.agents
./setup.sh --profile <technicolor|treetops|kaleidoscope>
```

- `refresh.sh --profile <technicolor|treetops|kaleidoscope>` generates content, refreshes symlinks, adds Claude Code marketplaces, and installs missing pi packages and Claude Code plugins
- `refresh.sh --profile <name> --pull-settings` first copies permissions Claude Code approved into `profiles/<name>/claude.settings.json`; without it, `refresh.sh` refuses to overwrite them
- `update.sh --profile <technicolor|treetops|kaleidoscope>` manages updates for all bodies

## Source of Truth

`~/.agents` is king. `~/.pi`, `~/.claude`, `~/.codex` hold links and generated output; when they disagree with this repo, they are wrong.

## Repo Map

```text
bin/          Tools to run by hand
commands/     Slash commands shared by every harness
hooks/        Scripts that harness hooks run
skills/       Skills shared by every harness
harnesses/    What belongs to one harness:
  claude/       settings.json (shared layer) and plugins/
  pi/           config/ (mirrors ~/.pi) and packages/
  codex/        config/ (mirrors ~/.codex)
profiles/     What differs per machine: host context, skills, Claude settings overlay
```
