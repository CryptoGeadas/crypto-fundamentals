import { analyse, fmt, tone } from "./rating.js";
import { HOUSE_RULES } from "./house-rules.js";
import { STARTER } from "./starter.js";
import { fetchToken } from "./coingecko.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const state = { id: new URLSearchParams(location.search).get("t"), sel: 0, hits: [], loadSeq: 0 };

// ---------------------------------------------------------------- rendering
function strip(r) {
  if (r.level == null) return `<span class="strip none">${r.unrated || r.value != null ? "Not rated" : "No data"}</span>`;
  const good = r.favour > 0 ? "good" : r.favour < 0 ? "bad" : "neutral";
  return `<span class="strip t-${tone(r.favour)}" role="img" aria-label="Rating: ${r.word} (${good})">${[1, 2, 3, 4, 5]
    .map((i) => `<i class="${i === r.level ? "on" : ""}"></i>`).join("")}<b>${r.word}</b></span>`;
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

function renderToken(t) {
  const a = analyse(t, HOUSE_RULES);
  $("#view").innerHTML = identity(t) + factsheet(t, a);
  document.title = `${t.sym} · Token Fundamentals`;
  renderFoot(t);
}

function renderFoot(t) {
  $("#foot").innerHTML = `${t ? `Live data from CoinGecko, fetched ${t.fetchedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} in your browser. ` : ""}
    Ratings follow house rules v${HOUSE_RULES.version}: published opinions, not evidence. Hover a rating to see its rule.<br>
    Informational only, not financial advice.`;
}

function renderLoading() {
  $("#view").innerHTML = `<div class="state" aria-busy="true"><div class="skel" style="width:40%"></div><div class="skel" style="width:70%"></div><div class="skel" style="width:55%"></div></div>`;
}

function renderError(msg, id) {
  $("#view").innerHTML = `<div class="state" role="alert"><p>${esc(msg)}</p><button class="btn btn-secondary btn-sm" id="retry">Try again</button></div>`;
  $("#retry").onclick = () => load(id);
}

function renderEmpty() {
  $("#view").innerHTML = `<div class="state">Pick a token to start. This first version covers ${STARTER.length} tokens: ${STARTER.map((s) => s.sym).join(", ")}.</div>`;
  renderFoot(null);
}

// ---------------------------------------------------------------- loading
async function load(id) {
  const seq = ++state.loadSeq;
  state.id = id;
  const url = new URL(location.href);
  url.searchParams.set("t", id);
  history.replaceState(null, "", url);
  renderLoading();
  try {
    const t = await fetchToken(id);
    if (seq === state.loadSeq) renderToken(t);
  } catch (e) {
    if (seq === state.loadSeq) renderError(e.message || "Something went wrong.", id);
  }
}

// ---------------------------------------------------------------- search
const q = $("#q"), dd = $("#dd"), box = $(".searchbar");
$("#hint").textContent = `${STARTER.length} tokens`;

function search(s) {
  const lo = s.trim().toLowerCase();
  if (!lo) return [];
  return STARTER.filter((t) => t.sym.toLowerCase().startsWith(lo) || t.name.toLowerCase().includes(lo))
    .sort((x, y) => (y.sym.toLowerCase() === lo) - (x.sym.toLowerCase() === lo));
}

function drawDropdown() {
  if (!q.value.trim()) { dd.hidden = true; box.setAttribute("aria-expanded", "false"); return; }
  dd.innerHTML = state.hits.length
    ? state.hits.map((t, i) => `<div class="it ${i === state.sel ? "sel" : ""}" role="option" aria-selected="${i === state.sel}" data-id="${t.id}"><b>${t.sym}</b><span>${esc(t.name)}</span></div>`).join("")
    : `<div class="msg">Not in this first version's list. The full list of verified tokens arrives in the next release.</div>`;
  dd.hidden = false;
  box.setAttribute("aria-expanded", "true");
  dd.querySelectorAll(".it").forEach((el) => el.addEventListener("mousedown", (e) => { e.preventDefault(); pick(el.dataset.id); }));
}

function pick(id) {
  q.value = "";
  state.hits = [];
  drawDropdown();
  q.blur();
  load(id);
}

q.addEventListener("input", () => { state.hits = search(q.value); state.sel = 0; drawDropdown(); });
q.addEventListener("keydown", (e) => {
  if (dd.hidden) return;
  if (e.key === "ArrowDown") { state.sel = Math.min(state.sel + 1, state.hits.length - 1); drawDropdown(); e.preventDefault(); }
  else if (e.key === "ArrowUp") { state.sel = Math.max(state.sel - 1, 0); drawDropdown(); e.preventDefault(); }
  else if (e.key === "Enter" && state.hits[state.sel]) { pick(state.hits[state.sel].id); e.preventDefault(); }
  else if (e.key === "Escape") { q.value = ""; drawDropdown(); }
});
q.addEventListener("blur", () => setTimeout(() => { dd.hidden = true; box.setAttribute("aria-expanded", "false"); }, 120));

// ---------------------------------------------------------------- theme
$("#theme").addEventListener("click", () => {
  const r = document.documentElement;
  r.dataset.theme = r.dataset.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem("theme", r.dataset.theme); } catch { /* storage unavailable: theme still toggles */ }
});

// ---------------------------------------------------------------- start
if (state.id && STARTER.some((t) => t.id === state.id)) load(state.id);
else renderEmpty();
