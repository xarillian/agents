#!/usr/bin/env node
// Resource-aware statusline for Antigravity CLI, matching the Claude and Pi footers.

import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PART_GAP = 2
const SIDE_GAP = 4
const FOOTER_INSET = 4

const RESET = '\x1b[0m'
const ansi = (code, text) => `\x1b[${code}m${text}${RESET}`
const accent = text => ansi('36', text)
const warning = text => ansi('33', text)
const error = text => ansi('31', text)
const muted = text => ansi('2', text)
const faint = text => ansi('90', text)
const plain = text => text

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g
const visibleWidth = text => [...text.replace(ANSI_PATTERN, '')].length
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export function renderFooter(payload = {}, options = {}) {
  const width = Math.max(1, (payload.terminal_width ?? 80) - FOOTER_INSET)
  const figures = fittingFigures(payload, width)
  const room = width - visibleWidth(figures) - SIDE_GAP
  const place = fittingPlace(payload, options, room)
  if (!place) return figures

  const gap = ' '.repeat(Math.max(SIDE_GAP, width - visibleWidth(figures) - visibleWidth(place)))
  return `${figures}${gap}${place}`
}

function fittingFigures(payload, width) {
  const percent = contextPercent(payload.context_window)
  const tint = percent !== undefined && percent > 90 ? error : percent !== undefined && percent > 70 ? warning : accent
  const value = tint(percent === undefined ? '?' : `${Math.round(percent)}%`)
  const context = `${meter(percent, tint)} ${value}`
  const cost = formatCost(payload.cost)
  const cache = formatCache(payload.context_window?.current_usage)
  const quota = formatQuota(payload.quota, payload.model)

  const candidates = [
    [context, cost, cache, quota],
    [value, cost, cache, quota],
    [value, cost, cache],
    [value, cost],
    [value],
  ].map(parts => parts.filter(Boolean).join(' '.repeat(PART_GAP)))

  return candidates.find(line => visibleWidth(line) <= width) ?? candidates.at(-1)
}

function contextPercent(window) {
  if (!window) return undefined
  if (Number.isFinite(window.used_percentage)) return window.used_percentage
  const usage = window.current_usage
  if (!usage || !(window.context_window_size > 0)) return undefined
  const tokens = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
  return (tokens / window.context_window_size) * 100
}

function meter(percent, tint) {
  if (percent === undefined) return faint('??????????')
  const filled = Math.round(clamp(percent, 0, 100) / 10)
  return `${tint('▰'.repeat(filled))}${faint('▱'.repeat(10 - filled))}`
}

function formatCost(cost) {
  return Number.isFinite(cost?.total_usd) ? plain(`$${cost.total_usd.toFixed(2)}`) : null
}

function formatCache(usage) {
  if (!usage) return null
  const read = usage.cache_read_input_tokens ?? 0
  const prompt = (usage.input_tokens ?? 0) + read + (usage.cache_creation_input_tokens ?? 0)
  if (!(prompt > 0)) return null
  return `${muted('◈ ')}${accent(`${Math.round((read / prompt) * 100)}%`)}`
}

function quotaPool(model) {
  const name = `${model?.id ?? ''} ${model?.display_name ?? ''}`.toLowerCase()
  if (!name.trim()) return null
  return /\b(claude|gpt)\b/.test(name) ? '3p' : 'gemini'
}

const windowRank = id => (/(^|-)5h$/.test(id) ? 0 : /(^|-)weekly$/.test(id) ? 1 : 2)

function formatQuota(quota, model) {
  if (!quota || typeof quota !== 'object') return null
  const entries = Object.entries(quota)
    .filter(([, bucket]) => bucket && !bucket.disabled && Number.isFinite(bucket.remaining_fraction))
  if (entries.length === 0) return null

  const pool = quotaPool(model)
  const poolMatches = pool ? entries.filter(([id]) => id.startsWith(`${pool}-`)) : []
  const shown = (poolMatches.length > 0 ? poolMatches : entries).sort(([idA, a], [idB, b]) =>
    windowRank(idA) - windowRank(idB)
    || ((a.reset_in_seconds || Infinity) - (b.reset_in_seconds || Infinity))
    || idA.localeCompare(idB),
  )

  const left = shown.map(([, bucket]) => `${Math.round(clamp(bucket.remaining_fraction * 100, 0, 100))}%`)
  return warning(`◆ ${left.join(' ')}`)
}

function fittingPlace(payload, { home, branch }, room) {
  if (room <= 0) return ''
  const model = singleLine(payload.model?.display_name || payload.model?.id || '')
  const dir = payload.workspace?.current_dir || payload.cwd || ''
  const location = [dir ? homePath(dir, home) : null, branch ?? null]
    .filter(Boolean)
    .map(singleLine)
    .join(' · ')

  const options = []
  if (location && model) options.push(`${muted(`${location} · `)}${plain(model)}`)
  if (model) options.push(plain(model))
  else if (location) options.push(muted(location))

  return options.find(option => visibleWidth(option) <= room) ?? ''
}

function homePath(cwd, home) {
  if (!home) return cwd
  if (cwd === home) return '~'
  return cwd.startsWith(`${home}/`) ? `~${cwd.slice(home.length)}` : cwd
}

function singleLine(value) {
  return String(value).replace(/[\r\n\t]/g, ' ').replace(/ +/g, ' ').trim()
}

function gitBranch(dir) {
  if (!dir) return null
  try {
    const out = execFileSync('git', ['-C', dir, 'branch', '--show-current'], {
      encoding: 'utf8',
      timeout: 500,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return out || null
  } catch {
    return null
  }
}

function isDirectRun() {
  if (!process.argv[1]) return false
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

const COOLDOWN_DRIFT_MS = 60_000
const COOLDOWN_HEARTBEAT_MS = 300_000

function activeQuotaEntries(quota, model) {
  if (!quota || typeof quota !== 'object') return { pool: quotaPool(model), entries: [] }
  const valid = Object.entries(quota)
    .filter(([, bucket]) => bucket && !bucket.disabled && Number.isFinite(bucket.remaining_fraction))
  const pool = quotaPool(model)
  if (!pool) return { pool: null, entries: valid }
  return { pool, entries: valid.filter(([id]) => id.startsWith(`${pool}-`)) }
}

export function cooldownReport(payload = {}, now = Date.now()) {
  const { pool, entries } = activeQuotaEntries(payload.quota, payload.model)
  const poolName = pool ? `antigravity/${pool}` : null
  if (entries.length === 0) return { pool: poolName, checked: false, resetAt: 0 }

  const exhausted = entries
    .map(([, bucket]) => bucket)
    .filter(bucket => bucket.remaining_fraction <= 0 && Number.isFinite(bucket.reset_in_seconds) && bucket.reset_in_seconds > 0)
    .map(bucket => Math.round(now + bucket.reset_in_seconds * 1000))

  return {
    pool: poolName,
    checked: true,
    resetAt: exhausted.length > 0 ? Math.max(...exhausted) : 0,
  }
}

export function syncHerdrCooldown(payload = {}, options = {}) {
  const env = options.env ?? process.env
  const terminalId = env.HC_TERMINAL_ID?.trim()
  if (!terminalId) return false

  const now = options.now ?? Date.now()
  const report = cooldownReport(payload, now)
  if (!report.pool && !report.checked) return false

  const cachePath = join(options.cacheDir ?? tmpdir(), `herdr-usage-${terminalId.replace(/[^a-zA-Z0-9_.-]/g, '_')}.json`)
  const prev = readCache(cachePath)
  if (!shouldPublishCooldown(prev, report, now)) return false

  const args = ['label', terminalId]
  if (report.pool) args.push(`usage.pool=${report.pool}`)
  if (report.checked) {
    args.push(`usage.cooldown=${report.resetAt > 0 ? String(report.resetAt) : ''}`)
    args.push(`usage.at=${String(now)}`)
  }

  const runHc = options.runHc ?? defaultRunHc
  try {
    runHc(args)
    writeFileSync(cachePath, JSON.stringify({ ...report, at: now }))
    return true
  } catch {
    return false
  }
}

function shouldPublishCooldown(prev, next, now) {
  if (!prev) return true
  if (prev.pool !== next.pool) return true
  if (!next.checked) return false
  if (!prev.checked) return true
  if ((prev.resetAt > 0) !== (next.resetAt > 0)) return true
  if (next.resetAt > 0 && Math.abs(next.resetAt - prev.resetAt) >= COOLDOWN_DRIFT_MS) return true
  return now - (prev.at ?? 0) >= COOLDOWN_HEARTBEAT_MS
}

function readCache(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function defaultRunHc(args) {
  execFileSync('hc', args, { timeout: 500, stdio: ['ignore', 'ignore', 'ignore'] })
}

if (isDirectRun()) {
  let payload = {}
  try {
    const raw = readFileSync(0, 'utf8').trim()
    if (raw) payload = JSON.parse(raw)
  } catch {
    payload = {}
  }

  syncHerdrCooldown(payload)
  const dir = payload.workspace?.current_dir || payload.cwd
  const branch = payload.vcs?.type === 'git' ? gitBranch(dir) : null
  process.stdout.write(`${renderFooter(payload, { home: process.env.HOME, branch })}\n`)
}
