// CoinGecko keyless API, called from the visitor's browser (no server, no key).
const BASE = "https://api.coingecko.com/api/v3";

export class SourceError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function fetchToken(id) {
  const url = `${BASE}/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
  let res;
  try {
    res = await fetch(url, { headers: { accept: "application/json" } });
  } catch {
    throw new SourceError("CoinGecko could not be reached. Check your connection and try again.");
  }
  if (res.status === 429) throw new SourceError("CoinGecko is rate-limiting requests right now. Wait a minute and try again.", 429);
  if (!res.ok) throw new SourceError(`CoinGecko answered with an error (HTTP ${res.status}).`, res.status);
  return normalise(await res.json());
}

// The rating module only ever sees this flat shape, never raw API payloads.
export function normalise(c) {
  const md = c.market_data || {};
  const usd = (o) => (o && typeof o.usd === "number" ? o.usd : null);
  const num = (v) => (typeof v === "number" && v > 0 ? v : null);
  return {
    id: c.id,
    name: c.name,
    sym: (c.symbol || "").toUpperCase(),
    img: c.image?.large || c.image?.small || "",
    rank: c.market_cap_rank ?? null,
    price: usd(md.current_price),
    change30d: md.price_change_percentage_30d ?? null,
    marketCap: num(usd(md.market_cap)),
    fdv: num(usd(md.fully_diluted_valuation)),
    circulatingSupply: num(md.circulating_supply),
    totalSupply: num(md.total_supply),
    maxSupply: num(md.max_supply),
    fetchedAt: new Date(),
  };
}
