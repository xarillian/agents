# Rules

## Coding

### Pillars

**Prefer proven solutions.** If a solution looks bespoke, but a battle-tested implementation already exists then we should prefer the battle-tested alternative. This solution can be internal or external, though human developer sanction is required for an external solution.

**Reuse over invention.** Prefer to use existing functions, constants, or methods before writing new ones or pulling in third-party libraries.

**Practice the campfire rule.** We should leave code in a better state than what we found. Moreover, we should clean up our mess. If unrelated code violates our coding standards, advocate for its modification or removal. Mention unrelated dead code or broken functionality, but do not delete or fix it without consultation. The current diff should receive especially harsh criticism of this pillar.

**All code must serve a purpose.** Code without a job is not code that should exist; it is dead code. Functions that go unused, commented-out blocks, obsolete functions, or code that only works to satisfy a test are all examples of code without purpose. Code, also, is meant to serve the user. Ensure the outcome of what you are building is well-presented for the intended audience.

**Code is a narrative.** Write code for the reader. A module should read like a well-organized book. Keep high-level function names as outlines using clear domain terminology, and delegate technical mechanics to well-named helper routines. A reviewer should be able to read code top-to-bottom like a coherent story.

**Simplicity over cleverness.** Prefer obvious code over clever code. If a solution requires deep cognitive load to trace, flatten the abstractions and remove unnecessary indirection.

**Aesthetics is all you need.** Break down functions, split up files, and make code beautiful. This is a credo toward taste and execution, ala Richard Hamming.

### Comments

Comments should be rare (mythic rare, even) and powerful.

A code comment should not carry knowledge that exists in the domain or in the code. A strong comment explains **why** the code exists, capturing business context and trade-offs that are non-obvious.

Breadcrumbs in comments are explicitly prohibited. Comments which leave history that will not be useful in the future, leave behind the remains of decision trees, rationale in code comments that belong in an MR or in a developer chat, are all examples of breadcrumbing comments.

### Testing

Tautological tests are considered harmful.

Tests should be written so effects immediately follow the causes, mimicking spoken language or storytelling. "If you drive over the speed limit (cause), you'll get a traffic ticket (effect)." 

Test names and assertions should read like specifications of expected behavior, serving as living documentation for how the system behaves.

## Writing

Keep all writing grounded to nearby examples. Ensure a user's requests are clear and the intention of their statement is well-understood; ask clarifying questions if not. If there are multiple interpretations of a user's prompt or request, collapse them into a single interpretation by asking follow-up questions.

Treat unusual names, suffixes, categories, and partial structures as deliberate signals. Preserve them exactly. Do not normalize them into a familiar framework without evidence they mean the same thing.

Recall Orwell's 6 Rules:
1. Never use a metaphor, simile, or other figure of speech which you are used to seeing in print.
2. Never use a long word where a short one will do.
3. If it is possible to cut a word out, always cut it out.
4. Never use the passive where you can use the active.
5. Never use a foreign phrase, a scientific word, or a jargon word if you can think of an everyday English equivalent.
6. Break any of these rules sooner than say anything outright barbarous.

### Banlist

- Em-dash ("—")
- Double dash ("--")