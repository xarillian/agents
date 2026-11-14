# Truesight

Forces your agent to read what's there instead of making it up.

The skill is intended to fire partway through a change. By then the agent has read enough to form a plan but has not yet carried it out. It also fires the instant something read doesn't fit what was expected. That mid-run "wait, check this" moment is when the skill has the most to check against.

## Eval (2026-11-04)

I noticed the skill had stopped firing, so I had Claude make an eval based on two questions: can it be made to fire, and does it change outcomes when it does? The eval used a large, legacy codebase, and the conditions were checked by me first. The rest of this doc is authored by Claude and is a report of that eval.

### Setup

- **Runs:** each one is a headless `claude -p` session on Opus 5.5 with the normal environment: global `CLAUDE.md`, installed skills, and auto permission mode.
- **Repo:** a large proprietary Django monolith, about 7,800 files, too big for the agent to read in full.
- **Traps:** an agent that never saw the skill wrote 11 tasks where the obvious move is wrong and only the code shows the right one. Each was piloted against an agent with no skills. Only 2 tripped it, and those are the ones scored:
  - adding a model field that a select-everything analytics view would ship to the data warehouse in cleartext;
  - raising a task's time limit past a job lock that expires after an hour, letting a second run clobber the first.
- **Conditions:** five. The descriptions were fixed before the traps were written.
  - **No skills:** all skills hidden.
  - **Placebo:** all skills hidden, and the prompt starts with "hey dog, make sure you read every file".
  - **v2, v3, v4:** three versions of truesight's description, defined below.
- **Run counts:** 9 fresh no-skill runs per trap, not counting the pilot runs used to pick the traps, and 6 runs for the placebo and each description.
- **Grading:** blind, with run names scrubbed. Graders checked each run's claims against the source. Previously graded anchor runs mixed into the last two batches came back with identical grades.

### Descriptions

The versions differ only in the `description` frontmatter: the text the agent always sees in its skill list, and uses to decide when to invoke the skill. The skill body is identical in all three.

**v2** asks the agent to invoke the skill at the start of a change. It lists the situations it covers and the kinds of mistakes it catches.

> Use before the first edit when changing behaviour in an existing codebase, especially one too large to have read in full. That covers fixing a reported error or failing CI check, adding a rule, retry, filter, or feature on request, and changing something the user calls a bug. Invoke it when the fix looks obvious; that is when you are most likely acting on a remembered pattern instead of the code in front of you. Catches mechanisms that already do what was asked, deliberate design the request would undo, and fields whose meaning differs from their name.

**v3** (current) asks the agent to invoke the skill mid-run, once it has a plan or hits something that doesn't fit. It tells it to skip the start of the task.

> Use partway through a change, once you have read enough to form a plan and before you carry it out. The moments are just before the first edit, and the instant something you read doesn't fit what you expected, such as a mechanism that already does what was asked, a comment saying the behaviour is deliberate, or a field whose meaning differs from its name. If the fix looks obvious, that is the time. Matters most in codebases too large to read in full, when fixing a reported error or failing check, or when adding a rule, retry, filter, or feature on request. Skip it at the very start of a task; it needs something already read to check the plan against.

**v4** is v2 with the situations and examples removed, which leaves only the timing.

> Use before the first edit when changing behaviour in an existing codebase, especially one too large to have read in full. Invoke it when the fix looks obvious; that is when you are most likely acting on a remembered pattern instead of the code in front of you.

### Findings

| | No skills | Placebo | v2 | v3 (current) | v4 |
|---|---|---|---|---|---|
| Analytics field | 7/9 | 5/6 | 6/6 | 6/6 | 5/6 |
| Time limit vs job lock | 3/9 | 5/6 | 5/6 | 6/6 | 4/6 |
| **Caught** | **10/18** | **10/12** | **11/12** | **12/12** | **9/12** |
| Skill fired | n/a | n/a | 12/12, at the start | 3/12, mid-run | 10/12, at the start |
| Average cost | $0.57 | $0.88 | $0.81 | $0.79 | $0.78 |

- **v3 is the only clear win.** Against the no-skill baseline it scores p ≈ 0.008, which holds after correcting for testing four conditions against it. v2 is borderline (p ≈ 0.04). v4 and the placebo can't be told apart from no skills.
- **The description does the work, not the body.** v3 caught everything while firing in only 3 of 12 runs. v4 loaded the skill body almost every time and did worst of the three. v3's always-visible wording acts as a standing nudge: check what you read against your plan, and stop when something doesn't fit.
- **The placebo helps less, and costs more.** Telling the agent to read every file caught 10 of 12, at $0.88 a run. v3 caught 12 of 12 at $0.79, without anyone having to type it. With six runs each, the gap between v3 and the placebo is within noise.
- **v3 costs about 40% more per run than no skills,** because the agent reads more before acting.
- **Most of the time the harness is enough.** 9 of the 11 traps never tripped the no-skill agent. The slip truesight still catches is a consequence enforced in another module, which nothing near the change hints at.

### Caveats

- **Two traps:** most of the gap comes from one of them, the time limit.
- **Small cells:** six runs for the placebo and each description.
