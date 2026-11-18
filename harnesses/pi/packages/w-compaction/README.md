# w-compaction

Uses native OpenAI compaction when Pi runs `/compact` or compacts automatically.

- `openai` with `openai-responses`: calls the first-party `/responses/compact` endpoint.
- `openai-codex` with `openai-codex-responses`: sends Codex's native `compaction_trigger` through Pi's authenticated Responses stream.
- Other providers retain Pi's normal compaction.
- Unsupported OpenAI endpoints, provider failures, timeouts, and invalid native results print `using fallback compaction (Pi)` before using Pi's summarizer. Interactive/RPC sessions receive a warning; headless sessions write to stderr. Cancelling compaction cancels it, without starting fallback.

Pi still chooses when to compact and which recent messages to keep. This package compacts the older prefix and preserves the provider's entire returned window before those recent messages. `/compact` instructions are included in the native request.

Native output lives in the compaction entry's `details`. The summary text is a replay marker, not a prose summary. Source-history references allow later fallback to summarize the original messages, including across repeated native compactions. If that fallback also fails, compaction cancels rather than replacing history with a summary of the marker.

## Portability

Keep this extension loaded when resuming native-compacted sessions. Pi alone cannot replay their encrypted state. The original transcript remains stored.

Changing provider, API, model ID, or base URL restores source history instead of forwarding opaque state to an incompatible model. This can expand context substantially; subsequent compaction uses the new model's supported strategy. Branch summaries use the source transcript rather than replay markers.

First-party endpoints only. OpenAI-compatible proxies and Azure are not supported. Native compaction is still lossy; this package does not promise better retention than Pi's summarizer.

Message converters load from the running Pi installation only when compaction starts. If that installation does not expose them, startup still succeeds and compaction warns before falling back to Pi.

## Verification

```sh
npm test --prefix packages/w-compaction
W_COMPACTION_LIVE=1 node --test --test-name-pattern='live Codex' packages/w-compaction/tests/compaction.test.ts
```

The live check uses Pi's saved Codex credentials, makes real requests, and checks that a numeric requirement survives native compaction and replay. It defaults to `gpt-6-astra`; override with `W_COMPACTION_MODEL`. Ordinary tests use mocked network responses and Pi's actual converters, session manager, summarizer, and extension loader. CLI regression tests launch the installed `pi` executable in isolated RPC sessions without resolver hooks, covering startup, native compaction, missing converters, and provider-failure fallback.

References: [OpenAI compaction](https://developers.openai.com/api/docs/guides/compaction), [Codex native compaction request](https://github.com/openai/codex/blob/main/codex-rs/core/src/compact_remote_v2_attempt.rs).
