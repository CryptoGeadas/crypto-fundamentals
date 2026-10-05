// Fixture checks for development activity and backers (no network).
// Run: node build/check-meta.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { orgsByToken, orgsFromUrls, isBot, humanActivity, pickRepos, dueFor, summariseRaises } from "./meta-lib.mjs";

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
check("CoinGecko GitHub links are a second source, used only when DefiLlama links no organisation", () => {
  const o = orgsByToken({
    parents: [], protocols: [{ slug: "aave-v3", github: ["aave"] }],
    idmap: { aave: { p: "aave-v3" }, solana: { c: "Solana" } }, ids: new Set(["aave", "solana"]),
    cgGithub: { solana: ["https://github.com/solana-labs/solana", "https://github.com/anza-xyz/agave", "https://gitlab.com/x/y"], aave: ["https://github.com/aave/aave-protocol"], other: ["https://github.com/z"] },
  });
  assert.deepEqual(o.solana, ["solana-labs", "anza-xyz"]);
  assert.deepEqual(o.aave, ["aave"]);
  assert.equal(o.other, undefined);
  assert.deepEqual(orgsFromUrls(["https://www.github.com/Org.Name/repo", "https://github.com/org.name", "nonsense"]), ["Org.Name"]);
  // #36: org in the second segment for /orgs/ and /users/; GitHub's own pages name no org.
  assert.deepEqual(orgsFromUrls(["https://github.com/orgs/foo/repositories", "https://github.com/users/bar", "https://github.com/sponsors/baz", "https://github.com/orgs"]), ["foo", "bar"]);
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
check("repos: the most-starred among those active in ~6 months, skipping forks and archives", () => {
  const NOWMS = Date.UTC(2026, 9, 3);
  const r = (n, monthsAgo, stars, o = {}) => ({ full_name: n, pushed_at: new Date(NOWMS - monthsAgo * 30 * 86400000).toISOString(), stargazers_count: stars, ...o });
  const lists = [[r("aave/governance-cache", 0, 2), r("aave/v3-core", 2, 900), r("aave/fork", 0, 5000, { fork: true }), r("aave/ancient", 20, 3000)],
                 [r("aave/arch", 0, 4000, { archived: true }), r("aave/interface", 1, 400), r("aave/docs", 0, 60)]];
  assert.deepEqual(pickRepos(lists, 3, NOWMS), ["aave/v3-core", "aave/interface", "aave/docs"]);
  assert.deepEqual(pickRepos([[r("x/old", 20, 1), r("x/older", 30, 9)]], 3, NOWMS), ["x/old", "x/older"]);   // none recent → most recent
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
