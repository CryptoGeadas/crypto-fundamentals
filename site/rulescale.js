// The house rule drawn as a five-step scale instead of a sentence of inequalities. Shared by the
// token page tooltips and the methodology page, so both show a rule the same way.
import { LEVELS, favourOf, tone } from "./rating.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const DIR = { up: "Higher is better", down: "Lower is better", none: "Context only: neither good nor bad" };

// Fixed thresholds: cuts are the four band edges as displayed (e.g. "0.10×"); level (1-5) marks the token.
export function scaleHtml({ dir, cuts, level = null }) {
  // Compact ranges: a shared unit (×, %) is written once, on the upper bound: "0.10–0.30×".
  const unit = (c) => (c.match(/[×%]$/) || [""])[0];
  const bare = (c) => (unit(c) ? c.slice(0, -1) : c);
  const span = (a, b) => (unit(a) && unit(a) === unit(b) ? `${bare(a)}–${b}` : `${a}–${b}`);
  const ranges = [`< ${cuts[0]}`, span(cuts[0], cuts[1]), span(cuts[1], cuts[2]), span(cuts[2], cuts[3]), `≥ ${cuts[3]}`];
  return `<div class="scale">
    <div class="scale-dir">${esc(DIR[dir] || DIR.none)}</div>
    <div class="scale-row">${LEVELS.map((w, i) => `<div class="seg t-${tone(favourOf(i + 1, dir))}${level === i + 1 ? " on" : ""}">
      <i></i><b>${w}</b><span>${esc(ranges[i])}</span></div>`).join("")}</div></div>`;
}

// Peer percentile: the five fifths of the peer group, cheapest first; level marks the token's fifth.
export function peerScaleHtml({ level = null, n = null, group = null, cheaperThan = null } = {}) {
  const fifths = ["Cheapest 20%", "20–40%", "Middle 20%", "60–80%", "Priciest 20%"];
  const head = n ? `Ranked against ${n} ${group === "all fee-earning tokens" ? group : `${group} peers`}` : "Ranked against its category peers";
  return `<div class="scale">
    <div class="scale-dir">${esc(head)} · lower is cheaper</div>
    <div class="scale-row">${LEVELS.map((w, i) => `<div class="seg t-${tone(favourOf(i + 1, "down"))}${level === i + 1 ? " on" : ""}">
      <i></i><b>${w}</b><span>${fifths[i]}</span></div>`).join("")}</div>
    ${cheaperThan != null ? `<div class="scale-note">Cheaper than ${cheaperThan}% of them</div>` : ""}</div>`;
}
