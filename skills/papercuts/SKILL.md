---
name: papercuts
description: "Use when a small friction exposes a repeatable problem in the project or tool workflow and recording it could produce a durable improvement. Do not log expected permission boundaries, ordinary sandbox restrictions, or isolated external failures."
---

# Papercuts

Important! Use this skill when you hit a small friction while working: a tool call that missed and had to be retried, a flaky command, a confusing or undocumented setup step, a flaky cache, a misleading error, a non-obvious gotcha, or a command that succeeded and quietly returned something false. Self-inflicted friction counts only when it exposes a repeatable tool or workflow improvement. A typo, recalled rule, or mistake corrected before impact does not qualify. The goal is to capture these small frictions so they can be fixed and the workflow improved; don't just capture random noise.


DO NOT RECORD SECRETS HERE. BE CAREFUL. If you are unsure, do not log it.

Submit each papercut through `~/.agents/bin/papercuts.sh`. It serializes and atomically appends a uniform, model-readable YAML entry.

```bash
~/.agents/bin/papercuts.sh -m <exact-active-model-id> [-p <project>] [-c <suspected-cause>] "<summary>"
```

- `<exact-active-model-id>` is the concrete current model ID from the environment block, not a role alias such as `@low`.
- Omit `-p` inside a Git repository to use its name. Supply it only when the source project cannot be derived.
- `-c` records a likely cause or fix. Omit it when unknown.
- Never read or write `~/.agents/workflow/PAPERCUTS.yaml` directly. Submit the entry through the command.

The command records the runtime timestamp, project, model, and working directory in this fixed shape:

```yaml
version: 1
papercuts:
  - occurred_at: "<submission timestamp>"
    project: "<source project>"
    model: "<exact active model ID>"
    cwd: "<source working directory>"
    summary: "<what you were doing and what got in the way>"
    suspected_cause: "<likely cause or fix, or null>"
```

DO NOT check for duplicates. Submit the qualifying papercut and continue.
