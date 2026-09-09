# Workstation

Host-specific context for the default `technicolor` profile. The skill records hardware, drivers, and desktop or session infrastructure that agents cannot infer reliably from the repository.

`refresh.sh` links every directory under `profiles/<profile>/skills` as a skill for Claude Code and Codex, so each profile carries its own `workstation` without touching the others.

Keep `SKILL.md` limited to durable machine facts. Ordinary application and developer-tool configuration belongs elsewhere.
