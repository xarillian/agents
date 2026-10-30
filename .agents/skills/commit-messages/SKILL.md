---
name: commit-messages
description: Use when writing a commit message in this repository.
---

# Commit messages

- **Subject:** imperative, sentence case, no period, no `scope:` prefix, about 60 characters. Name the outcome, not the files: "Make papercuts.sh work with mikefarah's yq".
- **One idea per commit.** Split unrelated changes, even when they landed together.
- **Body only when the why is not obvious.** Prose, no bullets, wrapped at 72. Say what was broken or misleading and for whom; the diff already says what changed.
- **No trailers.** No co-author or attribution lines.

```
Invoke papercuts even with a workaround in hand

Agents that found another way past a failing tool skipped the skill, so
friction with a workaround went unrecorded.
```
