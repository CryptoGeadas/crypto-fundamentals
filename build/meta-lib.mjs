// Pure logic for development activity and backers (no network), tested by build/check-meta.mjs.

export const DEV_MAX_AGE_DAYS = 7;
export const RAISES_MAX_AGE_DAYS = 30;
const DAY = 86_400;

// GitHub organisations per token, from DefiLlama: parent protocols and child protocols both carry
// a `github` list. A parent's orgs win (they describe the whole project).
// GitHub organisations from CoinGecko's repository links ("https://github.com/solana-labs/solana" → "solana-labs").
// "github.com/orgs/<org>/…" and "github.com/users/<org>" name the org in the second segment; GitHub's own
// pages (sponsors, topics, …) name no org at all (#36).
const GITHUB_PREFIX = new Set(["orgs", "users"]);
const GITHUB_PAGES = new Set(["sponsors", "topics", "collections", "features", "marketplace", "apps", "settings", "login",
  "about", "enterprise", "pricing", "explore", "search", "notifications", "trending", "events", "site", "security", "readme"]);
export function orgsFromUrls(urls = []) {
  const out = [];
  for (const u of urls || []) {
    const m = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)(?:\/([\w.-]+))?/i.exec(String(u).trim());
    if (!m) continue;
    const org = GITHUB_PREFIX.has(m[1].toLowerCase()) ? m[2] : m[1];
    if (!org || GITHUB_PAGES.has(org.toLowerCase()) || GITHUB_PREFIX.has(org.toLowerCase())) continue;
    if (!out.some((o) => o.toLowerCase() === org.toLowerCase())) out.push(org);
  }
  return out;
}

// cgGithub: { gecko id: [GitHub URLs from CoinGecko] }, recorded weekly by the attention step; used
// when DefiLlama links no organisation.
export function orgsByToken({ protocols = [], parents = [], idmap = {}, ids = new Set(), cgGithub = {} }) {
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
  for (const [g, urls] of Object.entries(cgGithub || {})) if (ids.has(g) && !out[g]?.length) add(g, orgsFromUrls(urls));
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
