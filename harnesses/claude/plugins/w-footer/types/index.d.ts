export type Ledger = { input: number; output: number; cacheRead: number; cacheWrite: number; reuse: number[] }

declare module 'claude-code' {
  interface PluginState {
    'w-footer': { ledger: Ledger; branch: string | null; isPinned: boolean }
  }
}
