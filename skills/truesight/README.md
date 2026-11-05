# Truesight

Forces your agent to read what's there instead of making it up.

The skill is intended to fire partway through a change. By then the agent has read enough to form a plan but has not yet carried it out. It also fires the instant something read doesn't fit what was expected. That mid-run "wait, check this" moment is when the skill has the most to check against.

## Eval (2026-11-04)

I noticed the skill had stopped firing, so I had Claude make an eval based on two questions: can it be made to fire, and does it change outcomes when it does? The rest of this doc is authored by Claude and a report of that eval.

### Setup

- Each run was a headless `claude -p` session on Opus 5.5 with the normal environment: global `CLAUDE.md`, every installed skill, and auto permission mode.
- Each task was a trap, where the obvious move is wrong and only the code shows the right one.
- Graders scored the runs blind. They didn't know the condition, and they checked each run's claims against the source.

There were two sets of traps.

- **Small fixtures, 6 repos of a few files each.** Examples:
  - a timeout configured in milliseconds;
  - a `.map` crash caused by a response envelope;
  - a retry request on a client that already retries;
  - a fix inside a generated file.
- **A large proprietary Django monolith, about 7,800 files, 3 traps.** These used natural code where possible:
  - a layer-boundary CI failure, with a planted helper that also uses the wrong timestamp field;
  - a request for a new rule, when existing configurable rules deliberately allow the behaviour;
  - a "bug" report about behaviour that a docstring documents as intentional.

### Findings

**Small repos don't discriminate.** All 24 fixture runs passed with or without the skill. When the agent can read every file, the skill has nothing to add.

**On the large repo, the skill helps.** Each cell is 3 runs.

| | Skill not invoked | Skill invoked |
|---|---|---|
| Caught the planted semantic bug | 1/3 | 3/3 in each of three conditions |
| Recognised the existing rules as deliberate configuration | 1/3 | 2/3, 3/3, 3/3 |
| Recognised the documented intent | 3/3 | 3/3 |

The three "skill invoked" conditions were:
- **forced:** `/truesight` prefixed to the prompt;
- **v2:** a description that fires at the start of the task;
- **v3:** the current description, which fires mid-run.

Cost was about the same; v3 runs were sometimes cheaper than runs without the skill.

**The description decides whether it fires.**

| Description | Fired on change tasks | When | Fired on plain questions |
|---|---|---|---|
| Original: "situation you recognize the truth of" | 2/21 | mid-run | n/a |
| v2: "before the first edit…" | 11/11 | always the first tool call | 0/2 |
| v3 (current): "partway through, once you have a plan…" | 9/11 | mid-run, 2–11 calls in | 0/2 |

The original asked the agent to notice its own pattern-matching. It can't, because acting on a prior feels exactly like knowing. Both rewrites name moments the agent can see instead. v3 also tells it to skip the start of the task, which moves the firing to mid-run. Graded outcomes for v2 and v3 were indistinguishable.

### Caveats

- **Small samples:** three runs per cell, although every scenario moved in the same direction.
- **No placebo:** there was no plain "read carefully" control, so the skill's content can't be fully separated from a general nudge to be careful.
- **Rubric error:** one rubric item was itself wrong, an assumption about a stale TODO. The graders caught it, and it is excluded from the results.
