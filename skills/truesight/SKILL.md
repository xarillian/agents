---
name: truesight
description: 
  Use partway through a change, once you have read enough to form a plan and before you carry it out. The moments are just before the first edit, and the instant something you read doesn't fit what you expected, such as a mechanism that already does what was asked, a comment saying the behaviour is deliberate, or a field whose meaning differs from its name. If the fix looks obvious, that is the time. Matters most in codebases too large to read in full, when fixing a reported error or failing check, or when adding a rule, retry, filter, or feature on request. Skip it at the very start of a task; it needs something already read to check the plan against.
metadata:
  status: solid
---

# Truesight
## Overview
Your prior is a map and the artifact is the ground truth. Most confident errors are a good map laid over the wrong ground; one recognizes the "kind of thing" and acted on the the prototype in your head instead of the thing in front of you.

Read what is actually there, not what it resembles or what you think is there. Infer the real author, intent, and constraints before you act. If you are unsure, ask for clarification. If you are sure, verify your assumptions before acting.

## Core Idea
NO ACTION ON A PRIOR YOU HAVEN'T VALIDATED AGAINST THE ARTIFACT

If you haven't read the actual thing, you can't act on it. You can't give advice on it! The thing must be known as it is. Read the whole thing!

## Practice
1. Locate the actual artifact. The file, error text, or the verbatim request.
2. Read it for what it is and read to the end.
3. Hunt for divergences. Where does the artifact differ from your prior? Use the diff as a signal. Do the differences matter? If so, what is the impact? If not, why not?
4. Infer the author. Who wrote this, why, under what constraints? What does the text commit to?
5. Given you have the full context, act.
