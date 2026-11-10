// Token type by a fixed rule, checked in order (decision 14). Pure: no DOM, no network.
//   1. Chain     — DefiLlama lists it as a chain's native token
//   2. Pegged    — CoinGecko puts it in a stablecoin, tokenized-asset, wrapped or liquid-staking
//                  category (#53): its price follows something else, so fundamentals don't apply
//   3. DeFi      — DefiLlama lists it as the token of a protocol that earned fees (30 days)
//   4. Memecoin  — CoinGecko puts it in a meme category
//   5. Narrative — everything else
// A chain whose protocol side also earns fees (e.g. Hyperliquid) stays a Chain but is flagged
// `alsoDefi`, so DeFi metrics are shown when the data exists.

export const TYPES = {
  chain: { label: "Chain", rule: "Type rule: DefiLlama lists this as the native token of a chain." },
  pegged: { label: "Pegged asset", rule: "Type rule: CoinGecko puts this in a stablecoin, tokenized gold or fund, wrapped-token or liquid-staking category, and it is not a chain's native token." },
  defi: { label: "DeFi protocol", rule: "Type rule: DefiLlama lists this as the token of a protocol that earned fees in the last 30 days." },
  meme: { label: "Memecoin", rule: "Type rule: CoinGecko puts this in a meme category, and it is neither a chain nor a fee-earning protocol." },
  narrative: { label: "Narrative", rule: "Type rule: not a chain, not a fee-earning DefiLlama protocol, not in a meme category." },
};

export const isMemeCategory = (categories = []) => categories.some((c) => /\bmeme\b/i.test(String(c)));

// Categories whose tokens track a price outside themselves (a currency, gold, a fund, another coin).
// Exact names, so "Stablecoin Protocol" or "Real World Assets (RWA)" platform tokens stay out.
const PEGGED = new Set(["stablecoins", "usd stablecoin", "eur stablecoin", "fiat-backed stablecoin", "crypto-backed stablecoin",
  "synthetic dollar", "yield-bearing stablecoins", "tokenized gold", "tokenized silver", "tokenized commodities", "wrapped-tokens",
  "tokenized btc", "crypto-backed tokens", "liquid staking tokens", "tokenized treasury bills (t-bills)", "tokenized treasury bonds (t-bonds)",
  "tokenized money market funds"]);
export const isPeggedCategory = (categories = []) => categories.some((c) => PEGGED.has(String(c).toLowerCase()));

// What the token is pegged to, when the free data says so: DefiLlama's stablecoin list (pegType) or
// CoinGecko's USD categories give $1. Anything else (EUR, gold, a fund, another coin) is unknown for
// now: no free source here gives that target's price, and a guessed target would be a made-up number.
const USD_CATS = new Set(["usd stablecoin", "synthetic dollar"]);
export function pegTarget(categories = [], stable = null) {
  const pt = stable?.pegType;
  if (pt === "peggedUSD" || (!pt && categories.some((c) => USD_CATS.has(String(c).toLowerCase())))) return { target: 1, unit: "USD" };
  return { target: null, unit: pt ? pt.replace(/^pegged/, "") || null : null };
}

// The page's peg record: the target rule plus supply now and a month ago from the stablecoin list.
// listEntry: pegFromList's result, null (failed or not listed). Missing figures stay null (unknown).
export function pegOf(categories = [], listEntry = null) {
  return { ...pegTarget(categories, listEntry), supply: listEntry?.supply ?? null, supplyPrev: listEntry?.supplyPrev ?? null };
}

// Exchange-business tokens (#56): BNB, CRO, OKB, GT, KCS… Much of their value comes from a centralised
// exchange (profits, burns paid from them) that no free on-chain source covers. A flag on top of the
// type, not a type: BNB stays a Chain and keeps its other ratings.
const EXCHANGE = new Set(["exchange-based tokens", "centralized exchange (cex) token"]);
export const isExchangeCategory = (categories = []) => categories.some((c) => EXCHANGE.has(String(c).toLowerCase()));

export function classify(llamaEntry, categories = []) {
  return { ...baseType(llamaEntry || {}, categories), exchange: isExchangeCategory(categories) };
}

function baseType(e, categories) {
  if (e.c) return { type: "chain", alsoDefi: Boolean(e.p && e.f) };
  if (isPeggedCategory(categories)) return { type: "pegged", alsoDefi: false };
  if (e.p && e.f) return { type: "defi", alsoDefi: false };
  if (isMemeCategory(categories)) return { type: "meme", alsoDefi: false };
  return { type: "narrative", alsoDefi: false };
}
