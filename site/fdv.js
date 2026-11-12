// Fully diluted valuation, one definition for the page and the daily job (#29, #31, #39): price × total
// supply, the supply that exists now (price × max supply only when total is unknown). The gap between max
// and total supply can be unminted (BTC) or already burned (BNB, HYPE, Stargate) and no free source says
// which, so max supply is only shown as a note. Computed, never taken from CoinGecko, whose FDV
// sometimes contradicts its own price and supply (Snowbank: $34.5 quadrillion).
// With circulating supply given, CoinGecko's supply figures are cleaned first (cleanSupply, #30).
export function fdvOf(price, maxSupply, totalSupply, circulating) {
  if (!(price > 0)) return null;
  const total = circulating === undefined ? totalSupply : cleanSupply(circulating, totalSupply, maxSupply).total;
  if (total > 0) return price * total;
  return maxSupply > 0 ? price * maxSupply : null;
}

// Total supply this many times circulating, with nothing else to check it against, is a source error, not
// a 0.1% float: Snowbank's total is exactly its circulating × 10⁹ (a decimals slip).
export const JUNK_RATIO = 1000;

// CoinGecko's supply figures, with the ones that contradict the others marked or dropped (#30):
// - circulating above max supply: the max is out of date (Gala, LCX). Kept for the capped / uncapped
//   rules, but shown as out of date rather than as a cap.
// - total far above max supply (more tokens than the cap allows) while circulating fits under the cap:
//   the total is the error (Ferrum: 164T against a 616M cap), so it becomes unknown and max is used.
// - total over JUNK_RATIO × circulating: unknown (Snowbank), so FDV is unknown, never a wild figure.
export function cleanSupply(circulating, totalSupply, maxSupply) {
  let total = totalSupply > 0 ? totalSupply : null;
  const max = maxSupply > 0 ? maxSupply : null;
  const maxBelowCirc = Boolean(max && circulating > max * 1.001);
  if (max && !maxBelowCirc && total > max * 1.1) total = null;
  if (total && circulating > 0 && total > circulating * JUNK_RATIO) total = null;
  return { total, max, maxBelowCirc };
}

// Max supply is worth a note when it is more than 10% above total supply.
export const maxGap = (maxSupply, totalSupply) => maxSupply > 0 && totalSupply > 0 && maxSupply > totalSupply * 1.1;

// CoinGecko's market cap this far from its own price × circulating supply is a contradiction, not a
// timing gap (those stay under 3%): QuantixAI showed 411.6M against 999.1M (#30). Neither figure can be
// trusted, so the market cap becomes unknown and nothing is rated on it.
export const MCAP_CONTRADICTION = 0.25;
export function cleanMarketCap(marketCap, price, circulating) {
  if (!(marketCap > 0)) return null;
  if (price > 0 && circulating > 0 && Math.abs((price * circulating) / marketCap - 1) > MCAP_CONTRADICTION) return null;
  return marketCap;
}

// The page's FDV over this many times the market cap means under 2% of supply circulates. That is rare
// enough to be a source error (adi-token: 9.4M of 1B circulating, 106×; owner's call on #30), so FDV
// becomes unknown and nothing is rated on it, rather than a wild dilution rating.
export const FDV_RATIO_MAX = 50;
export const plausibleFdv = (fdv, marketCap) => (fdv > 0 && marketCap > 0 && fdv / marketCap > FDV_RATIO_MAX ? null : fdv);
