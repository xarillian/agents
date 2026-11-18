# w-footer

A compact Pi footer with context, cost, cache reuse, and extension statuses.

In fullscreen mode, hover over the cache badge or `w-usage` status to open its card. Click to pin or unpin; Escape closes it. The editor keeps keyboard focus.

Keyboard access also works in regular mode:

- `/cache-history` toggles the cache reuse graph.
- `/usage-popup` toggles the active provider's usage card.

The usage card requires `w-usage` to be loaded. It shares that extension's current results, including reset countdowns, credits, and unavailable states; opening it does not fetch again. `/usage` still prints the full provider report.
