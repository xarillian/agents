import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { agentTitle, rowDisplay } from "../mods/my-agents/row.js";

describe("herdr my-agents row helpers", () => {
  it("uses agent.title label for Antigravity over empty, shell, or default tab titles", () => {
    const lead = {
      address: "t18",
      app: "antigravity",
      title: "xarillian@TECHNICOLOR:~/.agents",
      program: { key: "antigravity", name: "Antigravity" },
    };
    const tab = { id: "tb1", name: "1" };
    const terminal = { address: "t18", labels: { "agent.title": "Herdr Sidebar Agent IDs" } };

    assert.equal(agentTitle(tab, lead, terminal), "Herdr Sidebar Agent IDs");
    assert.equal(agentTitle({ id: "tb2", name: "Antigravity" }, { ...lead, title: "" }, terminal), "Herdr Sidebar Agent IDs");
  });

  it("falls back to tab name for Antigravity when agent.title is unset and ignores shell titles", () => {
    const lead = {
      address: "t9",
      app: "antigravity",
      title: "xarillian@TECHNICOLOR:~/.agents",
      program: { key: "antigravity", name: "Antigravity" },
    };

    assert.equal(agentTitle({ id: "tb1", name: "Antigravity" }, lead, { address: "t9", labels: {} }), "Antigravity");
    assert.equal(agentTitle({ id: "tb2", name: "1" }, { ...lead, title: "" }, undefined), "1");
  });

  it("ignores agent.title for non-Antigravity agents and uses their cleaned OSC title", () => {
    const lead = {
      address: "t5",
      app: "claude-code",
      title: "✦  Her Body Is Ready",
      program: { key: "claude", name: "Claude Code" },
    };
    const terminal = { address: "t5", labels: { "agent.title": "Stale Title" } };

    assert.equal(agentTitle({ id: "tb1", name: "1" }, lead, terminal), "Her Body Is Ready");
  });

  it("formats two-line row name and <project> · <id> subtitle", () => {
    assert.deepEqual(
      rowDisplay(
        { address: "t18", space_name: ".agents", program: { name: "Antigravity" } },
        "Herdr Sidebar Agent IDs",
        { showSpace: true },
      ),
      { name: "Herdr Sidebar Agent IDs", subtitle: ".agents · t18" },
    );

    assert.deepEqual(
      rowDisplay(
        { address: "vps/t7", space_name: "api", program: { name: "Claude Code" } },
        "Deploy",
        { showSpace: true },
      ),
      { name: "Deploy", subtitle: "api · vps/t7" },
    );

    assert.deepEqual(
      rowDisplay(
        { address: "t15", space_name: "chorus-rust", program: { name: "Antigravity" } },
        "1",
        { showSpace: true },
      ),
      { name: "Antigravity", subtitle: "chorus-rust · t15" },
    );

    assert.deepEqual(
      rowDisplay(
        { address: "t9", space_name: "chorus-rust", program: { name: "Antigravity" } },
        "Implement CHR-145",
        { showSpace: false },
      ),
      { name: "Implement CHR-145", subtitle: "t9" },
    );
  });
});
