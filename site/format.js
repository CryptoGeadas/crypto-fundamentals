// The page's one set of text helpers (#75): the HTML escape and the number formatters. Every
// file that writes text into the page imports from here, so there is one escape to keep right
// and one way a money figure is written.

// Text from outside (token names, source strings) is escaped before it goes into HTML.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const fmt = {
  // Money totals, abbreviated. A negative amount carries its sign in front: -$1.7M.
  usd(v) {
    if (v == null || !Number.isFinite(v)) return "—";
    if (v < 0) return "-" + fmt.usd(-v);
    if (v >= 1e12) return "$" + (v / 1e12).toFixed(2) + "T";
    if (v >= 1e9) return "$" + (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
    if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
    if (v >= 1) return "$" + v.toFixed(2);
    return fmt.price(v);
  },
  num(v) {
    if (v == null || !Number.isFinite(v)) return "—";
    const a = Math.abs(v);
    if (a >= 1e12) return (v / 1e12).toFixed(2) + "T";
    if (a >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return v.toFixed(a < 10 ? 1 : 0);
  },
  // Prices keep their digits ($2,734.12); tiny prices get 3 significant digits, never
  // scientific notation ($0.000000116, not $1.16e-7). Only large totals are abbreviated.
  price(v) {
    if (v == null || !Number.isFinite(v)) return "—";
    if (v >= 1) return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (v <= 0) return "$0";
    return "$" + v.toFixed(Math.min(20, 2 - Math.floor(Math.log10(v))));
  },
  pct: (v, d = 0) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d) + "%"),
  // Enough decimals that a value never rounds onto a band edge it sits below (1.47 must not read "1.5×").
  x: (v) => (v == null || !Number.isFinite(v) ? "—" : (v >= 100 ? Math.round(v).toLocaleString("en-US") : v >= 10 ? v.toFixed(1) : v.toFixed(2)) + "×"),
  chg: (v) => (v == null || !Number.isFinite(v) ? "—" : (v > 0 ? "+" : "") + v.toFixed(1) + "%"),
};
