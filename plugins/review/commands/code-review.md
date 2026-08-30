---
description: Review the current change with focused, evidence-based subagents.
---

Perform a read-only code review.

Review scope: $ARGUMENTS

If no scope is supplied, review the current working-tree change. First establish the actual changed files and the relevant surrounding behavior. The agents are read-only, centralized around a `reviewer` who stands central to five supporting pillars:

- `reviewer`
- `contract-pillar`
- `craft-pillar`
- `failure-pillar`
- `simplifying-pillar`
- `state-pillar`

Give each agent the review scope. Do not ask them to edit files, run formatters, or execute project-wide test suites.

Consolidate the reviewers' reports. Treat severity, confidence, and agreement as independent signals:

- **Severity** describes the impact if the finding is real. Rank it as p0, p1, p2, or p3.
- **Confidence** describes how strongly the available evidence proves the finding is real and introduced by the reviewed change. Rank it as c0, c10, ... c90, c100.
- **Agreement** describes independent reviewer convergence. Express it as X/N, where X is the number of reviewers that identified the finding and N is the number of reviewers.

Validate every candidate against the code before including it. Reject findings that are speculative, pre-existing, outside the review scope, or unsupported by a concrete failure or violated contract. Deduplicate overlapping findings and preserve their agreement count. Agreement may support confidence, but it never substitutes for evidence. Order surviving findings by severity, then confidence. If there are no actionable findings, state there are no actionable findings.
