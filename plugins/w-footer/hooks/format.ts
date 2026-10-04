export function formatTokens(count: number): string {
  if (count < 1000) return String(count)
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`
  if (count < 1000000) return `${Math.round(count / 1000)}k`
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`
  return `${Math.round(count / 1000000)}M`
}

export function homePath(cwd: string, home?: string): string {
  if (!home) return cwd
  if (cwd === home) return '~'
  return cwd.startsWith(`${home}/`) ? `~${cwd.slice(home.length)}` : cwd
}

export function singleLine(value: string): string {
  return value.replace(/[\r\n\t]/g, ' ').replace(/ +/g, ' ').trim()
}

export function compactCountdown(resetAt: number, now: number): string | undefined {
  if (!Number.isFinite(resetAt)) return undefined
  const seconds = Math.ceil((resetAt - now) / 1000)
  if (seconds <= 0) return 'now'
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  if (days > 99) return `${days}d`
  if (days) return hours ? `${days}d${hours}h` : `${days}d`
  if (hours) return minutes ? `${hours}h${minutes}m` : `${hours}h`
  return `${Math.max(1, minutes)}m`
}
