---
name: pr-authoring
description: ...
metadata: 
  status: in-progress
---

Publish a PR/MR.

# PR Authoring
Goal: To publish a PR that can easily be read and understood by developers and agents.

Loop: Review the branch (`/code-review <desired_effort>`). Ensure the changes from code review align with the developer's intention, then push any changes resulting from the review. Open a PR (or, MR) in Draft, write a description that aligns with the diff and records the decision log, and assign the human as assignee.

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
1. Rebase. Handle conflicts gracefully, using the intent review from Phase A. Push to remote.
2. Create a PR/MR from the branch. Set the user as the assignee. Open it in Draft.

## Phase C: Explainer
Using the `/explainer-deck` skil, construct an explainer for the PR. Follow the guidance delivered by that skill.

## Phase D: Description draft

### Template

```
# Description

**Explainer:** <use `/explainer-deck` skill and update as required>

## Risks

# Testing

# How to Revert
```

## Output
Link the PR and the Explainer artifact. Ensure the user is happy with both PR and Artifact; ensure they make the artifact public and the PR comes out of draft once they are.