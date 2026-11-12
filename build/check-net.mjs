// The daily job's network helper (net.mjs), the GitHub-issue helper (github.mjs) and the rule that
// nothing else in the job calls an outside source directly (#76). Fake fetch, no real waiting.
// Run: node build/check-net.mjs   (exit code 1 on any failure)

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createNet } from "./net.mjs";
import { githubIssues } from "./github.mjs";
import { Report } from "./report.mjs";

const results = [];
const check = async (name, fn) => { try { await fn(); results.push(["PASS", name]); } catch (e) { results.push(["FAIL", `${name} — ${e.message}`]); } };
const answer = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
const netWith = (fetchImpl) => { const report = new Report(), waits = []; return { report, waits, net: createNet(report, { fetchImpl, sleep: async (ms) => { waits.push(ms); } }) }; };

await check("getJson: a good answer is parsed, marks the source ok and carries a timeout", async () => {
  let init;
  const { net, report } = netWith(async (_u, i) => { init = i; return answer(200, { a: 1 }); });
  assert.deepEqual(await net.getJson("https://api.llama.fi/x", "defillama"), { a: 1 });
  assert.equal(report.sources.defillama, "ok");
  assert.ok(init.signal instanceof AbortSignal);
  assert.equal(init.headers.accept, "application/json");
});
await check("a rate-limited or failing source is retried after a wait, and the retry is in the report", async () => {
  const seq = [answer(429), answer(503), answer(200, { ok: true })];
  const { net, report, waits } = netWith(async () => seq.shift());
  assert.deepEqual(await net.getJson("https://api.llama.fi/x", "defillama"), { ok: true });
  assert.deepEqual(waits, [60_000, 10_000]);
  assert.equal(report.retries.length, 2);
  assert.match(report.retries[0].message, /HTTP 429 from api\.llama\.fi \(rate limited\)/);
});
await check("a source that hangs times out, is retried, then fails with the host", async () => {
  let calls = 0;
  const hang = (_u, i) => new Promise((_res, rej) => { calls++; i.signal.addEventListener("abort", () => rej(i.signal.reason)); });
  const { net, report } = netWith(hang);
  const alive = setInterval(() => {}, 10); // a timeout signal's own timer does not keep Node running
  try { await assert.rejects(net.get("https://slow.example/x", "defillama", { tries: 2, timeoutMs: 20 }), /slow\.example unreachable after 2 attempts/); }
  finally { clearInterval(alive); }
  assert.equal(calls, 2);
  assert.match(report.retries[0].message, /no answer in 0s/);
});
await check("get: 'no data' (404) comes back at once as a Response, so a step can tell it from a failure", async () => {
  let calls = 0;
  const { net, waits } = netWith(async () => { calls++; return answer(404); });
  const res = await net.get("https://api.llama.fi/treasury/x", "defillama");
  assert.equal(res.status, 404);
  assert.equal(calls, 1);
  assert.deepEqual(waits, []);
  await assert.rejects(net.getJson("https://api.llama.fi/treasury/x", "defillama"), /answered HTTP 404 for \/treasury\/x/);
});
await check("get: a server error that never clears is handed back after every try", async () => {
  let calls = 0;
  const { net } = netWith(async () => { calls++; return answer(500); });
  assert.equal((await net.get("https://api.llama.fi/x", "defillama", { tries: 3 })).status, 500);
  assert.equal(calls, 3);
});
await check("get: extra headers (a GitHub token) are sent along with the defaults", async () => {
  let init;
  const { net } = netWith(async (_u, i) => { init = i; return answer(200); });
  await net.get("https://api.github.com/x", "github", { headers: { authorization: "Bearer t", accept: "application/vnd.github+json" } });
  assert.equal(init.headers.authorization, "Bearer t");
  assert.equal(init.headers.accept, "application/vnd.github+json");
  assert.ok(init.headers["user-agent"]);
});
await check("CoinGecko calls are kept 8 s apart", async () => {
  const { net, waits } = netWith(async () => answer(200));
  await net.getJson("https://api.coingecko.com/a", "coingecko", { coingecko: true });
  await net.getJson("https://api.coingecko.com/b", "coingecko", { coingecko: true });
  assert.equal(waits.length, 1);
  assert.ok(waits[0] > 7000 && waits[0] <= 8000, String(waits[0]));
});

await check("one GitHub-issue helper: sends the token and body, returns JSON, null on 204, throws with the status", async () => {
  const calls = [];
  const seq = [answer(200, [{ number: 7 }]), { ok: true, status: 204 }, answer(422, { message: "bad" })];
  const gh = githubIssues({ repo: "o/r", token: "t", agent: "a", fetchImpl: async (url, init) => { calls.push({ url, init }); return seq.shift(); } });
  assert.deepEqual(await gh("GET", "/issues?state=open"), [{ number: 7 }]);
  assert.equal(await gh("PATCH", "/issues/7", { state: "closed" }), null);
  await assert.rejects(gh("POST", "/issues", { title: "x" }), /GitHub API POST \/issues → HTTP 422: .*bad/);
  assert.equal(calls[0].url, "https://api.github.com/repos/o/r/issues?state=open");
  assert.equal(calls[0].init.headers.authorization, "Bearer t");
  assert.equal(calls[1].init.body, JSON.stringify({ state: "closed" }));
  assert.equal(calls.length, 3, "a failed write is not tried again");
});
await check("the alert and the audit issue both use that helper", () => {
  for (const f of ["alert.mjs", "audit-issue.mjs"]) assert.match(readFileSync(new URL(f, import.meta.url), "utf8"), /githubIssues\(/, f);
});

await check("no build file calls fetch directly: steps use the injected net, issue writers use github.mjs", () => {
  const dir = new URL("./", import.meta.url);
  const direct = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".mjs") || name.startsWith("check-") || name === "net.mjs" || name === "github.mjs") continue;
    readFileSync(new URL(name, dir), "utf8").split("\n").forEach((line, i) => {
      if (/(^|[^.\w])fetch\(/.test(line.replace(/\/\/.*$/, ""))) direct.push(`${name}:${i + 1}`);
    });
  }
  assert.deepEqual(direct, []);
});
await check("all three workflows run the checks through the repo's runner", () => {
  for (const f of ["check.yml", "deploy-pages.yml", "refresh.yml"]) {
    const text = readFileSync(new URL(`../.github/workflows/${f}`, import.meta.url), "utf8");
    assert.match(text, /run: node build\/run-checks\.mjs/, f);
    assert.doesNotMatch(text, /for f in build\/check-/, f);
  }
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
const failed = results.filter(([s]) => s === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
