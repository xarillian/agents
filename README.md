# Agent Harnesses
Personal setup for `pi`, Claude Code, or Codex depending on the machine.

This repo contains setup and update scripts for those harnesses, links 'em to their appropriate dirs, and generated instructions. Bespoke packages for `pi` and plugins for the chassis are stored here, as well.

## Quick Start

```sh
git clone https://github.com/xarillian/agents ~/.agents
cd ~/.agents
./setup.sh --profile <technicolor|treetops>
```

- `refresh.sh --profile <technicolor|treetops>` generates content and refreshes symlinks
- `update.sh` manages updates for all bodies

## Repo Map

```text
config/       Harness configuration, split by tool
packages/     Local Pi extensions
plugins/      Claude Code plugins
profiles/     Per-machine or per-context overlays, including profile-only skills
rules/        Shared operating rules
skills/       Reusable agent skills
```
