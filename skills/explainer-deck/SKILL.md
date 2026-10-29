---
name: explainer-deck
description: >-
  Build a slide deck that someone who missed the conversation can follow without a speaker. Use for 'make an explainer', 'make a deck/slides on this', 'walk through this investigation/design/benchmark as slides', or 'teach me this repo/page/topic as slides'.
metadata:
  status: in-trial
---

# Explainer
Goal: To build a slide deck that is easily digestible asynchronously.

Loop: Earn the conclusion from evidence, outline it as titles, write one idea per slide, show the hard parts (interlaced), then review it as a critical stranger would. Every claim on a slide needs to be measured, read in a source, or labelled as inference. 

## Begin
Open a todolist with one entry per phase before writing anything.

(A) Gather
(B) Measure
(C) Outline
(D) Write
(E) Build
(F) Review

Skip "Measure" when no claim is comparative.

## Phase A: Gather
1. Read the code under discussion until you can say how it behaves and why it is shaped that way. Note the exact vocabulary used; we should _only_ utilize that vocabulary, except comparatively, e.g. "an egregore, called elsewhere a tulpa, is...".
2. Read the user's plans and roadmap, as well as agentic sessions for the project. Weaknesses come from here, not from generic concerns.
3. Establish competing patterns or architecture. Build these in your scratchpad. Merged MRs/PRs often say why a design has changed, so also view GitHub or GitLab.
4. Tag every note as **measured**, **read in source**, or **inferred**. Keep a list of every source. The source follows the claim onto its slide's footer; the tag and the full trail go in its speaker notes.

Teaching one source instead of a decision? Read until you could teach it to someone new: README and docs, then entry points and the files that show how the parts fit. If no source is given or it is undiscoverable, ask for one.

## Phase B: Measure
Build a small trial in the scratchpad instead of arguing from taste. Only the design under test changes between options.

1. Test the strongest version of each rival. If a fix (sharding, inline records) makes a rival competitive, test that version.
2. Run a realistic workload first (the user's actual scale), then a flood, a stall, and chaos. Count correctness, not just speed.
3. Prove ordering and lifetime properties with deterministic tests that force the interleaving. Chaos runs rarely hit races.
4. Distrust the first run. Harness artifacts inflate one design. Fix, rerun, and record which run each number comes from.
5. Report ranges from several runs ("5.4 to 6.1").

A number you did not produce is **read in source** until you reproduce it. Rerun existing measurements under your harness when you can; otherwise cite them with their origin and keep them apart from your own runs.

## Phase C: Outline
Write every title before any slide, in one grammar: short topic titles in title case. Read them alone. If they don't tell the story, fix the outline, not the slides.

Every deck opens with a glossary slide, "Words used here", right after the cover. One table: term, meaning, and status (in code, new, or the source it comes from).

A decision deck might need vocabulary, how others are doing it, options tried, etc. Fit your slides to the storytelling and drop what evidence can't fill.

A teaching deck builds bottom up. Start from what the reader surely knows, add one idea per slide, and work a real example before naming the rule. Six to fourteen steps, closing with the sources.

## Phase D: Write
1. Give each slide a title, one takeaway sentence, and one structure (cards, table, chart, pseudocode, or animation). Two structures compete for the eye and neither lands. A reader should take a slide in at a glance; what doesn't fit goes in its speaker notes.
2. Pin one source line at the foot of each content slide: the file, ADR, or command and date the slide stands on. If its sources won't fit on one line, the slide makes too many claims; split it.
3. Define each term before it is used. Use the code's word for it (`rg -o -i` the candidates, pick the most frequent) and its variant names (Completion, not "completed"). Terms the code lacks go in the glossary as new. Spell out shorthand, keeping the code's term in brackets. A proposal that contradicts the code's semantics is a correction, not a name to keep. Set identifiers (agents, packages, paths, functions) as code, in monospace: `agent_evals`, `evals/`.
4. Give every number a unit, a direction, a range, and its run. Say statistics in plain words: p99 is "the slowest 1 in 100", p50 is "the median". Label inferences on the slide ("likely", "not yet measured").
5. Show the hard parts.
    - Pseudocode. A dense mechanism gets a pseudocode panel, labelled "Pseudocode". Every code panel on every slide is pseudocode, API examples included. The only exception is a slide whose point is a feature of the language itself.
    - Traces. Surprising behaviour gets a trace on real values, with the divergent row highlighted and the proving test named. An easy-to-miss hazard gets a tagged callout (Race condition, Ordering, Lifetime, Breaking, Unmeasured) and one sentence saying what goes wrong and when.
    - About one callout per section. More and the reader stops seeing them.
6. Give strengths and weaknesses their own slides when the reader must weigh a choice. Each strength cites its proof. Each weakness comes from the user's plans and ends with a mitigation or "open". Use the same layout for both. A deck with only strengths is an advert.
7. Describe competitors fairly: what they do well and when they fit better.

## Phase E: Build
1. Build from a Slides artifact type.
2. Use the user's design system when there is one (i.e. any skill references or design templates). Otherwise, use a dark cover and closing, light content, and accents for headlines. Nothing under 24px. Body contrast at least 4.5:1.
    - Give the number to remember its own accent slide: one big figure and what it means. Orange unless the design system offers an accent.
    - Each colour must have one meaning and be colourblind-friendly: add labels.
    - All specific vocabulary must be consistent with one meaning.
3. Animate mechanisms but not decoration. The slides should be pretty and functional. Loop with a hold on the beginning and end states. Label it so a frame still survives a PDF export. Show the end state under reduced motion.

Flourish:
- Have a fun and relevant animation on the cover slide.
- Promote one of its actors to mascot in the following slides. It rides a rail along the bottom of each slide to mark the reader's place, and it finishes its own story on the closing slide.

## Phase F: Review
Spawn a critical readonly subagent with `references/cold-reader-prompt.md`. Modify the prompt as an operator and adapt the prompt to the deck as needed.

While it reads, check the rest yourself simultaneously:

1. Every fact, number, caveat, and source from the previous version survives, on a slide or in its speaker notes.
2. Simplify wording, but NOT content.
3. Fix typos and awkward grammar.
4. Every inference is labelled, and everything unmeasured is discussed as so.
5. Grep the slides, animations included, for off-vocabulary words.

Fix what the cold reader flags, then publish only the changed slides.

You, then, should do a final passover. Make sure no slide is too information dense: the ultimate presentation is informative AND easily digestible. Ensure it is that way.

## Outputs
The deck's link, private. A list of what's not verified. On a revision, one line per changed slide.
