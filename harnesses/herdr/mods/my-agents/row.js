// Pure title and subtitle formatting helpers for my-agents.

// Drops what an agent puts before its title: a status glyph or spinner and the separator
// after it ("✦  Working", "⠋ - Thinking"), and Codex's blinking "[ ! ] " / "[ . ] " mark.
// Stops at an opening bracket or quote, so a title that starts with one ("[web] login") keeps it,
// and at an emoji ("🔴 login", "❤️ deploy"), except for known status marks.
export const clean = (s) => (s ?? "").replace(/^(?:\[ [!.] \] |[✋⏳]\uFE0F?(?=\s)|(?!(?:\p{Emoji}\uFE0F|[#*]\u20E3))[^\p{L}\p{N}\p{Ps}\p{Pi}\p{Emoji_Presentation}])+/u, "").trim();

export function agentTitle(tab, lead, terminal) {
  const labeled = clean(terminal?.labels?.["agent.title"]);
  if (lead?.app === "antigravity" && labeled) return labeled;
  const prog = lead?.program?.name;
  const live = clean(lead?.title);
  // clean() would strip a path's leading ~ or /: test the title with only its status glyph gone.
  const path = /^[~/]|^[A-Za-z]:\\/.test((lead?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== (lead?.terminal ?? lead?.address) && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== lead?.program?.key;
  // The agent's own title outranks the tab's name, so a session renamed in the agent renames its row.
  return telling ? live : (tab?.name || prog || "");
}

export function rowDisplay(agent, rawTitle, { showSpace = true } = {}) {
  const name = rawTitle && !/^\d+$/.test(rawTitle) ? rawTitle : (agent.program?.name || agent.space_name || rawTitle || "");
  const subtitle = (showSpace ? [agent.space_name, agent.address] : [agent.address]).filter(Boolean).join(" \u00b7 ");
  return { name, subtitle };
}
