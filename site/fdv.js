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
