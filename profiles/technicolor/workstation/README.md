# Workstation

Host-specific context for the default `technicolor` profile. The skill records hardware, drivers, and desktop or session infrastructure that agents cannot infer reliably from the repository.

`setup.sh` links this directory as the `workstation` skill for Claude Code and Codex. Other profiles may provide a replacement at `profiles/<profile>/workstation`; setup links that directory instead without modifying this one.

Keep `SKILL.md` limited to durable machine facts. Ordinary application and developer-tool configuration belongs elsewhere.
