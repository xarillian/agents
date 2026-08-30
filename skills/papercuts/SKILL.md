---
name: papercuts
description: "Important! Use this skill when you hit a small friction while working: a tool call that missed and had to be retried, a flaky command, a confusing or undocumented setup step, a flaky cache, a misleading error, a non-obvious gotcha, or a command that succeeded and quietly returned something false. Self-inflicted friction counts only when it exposes a repeatable tool or workflow improvement. A typo, recalled rule, or mistake corrected before impact does not qualify. The goal is to capture these small frictions so they can be fixed and the workflow improved; don't just capture random noise."
---

# Papercuts

Use papercuts when friction exposes a repeatable problem in the project or tool workflow and recording it could produce a durable improvement. Do not log expected permission boundaries, ordinary sandbox restrictions, or isolated external failures.

Record each papercut with `~/.agents/bin/papercut.sh`, which enforces a consistent entry format:

```bash
~/.agents/bin/papercut.sh -m <model-id> [-p <project>] "<message>"
```

- `<model-id>` is the exact model ID from your environment block (e.g. `claude-opus-5`).
- `-p` names the project. Omit it inside a git repo and the repo name is used.
- For the message, write one or two sentences: what you were doing and what got in the way. A guess at the cause/fix is a great bonus.
- Never hand-write entries. ALWAYS go through the command so the timestamp, project, model, and cwd stay uniform.

Every entry goes to one central log, `~/.agents/PAPERCUTS.md`, regardless of where you run the
command; it is created if absent. Never write a papercut into the project you're working in.
`-f <path>` or `$PAPERCUTS_FILE` retarget the log, and the command refuses to write to a
git-tracked file.

DO NOT check for duplicates. Just run the command and continue your work.

## Mining a whole session

Session transcripts are JSONL at `~/.claude/projects/<slugified-cwd>/<session-id>.jsonl`, where the
slug replaces `/` with `-` (so `/home/xarillian/dev/chorus-llm` → `-home-xarillian-dev-chorus-llm`).

```bash
ls -t ~/.claude/projects/"${PWD//\//-}"/*.jsonl
```
