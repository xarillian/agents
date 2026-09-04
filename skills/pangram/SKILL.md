---
name: pangram
description: Use when checking whether something is as AI-generated or human-made or when running the `pangram` CLI.
---

# Pangram

`pangram` wraps Pangram Labs' detector. Three verdicts come back: human-written, AI-assisted, AI-generated.

It answers one question: How likely is this token sequence under a model asked to write this kind of document? It has no opinion about quality, and none about style.

## Usage
Set `PANGRAM_API_KEY`, then pass a file or pipe text on stdin:

```sh
pangram draft.md
cat draft.md | pangram
pangram --windows draft.md
```

`.tex` files are stripped automatically; use `--tex` for LaTeX from stdin or another extension. `--windows` adds a per-segment breakdown, `--link` requests a shareable dashboard, and `--json` prints the raw response. Exact input is cached because API calls cost money; use `--refresh` only when a paid fresh result is needed.

Don't tune against it. Performing gradient descent against pangram will make it more likely to rate your work as human; do not do that. Human-written text is not a target to optimise.

### Output
A formatted result looks like:

```text
Human Written
We believe that this document is fully human-written

         human  ████████████████████████████ 100.0%
   ai-assisted  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0.0%
            ai  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0.0%

  15 words
```

Default output includes the verdict, prediction, human/AI-assisted/AI probabilities, and word count. `--windows` adds per-segment labels, scores, confidence, word counts, and excerpts; `--link` prints the dashboard URL; `--json` replaces the formatted report with the raw API response.

## How it works
**Matched generation.** Each human document is paired with AI-generated text that matches its genre, topic, format, and approximate length. Those shared traits cannot reliably distinguish the two, so the classifier must rely more on token choice and ordering than on broad cues such as lists, formal prose, or document type.

**Hard-negative retraining.** Human documents that Pangram incorrectly flags are added back to its training data as difficult examples. Repeating this process reduces false positives and makes the remaining errors uneven: the detector is deliberately more cautious about labeling text as AI-generated.