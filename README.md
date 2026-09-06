# Agent Harnesses
Personal, machine-aware setup for pi.dev, Claude Code, and Codex.

This repo contains setup and update scripts for the supported harnesses, links this repository's configs to their appropriate directories, generated instructions, and manages bespoke packages and plugins.

## Quick Start

```sh
git clone https://github.com/xarillian/agents ~/.agents
cd ~/.agents
./setup.sh --profile <technicolor|treetops>
```

- `refresh.sh --profile <technicolor|treetops` generates content and refreshes symlinks
- `update.sh` manages updates for all bodies

## Repo Map

```text
config/       Harness configuration, split by tool
packages/     Local Pi extensions
plugins/      Claude Code plugins
profiles/     Per-machine or per-context overlays
rules/        Shared operating rules
skills/       Reusable agent skills
```
