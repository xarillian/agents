# Agents

Central directory for personal chassis setup.

## Claude Code

## Codex

## OMP (oh-my-pi)

OMP allows injectable prompts, formatted by file name. Stored here in `prompts`.

- `PERSONALITY.md` -> Voice, social stance, interpersonal default; injected into the [system prompt](https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/prompts/system/system-prompt.md).
- `RULES.md` -> Standing instructions; also injected into the system prompt.
- `APPEND_SYSTEM.md` -> Appended after OMP's default template and project/environment footer. If using `SYSTEM.md`, it follows the custom system prompt instead.
- `SYSTEM.md` -> Overrides OMP's default constructed template.
- `WATCHDOG.md` -> Appended to an enabled advisor's system prompt; not given to the primary agent.
- `TITLE_SYSTEM.md` -> Used only for session title generation; does not affect the primary agent.

### Rules

Rules in `rules/` with `alwaysApply: true` are always loaded into the system context for _each_ request. OMP omits their automatic injection when the same normalized content already appears in the system prompt, custom prompt, append prompt, or a loaded context file. The rule remains active and available through `rule://<name>` even when its duplicate text is omitted.
