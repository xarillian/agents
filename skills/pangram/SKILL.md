---
name: pangram
description: Use when checking whether writing reads as model-written or human-written, when running the local `pangram` CLI, when interpreting an AI-detection score, or when a user asks whether their text will get flagged as AI. Also use before explaining why any detector returned the verdict it did.
---

# Pangram

`pangram` wraps Pangram Labs' detector. Three verdicts come back: human-written, AI-assisted, AI-generated.

It answers one question. How likely is this token sequence under a model asked to write this kind of document? It has no opinion about quality, and none about style.

## Usage

| | |
|---|---|
| Check a file | `pangram draft.md` |
| Per-segment | `pangram --windows draft.md` |
| Stdin | `xclip -o \| pangram` |
| Raw JSON | `pangram --json draft.md` |
| Pay again | `pangram --refresh draft.md` |
| Key | `PANGRAM_API_KEY`, in `~/.config/secrets.env` |
| Cost | ~$0.05 per 100 words, and the word count prints |
| Cache | `~/.cache/pangram/`, hashed on the text, so re-renders are free |
| Script | `~/.local/bin/pangram`, a local Python wrapper, not a packaged tool |

`.tex` strips to prose automatically. The numeric per-window score is `ai_assistance_score`; `confidence` is a word like "High" and will break a `%` format string.

## How it works

Two training choices explain nearly everything, including the failures.

**Mirror prompting.** Each human document is paired with a model asked to generate its match: same genre, topic, format, roughly the same length. Both halves of every pair are the same kind of document, so the classifier cannot learn that lists are AI, or that bullet points are, or that formal prose is. Those cues carry no information in the training set. What's left is which tokens got picked, and in what order.

**Hard negative mining.** Human documents that get wrongly flagged are fed back in and retrained on, repeatedly. That loop produces the very low false positive rate, and it also makes the errors lopsided.

## Reading a result

**A verdict of AI is strong evidence.** The published false positive rate is 0.0041%. Believe it.

**A verdict of human is weak evidence.** Mirror prompting captures how models write when prompted normally. Prompt one unusually and its output falls outside anything the classifier trained on, so it passes. Producing a false negative on demand takes about one attempt. "Human" means the text sits outside a model's default register, which is a much lower bar than a person having written it.

**Don't tune against it.** The score is worth having because rewording can't move it. Used as a dial, it stops being informative and starts being a target.

## Explaining a score

The strong temptation is to name the human-legible property that caused a verdict: this list was too tidy, that phrasing was too messy, the parallel structure gave it away. Resist it. Genre, format, and register were controlled for during training, so surface explanations are answered before they're offered, and they have a bad track record.

The reason the temptation is hard to see past: seeming-human is observable from the inside, and being improbable under your own sampling is not. When those two conflict, the introspective one is wrong.

So when reaching for "it scored high because of X," either mark X as an unchecked guess, or run the ablation. Change X alone, hold the rest fixed, and run it. Short of that, it's a story.
