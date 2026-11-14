---
name: mending
description: >-
  MANDATORY on unexpected tool failure, command error, stale or misleading docs, host quirks, user correction, an external API or tool fails, the agent realizes their data is outdated or incorrect, or a better approach is discovered for a recurring task. Use BEFORE proposing fixes, retrying commands, or finding workarounds.
metadata:
  purpose: "Self-repair mechanism for agent behaviour and action, telemetry/repair pattern."
  status: solid
---

# Mending
Record friction to `MENDING.yaml` so `/mend` can inspect patterns and patch the underlying setup, docs, or skills.

## When to Record
Default to **recording**. If an event triggered this skill, log it unless it hits one of the strict exclusions below. Workarounds hide broken setups—log first, work around second.

**Record when:**
- A tool, command, or API fails. If one of these fail unexpectedly, exited non-zero due to setup or schema issues, or if a permission roadblock is hit.
- On stale docs or outdated knowledge. If instructions in an `AGENTS.md`/`CLAUDE.md`, a skill, or your own training data pointed to a non-existent path, deprecated CLI syntax, or outdated API behavior.
- When the host or environment has an unexpected quirk. Perhaps a command behaved unexpectedly due to local OS/shell differences, PATH issues, or machine-specific configuration.
- On user correction or better pattern discovery. If the user corrects your approach in a way that contradicts current instructions (`"No, do X instead."`) or you discover a significantly cleaner workflow for a recurring task.

**Do not record:**
- Trivial typos, like misspelled filenames or commands. An unexpected result (an argument that does something different than determined) still deserves a snag.
- Routine project state, like expected errors in a fresh repo, test failures before implementing a feature, test failures related to a feature that has _just_ been implemented.
- Something contains secrets. Do not record API keys, tokens, passwords, or private env values to the log. Redact them first, or skip if unsafe. 

## Workflow
1. Determine if the friction qualifies as a snag. If it does, continue with this workflow. If it does not, continue with your work.
2. Submit the snag through `~/.agents/bin/mending.sh` immediately before retrying or applying a workaround.

```sh
~/.agents/bin/mending.sh -m "<active-model-id>" -c "<suspected cause or fix>" "<1-sentence summary>"
```

- `-m` (required): Your exact active model ID (e.g., claude-sonnet-4-6).
- `-c` (strongly recommended): Your hypothesis for why it happened or what file/config /mend should fix (e.g., "workstation skill missing GNU sed note" or "settings.json blocks read-only git subcommand"). Omit only if completely unknown.
- `-p` (optional): Project name. Omit to let the script auto-detect the Git repo name.
- `"summary"` is a 1-2 sentence description of the snag.

Do not check for duplicates. Submit the qualifying snag and continue.
