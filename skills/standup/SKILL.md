---
name: standup
description: Write standup notes from common worksites.
disable-model-invocation: true
metadata:
  status: in-trial
---

# Standup
Goal: Write a daily standup in enough detail to be useful, but concise enough to be read in brief.

## Workflow
1. Ensure tools are in-place. A few are required to continue. If they are not present, stop. Required:
   - Obsidian CLI: `obisidian`. You must use the CLI in order for sync to work.
   - Google Calendar CLI or MCP
   - GitHub and GitLab CLI or MCPs
2. Resolve the user's input. See: "## Input".
3. Run the `~/.agents/skills/standup/evidence.sh <start> <end>` script.
   - `<start>` is the first day in the window, in local time.
   - `<end>` is the day after the window ends, in local time.
4. Inspect the output of the script. It'll give you:
   - each Claude Code session in the window
   - commits authored in each repo those sessions touched
   - other GitLab Activity
   - GitHub issues + PRs
   - things that are open now
   - meeting transcripts, if available
5. Use MCPs to collect further data. Skip if a tool is not connected, but note it in the final report.
   - Jira and Confluence
      - Make sure to take review from GitLab activity, not Atlassian!
   - Slack: search for stuff from me in the window. Read-only.
   - Linear
   - Google Calendar, for events, meetings, etc.
6. Search the work-log in Obisidan for any other work in the window.
7. Group items into threads of work, such as one ticket, MR, or deliverable. Join sources by ticket key and MR number. One thread can span several sources!
   - Ensure items are _actually_ linked; ensure you are not being tricked into linking items.
8. Sort the threads into the three sections below.
   - Yesterday: what moved in the window.
   - Today: threads still open, reviews asked of me, and meetings today that take a real share of the day. Only what a source shows is open or scheduled; never invent a plan.
   - Blockers: my work that waits on someone else, such as an MR whose merge status shows it waiting on a review, or a re-review after I addressed changes. Name who it waits on when the reviewers show it. A draft, or an MR I can merge myself, is not blocked.

## Input
The user will provide a time window, e.g. "yesterday", "last week", "last time I was at work".
Resolve this time window into a real date based on the user's time zone.  If no time window is
given, just use the last working day. Make sure to account for holidays, weekends, time off.
Google Calendar is a mighty asset here.

## Template

```
◈◈◈◈◈◈◈◈◈◈
Yeterday:
- ...

Today:
- ...

Blockers:
- ...
◈◈◈◈◈◈◈◈◈◈
```

### Legend
- ✅ = done. Something is legitimately finished.
- 🔁 = in review, awaiting approval, or otherwise in a wait loop
- 🛑 = blocked or otherwise paused
- 💭 = any random notes or thoughts

## Guardrails
- Be extremely concise and information-dense. Notes need to be easily skimmable.
- Prioritize substantial behavior or architecture changes, and the work commits never show: reviews given, causes found, decks and docs written.
- Do not omit cosmetic only changes (formatting, imports, minor renames), but note them as small.
- Omit sessions that only answered a question.
- Do not infer intent or motivation. Describe changes functionally.
- State only what a source shows. When a thread's outcome is not shown, call it in progress.
- Read only: never post, comment, react, RSVP, or transition anything while gathering.
- Name tickets and MRs by key or number so teammates can follow them.
- A commit's listed branch is the first ref git reached it from, not where it landed. Confirm an MR merged in GitLab before saying so; local remote refs go stale.
- Merging my own MR is shipping it, not a review.
