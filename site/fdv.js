// Fully diluted valuation, one definition for the page and the daily job (#29, #31, #39): price × total
// supply, the supply that exists now (price × max supply only when total is unknown). The gap between max
// and total supply can be unminted (BTC) or already burned (BNB, HYPE, Stargate) and no free source says
// which, so max supply is only shown as a note. Computed, never taken from CoinGecko, whose FDV
// sometimes contradicts its own price and supply (Snowbank: $34.5 quadrillion).
export function fdvOf(price, maxSupply, totalSupply) {
  if (!(price > 0)) return null;
  if (totalSupply > 0) return price * totalSupply;
  return maxSupply > 0 ? price * maxSupply : null;
}

// Max supply is worth a note when it is more than 10% above total supply.
export const maxGap = (maxSupply, totalSupply) => maxSupply > 0 && totalSupply > 0 && maxSupply > totalSupply * 1.1;
