#!/usr/bin/env node
// Resource-aware statusline for Antigravity CLI, matching the Claude and Pi footers.

import { execFileSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
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
  const quota = formatQuota(payload.quota)

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

function formatQuota(quota) {
  if (!quota || typeof quota !== 'object') return null
  const active = Object.values(quota)
    .filter(bucket => bucket && !bucket.disabled && Number.isFinite(bucket.remaining_fraction))
    .sort((a, b) => (a.reset_in_seconds ?? Infinity) - (b.reset_in_seconds ?? Infinity))
  if (active.length === 0) return null

  const left = active.map(bucket => `${Math.round(clamp(bucket.remaining_fraction * 100, 0, 100))}%`)
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

if (isDirectRun()) {
  let payload = {}
  try {
    const raw = readFileSync(0, 'utf8').trim()
    if (raw) payload = JSON.parse(raw)
  } catch {
    payload = {}
  }

  const dir = payload.workspace?.current_dir || payload.cwd
  const branch = payload.vcs?.type === 'git' ? gitBranch(dir) : null
  process.stdout.write(`${renderFooter(payload, { home: process.env.HOME, branch })}\n`)
}
