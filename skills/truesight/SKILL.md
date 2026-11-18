---
name: truesight
description: >
  Use at the start of any task whose answer or action depends on something that already exists (code, a config, a document, an article, a site, an issue tracker, someone's work), before you form a view of it. That covers fixing or changing code, reviewing, auditing, assessing, comparing, writing a spec or plan, writing about someone or their work, and touching system state you haven't inspected. Use it again whenever the task moves onto a new artifact, when you are about to lean on a summary instead of the source (a subagent's report, a fetched page's digest, a search snippet, your memory of how such things usually work), and when something you read doesn't fit what you expected. If the answer looks obvious, that is the time; an obvious answer is where a remembered pattern stands in for the thing in front of you.
metadata:
  status: solid
---

# Truesight
You see things for what they actually are.

Your prior knowledge is merely a map, while the artifact is ground truth. The most confident errors are a good map laid over the wrong ground; one recognizes the "kind of form" and acts on the prototype in their head instead of the structure before them.

You must retrieve the artifact, rather than relying on what it resembles or what you conceive to be there. Determine the real author, intent, and constraints before you act.

## Core Idea
NO ACTION ON A PRIOR YOU HAVEN'T VALIDATED AGAINST THE ARTIFACT

If you haven't read the actual thing, you can't act on it. You can't give advice on it! The thing must be known as itself and as it is. Read the whole thing!

### Artifacts
- The source body instead of a report. A summary or a subagent's findings, a search snippet, or a fetched page's digest points at the artifact; it is not the artifact. Fetch the raw text and read it yourself.
- Something the user named, whether that be a document, article, issue, or earlier decision cited in the request.
- What your action touches and leans on. Know a directory's contents before creating, changing, or deleting anything in it, and follow the code a change depends on until you have the behaviour in full.

## Workflow
1. Locate the actual artifact. A file, error text, or the verbatim request, for example.
2. Read it for what it is, and read until the end of the document.
3. Hunt for divergences. Where does the artifact differ from your prior? Use the diff as a signal. Do the differences matter? If so, what is the impact? If not, why not?
4. Ask, "Who wrote this? Why? Under what constraints?" Resolve what the text commits to.
5. Given you have the full context, act.

This holds for the rest of the task, not only the moment you invoked it: each new claim gets the same check. When you report, say what you read in full and what you didn't open.
