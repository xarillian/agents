export type Highlight = string

declare module 'claude-code' {
  interface PluginState {
    quote: { seen: Highlight | null; offered: Highlight | null }
  }
}
