// Daily step 5: development activity (GitHub) and backers (DefiLlama funding rounds).
//   site/data/meta.json  { tokens: { <id>: { orgs, dev: { repos, contributors90, commits90, commitsPrev90 } | null, devAt,
//                                            raises: [...], raisesAt } } }
// GitHub is called with the token every Action already has (GITHUB_TOKEN; no new keys), anonymously
// when run locally. Funding rounds only exist in DefiLlama's heavy per-protocol endpoint, so they are
// refreshed monthly; development weekly. Both rotate oldest-first with a cap per run.

import { orgsByToken, humanActivity, pickRepos, dueFor, summariseRaises, DEV_MAX_AGE_DAYS, RAISES_MAX_AGE_DAYS } from "./meta-lib.mjs";
import { sleep } from "./net.mjs";

const API = "https://api.llama.fi";
const GH = "https://api.github.com";
const DAY = 86_400;
const MIN_TOKENS = 200;

function gh(path) {
  const headers = { accept: "application/vnd.github+json", "user-agent": "crypto-fundamentals-daily" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return fetch(`${GH}${path}`, { headers }).then(async (r) => {
    if (r.status === 404 || r.status === 409) return null;            // missing org / empty repo
    if (!r.ok) throw new Error(`GitHub ${r.status}${r.status === 403 ? " (rate limit)" : ""} for ${path.split("?")[0]}`);
    return r.json();
  });
}

async function commitsBetween(repo, since, until) {
  const out = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await gh(`/repos/${repo}/commits?since=${since}&until=${until}&per_page=100&page=${page}`);
    if (!batch?.length) break;
    out.push(...batch);
    if (batch.length < 100) break;
  }
  return out;
}

async function devStats(orgs, now) {
  const lists = [];
  for (const org of orgs.slice(0, 2)) lists.push((await gh(`/users/${encodeURIComponent(org)}/repos?sort=pushed&per_page=40`)) || []);
  const repos = pickRepos(lists);
  if (!repos.length) return null;
  const iso = (t) => new Date(t * 1000).toISOString();
  let cur = [], prev = [];
  for (const r of repos) {
    cur = cur.concat(await commitsBetween(r, iso(now - 90 * DAY), iso(now)));
    prev = prev.concat(await commitsBetween(r, iso(now - 180 * DAY), iso(now - 90 * DAY)));
  }
  const a = humanActivity(cur), b = humanActivity(prev);
  return { repos, contributors90: a.contributors, commits90: a.commits, commitsPrev90: b.commits, bots90: a.bots };
}

export async function metaStep({ report, net, data }) {
  const [idmap, universe, prev] = [await data.read("idmap.json"), await data.read("universe.json"), await data.read("meta.json")];
  if (!idmap || !universe) { report.error("meta", "No identifier map or token list; development and backer data kept."); report.datasets.meta = { status: "kept" }; return; }
  const ids = new Set(universe.tokens.map((t) => t.id));
  const now = Date.now() / 1000;
  const stored = prev?.tokens || {};

  let orgs;
  try {
    const [protocols, lite] = await Promise.all([net.getJson(`${API}/protocols`, "defillama"), net.getJson(`${API}/lite/protocols2`, "defillama")]);
    orgs = orgsByToken({ protocols, parents: lite.parentProtocols || [], idmap: idmap.map, ids });
  } catch (e) {
    report.error("defillama", `${e.message}; development and backer data kept.`);
    report.datasets.meta = { status: "kept" };
    return;
  }
  const tokens = {};
  for (const id of ids) if (orgs[id] || stored[id] || idmap.map[id]?.p) tokens[id] = { ...(stored[id] || {}), orgs: orgs[id] || stored[id]?.orgs || [] };

  // Funding rounds: monthly, from the per-protocol endpoint (heavy, so capped).
  const withProtocol = [...ids].filter((id) => idmap.map[id]?.p);
  const raisesDue = dueFor("raises", RAISES_MAX_AGE_DAYS, withProtocol, stored, now, (process.env.RAISES_CAP ? Number(process.env.RAISES_CAP) : 40));
  let raisesDone = 0;
  for (const id of raisesDue) {
    const res = await fetch(`${API}/protocol/${encodeURIComponent(idmap.map[id].p)}`, { headers: { accept: "application/json" } }).catch(() => null);
    if (res?.ok) {
      try { const d = await res.json(); tokens[id] = { ...tokens[id], raises: summariseRaises(d.raises), raisesAt: new Date().toISOString() }; raisesDone++; }
      catch { report.warn("defillama", `Funding rounds for ${id} unreadable; kept previous.`); }
    } else if (res && (res.status === 400 || res.status === 404)) {
      tokens[id] = { ...tokens[id], raises: [], raisesAt: new Date().toISOString() };
    } else {
      report.warn("defillama", `Funding rounds for ${id} not refreshed (${res ? `HTTP ${res.status}` : "unreachable"}); kept previous.`);
    }
    await sleep(500);
  }

  // Development: weekly, from GitHub.
  const withOrgs = Object.keys(tokens).filter((id) => tokens[id].orgs?.length);
  const devDue = dueFor("dev", DEV_MAX_AGE_DAYS, withOrgs, stored, now, (process.env.DEV_CAP ? Number(process.env.DEV_CAP) : 50));
  let devDone = 0, devFailed = 0;
  for (const id of devDue) {
    try { tokens[id] = { ...tokens[id], dev: await devStats(tokens[id].orgs, now), devAt: new Date().toISOString() }; devDone++; }
    catch (e) {
      devFailed++;
      if (/rate limit/.test(e.message)) { report.warn("github", `${e.message}; the rest of today's development refresh postponed.`); break; }
      report.warn("github", `Development stats for ${id} not refreshed (${e.message}); kept previous.`);
    }
  }
  if (devDue.length) report.ok("github");

  const count = Object.keys(tokens).length;
  await data.publish("meta", "meta.json", { generated: new Date().toISOString(), count, tokens }, count, prev?.count, MIN_TOKENS);
  console.log(`Meta: ${count} tokens; GitHub orgs for ${withOrgs.length}; development refreshed ${devDone} (failed ${devFailed}); funding rounds refreshed ${raisesDone}.`);
}
