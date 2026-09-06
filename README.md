# Agent Harnesses
Personal


Central directory for personal chassis setup.

## Scripts

- `./setup.sh [--profile technicolor|treetops]` installs missing CLIs, configures the selected profile, and updates the tooling.
- `./refresh.sh [--profile technicolor|treetops]` regenerates `AGENTS.md` and recreates local configuration and skill links without installing or updating anything.
- `./update.sh` updates Pi and its packages, Claude Code and its plugins, and Codex.

## Chassis

### Claude Code
Claude Code plugins live in the local marketplace:

```sh
claude plugin marketplace add ~/.agents
claude plugin install <plugin>@xarillian-agents --scope user --yes
```

### Codex

### pi.dev

- `/clear` starts a new empty session.
- `/usage` shows Claude Code, Codex, and OpenRouter usage.
- ... `auth.json` should not live here.
