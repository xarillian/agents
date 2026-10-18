---
name: developing-on-kaleidoscope
description: Use when building, changing, deploying, or checking an app in ~/dev that kaleidoscope serves or will serve on the tailnet, including work started from ~ and checking a change in the browser.
---

# Developing on kaleidoscope

Apps live in `~/dev`; kaleidoscope serves them on the tailnet from `~/server`. This skill covers the loop every app shares: find the app, change it, deploy it, check it where xarillian can see it, commit. An app's own skill holds what is particular to it. The server's skills (`~/server/.agents/skills/`) hold how it is hosted.

## Where xarillian is

Over SSH, never at the machine: from technicolor, their Linux desktop, or from monochrome, their iPhone. `$SSH_CLIENT` holds the address they came from; `tailscale status` names its device. From monochrome they type on a phone, so keep any command you hand them on one line.

They see only the live app, at `https://<service>.<tailnet>.ts.net`. A change that is not deployed is not done, and `localhost` means nothing to them.

## Deploy

```sh
cd ~/server/services/<service> && docker compose up -d --build
```

The build copies the working tree, uncommitted changes included. Never copy files into a running container instead: recreating it drops them, and the container stops matching its image.

Before a deploy that changes the schema, copy the live data out: stop the service, `docker cp <container>:<data path> <scratchpad>`, then deploy.

Confirm the deploy before checking it: the container serves what it was built with. Look for a string from the change, retrying for up to two minutes while it starts:

```sh
for i in $(seq 1 24); do curl -s http://127.0.0.1:<port>/<file> | rg -qF '<new string>' && echo served && break; sleep 5; done
```

"It still shows the old thing" almost always means the container predates the change: compare `docker inspect <container> --format '{{.Created}}'` with the files' times, then redeploy.

## Reaching the live app

kaleidoscope never resolves its own services: `tag:server` holds no grant to them. From here, use `http://127.0.0.1:<port>`.

Some apps learn who is asking from the `Tailscale-User-Login` header that `tailscale serve` adds. On `127.0.0.1` it is missing, and they answer `401`. Pass it to `curl` with `-H 'Tailscale-User-Login: xarillian@github'`. A browser cannot add it: check those apps in xarillian's browser on the tailnet name, or run the app's dev server as its README says, on a spare port. Never publish a dev server on the tailnet.

## Checking in the browser

Use Claude in Chrome. Load the core browser tools in one ToolSearch call first.

- **Pick the browser.** `list_connected_browsers` shows those connected, under generic names like "Browser 1". This machine's Chrome is the one on this computer (`isLocal`, `onThisComputer`); one that is not is xarillian's, today technicolor's. If several are not, ask which. When xarillian is at technicolor, use its Chrome so they can watch: select it, or ask them to connect it, and open the service's tailnet name. Otherwise, as from monochrome, use this machine's Chrome on `127.0.0.1:<port>`. If it is unclear where they are, ask.
- **Reload after every deploy.** Moving between a single-page app's routes keeps the old scripts in memory: run `location.reload()` and wait for the app to start.
- **Read state with JavaScript before screenshots.** Screenshots are for layout.
- **Return what you measured, not markup.** Claude in Chrome blocks a result holding a query string ("[BLOCKED: Cookie/query string data]"), and the page shows xarillian's data. Return counts, classes, booleans and route shapes, not `outerHTML`, names or raw ids.
- **Your tab is hidden.** It sits behind xarillian's, and screenshots and hovers bring it forward for under a quarter second. Hidden, `setTimeout` wakes at most once a second, chained timers once a minute after a few minutes, and `requestAnimationFrame` never fires. Real input from `computer` still reaches the page and fires its handlers. Screenshots and zooms can time out outright ("Page.captureScreenshot timed out"); measure layout with `getBoundingClientRect` and `getComputedStyle` instead.
- **Phone widths need a frame.** The window will not shrink below about 453px. Open a plain-text page on the app's origin, such as `/robots.txt`, append an `<iframe src="/<route>">` at 390×844, wait for the app to start inside it, and read the layout through `contentDocument`. The frame is a full app instance on the real data. Media queries see the frame's width, but desktop Chrome applies no iOS-only rules (`@supports (-webkit-touch-callout: none)`) and reports no safe-area insets; say so when a conclusion rests on them.
- **A call that awaits past 45 seconds fails** with "Runtime.evaluate timed out … The renderer may be frozen or unresponsive". The renderer is fine; the script was throttled. Start long work without awaiting it, keep results on `window`, and read them in later calls that each wait under 40 seconds. Count a second for every app timer: a 400ms delay takes one.
- **Globals that vanish mean the page reloaded**, often by xarillian. `performance.now()` gives milliseconds since load.
- **Close your tab** when done, and restore any window size you changed.

## The data is real

The live apps hold real data.

- Prefer checks that change nothing: read state, open and cancel a confirm.
- Undo what a test changes, and check it is back.
- Ask before anything that creates or deletes real data.
- Ask before anything that notifies a real phone.
- An app's own skill names its test data.

## Hand-offs

`sudo` needs a real terminal, which agents lack. Write the files, lint them, and hand xarillian the exact commands.

## Git

- Commit only when xarillian asks; push only when they ask.
- Each repo's `git log` sets its message style. Read it before writing one.
- No attribution trailers.
- Other agents may be working in the same repo. Changes you did not make are theirs: leave them alone and out of your commits.

## Toolchain

| Tool | From |
|---|---|
| `node`, `npm` | MacPorts, `/opt/local/bin` |
| `cargo`, `rustc` | rustup, `~/.cargo/bin` |
| `docker` | Colima, through the `kaleidoscope` context |
| `gh` | Not installed; ask before installing it (`installing-software`) |
