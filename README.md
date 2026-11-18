# Agent Harnesses
Personal setup for `pi` or Claude Code depending on the machine.

This repo contains setup and update scripts for those harnesses, links 'em to their appropriate dirs, and generated instructions. Bespoke packages for `pi` and plugins for the chassis are stored here, as well.

## Quick Start

```sh
git clone https://github.com/xarillian/agents ~/.agents
cd ~/.agents
./scripts/setup.sh --profile <technicolor|treetops|kaleidoscope>
```

- `scripts/refresh.sh --profile <technicolor|treetops|kaleidoscope>` generates content, refreshes symlinks, adds Claude Code marketplaces, and installs missing pi packages and Claude Code plugins
- `scripts/update.sh --profile <technicolor|treetops|kaleidoscope>` manages updates for all bodies

## Source of Truth

`~/.agents` is king. `~/.pi` and `~/.claude` hold links and generated output; when they disagree with this repo, they are wrong.

## Repo Map

```text
bin/          Tools to run by hand
commands/     Slash commands shared by every harness
hooks/        Scripts that harness hooks run
skills/       Skills shared by every harness
harnesses/    What belongs to one harness:
  claude/       settings.json (linked to ~/.claude) and plugins/
  pi/           config/ (mirrors ~/.pi) and packages/
scripts/      setup.sh, update.sh, refresh.sh and their shared lib.sh
profiles/     What differs per machine: host context, skills, skill usage log
```
