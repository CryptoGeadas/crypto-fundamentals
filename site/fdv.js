// Fully diluted valuation, one definition for the page and the daily job (issue #29): price × max supply
// whenever a max supply exists. CoinGecko often computes FDV from total supply instead, which hides
// supply still to be minted or unlocked (Stargate: $21M on total vs $174M on max). For uncapped
// tokens there is no max, so CoinGecko's figure (price × total supply) is used.
export function fdvOf(price, maxSupply, coingeckoFdv) {
  if (price > 0 && maxSupply > 0) return price * maxSupply;
  return coingeckoFdv > 0 ? coingeckoFdv : null;
}
