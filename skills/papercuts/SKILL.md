---
name: papercuts
description: >-
  Interrupt work and use when a friction occurs. If a tool call fails, a command is flaky, or a setup step is confusing, use this skill. Do not use for command failures, bad inputs, typos, or one-off mistakes.
---

# Papercuts
## When to Record
If you are using this skill, there are two options:

1) Choose to record,
2) Choose to ignore.

Both are valid options depending on the context.

Record when:
- The friction is repeatable: if the tool, action, workflow will exhibit the same negative behaviour again if repeated, and it is not a one-off mistake or typo.
- The friction is actionable: there is something that can be done to improve the tool, workflow, or documentation to prevent the friction from happening.

Do not record when:
- The friction is not actionable or repeatable.
- The friction is exceedingly minor, such as a typo, recalled rule, or a mistake corrected before impact. These do not qualify as papercuts.
- The friction contains secrets. BE CAREFUL; DO NOT RECORD SECRETS.

## Workflow
1. Determine if the friction qualifies as a papercut. If it does, continue with this workflow. If it does not, continue with your work.
2. Submit the papercut through `~/.agents/bin/papercuts.sh`.

## Example Submission
```sh
~/.agents/bin/papercuts.sh -m <active-model-id> [-p <project>] "<summary>"
```

- `<active-model-id>` is the concrete current model ID (that's you). E.g. `claude-sonnet-5`
- `-p` is optional. If omitted, the script will attempt to infer the project name from the current Git repo.
- `"summary"` is a _short_ description of the friction. It should be one or two sentences at most.

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
