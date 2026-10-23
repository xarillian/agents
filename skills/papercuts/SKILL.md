---
name: papercuts
description: >-
  Interrupt work and use when friction occurs: a tool call fails, a command is flaky, a documented tool is missing, or a setup step is confusing. Invoke this even if you have a workaround. The skill decides whether the friction is worth recording.
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
~/.agents/bin/papercuts.sh -m <active-model-id> "<summary>"
```

- `<active-model-id>` is the concrete current model ID (that's you), e.g. `claude-sonnet-5`
- `"summary"` is a 1-2 sentence description of the papercut.

DO NOT check for duplicates. Submit the qualifying papercut and continue.
