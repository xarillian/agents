// Quota cooldown tracking, pool aggregation, and tooltip formatting for my-agents.

const POOL_RETENTION_MS = 7 * 86_400_000;
const CLAUDE_ACCOUNT_WINDOWS = ["five_hour", "seven_day"];

export function parseTimestamp(value) {
  let ts;
  if (typeof value === "number") {
    ts = value < 1_000_000_000_000 ? value * 1000 : value;
  } else if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    ts = Number.isFinite(numeric) ? (numeric < 1_000_000_000_000 ? numeric * 1000 : numeric) : Date.parse(value);
  } else {
    return null;
  }
  return Number.isFinite(ts) && ts > 0 && ts <= 8_640_000_000_000_000 ? ts : null;
}

export function machineOf(address) {
  return typeof address === "string" && address.includes("/") ? address.split("/")[0] : "";
}

export function poolOf(agent, terminal) {
  const declared = terminal?.labels?.["usage.pool"]?.trim();
  if (declared) return declared;
  return agent?.app === "claude-code" ? "claude" : null;
}

export function mergePoolUsage(pools, terminals, now) {
  let dirty = false;
  for (const terminal of terminals) {
    const labels = terminal?.labels;
    const pool = labels?.["usage.pool"]?.trim();
    const at = parseTimestamp(labels?.["usage.at"]);
    if (!pool || !at) continue;
    const resetAt = parseTimestamp(labels?.["usage.cooldown"]) ?? 0;
    const key = `${machineOf(terminal.address)}:${pool}`;
    const prev = pools[key];
    if (!prev || at > prev.at || (at === prev.at && resetAt !== prev.resetAt)) {
      pools[key] = { resetAt, at };
      dirty = true;
    }
  }
  for (const [key, entry] of Object.entries(pools)) {
    if (!entry || typeof entry.at !== "number" || (entry.resetAt <= now && now - entry.at > POOL_RETENTION_MS)) {
      delete pools[key];
      dirty = true;
    }
  }
  return dirty;
}

export function cooldownFor(agent, terminal, pools, now) {
  const termReset = parseTimestamp(terminal?.labels?.["usage.cooldown"]);
  const termAt = parseTimestamp(terminal?.labels?.["usage.at"]) ?? 0;
  const pool = poolOf(agent, terminal);
  const entry = pool ? pools?.[`${machineOf(agent?.address)}:${pool}`] : null;

  if (entry && entry.at > termAt) {
    return entry.resetAt > now ? entry.resetAt : null;
  }
  if (termReset && termReset > now) return termReset;
  if (entry && entry.resetAt > now) return entry.resetAt;
  return null;
}

export function claudeResetFromUsage(body, now) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { checked: false, resetAt: 0 };
  let checked = false;
  let resetAt = 0;
  for (const key of CLAUDE_ACCOUNT_WINDOWS) {
    const bucket = body[key];
    if (!bucket || typeof bucket !== "object" || typeof bucket.utilization !== "number" || !Number.isFinite(bucket.utilization)) continue;
    checked = true;
    if (bucket.utilization >= 100) {
      const ts = parseTimestamp(bucket.resets_at);
      if (ts && ts > now && ts > resetAt) resetAt = ts;
    }
  }
  return { checked, resetAt };
}

export function compactCountdown(resetAt, now) {
  if (!Number.isFinite(resetAt) || !Number.isFinite(now)) return null;
  const seconds = Math.ceil((resetAt - now) / 1000);
  if (seconds <= 0) return "now";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 99) return `${days}d`;
  if (days) return hours ? `${days}d${hours}h` : `${days}d`;
  if (hours) return minutes ? `${hours}h${minutes}m` : `${hours}h`;
  return `${Math.max(1, minutes)}m`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function absoluteReset(resetAt, now) {
  const date = new Date(resetAt);
  const hour = date.getHours();
  const clock = `${hour % 12 === 0 ? 12 : hour % 12}:${pad2(date.getMinutes())} ${hour < 12 ? "am" : "pm"}`;
  if (resetAt - now < 86_400_000) return clock;
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)} ${clock}`;
}

export function cooldownTooltip(resetAt, now, recap = null) {
  const left = compactCountdown(resetAt, now);
  const reset = !left || left === "now" ? "Usage resets soon" : `Resets in ${left} (${absoluteReset(resetAt, now)})`;
  return recap ? `${reset}\n\n${recap}` : reset;
}
