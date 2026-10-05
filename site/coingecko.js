// CoinGecko keyless API, called from the visitor's browser (no server, no key).
import { fdvOf } from "./fdv.js";
const BASE = "https://api.coingecko.com/api/v3";

export class SourceError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

// One automatic wait-and-retry: CoinGecko's free tier throttles bursts, and its "too many requests"
// answers reach the browser as network failures (no CORS header), so both are retried once.
export async function fetchToken(id, { onRetry, waitMs = 8000 } = {}) {
  try {
    return await fetchTokenOnce(id);
  } catch (e) {
    if (!(e instanceof SourceError) || (e.status !== 0 && e.status !== 429)) throw e;
    onRetry?.();
    await new Promise((r) => setTimeout(r, waitMs));
    return fetchTokenOnce(id);
  }
}

async function fetchTokenOnce(id) {
  const url = `${BASE}/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
  let res;
  try {
    res = await fetch(url, { headers: { accept: "application/json" } });
  } catch {
    // CoinGecko's "too many requests" answers carry no CORS header, so the browser reports them as
    // a network failure: a rate limit and being offline look identical from here.
    throw new SourceError("CoinGecko didn't answer. This is usually its free-tier rate limit (too many lookups in a minute), or you may be offline. Wait a minute and try again.", 0);
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
    fdv: fdvOf(usd(md.current_price), num(md.max_supply), num(md.total_supply)),   // price × total supply (#39)
    fdvCoinGecko: num(usd(md.fully_diluted_valuation)),
    volume24h: num(usd(md.total_volume)),
    watchlist: num(c.watchlist_portfolio_users),   // CoinGecko users following it (attention area)
    athChange: typeof md.ath_change_percentage?.usd === "number" ? md.ath_change_percentage.usd : null,
    homeChain: c.asset_platform_id || null,   // the chain the token lives on natively (null for native assets)
    circulatingSupply: num(md.circulating_supply),
    totalSupply: num(md.total_supply),
    maxSupply: num(md.max_supply),
    categories: (c.categories || []).filter(Boolean),
    // chain → contract address; empty for native assets (BTC, ETH, SOL…)
    // Real addresses only: EVM 0x…, base58 (Solana and similar), or Move-style 0x…::module::Name.
    // Drops registry ids such as "asset_registry%2F1000624".
    contracts: Object.fromEntries(Object.entries(c.platforms || {}).filter(([k, v]) => k && typeof v === "string" &&
      (/^0x[0-9a-fA-F]{40}$/.test(v) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v) || /^0x[0-9a-fA-F]+::\w+::\w+$/.test(v)))),
    fetchedAt: new Date(),
  };
}
