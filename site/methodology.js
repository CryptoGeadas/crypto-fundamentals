// Renders the generated parts of the methodology page from the same modules the dashboard uses,
// so every formula, source and threshold shown here is the one actually applied.
import { METRICS, AREAS, AREAS_BY_TYPE, ruleText, tidy } from "./rating.js";
import { HOUSE_RULES } from "./house-rules.js";
import { TYPES } from "./classify.js";
import { METRIC_EXPLAIN, AREA_INTROS, GLOSSARY, PRINCIPLES, principlesFor } from "./explain.js";
import { scaleHtml, peerScaleHtml } from "./rulescale.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const areaName = (id) => AREAS.find((a) => a.id === id)?.name || id;
const typeOrder = ["chain", "pegged", "defi", "meme", "narrative"];

// The rule as the reader sees it on a token page: a five-step scale, or a sentence when not rated.
function ruleVisual(m) {
  const r = HOUSE_RULES.metrics[m.id];
  const floor = m.base ? HOUSE_RULES.trendFloors?.[m.id] : null;
  const floorLine = floor != null ? `<p class="mrule-plain">Rated only when the smaller of the two periods is at least ${esc(tidy(m.baseShow(floor)))}; below that it is shown as "too small to rate". ${esc(HOUSE_RULES.trendFloorsReason.split(":")[0])}.</p>` : "";
  const why = r?.reason ? `<p class="mrule-plain"><span class="label">Why these cut-offs</span> ${esc(r.reason)}</p>` : "";
  if (m.yard === "fixed" && r) return scaleHtml({ dir: r.dir, cuts: r.bands.map((x) => m.show(x)) }) + why + floorLine;
  if (m.yard === "peer") return peerScaleHtml({}) + why;
  return `<p class="mrule-plain">${esc(rule(m))}</p>`;
}

function rule(m) {
  if (m.yard === "shown") return "Shown for context, never rated.";
  const r = HOUSE_RULES.metrics[m.id];
  if (m.yard === "peer") return `Percentile within the token's DefiLlama category: the cheapest 20% of the group is very low, the most expensive 20% very high. Lower is cheaper, which is better. Categories with fewer than 8 projects fall back to a wider group.${m.id === "feeMultiple" ? " Rated for chains only; shown for DeFi protocols." : m.id === "revenueMultiple" ? " Rated for DeFi protocols and chains whose protocol side earns fees; shown for chains." : ""}`;
  return r ? ruleText(m, r) : "";
}

function typesTable() {
  const head = `<tr><th scope="col">Type</th><th scope="col">Rule</th>${AREAS.map((a) => `<th scope="col" class="ar">${esc(a.name)}</th>`).join("")}</tr>`;
  const body = typeOrder.map((t) => `<tr><th scope="row">${esc(TYPES[t].label)}</th><td>${esc(TYPES[t].rule.replace(/^Type rule: /, ""))}</td>
    ${AREAS.map((a) => `<td class="ar">${AREAS_BY_TYPE[t].includes(a.id) ? "●" : ""}</td>`).join("")}</tr>`).join("");
  return `<div class="tablewrap"><table class="score types"><thead>${head}</thead><tbody>${body}</tbody></table></div>
    <p class="muted small">Checked in the order listed. ● = the area applies. Exchange tokens (CoinGecko's exchange-token categories, such as BNB, CRO and OKB) keep their type, but their valuation and value accrual are shown, not rated: part of their value comes from an exchange business that on-chain data doesn't cover.</p>`;
}

function metricList() {
  return AREAS.map((a) => {
    const ms = METRICS.filter((m) => m.area === a.id);
    if (!ms.length) return "";
    return `<section class="marea" id="area-${a.id}"><h3>${esc(a.name)}</h3><p>${esc(AREA_INTROS[a.id] || "")}</p>
      ${ms.map((m) => {
        const e = METRIC_EXPLAIN[m.id] || {};
        const types = m.types ? ` Applies to: ${m.types.map((t) => TYPES[t]?.label || t).join(", ")}.` : "";
        const rules = principlesFor(m).map((n) => `<a href="#p-${n}" title="${esc(PRINCIPLES[n - 1].name)}">${n}</a>`).join(", ");
        const terms = (e.terms || []).filter((t) => GLOSSARY[t]).map((t) => `<a href="#g-${t}">${esc(GLOSSARY[t].name)}</a>`).join(", ");
        return `<article class="metric" id="m-${m.id}"><h4>${esc(m.label)}</h4>
          <div class="mrule">${ruleVisual(m)}</div>
          <p class="mwhat">${esc(e.what)} ${esc(e.why)}</p>
          <p class="meta"><span class="label">Source</span> ${esc(m.src)}.${esc(types)}</p>
          ${m.note ? `<p class="meta"><span class="label">Caveat</span> ${esc(m.note)}</p>` : ""}
          ${rules ? `<p class="meta"><span class="label">Principles</span> ${rules}</p>` : ""}
          ${terms ? `<p class="meta"><span class="label">See also</span> ${terms}</p>` : ""}</article>`;
      }).join("")}</section>`;
  }).join("");
}

function glossary() {
  return Object.entries(GLOSSARY).sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([k, g]) => `<dt id="g-${k}">${esc(g.name)}</dt><dd>${esc(g.text)}</dd>`).join("");
}

$("#principles-list").innerHTML = PRINCIPLES.map((p) => `<li id="p-${p.n}"><strong>${esc(p.name)}</strong> ${esc(p.text)}</li>`).join("");
$("#types-table").innerHTML = typesTable();
$("#metric-list").innerHTML = metricList();
$("#glossary-list").innerHTML = glossary();
$("#hr-version").textContent = HOUSE_RULES.version;
$("#verdict-rule").textContent = HOUSE_RULES.verdictMinRatedReason;
// The page is rendered after load, so honour a #m-…, #g-… or #p-… link once the targets exist.
if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();

