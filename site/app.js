import { analyse, fmt, tone } from "./rating.js";
import { HOUSE_RULES } from "./house-rules.js";
import { fetchToken } from "./coingecko.js";
import { addressKind, buildAddressIndex, lookupAddress, searchUniverse, tickerClashes } from "./search.js";
import { resolveAddress } from "./resolve.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const state = {
  id: new URLSearchParams(location.search).get("t"),
  universe: null, byId: new Map(), addrIdx: new Map(),
  sel: 0, hits: [], address: null, loadSeq: 0,
};
const EXAMPLES = ["bitcoin", "ethereum", "solana", "aave", "jupiter-exchange-solana", "arbitrum"];

// ---------------------------------------------------------------- rendering
function strip(r) {
  if (r.level == null) return `<span class="strip none">${r.unrated || r.value != null ? "Not rated" : "No data"}</span>`;
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

function identity(t) {
  return `<div class="idrow">
      ${t.img ? `<img class="logo" src="${esc(t.img)}" alt="" width="44" height="44">` : ""}
      <div><h2>${esc(t.name)}<span class="sym">${esc(t.sym)}</span></h2>
        ${t.rank ? `<div class="badges"><span class="badge badge-info">Rank #${t.rank}</span></div>` : ""}</div>
      <div class="px"><div class="p">${fmt.price(t.price)}</div><div class="c">30d ${fmt.chg(t.change30d)}</div></div>
    </div>
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
  return parts.length ? parts.join("; ") + "." : "CoinGecko has no supply data for this token.";
}

function factsheet(t, a) {
  const d = a.byArea.dilution;
  const areaTone = d.avg == null ? "n" : d.avg >= 1 ? "g2" : d.avg >= 0.34 ? "g1" : d.avg > -0.34 ? "n" : d.avg > -1 ? "b1" : "b2";
  const cards = d.rows.map((r) => `
    <div class="fact t-${tone(r.favour)}" tabindex="0" aria-describedby="rule-${r.id}">
      <span class="label">${esc(r.label)}</span>
      <span class="vv">${esc(r.display)}</span>
      ${strip(r)}
      ${r.extra ? `<div class="ex">${esc(r.extra)}</div>` : ""}
      <div class="src">Source: ${esc(r.src)}</div>
      <div class="rule" id="rule-${r.id}" role="tooltip">${esc(r.rule)}</div>
    </div>`).join("");
  return `<section class="sec" aria-labelledby="sec-dilution">
      <div class="sec-head t-${areaTone}"><span class="label" id="sec-dilution">Dilution</span><span class="verdict">${d.word}</span></div>
      <p class="lead">${esc(leadSentence(t, a))}</p>
      <div class="facts">${cards}</div>
    </section>`;
}

function renderToken(t, via) {
  const a = analyse(t, HOUSE_RULES);
  $("#view").innerHTML = outsideBanner(t, via) + identity(t) + factsheet(t, a);
  document.title = `${t.sym} · Token Fundamentals`;
  renderFoot(t);
}

function renderFoot(t) {
  const u = state.universe;
  $("#foot").innerHTML = `${t ? `Live data from CoinGecko, fetched ${t.fetchedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} in your browser. ` : ""}
    ${u ? `Verified token list: ${u.count} tokens, rebuilt ${new Date(u.generated).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}. ` : ""}
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
    const t = await fetchToken(id);
    if (seq === state.loadSeq) renderToken(t, via);
  } catch (e) {
    if (seq === state.loadSeq) renderError(e.message || "Something went wrong.", () => load(id, via));
  }
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
  state.byId = new Map(state.universe.tokens.map((t) => [t.id, t]));
  state.addrIdx = buildAddressIndex(state.universe.tokens);
  $("#hint").textContent = `${state.universe.count} verified tokens`;
  if (state.id) load(state.id);
  else renderEmpty();
}
start();
