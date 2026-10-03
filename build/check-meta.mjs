// Fixture checks for development activity and backers (no network).
// Run: node build/check-meta.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { orgsByToken, isBot, humanActivity, pickRepos, dueFor, summariseRaises } from "./meta-lib.mjs";

const results = [];
const check = (name, fn) => { try { fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", `${name} — ${e.message}`]); } };
const NOW = Date.UTC(2026, 9, 3) / 1000, DAY = 86400;

check("GitHub orgs come from the parent protocol first, then children; de-duplicated, max 3", () => {
  const o = orgsByToken({
    parents: [{ id: "parent#aave", github: ["aave", "aave-dao"] }],
    protocols: [{ slug: "aave-v3", parentProtocolSlug: "aave", github: ["Aave", "bgd-labs"] }, { slug: "jupiter", github: ["jup-ag"] }, { slug: "x", github: ["bad org!"] }],
    idmap: { aave: { p: "aave" }, "jupiter-exchange-solana": { p: "jupiter" }, x: { p: "x" } },
    ids: new Set(["aave", "jupiter-exchange-solana", "x"]),
  });
  assert.deepEqual(o.aave, ["aave", "aave-dao", "bgd-labs"]);
  assert.deepEqual(o["jupiter-exchange-solana"], ["jup-ag"]);
  assert.equal(o.x, undefined);
});
check("bots are excluded: GitHub type Bot, [bot] logins, dependabot/renovate/actions names", () => {
  assert.ok(isBot({ author: { login: "dependabot[bot]", type: "Bot" } }));
  assert.ok(isBot({ author: { login: "renovate-bot" } }));
  assert.ok(isBot({ author: null, commit: { author: { name: "github-actions" } } }));
  assert.ok(!isBot({ author: { login: "robotnik" } }));
  assert.ok(!isBot({ author: { login: "alice" } }));
});
check("human activity counts commits and distinct people (by login, else email)", () => {
  const c = (login, email) => ({ author: login ? { login, type: "User" } : null, commit: { author: { email, name: email } } });
  const a = humanActivity([c("alice"), c("alice"), c("bob"), c(null, "carol@x.io"), { author: { login: "dependabot[bot]", type: "Bot" } }]);
  assert.deepEqual(a, { commits: 4, contributors: 3, bots: 1 });
});
check("repos: most recently pushed, skipping forks and archives", () => {
  const r = (n, d, o = {}) => ({ full_name: n, pushed_at: `2026-0${d}-01T00:00:00Z`, ...o });
  assert.deepEqual(pickRepos([[r("a/old", 1), r("a/fork", 9, { fork: true }), r("a/new", 8)], [r("b/arch", 9, { archived: true }), r("b/mid", 5), r("b/x", 4)]]),
    ["a/new", "b/mid", "b/x"]);
});
check("rotation: never fetched or older than the limit, oldest first, capped", () => {
  const iso = (d) => new Date((NOW - d * DAY) * 1000).toISOString();
  const stored = { a: { devAt: iso(8) }, b: { devAt: iso(1) }, c: {} };
  assert.deepEqual(dueFor("dev", 7, ["a", "b", "c"], stored, NOW, 10), ["c", "a"]);
  assert.deepEqual(dueFor("dev", 7, ["a", "b", "c"], stored, NOW, 1), ["c"]);
});
check("funding rounds keep date, round, amount ($M) and up to 4 leads, newest first", () => {
  const r = summariseRaises([{ date: 1594771200, round: "Private", amount: 3, leadInvestors: ["Framework", "3AC"] }, { date: 1700000000, round: "Strategic", amount: 35, leadInvestors: [] }]);
  assert.equal(r[0].round, "Strategic");
  assert.deepEqual(r[1], { date: 1594771200, round: "Private", amount: 3, leads: ["Framework", "3AC"] });
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
