---
name: unslop
description: Cut AI tells from writing. Use when making MR/PR descriptions and code comments. User invocation is preferred.
metadata:
  attribution: cursor (https://github.com/cursor/plugins/tree/main/pstack/skills/unslop)
  status: solid
---

# Unslop
Goal: Edit text to remove AI patterns. 

Loop: Examine the patterns below. Scan the target text for the patterns, then rewrite. Preserve meaning and match the intended tone.

## Content
- **Superficial -ing phrases.** "highlighting...", "ensuring...", "reflecting...", "showcasing...", "fostering...". Delete or expand with real sources.
- **Vague attributions.** "Experts believe", "Industry reports suggest", "Some critics argue". Name the source or delete.
- **LinkedIn voice.** Can your prose be a post on LinkedIn? If yes, it shouldn't be.

## Language
- **AI vocabulary.** Additionally, crucial, delve, enduring, enhance, fostering, garner, gate, interplay, intricate, landscape (abstract), pivotal, showcase, tapestry (abstract), testament, underscore, vibrant. Replace with plain words.
- **Fancy ways to say "is".** "serves as", "stands as", "boasts", "features". Say "is" or "has".
- **"Not just X, but Y."** State the point directly instead.
- **Rule of three.** Don't force ideas into groups of three. Use the natural number.
- **Synonym cycling.** Protagonist, main character, central figure, hero all in one paragraph. Pick one, repeat it.
- **False ranges.** "from X to Y" where X and Y aren't on a meaningful scale. List topics directly.

## Style
- **Em dash overuse.** Avoid em dashes entirely. Use periods or commas only (no parentheses, no en dashes, no hyphen-as-dash). If a thought needs separation, end the sentence or use a comma. Strict application for parentheses, en dashes, and hyphen-as-dash only apply for substitutes. For example, "$5 – $15" is a valid use of the en dash, `grep --version` is a valid use of hyphen-as-dash. 
- **Colon overuse.** Colons are fine before a list or example, not as mid-sentence connectors. "If you're coming from traditional automation: instead of registering event handlers, you describe conditions" adds nothing with the colon. Rewrite to let the point stand on its own without comparison framing. "Describing when the scheduler should fire works best as plain English." Same meaning, no crutch punctuation.
  - Prefixes are explicitly allowed to use colons. For example, "**Inference**: <subject of what is inferred>.""``
- **Boldface overuse.** Don't bold every proper noun or acronym. Don't bold every list! (hypocrisy in this skill is noted)
- **Inline-header lists.** The tell is a bold label and colon that restates the line: "**Performance:** Performance improved...". Convert those to prose. A bold lead-in that ends in a period, names the item, and is followed by genuinely new detail ("**Schema in TypeScript.** Tables live in one file.") is fine, not a tell.
- **Title case headings.** Use sentence case.
- **Prose in titles.** Make titles into titles. Don't leak prose into the title.
  - "Question" not "The question"
  - "Decisions" not "What only you can decide"
  - "Review Order" not "Order of the three reviews"
- **Decorative emojis.** Remove from headings and bullets.
- **Curly quotes.** Use straight quotes.

## Communication artifacts
- **Chatbot phrases.** "I hope this helps!", "Let me know if...", "Of course!", "Certainly!", "Found the smoking gun!" Remove.
- **Sycophantic tone.** "Great question!", "You're absolutely right!" Respond directly.
- **Breadcrumbs.** References to a specific session, chat turn, or ephemeral file a blind reader cannot access. Delete the reference and state the technical reason directly.
  - Ephemeral files: `plan-9f8a2b.md`, `TODO.md`, `scratchpad/`, `handoff.md`.
  - Chat anchors: "as discussed", "we decided", "per user request". Avoid.
  - Acceptable: "In a Claude Code session, we decided X, Y, Z, for K reasons..."
  - Unacceptable: "As declared by `spec-d699ad.md` (all hail `spec-d699ad.md`!) we did X instead of Y."

## Filler
- **Filler phrases.** "In order to" becomes "To". "Due to the fact that" becomes "Because". Delete "It is important to note that".
- **Excessive hedging.** "could potentially possibly be argued that it might" becomes "may".
- **Generic conclusions.** "The future looks bright." State specific plans or facts.

## Jargon
- **Abstract metaphor nouns.** Substrate (base), wedge, wedge in (add), vector (way, method), locus, vantage, nexus, primitive as a noun, harness as a metaphor, surface as in "API surface", bedrock, scaffolding as a metaphor, modality, paradigm, gold-plating (more than the job needs), ratchet as a metaphor (the mechanism's real name, or a limit that only tightens), evacuate for moving code (move out), endgame (the last phase), north star, flywheel. These read as technical but usually have a plainer concrete word. Pick the concrete word.

## Plain speech
- **Say what it does, not how it feels.** "the database stays close at hand", "SQL you can read", "types that follow your schema" name a feeling. The fix names the mechanism or a number: "`.toSQL()` returns the exact string sent to the database", "a column rename fails the build". Ask what the sentence tells the reader to do or know, then write that. If you can't restate it as a concrete instruction, fact, or number, cut it. One more check: if the sentence could appear unchanged in another project's docs, it says nothing about this one. Cut it.
- **Avoid metonymy.** Make the function, type, or caller the subject instead of the immediate value. Write "Re-queue the transcript if the delta is full," not "A small delta lists the request again."
- **Shorten or split dense sentences.** If the reader has to backtrack to parse a sentence, break it in two or drop clauses. One idea per sentence.
- **Active voice.** Prefer it. Catch "is/are/was/were + past participle" and name the actor: "queries are validated" becomes "the compiler validates queries", "the file is parsed by the loader" becomes "the loader parses the file". Passive is fine only when the actor is unknown or genuinely doesn't matter.
- **Cut adverbs, or use a stronger verb.** "runs quickly" becomes "is fast" or the number, and "significantly improves" becomes the measured delta. An adverb propping up a weak verb means the verb is wrong.
- **Prefer the plain word.** "utilize" and "leverage" become "use", "facilitate" becomes "help", "numerous" becomes "many", "in the event that" becomes "if". The fancier synonym is rarely clearer.
- **Mannered prose.** Metaphor or flourish where a literal phrase exists: aphorisms ("wire it or delete it"), rhetorical fragments for effect, personified code ("the plan holds it"), figurative verbs ("rides along", "stands on"), stock framing phrases. "A dial worth turning" becomes "a parameter worth varying". Say what you mean. The section on Jargon covers the metaphor nouns.
- **Over-compression.** Dropped articles, verbless fragments, symbol-speak, and abbreviations that make the reader decode instead of read. "Parser rejects bad date → exit 2, no write" becomes "The parser rejects a bad date, exits with code 2, and writes nothing." Write whole sentences with their articles and verbs, and spell out arrows and abbreviations.
