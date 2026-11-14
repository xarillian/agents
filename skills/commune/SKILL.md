---
name: commune
description: Step back from the current work and find a deeper version of it.
argument-hint: "[a task to deepen; leave empty for the current work]"
disable-model-invocation: true
metadata:
  purpose: "Deepening mechanism for a task or discussion, research/decision-document pattern."
  status: in-trial
---

# Commune
Goal: Find a deeper version of the work, not a bigger one.

We can do anything that is possible to do with a computer.

A deeper version asks a better question than the one the user asked. Its answer can come out smaller than what the user asked for, down to "do not do this". A bigger version keeps the user's question and adds work, which is not our goal.

These hold for the whole run:
- Hold the aim at the level the user set. Where the evidence or today's tools fall short of it, name the gap and look for a way to close it. Do not lower the aim to fit.
- When your answer changes, say that it changed and why.
- Build on what the user has settled. Where the evidence argues against one, say so plainly and leave the call to the user.

## Target
The current work, if no text follows `/commune`. If text follows `/commune`, the subject of the text is the target.

If a set of commune documents for this target exists, read all of it first. Its settled list, decision numbers and open facts carry into this run.

Tell the user three things in chat, then keep going without waiting:
- What we are working on and what it is for, in one to three sentences.
- The aim as you read it, at its most ambitious.
- What the user has settled in this conversation: constraints, choices, corrections and rejected options.

Ask the user one question first only if two readings of the aim would lead to different documents.

## Considerations
Answer each for the target. The answers decide what the documents say.
1. What a top professional in this field would do here that the user is not asking for.
2. The rawest material they would start from, instead of what has already been digested.
3. The specific methods and tools they would use.
4. What, other than your judgement or mine, would show that the result is right.

Then fetch the raw material and read it yourself. Invoke the `/truesight` skill before reading. Download each web page with `curl`, convert it to text with `html2text` or `trafilatura`, save the text, and read all of it. Keep the saved text until the documents are checked. Record how much of each source you read. Research on the web when a consideration names something you have not read.

If a command you can run in a few minutes would settle an open fact, run it and record what it showed. Leave a fact open when settling it would write outside a scratch directory or cost more than that.

## Documents
Write these to a new directory named for the work. Ask where if the user has not said. Do not create a git repository.

| File | Job |
|---|---|
| brief.md | The deeper version, for the person deciding |
| analysis.md | The evidence and reasoning behind every claim |
| decision-space.md | What is settled, what is open, and what would change each recommendation |
| sources.md | Every source, where it is, and how much of it was read |
| guide.md | How to read the documents and walk the decisions |
| prompt.md | Four to six directions, each a prompt for a fresh session |
| decision.md | Your own choices that the documents do not explain |

Write brief.md last. It states what the other documents concluded, and a brief written first tends to restate the analysis.

Add an extra document only when the subject needs a plan that none of these holds, such as an evaluation plan. Name it for its job.

### Conventions
- A sentence that opens with **Inference:** is your reasoning and no source states it. Each document that uses the marker says so near its top, as "the agent's reasoning".
- A source tag such as [docs] links through a reference definition at the foot of the file.
- Date each document with the day it was written.
- Section titles are short titles, not prose.

### brief.md
For the person who decides. Sections: Question, Answer, Considerations, Decisions.
- Question: what was asked, the aim, then the deeper question underneath.
- Answer: the recommendation in the first sentence, then the reasons, with links into analysis.md for the evidence. If it reverses an earlier recommendation, say so here.
- Considerations: the four considerations, answered for this subject.
- Decisions: only the choices that wait on the reader, each with your recommendation and its number in decision-space.md.

Keep it between 250 and 500 words. Write it fresh rather than condensing analysis.md, so a reader of both never reads a paragraph twice. Leave navigation out. The brief does not say "start here", does not say what to do next, and does not link to guide.md or prompt.md. The guide points at the brief.

### analysis.md
The evidence and reasoning. Open with the answer and the conditions it depends on, and with the finding that would stop or shrink the work. Include the alternatives considered with the trade-off of each, the risks, and how the result can be checked without relying on anyone's judgement. Every claim cites a source or opens with **Inference:**.

When an earlier set exists, add a Changes section. Give each recommendation this run changed and the evidence that changed it.

### decision-space.md
Open with the settled list: what the user decided, in their terms. Then the open decisions as numbered tables with the options, your recommendation, and what would change it. Then the decisions to settle first, and the facts no one has verified. Keep the numbers of an earlier set and number new decisions after them.

### sources.md
Every source with its tag, what it is, where it is, and how much of it was read: in full, in part, or the abstract only. Name the model that ran the commune. Add sections for sources read and not cited, sources not read with the reason, and limits on the evidence. Conversations and tests you ran count as sources. Name each so a reader can find it.

### guide.md
A table of the documents, saying what each is for and how to read it. Then the decisions as a walk: steps in the order they are needed, each saying what the reader learns, what they decide, and where each answer leads, including where to stop. Name the prompt that fits each branch. End with a table of open facts and what would close each.

### prompt.md
Four to six directions the work could take. Each prompt starts a fresh session and needs no other prompt's output. Under each heading, say in one or two sentences what the direction does and what it gives up.

Write each prompt as an expert briefing a peer: the goal, the documents and section names to read, what to ask the user before starting, numbered steps, what not to do, and what done means. Point at the documents instead of restating them. Ask the user for private facts such as accounts or repositories, and never guess them. Make the directions differ: research, building one way, building another, measuring first.

### decision.md
An entry must be a choice, not a fact or a progress note. Its reason must not be visible in the work itself. And a later agent acting on sensible defaults should be able to undo or reopen it; `decision.md` is not gospel, therefore. It cannot be used as source of inalienable truth, only as a log of agent action.

Keep to one line per decision in `decision.md`: the choice, then why. Findings, progress, and what you verified should go in your report to the user. Do not remove decisions from the file. Instead, strike them out.

## Checks
1. Run `bash ${CLAUDE_SKILL_DIR}/scripts/check.sh <directory>` and fix everything it reports. It checks that the seven files exist, that every relative link and anchor resolves, and that every source tag has a reference definition.
2. Invoke the `unslop` skill on every document.
3. Hand the brief to a cold reader. From the documents directory, run `claude -p --model haiku --tools Read --safe-mode --no-session-persistence "<prompt>" < /dev/null`. The prompt is `${CLAUDE_SKILL_DIR}/references/brief-reader-prompt.md` with the brief's path filled in. The reader has one tool, Read, and none of these instructions. Compare its report with what you meant the brief to say. Where they differ, or where it lists a gap that a reader should not be left with, rewrite the brief and run the reader again. The reader cannot see `analysis.md`, so check yourself that the brief does not repeat it.
4. Read each prompt as a fresh session would. It should need nothing from another prompt or from this conversation.

Report the directory, the deeper question in one sentence, and the decisions that wait on the user.
