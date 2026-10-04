---
name: mod-porting
description: Use when porting a feature between a pi package (`packages/`) and a Claude Code mod (`plugins/`), in either direction, or when building one side to match the other.
---

# Porting

A pi package and a Claude Code mod can do much the same things through different doors. Port the behaviour and the look, not the code: find each door on the other side, and say plainly where one is missing.

## Sharing code

Neither side imports from the other.

- A Claude plugin is copied into `~/.claude/plugins/cache` on install, so it reaches nothing outside its own folder.
- pi resolves a package's relative imports from its symlink in `~/.pi/agent/packages`, so a package reaches only its siblings in `packages/`.

Copy pure helpers, in the target's code style, and give each copy its own tests so the two cannot drift unnoticed.

## Doors

| Need | Claude Code mod | pi package |
|---|---|---|
| Row above the input | `ui.render` on `AbovePrompt` | `ctx.ui.setWidget(key, factory)` |
| Click | `Button` with `onPress` | `handleMouse` on the component; act on `press` |
| Highlighted text | `$.ui.selection()` | `hasActiveSelection()` on the fullscreen TUI, the text from the clipboard |
| Draft text | `$.prompt.read()` and `$.prompt.fill()`, cursor included | `getEditorText()` and `setEditorText()`, no cursor |
| Style the draft | `prompt.edit` returning decorations | a `CustomEditor` subclass that restyles drawn rows |
| Style a sent message | `ui.render` on `UserMessage`, any tree | `registerMarkdownTransformer`, Markdown only, width given |
| Recent replies | `$.session.messages()` | `ctx.sessionManager.getBranch()` |
| Clipboard | `$.ui.copy()` | `getNativeClipboard()`, which is absent on Linux; use the clipboard tools there |
| Theme colours | theme keys such as `briefLabelClaude`, `subtle` | `ctx.ui.theme`: `fg`, `bg`, `italic` |

## Claude Code mods

- `$` may only be passed to functions in the same file. Keep views in their own file, taking an element table and callbacks.
- `$.ui.selection()` keeps answering after a click or Esc clears the highlight. Withdraw on typing, and let an untouched offer expire.
- `claude plugin update` recopies a plugin only when its version changes. During development, uninstall and install instead of bumping the version.
- The test kit cannot follow `$.ui.focus` from a press, and cannot raise `prompt.edit`. Check those paths live.
- A `ui.render` tree validates by surface; the border of a box covers its own children, so draw an overlay after the box as a sibling.

## pi packages

- Mouse input never reaches `onTerminalInput`. Poll instead.
- A press can clear the transcript highlight before its release lands, so act on `press`.
- pi's Markdown keeps backslash hard breaks, runs of spaces and colour codes, which is enough to draw boxes. It drops escaped brackets (`\[a\]` shows `a`) yet leaves bare `[a]` alone; break a link with a zero-width space between `]` and `(`.
- Packages are tested with `node --test` on their pure modules; anything importing pi at run time is checked live.

## Checking it live

Drive the real app in `tmux`. Send SGR mouse sequences with `tmux send-keys -l`, for example `$'\e[<0;12;27M'` to press at column 12, row 27, and the same ending in `m` to release; a drag sends `\e[<32;…M` between them. Read colours with `tmux capture-pane -e`.

## Update this skill

If there are any breaking or inaccurate points in this skill, update it as part of the porting process so the next agent has a better starting point.

These edits won't be out of scope, but notify the user of them.
