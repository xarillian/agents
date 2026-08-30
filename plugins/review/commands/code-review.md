---
description: Review a change or explicit audit scope with focused, evidence-based subagents.
---

Perform a read-only code review.

Review scope: $ARGUMENTS

Determine the scope mode before delegation:

- No supplied scope means a **change review** of the current working-tree change.
- A supplied patch, commit, or changed-file set means a **change review**.
- A supplied file, directory, subsystem, repository, or whole-project scope means an **audit review**, unless the user explicitly limits it to changes.

In change-review mode, first establish the actual changed files and relevant surrounding behavior. In audit-review mode, inventory the named first-party surface and its applicable boundaries. Exclude generated or vendored paths unless the scope explicitly includes them.

Build one shared review brief containing:

- scope mode;
- exact files, directories, or changed-file set;
- the task, specification, or behavior under review when available;
- applicable repository instructions;
- excluded paths;
- relevant entry points and boundaries already established.

Derive a coverage map from the repository's actual instructions and the reviewed surface. Assign every applicable rule or concern to at least one reviewer. Do not hardcode rules from an unrelated repository or turn generic possible defects into mandatory findings.

The agents are read-only, centralized around a `reviewer` who stands central to five supporting pillars:

- `reviewer`
- `contract-pillar`
- `craft-pillar`
- `failure-pillar`
- `simplifying-pillar`
- `state-pillar`

Give every agent the same shared review brief, followed by its specialized assignment. Ask each agent to exercise every applicable lens in its own definition. Do not ask agents to edit files, run formatters, or execute project-wide test suites.

Before consolidation, perform a coverage gate:

1. Compare each report with the lenses assigned to that reviewer and with the repository-rule coverage map.
2. Inspect any internal coverage receipt supplied by an agent. Receipts are coordinator input and never appear in the final response.
3. Treat an absent lens as unreviewed, never as evidence that the lens is clean.
4. If a report does not demonstrate coverage of an applicable lens, send that same agent a focused follow-up and require it to complete the missing pass.
5. Do not consolidate until every applicable lens has been examined or is explicitly unreachable for a concrete reason.

Candidate validation and review coverage are separate gates:

- **Candidate validation:** Determine whether each reported observation is supported by the reviewed code and relevant evidence.
- **Coverage validation:** Determine whether the assigned review lenses were actually exercised across the required scope.

A fully validated candidate list can still be incomplete when coverage is missing.

Consolidate every reviewer's findings into one compact Markdown table. Treat severity, confidence, and agreement as independent signals:

- **Severity** describes the impact if the observation is valid. Rank it as sev0, sev1, sev2, or sev3. Preserve low-impact sev3 observations and nits.
- **Confidence** describes how strongly the available evidence supports the observation and ties it to the reviewed scope. Rank it as c0, c10, ... c90, c100.
- **Agreement** describes independent reviewer convergence. Express it as X/N, where X is the number of reviewers that independently identified the observation and N is the number of reviewers.

Agreement does not determine, bound, or substitute for severity or confidence. One specialist may identify a c100 sev0 issue alone, while several reviewers may converge on an unsupported concern. Agreement also does not prove review coverage.

Validate every candidate against the code before including it. Reject observations that are speculative, outside the review scope, or unsupported by relevant evidence. In change-review mode, also reject pre-existing observations that the reviewed change did not introduce or materially worsen. Existing observations inside an audit scope are eligible. A useful observation does not need to describe a concrete behavioral defect or supply a proposed correction.

Deduplicate overlapping observations and preserve their independent agreement count. Do not increase agreement when an agent merely confirms a candidate after seeing another agent's report. Agreement may inform further validation, but evidence alone determines confidence.

Return exactly one findings table using these columns:

| ID | Item | Stats | Location | Evidence |
| --- | --- | --- | --- | --- |
| *F1* | *Concise title* | c0-c100 <br> sev0-sev3 <br> X/N | `path:start`-`end` | **Evidence:** concise consolidated support<br>**Impact:** why it matters |

Assign each consolidated observation a unique ID beginning with `F` and a sequential number, such as `F1`, `F2`, and `F3`. Use `<br>` between labeled evidence parts. Do not include coverage receipts, per-agent sections, rejected candidates, correction advice, recommendations, or direction. Order rows by severity from sev0 to sev3, then by confidence from highest to lowest. If there are no supported observations, state that there are no findings.
