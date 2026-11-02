---
name: pr-authoring
description: Use when publishing a branch as a PR or MR, writing or rewriting a PR description, or answering review on an open PR. Reviews the branch against the developer's intent, opens the PR, builds an explainer deck, writes the description and revert guidance, and runs the review loop, following the repo's own PR conventions where it has them.
metadata: 
  status: in-progress
---

Publish a PR/MR.

# PR Authoring
Goal: A PR that earns a correct merge decision for the least reviewer attention, and points that attention where judgment is needed.

Readers: Today's reviewer and today's agents (review agents, agents building on the branch). Nobody reads a PR after it merges. Anything a later reader needs belongs in the code, an ADR or the backlog, not the description.

Loop: Review the branch (`/code-review <desired_effort>`). Ensure the changes from code review align with the developer's intention, then push any changes resulting from the review. Open a PR (or, MR) in Draft, write a description that aligns with the diff, and assign the human as assignee. Where the repo has its own conventions for any of this, follow them (see Repo conventions).

Updates: A description is a not a decision log nor is an action list. Keep a description concise and focused on helping a reader understand the context and scope of the PR. DO update the explainer artifact. Do NOT use the description as a log. It must remain concise and digestible!

## Repo conventions
A repo's own PR rules win over this skill's defaults. Before Phase A, look for them:
- A PR/MR process doc (`CONTRIBUTING.md`, or whatever the repo's `CLAUDE.md`/`AGENTS.md` links for PRs).
- Writing rules in the repo's `CLAUDE.md`/`AGENTS.md`.
- Templates: `.gitlab/merge_request_templates/`, `.github/pull_request_template.md`.
- Repo skills a PR requires (e.g. a changelog skill), and CI jobs that fail a PR missing something.
- A handful of the team's recently merged PRs, for what the written rules leave out: titles, branch names, footers, screenshots, draft or ready.

The repo decides the description's shape and headings, the title, the branch name, draft or ready, assignee/reviewers/labels, required companions (changelog entries, footers), and prose style. Where the repo is silent, use this skill's defaults.

This skill holds regardless: the review and intent survey (Phase A), the explainer, a description that reads as the PR's final state rather than a log, and revert guidance. Fit each into the repo's shape instead of adding sections it doesn't use: the explainer link as one line above the first heading, and revert guidance under whichever section carries risks or callouts, only when a revert is more than reverting the merge commit.

When the user's instruction conflicts with the repo's, the user's wins; tell them.

## Begin
Open a todolist with one entry per phase.

(A) Review + Feedback
(B) Create PR
(C) Explainer deck
(D) Description draft
(E) Revert guidance
(F) Review loop

(A) is skippable iff the user has previously run a code review skill in session.

## Phase A: Review
1. Begin a code review for the diff of the current branch versus the target branch (`/code-review`). Prefer review at `xHigh` effort.
2. While code review happens, mine previous agent sessions and your own session data for developer intention. Check session data, spec and plan documents for developer intention behind certain choices and patterns in the change. Given insufficient data, interview the user relentlessly until a shared understanding is reached; construct a round of interview questions to determine intent.
3. Implement the review feedback based on the survey of intent, ensuring the implemented changes match intent.

## Phase B: Create PR
1. Rebase. Handle conflicts gracefully, using the intent review from Phase A. Run any step the repo requires before a push. Push to remote.
2. Create a PR/MR from the branch. Set the user as the assignee. Open it in Draft. The repo's conventions override either default.
3. Run any step the repo requires once the PR exists (e.g. a changelog skill that records the PR number).

## Phase C: Explainer
Using the `/explainer-deck` skil, construct an explainer for the PR. Follow the guidance delivered by that skill.

## Phase D: Description draft
Fill the repo's description shape, or use the provided template where it has none. Include _only_ what a reader needs today to understand the change's context and scope. Leave out what the diff already shows.

Always include the explainer.

### Template

```
# Description

**Explainer:** <use `/explainer-deck` skill and update as required>

## Risks

# Testing

# How to Revert
```

## Phase E: Revert guidance
1. Check whether reverting the merge commit undoes the change. Migrations, infrastructure applies and writes to other systems usually don't.
2. If it does, the template says "Revert the merge commit."; a repo shape says nothing.
3. If it doesn't, list the steps in order and name what can't be undone.

## Phase F: Review loop
1. Read each thread and check it against the intent from Phase A. Take conflicts to the user.
2. Answer with new commits.
3. Bring the description and explainer up to the branch's new state.
4. Draft a reply per thread, citing the commit that answers it. Post only on the user's go-ahead.


## Output
Link the PR and the Explainer artifact. Ensure the user is happy with both PR and Artifact; ensure they make the artifact public and the PR comes out of draft once they are.
