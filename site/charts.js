// Small dependency-free SVG charts. Colours come from CSS tokens (sapphire ramp by opacity),
// so they follow the light/dark theme.

const fmtNum = (v) => {
  const a = Math.abs(v);
  return a >= 1e12 ? (v / 1e12).toFixed(2) + "T" : a >= 1e9 ? (v / 1e9).toFixed(2) + "B" : a >= 1e6 ? (v / 1e6).toFixed(1) + "M" : a >= 1e3 ? (v / 1e3).toFixed(1) + "K" : String(Math.round(v));
};
const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const fmtUsd = (v) => "$" + fmtNum(v);

// Monthly fees (solid) next to revenue (light), last 12 months.
export function feesChart(fees, revenue, { w = 640, h = 190 } = {}) {
  if (!fees?.length) return `<div class="nochart">No fee history</div>`;
  const rev = Object.fromEntries((revenue || []).map((x) => [x.m, x.v]));
  const max = Math.max(...fees.map((x) => x.v), ...fees.map((x) => rev[x.m] || 0), 1);
  const padB = 22, padT = 18, bw = (w - 8) / fees.length;
  const H = (v) => (v / max) * (h - padB - padT);
  const month = (m) => new Date(m + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  const bars = fees.map((x, i) => {
    const x0 = 4 + i * bw, r = rev[x.m] || 0;
    return `<rect x="${(x0 + bw * 0.08).toFixed(1)}" y="${(h - padB - H(x.v)).toFixed(1)}" width="${(bw * 0.4).toFixed(1)}" height="${H(x.v).toFixed(1)}" class="b1"><title>${esc(x.m)} fees ${fmtUsd(x.v)}</title></rect>
      <rect x="${(x0 + bw * 0.5).toFixed(1)}" y="${(h - padB - H(r)).toFixed(1)}" width="${(bw * 0.4).toFixed(1)}" height="${H(r).toFixed(1)}" class="b2"><title>${esc(x.m)} revenue ${fmtUsd(r)}</title></rect>
      ${i % 2 === 0 ? `<text x="${(x0 + bw / 2).toFixed(1)}" y="${h - 6}" class="ax" text-anchor="middle">${month(x.m)}</text>` : ""}`;
  }).join("");
  return `<figure class="chart"><svg viewBox="0 0 ${w} ${h}" class="svg" role="img" aria-label="Monthly fees and revenue">${bars}
      <text x="4" y="11" class="ax">${fmtUsd(max)} a month</text></svg>
    <figcaption class="legend"><span class="lg"><i></i>Fees</span><span class="lg"><i style="opacity:.4"></i>Revenue</span></figcaption></figure>`;
}

// Unlock schedule: cumulative unlocked supply per category, stacked, with a "today" marker and,
// when known, a dashed line at max supply (the gap above the stack is supply with no schedule).
export function unlockChart(detail, maxSupply, { w = 640, h = 220 } = {}) {
  const rows = detail?.monthly;
  if (!rows || rows.length < 2) return `<div class="nochart">No unlock schedule tracked</div>`;
  const cats = detail.cats;
  const x0 = rows[0][0], x1 = rows[rows.length - 1][0];
  const top = Math.max(...rows.map((r) => r.slice(1).reduce((a, b) => a + b, 0)), maxSupply || 0, 1);
  const padL = 4, padB = 22, padT = 16;
  const X = (x) => padL + ((x - x0) / (x1 - x0 || 1)) * (w - padL * 2);
  const Y = (y) => h - padB - (y / top) * (h - padB - padT);
  const opacity = (i) => (0.3 + 0.7 * (1 - i / Math.max(cats.length - 1, 1))).toFixed(2);
  let paths = "", lower = rows.map(() => 0);
  cats.forEach((cat, c) => {
    const upper = rows.map((r, i) => lower[i] + (r[c + 1] || 0));
    const fwd = rows.map((r, i) => `${i ? "L" : "M"}${X(r[0]).toFixed(1)},${Y(upper[i]).toFixed(1)}`).join("");
    const back = rows.map((r, i) => i).reverse().map((i) => `L${X(rows[i][0]).toFixed(1)},${Y(lower[i]).toFixed(1)}`).join("");
    paths += `<path d="${fwd}${back}Z" class="st" style="opacity:${opacity(c)}"><title>${esc(cat)}</title></path>`;
    lower = upper;
  });
  const now = Date.now() / 1000;
  const marker = now > x0 && now < x1
    ? `<line x1="${X(now)}" x2="${X(now)}" y1="${padT - 6}" y2="${h - padB}" class="now"/><text x="${X(now) + 4}" y="${padT}" class="ax">today</text>` : "";
  const maxLine = maxSupply ? `<line x1="${padL}" x2="${w - padL}" y1="${Y(maxSupply)}" y2="${Y(maxSupply)}" class="maxline"/><text x="${w - padL}" y="${Y(maxSupply) - 4}" class="ax" text-anchor="end">max supply ${fmtNum(maxSupply)}</text>` : "";
  const legend = cats.map((c, i) => `<span class="lg"><i style="opacity:${opacity(i)}"></i>${esc(c)}</span>`).join("");
  return `<figure class="chart"><svg viewBox="0 0 ${w} ${h}" class="svg" role="img" aria-label="Unlock schedule by category">${paths}${maxLine}${marker}
      <text x="${padL}" y="${h - 6}" class="ax">${fmtDate(x0)}</text><text x="${w - padL}" y="${h - 6}" class="ax" text-anchor="end">${fmtDate(x1)}</text></svg>
    <figcaption class="legend">${legend}</figcaption></figure>`;
}

// Top holders as horizontal bars: share of supply, with contract / locked / tag markers.
export function holdersChart(holders) {
  if (!holders?.length) return `<div class="nochart">No holder list</div>`;
  const max = Math.max(...holders.map((h) => h.percent || 0), 1);
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "?");
  return `<div class="hbars" role="list">${holders.map((h) => `<div class="hb" role="listitem">
      <span class="hn" title="${esc(h.address)}">${esc(h.tag || short(h.address))}${h.contract ? ' <em>contract</em>' : ""}${h.locked ? ' <em>locked</em>' : ""}</span>
      <span class="hbar"><i style="width:${(((h.percent || 0) / max) * 100).toFixed(1)}%"></i></span>
      <span class="hv">${(h.percent || 0).toFixed(1)}%</span></div>`).join("")}</div>`;
}
