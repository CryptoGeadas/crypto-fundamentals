import { analyse, fmt, tone, areaTone } from "./rating.js";
import { classify, TYPES } from "./classify.js";
import { HOUSE_RULES } from "./house-rules.js";
import { fetchToken } from "./coingecko.js";
import { addressKind, buildAddressIndex, lookupAddress, searchUniverse, tickerClashes } from "./search.js";
import { resolveAddress } from "./resolve.js";
import { unlockChart, feesChart, holdersChart } from "./charts.js";
import { fetchSecurity } from "./goplus.js";
import { loadLlama } from "./llama.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const state = {
  id: new URLSearchParams(location.search).get("t"),
  defaultView: "factsheet", viewFallback: null, current: null,
  universe: null, status: null, idmap: null, unlocks: null, defi: null, peers: null, meta: null, byId: new Map(), addrIdx: new Map(),
  sel: 0, hits: [], address: null, loadSeq: 0,
};
const EXAMPLES = ["bitcoin", "ethereum", "solana", "aave", "jupiter-exchange-solana", "arbitrum"];

// ---------------------------------------------------------------- rendering
function strip(r) {
  if (r.level == null) return `<span class="strip none">${r.missing || (r.value == null && !r.unrated) ? "No data" : "Not rated"}</span>`;
  const good = r.favour > 0 ? "good" : r.favour < 0 ? "bad" : "neutral";
  return `<span class="strip t-${tone(r.favour)}" role="img" aria-label="Rating: ${r.word} (${good})">${[1, 2, 3, 4, 5]
    .map((i) => `<i class="${i === r.level ? "on" : ""}"></i>`).join("")}<b>${r.word}</b></span>`;
}

function outsideBanner(t, via) {
  if (state.byId.has(t.id)) return "";
  return `<div class="outside" role="note"><b>Outside the verified universe.</b> ${esc(t.name)} is not in the curated list
    (CoinGecko top 300, plus tokens up to #1,500 with DefiLlama data)${via ? `; it was found from the address <code>${esc(via)}</code>` : ""}.
    Check this is the token you mean.</div>`;
}

// Readable chain names for CoinGecko platform ids.
const CHAIN_NAMES = { ethereum: "Ethereum", "binance-smart-chain": "BNB Chain", "arbitrum-one": "Arbitrum", "polygon-pos": "Polygon",
  "optimistic-ethereum": "Optimism", avalanche: "Avalanche", base: "Base", solana: "Solana", "arbitrum-nova": "Arbitrum Nova" };
const chainName = (k) => CHAIN_NAMES[k] || k.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const CHAIN_ORDER = ["ethereum", "solana", "base", "arbitrum-one", "binance-smart-chain", "polygon-pos", "optimistic-ethereum", "avalanche"];
const chainRank = (k) => (CHAIN_ORDER.includes(k) ? CHAIN_ORDER.indexOf(k) : CHAIN_ORDER.length);

function contractsRow(t) {
  const entries = Object.entries(t.contracts || {}).sort((a, b) => chainRank(a[0]) - chainRank(b[0]));
  if (!entries.length) return `<div class="contracts"><span class="label">Contract</span><span class="muted">Native asset of its own chain, no token contract</span></div>`;
  const shown = entries.slice(0, 4);
  const more = entries.length - shown.length;
  return `<div class="contracts"><span class="label">Official contracts</span>
    ${shown.map(([k, a]) => `<button class="addr" data-copy="${esc(a)}" title="Copy ${esc(a)}">${esc(chainName(k))} <code>${esc(a.slice(0, 6))}…${esc(a.slice(-4))}</code></button>`).join("")}
    ${more > 0 ? `<span class="muted">+${more} more chain${more > 1 ? "s" : ""}</span>` : ""}</div>`;
}

function identity(t, a, cls) {
  const ti = TYPES[cls.type];
  const covTone = a.coverage.level === "Full" ? "badge-success" : a.coverage.level === "Partial" ? "badge-warning" : "badge-error";
  const covRule = cls.type === "meme" ? "Memecoins have no fundamentals to cover: only market, holder and contract checks apply."
    : `${a.coverage.share}% of the metrics that apply to this token have data. Full ≥ 80%, Partial ≥ 45%.`;
  return `<div class="idrow">
      ${t.img ? `<img class="logo" src="${esc(t.img)}" alt="" width="44" height="44">` : ""}
      <div><h2>${esc(t.name)}<span class="sym">${esc(t.sym)}</span></h2>
        <div class="badges">
          <span class="badge badge-accent tip" tabindex="0" data-tip="${esc(ti.rule)}${cls.alsoDefi ? " Its protocol side also earns fees, so DeFi metrics are shown too." : ""}">${ti.label}${cls.alsoDefi ? " + DeFi" : ""}</span>
          <span class="badge ${covTone} tip" tabindex="0" data-tip="${esc(covRule)}">Coverage: ${a.coverage.level}</span>
          ${t.rank ? `<span class="badge badge-info">Rank #${t.rank}</span>` : ""}
        </div></div>
      <div class="px"><div class="p">${fmt.price(t.price)}</div><div class="c">30d ${fmt.chg(t.change30d)}</div></div>
    </div>
    ${contractsRow(t)}
    ${cls.type === "meme" ? `<div class="memenote" role="note"><b>Fundamental analysis does not apply to memecoins.</b> There is no business, revenue or product to assess, so only supply, holder, market and contract checks are shown.</div>` : ""}
    <div class="kpis">${[["Market cap", fmt.usd(t.marketCap)], ["Fully diluted value", fmt.usd(t.fdv)],
      ["Circulating supply", fmt.num(t.circulatingSupply)], ["Max supply", t.maxSupply ? fmt.num(t.maxSupply) : "No cap"]]
      .map(([l, v]) => `<div class="kpi"><span class="label">${l}</span><b>${v}</b></div>`).join("")}</div>`;
}

function leadSentence(t, a) {
  const circ = a.rows.find((r) => r.id === "circulatingShare");
  const fdvm = a.rows.find((r) => r.id === "fdvToMcap");
  const parts = [];
  if (circ.unrated) parts.push(`${t.sym} has no maximum supply, so its dilution depends on how fast new tokens are issued`);
  else if (circ.value != null) parts.push(`${circ.display} of ${t.sym}'s eventual supply is already circulating`);
  if (fdvm.value != null) parts.push(`its fully diluted value is ${fdvm.display} its market cap`);
  let text = parts.length ? parts.join("; ") + "." : "CoinGecko has no supply data for this token.";
  const next = a.rows.find((r) => r.id === "nextUnlockShare");
  const y = a.rows.find((r) => r.id === "unlocks12m");
  if (next && next.value != null) text += ` Next unlock: ${next.extra}.`;
  else if (next?.display === "None scheduled") text += " No unlock is scheduled.";
  if (y && y.value != null) text += ` ${y.display.replace(" of circulating", "")} of circulating supply is due to unlock in the next 12 months.`;
  else if (!t.unlocks) text += " DefiLlama does not track an unlock schedule for it.";
  return text;
}

// One plain sentence of facts that opens each area (Factsheet layout).
const money = (v) => fmt.usd(v);
function tractionLead(t, a) {
  const L = t.llama, f = a.rows.find((r) => r.id === "feesTrend"), tv = a.rows.find((r) => r.id === "tvlTrend");
  const parts = [];
  if (L?.fees?.d30 != null) parts.push(`${t.name} earned ${money(L.fees.d30)} in fees over the last 30 days${f?.value != null ? ` (${f.display} against the same window three months earlier)` : ""}${L.revenue?.d30 != null ? `, of which ${money(L.revenue.d30)} was revenue` : ""}`);
  if (L?.tvl?.now) parts.push(`${money(L.tvl.now)} is locked in it${tv?.value != null ? ` (${tv.display} in 30 days)` : ""}`);
  if (L?.chain?.dex30) parts.push(`${money(L.chain.dex30)} traded on its DEXs in 30 days`);
  return parts.length ? parts.join("; ") + "." : "DefiLlama returned no fee or TVL data for it.";
}
function accrualLead(t, a) {
  const r = a.rows.find((x) => x.id === "holdersShare");
  if (r?.value == null) return "DefiLlama has no holders-revenue data for it, so it is unclear whether fees reach token holders.";
  return r.value === 0 ? `None of ${t.name}'s fees reached token holders in the last 30 days, according to DefiLlama.` : `${r.display} of ${t.name}'s fees reached token holders in the last 30 days, through buybacks, burns or staking payouts.`;
}
function treasuryLead(t) {
  const tr = t.llama?.treasury;
  return tr ? `The treasury holds ${money(tr.other)} in other assets and ${money(tr.own)} in ${t.sym}.` : "DefiLlama does not track a treasury for it.";
}
const peerLabel = (p) => `${p.n} ${p.group === "all fee-earning tokens" ? p.group : `${p.group} peers`}`;
function valuationLead(t, a) {
  const f = a.rows.find((r) => r.id === "feeMultiple"), m = a.rows.find((r) => r.id === "mcapToTvl");
  const parts = [];
  if (f?.value != null) parts.push(`${t.sym} is valued at ${f.display} its yearly fees${f.peer ? `, cheaper than ${f.peer.cheaperThan}% of ${peerLabel(f.peer)}` : ""}`);
  if (m?.value != null) parts.push(`its market cap is ${m.display} the value locked in it`);
  return parts.length ? parts.join("; ") + "." : "There are no fees or TVL to value it against.";
}
function holdersLead(t, a) {
  const r = a.rows.find((x) => x.id === "top10Share");
  if (r?.display === "Native asset") return `${t.name} is a chain's native coin, so there is no token contract or holder list to inspect.`;
  if (r?.value == null) return "The holder list could not be checked.";
  if (t.security.chain === "solana") return `The 10 largest wallets hold ${r.display} of the supply. On Solana these can include team, exchange and treasury wallets, which are not single owners.`;
  const c = t.security.holders.filter((h) => h.contract).length;
  return `The 10 largest wallets hold ${r.display} of the supply; ${c} of them are contracts such as exchanges, bridges, staking or treasuries, not single owners.`;
}
function marketLead(t, a) {
  const v = a.rows.find((x) => x.id === "volumeToMcap"), h = a.rows.find((x) => x.id === "athDistance");
  const parts = [];
  if (v?.value != null) parts.push(`${money(t.volume24h)} traded in the last 24 hours, ${v.display} of its market cap`);
  if (h?.value != null) parts.push(`the price is ${Math.abs(h.value).toFixed(0)}% below its all-time high`);
  return parts.length ? parts.join("; ") + "." : "CoinGecko has no market data for it.";
}
function securityLead(t, a) {
  const f = a.rows.find((x) => x.id === "contractFlags"), e = a.rows.find((x) => x.id === "exploitLoss");
  const parts = [];
  if (f?.display === "Native asset") parts.push("As a native coin it has no token contract to audit");
  else if (f?.value != null) parts.push(f.value === 0 ? "GoPlus found no risky owner powers, taxes or honeypot behaviour in the contract" : `GoPlus raises ${f.display} on the contract: ${t.security.flags.join(", ").toLowerCase()}`);
  const n = (t.defiExtra?.hacks || []).length, ex = n === 1 ? "1 exploit" : `${n} exploits`;
  if (e?.value != null) parts.push(!n ? "DefiLlama records no exploits" : e.value === 0 ? `DefiLlama records ${ex}, with the funds returned in full` : `DefiLlama records ${ex}, with ${e.display} lost after returned funds`);
  return parts.length ? parts.join("; ") + "." : "The contract could not be checked.";
}
function devLead(t, a) {
  const c = a.rows.find((x) => x.id === "contributors90");
  if (!c || c.value == null) return c?.display === "Not measured yet" ? "Development activity is still queued for measurement by the daily job." : "No public GitHub repository is linked for it.";
  const d = t.meta.dev;
  return `${c.display} people (bots excluded) made ${d.commits90} commits in the last 90 days across ${d.repos.length} recently active repositories, against ${d.commitsPrev90} commits in the 90 days before.`;
}
function backersLead(t, a) {
  const r = a.rows.find((x) => x.id === "raised"), g = a.rows.find((x) => x.id === "age");
  const parts = [];
  if (r?.value) parts.push(`It raised ${r.display} across ${t.meta.raises.length} recorded round${t.meta.raises.length > 1 ? "s" : ""}`);
  else if (r?.value === 0) parts.push("DefiLlama records no funding rounds");
  if (g?.value != null) parts.push(`the token has traded for ${g.display}`);
  return parts.length ? parts.join("; ") + "." : "No funding or age data for it.";
}
const LEADS = { valuation: valuationLead, holders: holdersLead, market: marketLead, security: securityLead, dev: devLead, backers: backersLead, dilution: leadSentence, traction: tractionLead, accrual: accrualLead, treasury: treasuryLead };
// Charts shown under an area's facts.
const CHARTS = {
  holders: (t) => (t.security?.holders?.length ? `<div class="chartbox"><span class="label">Top 10 wallets, share of supply (GoPlus, ${esc(chainName(t.security.chain))})</span>${holdersChart(t.security.holders)}</div>` : ""),
  traction: (t) => (t.llama?.fees?.monthly?.length ? `<div class="chartbox"><span class="label">Fees and revenue per month (DefiLlama)</span>${feesChart(t.llama.fees.monthly, t.llama.revenue?.monthly)}</div>` : ""),
  dilution: (t) => (t.unlocks?.detail?.monthly ? `<div class="chartbox"><span class="label">Unlock schedule (DefiLlama)</span>${unlockChart(t.unlocks.detail, t.unlocks.max || t.unlocks.detail.maxSupply)}</div>` : ""),
};

// Which areas each live source feeds, so a failed source marks exactly its rows.
const SOURCE_AREAS = { defillama: ["valuation", "traction", "accrual"], goplus: ["holders", "security"] };
const SOURCE_NAMES = { defillama: "DefiLlama", goplus: "GoPlus" };
const failedSources = (t) => Object.keys(SOURCE_AREAS).filter((k) => t.sourceFailed?.[k]);
const failedIn = (t, area) => failedSources(t).filter((k) => SOURCE_AREAS[k].includes(area));
const unavailable = (t, r) => r.value == null && !r.unrated && failedIn(t, r.area).length > 0;

function sourceBanner(t, area) {
  return failedIn(t, area).map((k) => `<div class="srcfail" role="alert">${SOURCE_NAMES[k]} didn't answer, so some rows here are missing.
    <button class="btn btn-ghost btn-sm" data-retry="${k}">Retry</button></div>`).join("");
}

function factCard(r, t) {
  const display = t && unavailable(t, r) ? "Source unavailable" : r.display;
  return `<div class="fact t-${tone(r.favour)}" tabindex="0" aria-describedby="rule-${r.id}">
      <a class="label mlink" href="methodology.html#m-${r.id}" title="How this is measured">${esc(r.label)}</a>
      <span class="vv">${esc(display)}</span>
      ${strip(r)}
      ${r.peer ? `<div class="ex peer">Cheaper than ${r.peer.cheaperThan}% of ${esc(peerLabel(r.peer))}</div>` : ""}
      ${r.extra ? `<div class="ex">${esc(r.extra)}</div>` : ""}
      <div class="src">Source: ${esc(r.src)}</div>
      <div class="rule" id="rule-${r.id}" role="tooltip">${esc(r.rule)}</div>
    </div>`;
}

function factsheet(t, a) {
  return Object.values(a.byArea).map((d) => `<section class="sec" aria-labelledby="sec-${d.id}" id="area-${d.id}">
      <div class="sec-head t-${areaTone(d.avg)}"><span class="label" id="sec-${d.id}">${esc(d.name)}</span><span class="verdict">${d.word}</span></div>
      ${sourceBanner(t, d.id)}
      ${LEADS[d.id] ? `<p class="lead">${esc(LEADS[d.id](t, a))}</p>` : ""}
      <div class="facts">${d.rows.map((r) => factCard(r, t)).join("")}</div>
      ${CHARTS[d.id] ? CHARTS[d.id](t) : ""}
    </section>`).join("");
}

// Table view: one dense scorecard (prototype variant A), same data and rules as the factsheet.
function scoreTable(t, a) {
  const rows = Object.values(a.byArea).map((d) => `
    <tr class="grp" id="area-${d.id}"><th colspan="4" scope="rowgroup"><span>${esc(d.name)}</span> <span class="verdict t-${areaTone(d.avg)}">${d.word}</span>${sourceBanner(t, d.id)}</th></tr>
    ${d.rows.map((r) => `<tr>
      <td><a class="tl mlink" href="methodology.html#m-${r.id}" title="How this is measured">${esc(r.label)}</a>${r.extra ? `<div class="ex">${esc(r.extra)}</div>` : ""}</td>
      <td class="v">${esc(unavailable(t, r) ? "Source unavailable" : r.display)}</td>
      <td class="rt" title="${esc(r.rule)}">${strip(r)}${r.peer ? `<div class="ex">Cheaper than ${r.peer.cheaperThan}% of ${esc(peerLabel(r.peer))}</div>` : ""}</td>
      <td class="src">${esc(r.src)}</td></tr>`).join("")}`).join("");
  return `<div class="tablewrap"><table class="score"><thead><tr><th scope="col">Metric</th><th scope="col">Value</th><th scope="col">Rating</th><th scope="col" class="src">Source</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

// Area verdicts sit in the same place in both views; each chip jumps to its area.
function areaChips(a) {
  return `<nav class="areachips" aria-label="Area verdicts">${Object.values(a.byArea).map((d) =>
    `<a class="chip t-${areaTone(d.avg)}" href="#area-${d.id}"><span class="dot"></span>${esc(d.name)}: ${d.word}</a>`).join("")}</nav>`;
}

const VIEW_KEY = "tf-view";
function getView() {
  try { return localStorage.getItem(VIEW_KEY) || state.viewFallback || state.defaultView; }
  catch { return state.viewFallback || state.defaultView; }
}
function setView(v) {
  state.viewFallback = v;
  try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage blocked: the choice lasts for this page only */ }
}

function viewToggle(view) {
  return `<div class="viewtoggle" role="group" aria-label="Layout">
    ${["factsheet", "table"].map((v) => `<button data-view="${v}" aria-pressed="${view === v}" class="${view === v ? "on" : ""}">${v === "factsheet" ? "Factsheet" : "Table"}</button>`).join("")}</div>`;
}

function renderToken(t, via) {
  state.current = { t, via };
  const cls = classify(state.idmap?.[t.id], t.categories);
  const a = analyse(t, HOUSE_RULES, cls);
  const view = getView();
  $("#view").innerHTML = outsideBanner(t, via) + identity(t, a, cls)
    + `<div class="viewbar">${areaChips(a)}${viewToggle(view)}</div>`
    + (view === "table" ? scoreTable(t, a) : factsheet(t, a));
  document.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = () => copyAddress(b)));
  document.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => { setView(b.dataset.view); renderToken(t, via); }));
  document.querySelectorAll("[data-retry]").forEach((b) => (b.onclick = () => retrySource(b.dataset.retry, b)));
  document.title = `${t.sym} · Token Fundamentals`;
  renderFoot(t);
}

async function copyAddress(btn) {
  try {
    await navigator.clipboard.writeText(btn.dataset.copy);
    btn.classList.add("copied");
    btn.setAttribute("aria-label", "Copied");
    setTimeout(() => btn.classList.remove("copied"), 1400);
  } catch { window.prompt("Copy the address:", btn.dataset.copy); }
}

const ISSUES_URL = "https://github.com/CryptoGeadas/crypto-fundamentals/issues?q=is%3Aissue+is%3Aopen+label%3Apipeline";
const fmtWhen = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";

// "Data updated 4 Oct 06:00 UTC, all sources OK", or which sources are degraded and which data is older.
function healthLine(s) {
  if (!s) return "";
  const bad = Object.entries(s.sources || {}).filter(([, v]) => v !== "ok");
  const kept = Object.entries(s.datasets || {}).filter(([, d]) => d.status === "kept");
  const ok = s.healthy;
  const parts = [`<span class="health ${ok ? "ok" : "warn"}" aria-hidden="true"></span>Data updated ${fmtWhen(s.startedAt)}`];
  parts.push(ok ? "all sources OK" : `${bad.length || s.problems.length} ${bad.length === 1 ? "source" : "sources"} degraded`);
  const plain = { universe: "the token list", idmap: "the DefiLlama links" };
  if (kept.length) parts.push(`using earlier data for ${kept.map(([n, d]) => `${plain[n] || n}${d.lastSuccess ? ` (from ${fmtWhen(d.lastSuccess)})` : ""}`).join(", ")}`);
  return parts.join(", ") + (ok ? "." : `. <a href="${ISSUES_URL}" target="_blank" rel="noopener">See status</a>.`) + "<br>";
}

function renderFoot(t) {
  const u = state.universe;
  $("#foot").innerHTML = `${healthLine(state.status)}
    ${t ? `Live data from CoinGecko, fetched ${t.fetchedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} in your browser. ` : ""}
    ${u ? `Verified token list: ${u.count} tokens. ` : ""}
    Ratings follow house rules v${HOUSE_RULES.version}: published opinions, not evidence. Hover a rating to see its rule.<br>
    Informational only, not financial advice.`;
}

function renderLoading(text) {
  $("#view").innerHTML = `<div class="state" aria-busy="true">${text ? `<p>${esc(text)}</p>` : ""}<div class="skel" style="width:40%"></div><div class="skel" style="width:70%"></div><div class="skel" style="width:55%"></div></div>`;
}

function renderError(msg, retry) {
  $("#view").innerHTML = `<div class="state" role="alert"><p>${esc(msg)}</p>${retry ? `<button class="btn btn-secondary btn-sm" id="retry">Try again</button>` : ""}</div>`;
  if (retry) $("#retry").onclick = retry;
}

function renderEmpty() {
  const ex = EXAMPLES.map((id) => state.byId.get(id)).filter(Boolean);
  $("#view").innerHTML = `<div class="state">Search any of the ${state.universe.count} verified tokens by name or ticker, or paste a contract address.
    ${ex.length ? `<div class="examples">Try: ${ex.map((t) => `<button class="chip-btn" data-id="${t.id}">${esc(t.sym)}</button>`).join("")}</div>` : ""}</div>`;
  document.querySelectorAll(".chip-btn").forEach((b) => (b.onclick = () => load(b.dataset.id)));
  renderFoot(null);
}

// ---------------------------------------------------------------- loading
function setUrl(id) {
  const url = new URL(location.href);
  url.searchParams.set("t", id);
  history.replaceState(null, "", url);
}

async function load(id, via) {
  const seq = ++state.loadSeq;
  state.id = id;
  setUrl(id);
  renderLoading();
  try {
    const entry = state.idmap?.[id];
    const [t, detail] = await Promise.all([
      fetchToken(id, { onRetry: () => seq === state.loadSeq && renderLoading("CoinGecko is busy; trying again in a few seconds…") }),
      loadUnlockDetail(id),
    ]);
    t.sourceFailed = {};
    const securityJob = fetchSecurity(t).catch(() => { t.sourceFailed.goplus = true; return null; });
    const firstPriceJob = fetch(`https://coins.llama.fi/prices/first/coingecko:${encodeURIComponent(id)}`).then((r) => r.json())
      .then((d) => d.coins?.[`coingecko:${id}`]?.timestamp ?? null).catch(() => null);
    const u = state.unlocks?.[id];
    t.unlocks = u ? { ...u, detail } : null;
    t.llama = await loadLlama(id, entry, state.defi?.[id], classify(entry, t.categories)).catch(() => ({ failed: true }));
    if (t.llama?.failed) t.sourceFailed.defillama = true;
    t.security = await securityJob;
    t.firstPriceTs = await firstPriceJob;
    t.meta = state.meta?.[id] || null;
    t.defiExtra = state.defi?.[id] ? { hacks: state.defi[id].hacks || [], audits: state.defi[id].audits || null } : null;
    t.peers = state.peers ? { group: state.peers.byToken?.[id]?.group, groups: state.peers.groups, secondary: entry?.c ? "Chain" : null } : null;
    if (seq === state.loadSeq) renderToken(t, via);
  } catch (e) {
    if (seq === state.loadSeq) renderError(e.message || "Something went wrong.", () => load(id, via));
  }
}

// Retry one failed live source for the token on screen, then re-render.
async function retrySource(source, btn) {
  const cur = state.current;
  if (!cur) return;
  btn.disabled = true;
  btn.textContent = "Retrying…";
  const { t, via } = cur;
  if (source === "defillama") {
    const entry = state.idmap?.[t.id];
    t.llama = await loadLlama(t.id, entry, state.defi?.[t.id], classify(entry, t.categories)).catch(() => ({ failed: true }));
    t.sourceFailed.defillama = Boolean(t.llama?.failed);
  } else if (source === "goplus") {
    t.sourceFailed.goplus = false;
    t.security = await fetchSecurity(t).catch(() => { t.sourceFailed.goplus = true; return null; });
  }
  if (state.current === cur) renderToken(t, via);
}

// Full unlock schedule for one token (same origin, built by the daily job); optional.
async function loadUnlockDetail(id) {
  if (!state.unlocks?.[id]?.detail) return null;
  try {
    const r = await fetch(`./data/unlocks/${encodeURIComponent(id)}.json`, { cache: "no-cache" });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function loadAddress(address, kind) {
  const known = lookupAddress(state.addrIdx, address);
  if (known) return load(known);
  const seq = ++state.loadSeq;
  renderLoading("Looking this address up across chains…");
  try {
    const id = await resolveAddress(address, kind);
    if (seq !== state.loadSeq) return;
    if (!id) return renderError(`No CoinGecko-listed token was found at ${address} on ${kind === "solana" ? "Solana" : "Ethereum, BNB Chain, Base, Arbitrum, Polygon, Optimism or Avalanche"}.`);
    load(id, address);
  } catch (e) {
    if (seq === state.loadSeq) renderError(e.message || "The lookup failed.", () => loadAddress(address, kind));
  }
}

// ---------------------------------------------------------------- search
const q = $("#q"), dd = $("#dd"), box = $(".searchbar");

function closeDropdown() { dd.hidden = true; box.setAttribute("aria-expanded", "false"); }

function drawDropdown() {
  if (!q.value.trim()) return closeDropdown();
  if (state.address) {
    const known = lookupAddress(state.addrIdx, state.address.value);
    const t = known && state.byId.get(known);
    dd.innerHTML = `<div class="it sel" role="option" aria-selected="true" data-addr="1">${t
      ? `<img src="${esc(t.img)}" alt="" width="22" height="22"><b>${esc(t.sym)}</b><span>${esc(t.name)} · matched by contract address</span>`
      : `<b>${state.address.kind === "solana" ? "Solana" : "EVM"}</b><span>Look up this contract address (outside the verified universe)</span>`}</div>`;
  } else if (state.hits.length) {
    const clash = tickerClashes(state.hits);
    dd.innerHTML = state.hits.map((t, i) => `<div class="it ${i === state.sel ? "sel" : ""}" role="option" aria-selected="${i === state.sel}" data-id="${t.id}">
        <img src="${esc(t.img)}" alt="" width="22" height="22" loading="lazy"><b>${esc(t.sym)}</b><span>${esc(t.name)}${clash.has(t.id) ? ' <em class="clash">same ticker</em>' : ""}</span>
        <span class="r">#${t.rank}</span></div>`).join("");
  } else {
    dd.innerHTML = `<div class="msg">Not in the verified universe (CoinGecko top 300, plus tokens up to #1,500 with DefiLlama data). Paste its contract address instead.</div>`;
  }
  dd.hidden = false;
  box.setAttribute("aria-expanded", "true");
  dd.querySelectorAll(".it").forEach((el) => el.addEventListener("mousedown", (e) => { e.preventDefault(); choose(el); }));
}

function choose(el) {
  const addr = state.address;
  q.value = ""; state.hits = []; state.address = null;
  closeDropdown(); q.blur();
  if (el.dataset.addr && addr) loadAddress(addr.value, addr.kind);
  else if (el.dataset.id) load(el.dataset.id);
}

q.addEventListener("input", () => {
  const v = q.value.trim();
  const kind = addressKind(v);
  state.address = kind ? { value: v, kind } : null;
  state.hits = kind || !state.universe ? [] : searchUniverse(state.universe.tokens, v);
  state.sel = 0;
  drawDropdown();
});
q.addEventListener("keydown", (e) => {
  if (dd.hidden) return;
  const n = state.address ? 1 : state.hits.length;
  if (e.key === "ArrowDown") { state.sel = Math.min(state.sel + 1, n - 1); drawDropdown(); e.preventDefault(); }
  else if (e.key === "ArrowUp") { state.sel = Math.max(state.sel - 1, 0); drawDropdown(); e.preventDefault(); }
  else if (e.key === "Enter") { const el = dd.querySelectorAll(".it")[state.sel]; if (el) { choose(el); e.preventDefault(); } }
  else if (e.key === "Escape") { q.value = ""; state.address = null; closeDropdown(); }
});
q.addEventListener("blur", () => setTimeout(closeDropdown, 120));

// ---------------------------------------------------------------- theme
$("#theme").addEventListener("click", () => {
  const r = document.documentElement;
  r.dataset.theme = r.dataset.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem("theme", r.dataset.theme); } catch { /* storage unavailable: theme still toggles */ }
});

// ---------------------------------------------------------------- start
async function start() {
  renderLoading();
  try {
    const res = await fetch("./data/universe.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.universe = await res.json();
  } catch {
    q.disabled = true;
    return renderError("The verified token list could not be loaded.", () => { q.disabled = false; start(); });
  }
  // Optional data: the page still works without them (type falls back to the meme/narrative rule).
  const [status, idmap, unlocks, defi, peers, meta] = await Promise.all(["status.json", "idmap.json", "unlocks.json", "defi.json", "peers.json", "meta.json"].map((f) =>
    fetch(`./data/${f}`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
  state.status = status;
  state.idmap = idmap?.map || null;
  state.unlocks = unlocks?.tokens || null;
  state.defi = defi?.tokens || null;
  state.peers = peers || null;
  state.meta = meta?.tokens || null;
  state.byId = new Map(state.universe.tokens.map((t) => [t.id, t]));
  state.addrIdx = buildAddressIndex(state.universe.tokens);
  $("#hint").textContent = `${state.universe.count} verified tokens`;
  if (state.id) load(state.id);
  else renderEmpty();
}
start();
