// Circulating supply growth per year (issue #55, decision D3). Pure: no DOM, no network; shared by the
// page and the daily job.
//
// The daily job records each token's CoinGecko circulating supply once a day (data/supply.json,
// { tokens: { <id>: [[YYYY-MM-DD, circulating], ...] } }, the last KEEP_DAYS days). Growth is measured
// over about 30 days and annualised. Until the record covers 28 days, DefiLlama's own 30-day figure
// (circSupply30d in its unlock overview) is used for the tokens it tracks; otherwise it is unknown.
// One number for issuance (SOL), unlock emissions (SPK) and burns (BNB, negative).

export const KEEP_DAYS = 45;
const MIN_DAYS = 28;
const DAY_MS = 86_400_000;
const dayMs = (d) => Date.parse(`${d}T00:00:00Z`);

// Adds today's supply for every listed token. A token missing from today's list (it moved past the
// rank cut-off, or CoinGecko answered short) keeps its history until its points age past KEEP_DAYS.
// A missing or zero supply is not recorded (it would read as a fall to zero).
export function recordSupply(prev = {}, circById = {}, day) {
  const oldest = dayMs(day) - (KEEP_DAYS - 1) * DAY_MS;
  const out = {};
  for (const id of new Set([...Object.keys(prev), ...Object.keys(circById)])) {
    const past = (prev[id] || []).filter(([d]) => d !== day && dayMs(d) >= oldest);
    const c = circById[id];
    const pts = Number.isFinite(c) && c > 0 ? [...past, [day, c]] : past;
    if (pts.length) out[id] = pts.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }
  return out;
}

// The daily job's record (#55): CoinGecko's circulating_supply for the tokens in the universe, added to
// the previous record. → the payload for data/supply.json.
export function supplyRecord({ markets = [], tokens = [], prev = null, generated }) {
  const day = generated.slice(0, 10);
  const listed = new Set(tokens.map((t) => t.id));
  const circ = Object.fromEntries(markets.filter((m) => listed.has(m.id)).map((m) => [m.id, m.circulating_supply]));
  const out = recordSupply(prev?.tokens || {}, circ, day);
  return { generated, started: prev?.started || day, count: Object.keys(out).length, tokens: out };
}

const MAX_DAY_JUMP = 0.25; // a bigger one-day move is a data correction, not issuance or burning
const MAX_AGE_DAYS = 5;    // a record whose latest point is older than this has stopped updating

// → { value: % a year, days, from: "coingecko" | "defillama" } or null (unknown).
// history: [[day, circ], ...]; unlocks: { circ, circ30 }; now: YYYY-MM-DD (defaults to today, UTC).
export function supplyGrowth({ history = null, unlocks = null, now = new Date().toISOString().slice(0, 10) } = {}) {
  const pts = (history || []).filter(([d, c]) => d <= now && c > 0);
  const last = pts.at(-1);
  if (last && (dayMs(now) - dayMs(last[0])) / DAY_MS <= MAX_AGE_DAYS) {
    // the point closest to 30 days before the latest one, at least MIN_DAYS back
    const old = pts.filter(([d]) => (dayMs(last[0]) - dayMs(d)) / DAY_MS >= MIN_DAYS)
      .sort((a, b) => Math.abs((dayMs(last[0]) - dayMs(a[0])) / DAY_MS - 30) - Math.abs((dayMs(last[0]) - dayMs(b[0])) / DAY_MS - 30))[0];
    if (old) {
      const days = Math.round((dayMs(last[0]) - dayMs(old[0])) / DAY_MS);
      const win = pts.filter(([d]) => d >= old[0]);
      if (win.some(([, c], i) => i > 0 && Math.abs(c / win[i - 1][1] - 1) > MAX_DAY_JUMP)) return { value: null, jump: true, days, from: "coingecko" };
      return { value: (last[1] / old[1] - 1) * (365 / days) * 100, days, from: "coingecko" };
    }
  }
  if (unlocks?.circ > 0 && unlocks?.circ30 > 0) return { value: (unlocks.circ / unlocks.circ30 - 1) * (365 / 30) * 100, days: 30, from: "defillama" };
  return null;
}
