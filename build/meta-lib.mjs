// Pure logic for development activity and backers (no network), tested by build/check-meta.mjs.

export const DEV_MAX_AGE_DAYS = 7;
export const RAISES_MAX_AGE_DAYS = 30;
const DAY = 86_400;

// GitHub organisations per token, from DefiLlama: parent protocols and child protocols both carry
// a `github` list. A parent's orgs win (they describe the whole project).
export function orgsByToken({ protocols = [], parents = [], idmap = {}, ids = new Set() }) {
  const slugToGecko = {};
  for (const [g, e] of Object.entries(idmap)) if (e.p && ids.has(g)) slugToGecko[e.p] = g;
  const out = {};
  const add = (g, orgs) => {
    if (!g || !Array.isArray(orgs)) return;
    for (const o of orgs) {
      if (typeof o !== "string" || !/^[\w.-]+$/.test(o)) continue;
      const set = (out[g] ||= []);
      if (!set.some((x) => x.toLowerCase() === o.toLowerCase())) set.push(o);
    }
  };
  for (const p of parents) add(slugToGecko[String(p.id).replace(/^parent#/, "")], p.github);
  for (const p of protocols) add(slugToGecko[p.parentProtocolSlug] || slugToGecko[p.slug], p.github);
  for (const k of Object.keys(out)) out[k] = out[k].slice(0, 3);
  return out;
}

// A commit author is a bot when GitHub says so, or the login/name looks like one.
export function isBot(commit) {
  const login = commit.author?.login || "";
  const name = commit.commit?.author?.name || "";
  return commit.author?.type === "Bot" || /\[bot\]$/i.test(login) || /(^|[-_\s])bot([-_\s]|$)|dependabot|renovate|github-actions/i.test(login || name);
}

// Human commits and distinct human contributors in a list of GitHub commit objects.
export function humanActivity(commits) {
  const humans = commits.filter((c) => !isBot(c));
  const who = new Set(humans.map((c) => (c.author?.login || c.commit?.author?.email || c.commit?.author?.name || "").toLowerCase()).filter(Boolean));
  return { commits: humans.length, contributors: who.size, bots: commits.length - humans.length };
}

// The project's main live codebases: among repositories pushed in the last ~6 months (no forks, no
// archives), the most starred. "Most recently pushed" alone picks bot-maintained config repos
// (aave-governance-cache, hooklist) over the real code. Falls back to the most recent if none qualify.
export function pickRepos(repoLists, n = 3, now = Date.now()) {
  const live = repoLists.flat().filter((r) => r && !r.fork && !r.archived && r.full_name);
  const recent = live.filter((r) => now - Date.parse(r.pushed_at || 0) < 183 * 86_400_000)
    .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0) || Date.parse(b.pushed_at || 0) - Date.parse(a.pushed_at || 0));
  const pool = recent.length ? recent : live.sort((a, b) => Date.parse(b.pushed_at || 0) - Date.parse(a.pushed_at || 0));
  return pool.slice(0, n).map((r) => r.full_name);
}

// Tokens due for a refresh of `field` (each entry stores `<field>At`), oldest first, capped.
export function dueFor(field, maxAgeDays, candidates, stored, now = Date.now() / 1000, cap = 40) {
  const due = [];
  for (const id of candidates) {
    const at = stored[id]?.[`${field}At`];
    const age = at ? (now - Date.parse(at) / 1000) / DAY : Infinity;
    if (age >= maxAgeDays) due.push([id, age]);
  }
  return due.sort((a, b) => b[1] - a[1]).slice(0, cap).map(([id]) => id);
}

export const summariseRaises = (raises = []) => raises
  .map((r) => ({ date: r.date, round: r.round || "", amount: Number(r.amount) || 0, leads: (r.leadInvestors || []).slice(0, 4) }))
  .sort((a, b) => b.date - a.date);
