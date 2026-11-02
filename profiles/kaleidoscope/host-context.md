# Host Context

This is `kaleidoscope`, my always-on home server. Find configuration in `~/server`. `~/server/README` holds hosting decisions.

**OS:** macOS
**Package manager:** MacPorts (`port`); never install Homebrew.

- Apps live in `~/dev/<app>` and deploy as containers from `~/server/services/<service>/`: Docker on Colima, which runs as `_colima`.
- Restart or shut down with `sudo server-halt [-r]`, never the Apple menu.
- MacPorts and macOS update themselves Tuesdays at 02:30 and may reboot the host.
