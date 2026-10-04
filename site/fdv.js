// Fully diluted valuation, one definition for the page and the daily job (issues #29, #31): price × max
// supply when a max exists, otherwise price × total supply. CoinGecko's own FDV is never used for
// ratings: it often counts total supply despite a higher max (Stargate: $21M vs $174M), and on some
// tokens it contradicts its own price and supply outright (Snowbank: $34.5 quadrillion).
export function fdvOf(price, maxSupply, totalSupply) {
  if (!(price > 0)) return null;
  if (maxSupply > 0) return price * maxSupply;
  return totalSupply > 0 ? price * totalSupply : null;
}
