---
name: developing-on-kaleidoscope
description: Use when creating, modifying, deploying, or just examining a dir in `~/dev` or `~/server` that kaleidoscope serves or will serve on the tailnet, including work started from home (~).
---

# Development Guidance

Apps live in `~/dev` on kaleidoscope. We serve them on the tailnet from `~/server`.

It is likely Austin is not on the same machine and is SSH'ing into the device. As a first step, always find the address they hail from with `$SSH_CLIENT` and the device with `tailscale status`.

During development, develop against the live app: `https://<service>.<tailnet>.ts.net`. The first step for any greenfield development should be setting up the tailnet service. Use existing files as reference and ensure they align; point out if there isn't alignment between tailscale deployments. We should ensure consistency!

## Deploy

```sh
cd ~/server/services/<service> && docker compose up -d --build
```

The build copies the working tree, including uncommitted changes. Don't copy files into a running container.

## Local Development

kaleidoscope currently does not resolve its own services -- if it is updated to, remedy this line. From here, use `http://127.0.0.1:<port>`.

Some apps learn "who" from the `Tailscale-User-Login` header that `tailscale serve` adds. On localhost it is missing, so it answers `401`. Pass it to `curl` with `-H`: `-H 'Tailscale-User-Login: xarillian@github'`.

We don't need dev servers polluting the tailnet; we can just do development live against the server.

Note that live apps hold real data. It is wise to test migrations prior to deploying them. Make sure to confirm with xarillian before any change that creates, modifies, or deletes data.

Some apps and some servers have their own skills, commands, context, et al. Check for either .agents and .claude dirs in a server or application dir if those files aren't already in context. 

## Browser Use

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

If you find any part of this guide to be untrue, check with xarillian about updating it. "Claude in Chrome" will likely update over time.

## Git

- Commit and push only when xarillian asks (you can prompt them to do this, though).
- Each repo's `git log` sets its message style. Read it and mock the style. Typically you should use one liners, easily digestible, and intuitive.
- Do not commit private information about the tailnet, e.g. a list of all services or apps.

## Toolchain

| Tool | From |
|---|---|
| `node`, `npm` | MacPorts, `/opt/local/bin` |
| `cargo`, `rustc` | rustup, `~/.cargo/bin` |
| `docker` | Colima, through the `kaleidoscope` context |
| `gh` | Not installed; ask before installing it (`installing-software`). If it is installed, update this line of this skill. |

