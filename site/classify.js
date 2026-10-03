// Token type by a fixed rule, checked in order (decision 14). Pure: no DOM, no network.
//   1. Chain     — DefiLlama lists it as a chain's native token
//   2. DeFi      — DefiLlama lists it as the token of a protocol that earned fees (30 days)
//   3. Memecoin  — CoinGecko puts it in a meme category
//   4. Narrative — everything else
// A chain whose protocol side also earns fees (e.g. Hyperliquid) stays a Chain but is flagged
// `alsoDefi`, so DeFi metrics are shown when the data exists.

export const TYPES = {
  chain: { label: "Chain", rule: "Type rule: DefiLlama lists this as the native token of a chain." },
  defi: { label: "DeFi protocol", rule: "Type rule: DefiLlama lists this as the token of a protocol that earned fees in the last 30 days." },
  meme: { label: "Memecoin", rule: "Type rule: CoinGecko puts this in a meme category, and it is neither a chain nor a fee-earning protocol." },
  narrative: { label: "Narrative", rule: "Type rule: not a chain, not a fee-earning DefiLlama protocol, not in a meme category." },
};

export const isMemeCategory = (categories = []) => categories.some((c) => /\bmeme\b/i.test(String(c)));

export function classify(llamaEntry, categories = []) {
  const e = llamaEntry || {};
  if (e.c) return { type: "chain", alsoDefi: Boolean(e.p && e.f) };
  if (e.p && e.f) return { type: "defi", alsoDefi: false };
  if (isMemeCategory(categories)) return { type: "meme", alsoDefi: false };
  return { type: "narrative", alsoDefi: false };
}
