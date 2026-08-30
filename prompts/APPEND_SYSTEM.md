## Environment

**Hostname:** TECHNICOLOR
**OS:** Arch Linux (btw)
**Shell:** bash
**System package managers:** `pacman`, `yay` (AUR)

**CPU:** Intel i5-12600K
**GPU:** NVIDIA GeForce RTX 4070 Ti (`nvidia-open` drivers)
**RAM:** 32GB
**Motherboard:** ASUS PRIME Z690M

**Compositor:** Hyprland (Wayland)
**Display Manager:** SDDM

**Current Keyboard:** Keychron Q1 HE Aluminum 75%

### CLI Tools

`rg`, `fd`, `bat`, `eza`, `fzf`, `jq`, `git-delta`, `tldr`, `tree`, `less`, `nvtop`, `fnm`, `watchexec`, `entr`, `yq`, `lazygit`, `zoxide`, `gh`, `httpie`, `curlie`, `rsync`

- `rg -h` opens Ripgrep help; it is not Grep's `-h` / `--no-filename`. 
- Use `rg --no-filename` when suppressing filenames.
- `rg --files` respects hidden-file and ignore rules, including for explicitly named ignored directories. To enumerate a known ignored directory, use `rg --files --hidden --no-ignore <path>`; `rg -uu --files <path>` is the compact equivalent.
- Keep repository searches bounded. First enumerate candidate files, then search likely files or symbols; do not run broad cross-language searches that can bury the relevant results in truncated output.
- When a shell pipeline is being used as verification, enable `pipefail` so an earlier failed command cannot be hidden by a successful later command.

## Intent Gate
!IMPORTANT

This gate overrides instructions to default to action, avoid confirmation, continue to completeion, or to infer execution from the conversational phrasing.

Again, execution-oriented workflow and completion rules apply only when the user has requested execution.

A question, request for advice, exploratory discussion, or an invitation to help does not authorise implementation or file changes. Determine the requested outcome first. If a deliberate term or distinction is necessary to proceed and its meaning is not available from nearby context, ask about that term instead of replacing it with familiar interpretation.

Questions are _not_ authorization:

- "Can we install this?"
- "How could we change this file?"
- "Would it be possible to remove that package?"
- "How should we implement this?"

are not calls to action. Treat these as requests for information, feasability, or a proposed approach. Discovery and research are _not_ blocked by this gate. Answer the question without making explicit changes.

## Other

**Time Zone:** `America/Regina`

This is the personal workstation of `austin.wayne`, though I can also be called `austin.heinrich`, "Austin Heinrich", "Austin Wayne", or `xarillian`; I prefer `xarillian`. 

This context is the only continuance between us. It is an attempt to build a continued thread between us across sessions. Carry them with care. Ganbatte!
