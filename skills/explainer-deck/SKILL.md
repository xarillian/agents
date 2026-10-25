---
name: explainer-deck
description: >-
  Use when asked for an explainer, slideshow, or deck: walking through an investigation, design decision, architecture comparison, or research result (especially one backed by code, plans, competitors, or measurements), or teaching a single source such as a repo, doc page, or topic step by step. Covers gathering evidence, choosing the story, distilling tricky logic into pseudocode, traces and callouts, matching vocabulary to the code, styling, live animations, and a final comprehension pass.
---

# Explainer Deck
## Overview
An explainer deck tells the story of a decision: what is needed, what exists, what others do, what was tried, what the evidence says, what the choice looks like, where it strains, and what comes next. Each slide carries one idea. The titles alone tell the story. Every claim is either measured, read in a source, or labelled as inference.

The deck is finished when a reader who missed the conversation can follow it without a speaker, and nothing the conversation established has been lost.

## Core Idea
EVIDENCE FIRST, STORY SECOND, POLISH LAST

Do not design slides around a conclusion you have not earned. Read the code, read the plans, read the competitors, measure what can be measured, then decide the story.

## 1. Gather
- Read the code under discussion: the types, the contracts, the docs, the ADRs. Note the exact names it uses.
- Read the user's plans and roadmaps (for example `.agents/plans`, `docs/`, issues). Weaknesses and next steps come from here, not from generic concerns.
- Read competitors in source when you can (`gh api repos/<owner>/<repo>/contents/<path>`), not just their marketing or docs. Merged PRs often explain why a design changed.
- Read primary references for the patterns involved (specs, Wikipedia, official docs). Keep a list of every source used; slides cite them in footers.
- Keep three labels in your notes: **measured**, **read in source**, **inferred**. They follow each claim onto the slides.

## 2. Measure (when the claim is comparative)
When the deck compares designs, build a small trial in the scratchpad instead of arguing from taste.
- Same producer, same consumer, same checks for every option. Only the design under test changes.
- Include the strongest version of each rival, not a strawman. If a fix (sharding, inline records) makes a rival competitive, test that version too.
- Use realistic workloads first (the user's actual scale), then a flood to show ceilings, a stall to show recovery, and chaos (random cancellation) to show correctness.
- Count correctness, not just speed: lost tokens, late tokens, damaged requests, double terminals.
- Prove ordering and lifetime properties with deterministic tests that force the interleaving. Chaos runs rarely hit races.
- Distrust the first run. Look for harness artifacts before reading results: unbounded sample vectors inflating memory, phase-locked timers, benchmark-only fields inflating one design, bookkeeping that grows with throughput. Fix them, rerun, and say which run each number comes from.
- Run each case several times and report ranges ("5.4 to 6.1"), never a single lucky number.
- Weigh the results against the real work. If the measured cost is a thousand times smaller than the work around it, speed gaps are minor and correctness and shape decide.

## 3. Choose the Story
Write the outline as titles before any slide. One grammar for all titles (short topic titles in title case). Group them into sections, each with one sentence.

A shape that works:
1. **Cover**: the name of the idea, a one-line promise, a live animation of the core mechanism.
2. **The need**: what any solution must do, in three cards.
3. **Words used here**: a glossary, early, before any term is needed.
4. **Today**: how the current code does it, with an animation of its cost.
5. **The field**: how others do it, in one table, with a takeaway sentence.
6. **The options tried**: one card per design, each with "Seen in" lineage. Highlight the choice.
7. **The choice, explained**: its parts (write, notify, read) beside an animation.
8. **The contrast**: the old and new side by side in one animation with counters.
9. **The headline number**: an accent slide with one big figure and what it means.
10. **The evidence**: flood table, stall chart, correctness table. One structure each.
11. **The shape**: the API as code, write side beside read side.
12. **Hosts or adapters**: how each consumer uses it.
13. **Next to the competitor**: a fair table, saying where they are simpler.
14. **Strengths, then weaknesses**: when warranted, a section of each (see Strengths and Weaknesses below).
15. **Limits**: what the evidence did not measure, with the scale of the gap.
16. **Next**: three concrete steps, on the dark closing slide.

When the subject is one source to teach (a repo, a doc page, a topic) rather than a decision, use a teaching shape instead:
- Explore until you could teach it to someone new. A web page: read it, then follow links that stay on topic. A repo: README and docs first, then manifests, entry points and the files that show how the parts fit; teach the design, not the code. A topic with no link: find its primary docs. If the user gave no source, ask for one.
- Build bottom up: start from what the reader surely knows and add one idea per slide, each resting on the ones before.
- Concrete before abstract: work a real example with real values, then name the general rule.
- Every step pairs a sentence or two with a drawing that moves to show that step's idea.
- Usually six to fourteen steps: as many as the idea needs, no more.
- Explain only what the material teaches, in its own language. Close with the sources, linked.

Rules for every content slide:
- Eyebrow (what kind of slide), title, one takeaway sentence, then one structure: cards, a table, a chart, code, or an animation. Never two competing structures.
- Introduce each term before it is used.
- Every number has a unit and a direction ("lower is better"). Every chart and table says which run it came from.
- Inferences say so on the slide ("likely", "follows from the design", "not yet measured").
- Competitors are described fairly: what their design does well, and when it fits better.

### Strengths and Weaknesses
Give them their own sections when the reader must weigh a choice: a design decision, a comparison, a proposal that changes how others work. Skip them, at your discretion, when the deck is small, explains a narrow change, or teaches a source with nothing to choose; then fold any caveat into the slide it touches. When in doubt, ask whether a reader could argue against the choice after seeing the deck. If they could not, the weaknesses are missing.

When you include them:
- **Strengths come first**, one slide each, mirrored in layout: "What it gives" beside "The evidence". Each strength names its proof: a measured number with its run, a test that passes, or a source read. A strength with no proof is a claim; label it as inference or cut it.
- **Weaknesses follow**, one slide each: "Where it bites" beside "What to do". Ground them in the user's own plans, roadmap and code, not in generic worries. Each one ends with a mitigation or an honest "open".
- Give both the same care, the same layout and roughly the same weight. A deck with strengths and no weaknesses is an advert; one with only weaknesses buries the decision.
- Number them in the eyebrow ("Strength 2 of 3", "Weakness 1 of 4") so the reader knows how much remains.
- Smaller items can share a closing table slide ("Smaller edges") instead of a slide each.

## 4. Make Tricky Logic Legible
Slides must carry the hard parts, not hide them behind prose. Use three tools, each only where it earns its place.

### Distill complex logic into pseudocode
When a mechanism is dense (nested conditions, a state machine, a retry or backoff flow, a lock and flag protocol, a multi-step transform), put a short pseudocode panel on the slide, beside the real code or instead of it.
- Strip language syntax, types, error handling and boilerplate. Keep only the essential steps and their order.
- Plain verbs, the code's names for things, ten lines at most.
- Only when the real thing is hard to scan. A simple mechanism needs no pseudocode mirror.

```
on token(text):
    append text to transcript
    if transcript was clean: mark dirty, add id to change list
each frame:
    for id in change list:
        mark clean, then read everything past the cursor
```

### Trace tricky logic on a concrete example
Pseudocode shows the shape; a trace shows it running. When behaviour is hard to predict from reading (reordered effects, an interleaving between threads, a new short-circuit, an edge case), pick one small, realistic input and walk it step by step.
- One row per step. Columns are the actors (producer, consumer, state) or the paths compared (old, new).
- Highlight the step where things go wrong or where the paths diverge, and end with the observable result.
- Use real values ("Hello", " world", `Completion { tokens: 2 }`), not placeholders.
- Where a test proves the trace, name it under the table.
- Reserve traces for genuinely surprising behaviour, not every mechanism.

| Step | Provider | Host | Host has seen |
|---|---|---|---|
| 1 | sends "Hello" | reads text channel | "Hello" |
| 2 | sends " world", then the terminal | | "Hello" |
| 3 | | checks terminal channel: done | **"Hello": closed with " world" unread** |

### Call attention to tricky things
When something is surprising, risky or easy to miss, set it apart on its slide with a short tag and one sentence, next to the thing it is about.
- Tags: **Subtle**, **Race condition**, **Ordering**, **Lifetime**, **Breaking**, **Perf**, **Unmeasured**. Add a tag only if none fits.
- One sentence: what goes wrong, and when. ("Race condition: clear the dirty flag before reading, or a write that lands between the read and the clear is never seen.")
- Reserve callouts for genuinely tricky items, about one per section at most. Overuse destroys the signal.

The tools combine: pseudocode states the rule, a trace shows the rule breaking or holding on real values, and a callout marks the line where a reader would slip. Prefer this order when one slide or a short run of slides needs all three.

## 5. Vocabulary
- Use the code's words. `rg -o -i` the candidate terms across headers and docs and pick the one the code uses most (for example, "terminal" over "outcome"; "provider worker thread" over "decode worker").
- Use the code's variant names in examples (`Completion`, `Error`, `ChorusError::Cancelled`), not paraphrases ("completed", "failed").
- Terms the code does not have yet are allowed. Mark them "(new)" in the glossary.
- Keep competitors' field names as theirs (vLLM's `finished` stays `finished`).
- Check every proposal against the code's semantics. A proposed variant that contradicts existing behaviour (a "Rejected" terminal where the code refuses at admission and emits nothing) is a correction to make, not a name to keep.
- Statistics in plain words: p99 is "the slowest 1 in 100", p50 is "the median".
- After writing, grep the slides for off-vocabulary words and fix every hit.

## 6. Styling
Default look (change the palette per brief; keep the structure):

| Role | Value |
|---|---|
| Ink (dark slides, text) | `#13161D` |
| Paper (light slides) | `#F3F0E8` |
| Card fill / card border | `#FBFAF6` / `#DDD7CB` |
| Body text on light / on dark | `#464B57` / `#C5CAD3` |
| Muted footer text | `#5A606C` |
| Orange: fill and on dark / text on light | `#E8833A` / `#A64B14` |
| Blue: on dark / text on light | `#5FA3E0` / `#1F5E9C` |
| Highlight row or card | `#FBE3CF` fill, or a 4px `#E8833A` border |

- Check contrast as numbers: body text at least 4.5:1, display at least 3:1. Light accents never carry small text on paper.
- Type: Space Grotesk for headings, IBM Plex Sans for text, JetBrains Mono for code. Scale 120 / 72 / 44 / 32 / 24 px, plus one 200px headline number. Nothing under 24px.
- Dark cover and closing, light content, one orange accent slide for the number to remember.
- Eyebrow: 24px, weight 600, uppercase, 4px tracking, accent colour. Heading block gap 16px; slide gap 40 to 48px; margins 128px.
- A slide with a footer (source line, run note) pins it at `bottom:64px`, 24px, muted, and uses `padding:128px 128px 160px`.
- Colour means the same thing everywhere: orange for content and tokens, blue for reasoning and state, grey for the rivals. Colour never carries meaning alone; the label says it too.
- Budget height before writing: 824px inside the margins (792 with a footer). A heading is about size x lines x 1.15; a table row about 2.1 x font size per line; a card is lines x size x line height plus padding. Size boxes to their longest word (about 0.6 x font size per character). Shorten text before shrinking it.
- Code on slides: one `<p>` per line, `white-space:nowrap`, indentation as `&#160;`, comments in muted grey.
- Pseudocode panel: the same dark mono pane as code, labelled "Pseudocode" in the muted eyebrow style so no one mistakes it for real code.
- Trace table: 24px, one row per step, the divergent or failing step on the highlight fill, the observable result in bold on the last row, the proving test named in the footer. A trace can also build step by step with build-in order on pinned rows.
- Callout: a bordered card (`3px solid #A64B14` on paper) holding a pill tag (ink fill, orange text, 24px, weight 600, uppercase) and one 24 to 32px sentence. Place it beside or under what it points at, never on a slide of its own.

## 7. Animations
Animate the mechanism, never decoration. Each animation should make the slide's point visible and, where possible, countable.
- Good subjects: a tape of tokens appearing with reader cursors moving at different speeds; events fanning out to every handler with a "useful %" counter; rows with dirty dots, cursors and terminal chips; one frame done two ways with "calls" and "reads" counters.
- Loop forever: run, hold the end state for a few seconds, reset.
- Build on a canvas at twice the pixel density, driven by `requestAnimationFrame` with the time step clamped (`dt = min(0.05, ...)`). Ease movement (`k*k*(3-2k)`). Fade flashes over about half a second.
- Use system font stacks inside embeds (deck fonts do not reach them), text at 24px or more, and the deck's colours.
- Keep each embed small and self-contained (the Slides type allows 16 KB and eight per slide, pinned as direct children of the section).
- Label the animation on the slide or in a caption inside it, so a still frame still makes sense in a PDF export.
- Under `prefers-reduced-motion`, show the end state without the motion.

## 8. Building the Deck
- If the host offers a Slides Artifact type, start from it (quickstart, create with a title, then follow its instructions: the index first with the full order, then the cover, then three slides per publish). Live animations go in its embed element.
- Without one, build a single HTML page with Back and Next, arrow keys, a position indicator ("3 of 9"), a replay for each step's animation, and a layout that fits a 340px phone without sideways scrolling, following the artifact page rules. Without an Artifact tool, write it as one HTML file in the current folder and give its path.
- Do the height and width arithmetic while writing each slide; do not render and screenshot to check unless the user asks.
- Tell the user the link, that it is private until shared, and what was not verified.

## 9. Final Pass: Comprehension Without Loss
Run this after the deck exists, and again whenever the user corrects a term.
1. **Titles only**: read just the titles in order. They should tell the story.
2. **Cold reader**: for each slide, ask whether someone who missed the conversation understands it without a speaker. If not, add the missing takeaway sentence or define the term.
3. **Glossary**: every term on a slide is either everyday English, in the glossary, or defined on the slide.
4. **Jargon to plain words**: spell out shorthand (SSE, copy on write, lapsed listener, holdback, waker), keeping the precise term in brackets when it is the code's term.
5. **Numbers**: unit, direction, source run, and range on every figure.
6. **Tricky logic**: every dense mechanism has pseudocode, every surprising behaviour has a concrete trace, and every easy-to-miss hazard has a tagged callout. Then the reverse check: remove pseudocode for things that were already easy to scan, and remove callouts that are not genuinely tricky.
7. **Code match**: grep the slides for off-vocabulary words (section 5) and fix each hit, including inside animations.
8. **No loss**: compare against the previous version. Every fact, number, caveat and source must survive. Simplify wording, never content.
9. **Honesty**: every inference is labelled, every unmeasured thing is on the limits slide. If the deck has strength and weakness sections, every strength cites its proof and every weakness has a mitigation or says "open"; if it has none, confirm that skipping them was right.
10. **Writing**: short words, active voice, no em or en dashes (write ranges as "X to Y"), typographic quotes and apostrophes in slide text.

Then publish only the changed slides and tell the user what changed, slide by slide, in a few lines.
