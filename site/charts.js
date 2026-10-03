// Small dependency-free SVG charts. Colours come from CSS tokens (sapphire ramp by opacity),
// so they follow the light/dark theme.

const fmtNum = (v) => {
  const a = Math.abs(v);
  return a >= 1e12 ? (v / 1e12).toFixed(2) + "T" : a >= 1e9 ? (v / 1e9).toFixed(2) + "B" : a >= 1e6 ? (v / 1e6).toFixed(1) + "M" : a >= 1e3 ? (v / 1e3).toFixed(1) + "K" : String(Math.round(v));
};
const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

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
