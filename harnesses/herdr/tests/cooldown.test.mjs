import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  claudeResetFromUsage,
  compactCountdown,
  cooldownFor,
  cooldownTooltip,
  mergePoolUsage,
} from "../mods/my-agents/cooldown.js";

const NOW = Date.UTC(2026, 10, 26, 21, 0, 0);
const HOUR = 3_600_000;

describe("herdr my-agents cooldown helpers", () => {
  it("propagates pool cooldown to sibling agents in the same pool on the same machine", () => {
    const pools = {};
    const t3 = {
      address: "t3",
      labels: {
        "usage.pool": "claude",
        "usage.cooldown": String(NOW + 2 * HOUR),
        "usage.at": String(NOW),
      },
    };
    const t5 = { address: "t5", labels: {} };
    const remote = { address: "vps/t1", labels: {} };
    const agyGemini = { address: "t9", labels: { "usage.pool": "antigravity/gemini" } };

    assert.equal(mergePoolUsage(pools, [t3, t5, remote, agyGemini], NOW), true);
    assert.equal(cooldownFor({ address: "t3", app: "claude-code" }, t3, pools, NOW), NOW + 2 * HOUR);
    assert.equal(cooldownFor({ address: "t5", app: "claude-code" }, t5, pools, NOW), NOW + 2 * HOUR);
    assert.equal(cooldownFor({ address: "vps/t1", app: "claude-code" }, remote, pools, NOW), null);
    assert.equal(cooldownFor({ address: "t9", app: "antigravity" }, agyGemini, pools, NOW), null);
  });

  it("isolates Antigravity gemini and 3p pools from each other", () => {
    const pools = {};
    const t9 = {
      address: "t9",
      labels: {
        "usage.pool": "antigravity/gemini",
        "usage.cooldown": String(NOW + HOUR),
        "usage.at": String(NOW),
      },
    };
    const t13 = {
      address: "t13",
      labels: {
        "usage.pool": "antigravity/3p",
        "usage.at": String(NOW),
      },
    };

    mergePoolUsage(pools, [t9, t13], NOW);
    assert.equal(cooldownFor({ address: "t9", app: "antigravity" }, t9, pools, NOW), NOW + HOUR);
    assert.equal(cooldownFor({ address: "t13", app: "antigravity" }, t13, pools, NOW), null);
  });

  it("clears a stale terminal cooldown when a newer pool check reports usage is available", () => {
    const pools = {};
    const stale = {
      address: "t3",
      labels: {
        "usage.pool": "claude",
        "usage.cooldown": String(NOW + 2 * HOUR),
        "usage.at": String(NOW - 60_000),
      },
    };
    const fresh = {
      address: "t5",
      labels: {
        "usage.pool": "claude",
        "usage.at": String(NOW),
      },
    };

    mergePoolUsage(pools, [stale, fresh], NOW);
    assert.equal(cooldownFor({ address: "t3", app: "claude-code" }, stale, pools, NOW), null);
  });

  it("honors a direct usage.cooldown label even without a pool and clears once expired", () => {
    const terminal = { address: "t13", labels: { "usage.cooldown": String(NOW + 30 * 60_000) } };
    assert.equal(cooldownFor({ address: "t13", app: "antigravity" }, terminal, {}, NOW), NOW + 30 * 60_000);
    assert.equal(cooldownFor({ address: "t13", app: "antigravity" }, terminal, {}, NOW + 30 * 60_000), null);
  });

  it("parses Anthropic OAuth account windows and ignores non-account qualifier windows", () => {
    const body = {
      five_hour: { utilization: 100, resets_at: new Date(NOW + 90 * 60_000).toISOString() },
      seven_day: { utilization: 40, resets_at: new Date(NOW + 48 * HOUR).toISOString() },
      seven_day_sonnet: { utilization: 100, resets_at: new Date(NOW + 72 * HOUR).toISOString() },
    };
    assert.deepEqual(claudeResetFromUsage(body, NOW), {
      checked: true,
      resetAt: NOW + 90 * 60_000,
    });
  });

  it("formats countdowns and hover tooltips, including combined TODO recap", () => {
    assert.equal(compactCountdown(NOW + 2 * HOUR + 15 * 60_000, NOW), "2h15m");
    assert.equal(compactCountdown(NOW + 3 * 24 * HOUR + 4 * HOUR, NOW), "3d4h");
    assert.match(cooldownTooltip(NOW + 2 * HOUR + 15 * 60_000, NOW), /^Resets in 2h15m \(\d{1,2}:\d{2} [ap]m\)$/);
    assert.match(
      cooldownTooltip(NOW + 2 * HOUR, NOW, "Finished PR review."),
      /^Resets in 2h \(\d{1,2}:\d{2} [ap]m\)\n\nFinished PR review\.$/,
    );
    assert.equal(cooldownTooltip(NOW, NOW), "Usage resets soon");
  });
});
