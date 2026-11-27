// Agents in grouped or priority views; parents take their most urgent sub-agent's place.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, panes, focused, spaces, run, hc, exec, home, checking, readTextFile, theme, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props, window, layout } from "herdr";
import { claudeResetFromUsage, cooldownFor, cooldownTooltip, mergePoolUsage } from "./cooldown.js";
import { agentTitle, rowDisplay } from "./row.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

function leadPanes(all) {
  const leads = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const current = leads.get(p.tab);
    // First agent, else first focused terminal, else first terminal in the tab.
    if (!current || (!current.program?.agent && (p.program?.agent || (!current.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}
const RANK = { blocked: 5, done: 4, working: 2, idle: 1 };
// An idle agent marked as mine to pick up: below the news, above what runs on its own.
const TODO = 3;
// A sub-agent without a pane isn't in agents(): its raw word, error counting as
// blocked. It's never done: it reports to its parent, and the parent's done is the news.
// A kept sub-agent (one with a pane) is in agents() too: it keeps its own status, done included.
const kidStatus = (k, listed) => {
  if (listed.has(k.address)) return listed.get(k.address);
  const s = k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};
const SORTS = [
  { id: "priority", label: "Priority", icon: "clock" },
  { id: "grouped", label: "Grouped by space", icon: "layers" },
];
const sortOf = () => SORTS.find((s) => s.id === shared("agents.sort")) ?? SORTS[0];
const SECTION = { 5: "Needs you", 4: "Done", 3: "TODO", 2: "Working", 1: "Idle" };
const SECTION_TONE = { 5: "blocked", 4: "done", 3: "accent", 2: "working" };

// Claude Code keeps a session file per process, and writes a recap into that session's
// transcript whenever its person comes back from being away. The latest one, or null.
async function latestRecap(pid) {
  const session = JSON.parse((await readTextFile(`${home()}/.claude/sessions/${pid}.json`)) ?? "null");
  if (!session?.sessionId) return null;
  const found = await exec("sh", ["-c", `grep -h '"subtype":"away_summary"' "$HOME"/.claude/projects/*/"$1".jsonl | tail -n 1`, "sh", session.sessionId]);
  const line = found.stdout.trim();
  return line ? wrapped(JSON.parse(line).content.replace(/\s*\(disable recaps in \/config\)$/, ""), 48) : null;
}

// A tooltip is a plain string: it gets its line breaks here.
const wrapped = (text, width) => text.replace(new RegExp(`(.{1,${width}})(\\s+|$)`, "g"), "$1\n").trim();

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

const CLAUDE_POLL_MS = 120_000;

async function readClaudeOAuthToken(now) {
  try {
    const raw = await readTextFile(`${home()}/.claude/.credentials.json`);
    const oauth = raw ? JSON.parse(raw)?.claudeAiOauth : null;
    if (oauth?.accessToken && (oauth.expiresAt === undefined || oauth.expiresAt > now)) return oauth.accessToken;
  } catch {}
  try {
    const raw = await readTextFile(`${home()}/.pi/agent/auth.json`);
    const oauth = raw ? JSON.parse(raw)?.anthropic : null;
    if (oauth?.type === "oauth" && oauth.access && oauth.expires > now) return oauth.access;
  } catch {}
  return null;
}

async function fetchClaudeCooldown(now) {
  const token = await readClaudeOAuthToken(now);
  if (!token) return null;
  try {
    const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "anthropic-beta": "oauth-2025-04-20",
      },
    });
    if (!res.ok) return null;
    return claudeResetFromUsage(await res.json(), now);
  } catch {
    return null;
  }
}

// The agent's icon from the app's program table: a one-color glyph or a picture.
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

export default class Agents extends View {
  init(_props, cx) {
    if (props()?.sortMenu) return;
    this.folded = new Set();
    this.recaps = new Map();
    // Each agent's last state and when it changed (ms), kept across restarts.
    try { this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}"); } catch { this.changed = {}; }
    if (!this.changed || typeof this.changed !== "object" || Array.isArray(this.changed)) this.changed = {};
    try { this.pendingPins = JSON.parse(localStorage.getItem("pins") ?? "[]"); } catch { this.pendingPins = []; }
    if (!Array.isArray(this.pendingPins)) this.pendingPins = [];
    if (!this.pendingPins.length) localStorage.removeItem("pins");
    this.migratingPins = new Set();
    try { this.pools = JSON.parse(localStorage.getItem("usagePools") ?? "{}"); } catch { this.pools = {}; }
    if (!this.pools || typeof this.pools !== "object" || Array.isArray(this.pools)) this.pools = {};
    this.claudePollAt = 0;
    this.pollingClaude = false;
    cx.timer.every(30000, (cx) => cx.notify());
  }

  syncUsage(list, all, now, cx) {
    if (mergePoolUsage(this.pools, all, now)) {
      localStorage.setItem("usagePools", JSON.stringify(this.pools));
    }
    if (checking() || window()?.visible === false || this.pollingClaude) return;
    if (!list.some((a) => a.app === "claude-code" && !a.address.includes("/"))) return;
    const claudeEntry = this.pools[":claude"];
    if (now - this.claudePollAt < CLAUDE_POLL_MS || (claudeEntry && now - claudeEntry.at < CLAUDE_POLL_MS)) return;
    this.claudePollAt = now;
    this.pollingClaude = true;
    cx.spawn(async (cx) => {
      try {
        const result = await fetchClaudeCooldown(Date.now());
        if (!result?.checked) return;
        const at = Date.now();
        if (!this.pools[":claude"] || at >= this.pools[":claude"].at) {
          this.pools[":claude"] = { resetAt: result.resetAt, at };
          localStorage.setItem("usagePools", JSON.stringify(this.pools));
          cx.notify();
        }
      } finally {
        this.pollingClaude = false;
      }
    });
  }

  // Stamps agents whose state changed. Done and idle count as one: looking at a
  // finished agent turns done into idle, and looking isn't the agent doing anything.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    // Gone and old: the list alone is empty right after a start.
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  // Keep offline pins until their terminal returns, and keep each pending until
  // core echoes the label so a failed write doesn't erase the old pin.
  migratePins(all) {
    const listed = new Map(all.filter((t) => t.state === "live").map((t) => [t.address, t]));
    const pending = this.pendingPins.filter((address) => {
      const terminal = listed.get(address);
      if (!terminal) return true;
      if (terminal.labels?.["herdr.pinned"]) return false;
      if (!this.migratingPins.has(address)) {
        this.migratingPins.add(address);
        run("terminal.pin", { terminal: address, pinned: true });
      }
      return true;
    });
    if (pending.length === this.pendingPins.length) return;
    this.pendingPins = pending;
    if (pending.length) localStorage.setItem("pins", JSON.stringify(pending));
    else localStorage.removeItem("pins");
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  rank(a) {
    return this.isTodo(a) ? TODO : RANK[a.status] ?? 0;
  }

  // The mark stays on the terminal; it only counts while the agent sits idle.
  isTodo(a) {
    return a.status === "idle" && this.todo.has(a.address);
  }

  // A TODO's recap is read when it shows up here, and forgotten when it leaves.
  remember(list, all, cx) {
    const todos = new Set(list.filter((a) => this.isTodo(a)).map((a) => a.address));
    for (const address of [...this.recaps.keys()]) if (!todos.has(address)) this.recaps.delete(address);
    for (const a of list) if (todos.has(a.address) && !this.recaps.has(a.address)) this.recall(a, all, cx);
  }

  // Only Claude Code on this computer has a recap to read. Hovering the row asks again,
  // since a recap can be written while the TODO waits.
  recall(a, all, cx) {
    this.recaps.set(a.address, this.recaps.get(a.address) ?? null);
    const pid = all.find((k) => k.address === a.address)?.foreground?.pid;
    if (a.app !== "claude-code" || a.address.includes("/") || !pid) return;
    cx.spawn(async (cx) => {
      const recap = await latestRecap(pid);
      if (!recap) return;
      this.recaps.set(a.address, recap);
      cx.notify();
    });
  }

  // Priority order: the most urgent section first. Inside a section a space's agents
  // sit together, and the space that changed most recently leads.
  clusteredBySpace(list, rankOf) {
    const cluster = (a) => `${rankOf(a)} ${a.space}`;
    const freshest = new Map();
    for (const a of list) freshest.set(cluster(a), Math.max(freshest.get(cluster(a)) ?? 0, this.since(a)));
    return [...list].sort((x, y) =>
      rankOf(y) - rankOf(x)
      || freshest.get(cluster(y)) - freshest.get(cluster(x))
      || x.space.localeCompare(y.space)
      || this.since(y) - this.since(x)
      || y.seq - x.seq);
  }

  sortMenu(t) {
    const on = sortOf().id;
    return v_flex()
      .w_full()
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child("Sort agents"))
      .children(SORTS.map((s) => h_flex()
        .id(`sort-${s.id}`)
        .h(31)
        .px(8)
        .gap(9)
        .rounded(7)
        .items_center()
        .text_color(t.foreground)
        .hover((el) => el.bg(t.hover))
        .on_click(() => {
          setShared("agents.sort", s.id);
          closeOverlay(props().overlay);
        })
        .child(svg(`mods/workspace-chrome/${s.icon}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().child(s.label))
        .when(s.id === on, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(14).flex_none().text_color(t.foreground)))));
  }

  peek(addr) {
    run("terminal.peek", { terminal: addr });
  }

  // Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
  tree(all, addr, lead = []) {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [
        { t: k, lines: [...lead, last ? "└" : "├"] },
        ...this.tree(all, k.address, [...lead, last ? "" : "│"]),
      ];
    });
  }

  subRow(t, s, shown, compact) {
    const k = s.t;
    const st = kidStatus(k, this.listed);
    const pic = icon(k.program, 14, t.foreground);
    const on = k.address === shown;
    const name = k.name || k.template || k.program?.name || k.address;
    const showId = Boolean(k.address) && name !== k.address;
    return h_flex()
      .id(`sub-${k.address}`)
      .pl(39)
      .pr(8)
      .rounded(8)
      .h(26)
      .flex_none()
      .gap(0)
      .items_center()
      .text_size(12.5)
      .when(on, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => (this.listed.has(k.address) ? run("pane.focus", { terminal: k.address }) : this.peek(k.address)))
      .children(s.lines.map(l => div().self_start().mt(-4).w(9).h(17).mr(4).flex_none()
        .when(Boolean(l), el => el.border_l(1.5).border_color(t.input))
        .when(l === "└" || l === "├", el => el.border_b(1.5).rounded_bl(6))))
      .when(Boolean(pic), el => el.child(div().mr(8).child(pic)))
      .child(div().flex_1().min_w(0).truncate().text_color(on ? t.foreground : t.muted).child(name))
      .when(showId, el => el.child(div().flex_none().mx(6).text_size(11).text_color(t.dim).child(k.address)))
      .child(this.status(t, { address: k.address, app: k.status?.app ?? null, status: st }, compact));
  }

  // An agent whose active quota pool is exhausted; hovering tells when it resets.
  cooldown(t, a, resetAt, recap = null) {
    return div()
      .id(`cooldown-${a.address}`)
      .w(14)
      .h(18)
      .flex_none()
      .flex()
      .items_center()
      .justify_center()
      .text_color(t.blocked)
      .tooltip(cooldownTooltip(resetAt, this.now, recap))
      .child(svg("mods/my-agents/cooldown.svg").size(12));
  }

  // A TODO's mark. With a recap to read it takes the accent, and hovering it tells the recap.
  bookmark(t, a) {
    const recap = this.recaps.get(a.address);
    const mark = div().id(`todo-mark-${a.address}`).w(13).flex_none().flex().justify_center()
      .text_color(recap ? t.accent : t.dim)
      .child(svg("mods/my-agents/bookmark.svg").size(12));
    return recap ? mark.tooltip(recap) : mark;
  }

  // compact: a ! for blocked where a header already says "Needs you".
  // singleSlot: collapsed rail only fits one 14px icon, so TODO+cooldown combines tooltips there.
  status(t, a, compact = false, singleSlot = false) {
    if (a.address) {
      const resetAt = cooldownFor(a, this.terminalsByAddress?.get(a.address), this.pools, this.now);
      if (resetAt) {
        if (this.isTodo(a)) {
          if (singleSlot) return this.cooldown(t, a, resetAt, this.recaps.get(a.address));
          return h_flex()
            .flex_none()
            .items_center()
            .gap(4)
            .child(this.bookmark(t, a))
            .child(this.cooldown(t, a, resetAt));
        }
        return this.cooldown(t, a, resetAt);
      }
    }
    const color = t[a.status] ?? t.dim;
    if (a.status === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.working).spin(900);
    if (a.status === "blocked" && compact) return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    if (a.status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
    if (this.isTodo(a)) return this.bookmark(t, a);
    // Idle: a ring; done: a dot.
    if (a.status === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
    return div().size(7).mx(3).flex_none().rounded(4).bg(a.status === "done" ? color : t.dim + "00");
  }

  render(cx) {
    const t = theme();
    if (props()?.sortMenu) return this.sortMenu(t);
    const collapsed = narrow();
    const sort = sortOf();
    let list = agents();
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    const all = terminals();
    this.migratePins(all);
    this.todo = new Set(all.filter((k) => k.labels?.todo).map((k) => k.address));
    const shown = focused()?.agent;
    const now = Date.now();
    this.now = now;
    this.terminalsByAddress = new Map(all.map((k) => [k.address, k]));
    this.track(list, now);
    this.syncUsage(list, all, now, cx);
    this.remember(list, all, cx);
    // A kept sub-agent (one with a pane) is in agents() too: where a tree shows
    // it, it gets no row of its own, unless it's pinned.
    const nested = new Set(collapsed ? [] : list.flatMap((a) => this.tree(all, a.address).map((s) => s.t.address)));
    list = list.filter((a) => a.pinned || !nested.has(a.address));
    const tabCounts = new Map();
    for (const a of list) tabCounts.set(a.tab, (tabCounts.get(a.tab) ?? 0) + 1);
    const byPriority = sort.id === "priority";
    // A helper's done is its own row's news: it doesn't pull a working parent out of Working.
    const kidRank = (k) => { const s = kidStatus(k, this.listed); return RANK[s === "done" ? "idle" : s] ?? 0; };
    const urgency = new Map(list.map((a) => [a.address, Math.max(this.rank(a), ...this.tree(all, a.address).map((s) => kidRank(s.t)))]));
    const rankOf = (a) => urgency.get(a.address);
    if (byPriority) list = this.clusteredBySpace(list, rankOf);
    const pinned = list.filter((a) => a.pinned);
    const rest = list.filter((a) => !a.pinned);
    list = [...pinned, ...rest];
    setAgentOrder(list.map((a) => a.address));

    const withKids = (a, i) => {
      const subs = collapsed ? [] : this.tree(all, a.address);
      const r = row(a, i, subs);
      if (this.folded.has(a.address)) return [r];
      return [r, ...subs.map((s) => this.subRow(t, s, shown, byPriority))];
    };

    // The fold chevron; folded, the count too, colored by the most urgent one.
    const fold = (a, subs) => {
      const sts = subs.map((s) => kidStatus(s.t, this.listed));
      const top = sts.reduce((m, s) => ((RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m), null);
      const open = !this.folded.has(a.address);
      return div()
        .id(`fold-${a.address}`)
        .h(18)
        .px(3)
        .gap(3)
        .flex()
        .items_center()
        .rounded(4)
        .text_size(11)
        .text_color(open ? t.dim : (t[top] ?? t.dim))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          open ? this.folded.add(a.address) : this.folded.delete(a.address);
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none())
        .when(!open, (el) => el.child(String(subs.length)));
    };

    // Read the pane snapshot once: every host read copies the whole list into JS.
    const leads = leadPanes(panes());
    const tabs = new Map(spaces().flatMap(s => s.tabs).map(tab => [tab.id, tab]));
    const labels = new Map(list.map(a => {
      const tab = tabs.get(a.tab);
      const many = tabCounts.get(a.tab) > 1;
      const lead = many ? a : (leads.get(a.tab) ?? a);
      return [a.address, agentTitle(tab, lead, this.terminalsByAddress.get(lead?.terminal ?? lead?.address))];
    }));
    const label = (a) => labels.get(a.address);

    const row = (a, i, subs = []) => {
      const pic = icon(a.program, 16, t.foreground);
      if (collapsed) {
        return h_flex()
          .id(`ag-${a.address}`)
          .h(26)
          .mx(6)
          .px(2)
          .rounded(6)
          .flex_none()
          .items_center()
          .gap(4)
          .when(a.focused, (el) => el.bg(t.selected))
          .hover((s) => s.bg(t.hover))
          .on_click(() => run("pane.focus", { pane: a.pane }))
          .child(div().flex_1().min_w(0).whitespace_nowrap().text_right().text_color(a.focused ? t.foreground : t.muted).child(String(i + 1)))
          .child(h_flex().w(14).flex_none().items_center().justify_center().child(this.status(t, a, true, true)));
      }
      const when = this.since(a);
      const idle = a.status === "idle" && !a.focused;
      const isPinned = a.pinned;
      const marked = this.todo.has(a.address);
      const hoverButton = (id, glyph, tip, act) => div()
        .id(id)
        .flex_none()
        .p(2)
        .rounded(4)
        .text_color(t.dim)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(tip)
        .on_click((_e, cx) => {
          cx.stop_propagation();
          act();
          // The row moves away from under the pointer, and no hover-out comes.
          this.hovered = null;
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${glyph}.svg`).size(13));
      const pin = hoverButton(`pin-${a.address}`, isPinned ? "pin-off" : "pin", isPinned ? "Unpin" : "Pin to the top",
        () => run("terminal.pin", { terminal: a.address, pinned: !isPinned }));
      const todo = hoverButton(`todo-${a.address}`, marked ? "circle-check" : "square", marked ? "Clear TODO" : "Mark as TODO",
        () => hc(["label", a.address, marked ? "todo=" : "todo=1"]));
      const { name, subtitle } = rowDisplay(a, label(a), { showSpace: byPriority || isPinned });
      return h_flex()
        .id(`ag-${a.address}`)
        .px(8)
        .h(42)
        .flex_none()
        .rounded(8)
        .items_center()
        .gap(9)
        .when(a.focused, (el) => el.bg(t.selected))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_hover((on, cx) => {
          if (on) this.hovered = a.address;
          else if (this.hovered === a.address) this.hovered = null;
          if (on && this.isTodo(a)) this.recall(a, all, cx);
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .when(Boolean(pic), el => el.child(div().id(`agent-fold-${a.address}`)
          .when(subs.length > 0, el => el.on_click((_e, cx) => {
            cx.stop_propagation();
            this.folded.has(a.address) ? this.folded.delete(a.address) : this.folded.add(a.address);
            cx.notify();
          })).child(pic)))
        .child(v_flex().flex_1().min_w(0).gap(2)
          .child(div().truncate().text_size(13).line_height("16px").text_color(idle ? t.muted : t.foreground).child(name))
          .when(Boolean(subtitle), el => el.child(div().truncate().text_size(11).line_height("14px").text_color(t.dim).child(subtitle))))
        .when(subs.length > 0, el => el.child(fold(a, subs)))
        .when(this.hovered === a.address, el => el.child(todo).child(pin))
        .when(this.hovered !== a.address && Boolean(when), el => el.child(div().flex_none().text_size(11).text_color(t.dim).child(duration(now - when))))
        .child(this.status(t, a, byPriority && !isPinned));
    };

    // Groups in list order: spaces (grouped) or priority sections. Agents of a
    // space are next to each other in agents(), so neighbours make a group.
    const groups = pinned.length ? [{ id: "pinned", label: "Pinned", tone: null, members: pinned }] : [];
    for (const a of rest) {
      const r = rankOf(a) || RANK.idle;
      const id = byPriority ? `sec-${r}` : `sp-${a.space}`;
      if (groups.at(-1)?.id === id) groups.at(-1).members.push(a);
      else groups.push({ id, label: byPriority ? SECTION[r] : a.space_name || "", tone: byPriority ? SECTION_TONE[r] : null, members: [a] });
    }

    // A group's header; it folds the group. Folded, it says how many and the most urgent state.
    const header = (g) => {
      const open = !this.folded.has(g.id);
      const top = g.members.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
      return h_flex()
        .id(g.id)
        .px(8)
        .pt(8)
        .h(30)
        .flex_none()
        .gap(6)
        .items_center()
        .text_size(11)
        .font_medium()
        .cursor_pointer()
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => {
          open ? this.folded.add(g.id) : this.folded.delete(g.id);
          cx.notify();
        })
        .child(div().truncate().text_color(t[g.tone] ?? t.dim).child(g.label))
        .when(byPriority || !open, (el) => el.child(div().text_color(t.dim).child(String(g.members.length))))
        .child(div().flex_1())
        .when(!open, (el) => el
          .when(!byPriority && top && top !== "idle", (el) => el.child(this.status(t, { status: top }, true)))
          .child(svg("mods/workspace-chrome/chevron-right.svg").size(11).flex_none().text_color(t.dim)));
    };
    const rows = collapsed
      ? list.flatMap(withKids)
      : groups.flatMap((g) => [header(g), ...(this.folded.has(g.id) ? [] : g.members.flatMap(withKids))]);

    return v_flex()
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .border_t(1)
      .border_color(t.border)
      .text_size(13)
      .when(!collapsed, (el) =>
        el.child(
          h_flex()
            .px(16)
            .h(41)
            .pt(14)
            .pb(5)
            .flex_none()
            .items_center()
            .justify_between()
            .child(div().text_size(11.5).font_medium().text_color(t.dim).child("Agents"))
            .child(
              div()
                .id("ag-sort")
                .text_size(11)
                .text_color(t.dim)
                .hover((s) => s.text_color(t.foreground))
                .on_click(() => openOverlay({ mod: "my-agents", kind: "popup", width: 200, height: 140, props: { sortMenu: true } }))
                .tooltip(`Sort agents: ${sort.label}`)
                .child(svg(`mods/workspace-chrome/${sort.icon}.svg`).size(14)),
            ),
        ),
      )
      .when(list.length === 0 && !collapsed, (el) =>
        el.child(div().px(12).text_size(12).text_color(t.dim).child("No agent status yet. Agents show up here when they report their status. Older versions and agents inside tmux may not.")),
      )
      .child(v_flex().id("ag-list").flex_1().min_h(0).px(collapsed ? 0 : 8).overflow_y_scrollbar().mode("always").children(rows))
      .when(collapsed, (el) =>
        el.child(
          h_flex()
            .h(28)
            .items_center()
            .justify_center()
            .child(
              div()
                .id("collapse")
                .text_size(13)
                .text_color(t.dim)
                .hover((s) => s.text_color(t.foreground))
                .on_click(toggleSidebar)
                .child("»"),
            ),
        ),
      );
  }
}
