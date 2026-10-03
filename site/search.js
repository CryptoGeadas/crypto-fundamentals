// Pure search helpers over the curated universe (no DOM, no network), shared with the Node check.

const EVM = /^0x[0-9a-fA-F]{40}$/;
const SOLANA = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// "evm" | "solana" | null
export function addressKind(s) {
  const v = String(s || "").trim();
  if (EVM.test(v)) return "evm";
  if (SOLANA.test(v)) return "solana";
  return null;
}

// EVM addresses are case-insensitive; Solana (base58) addresses are case-sensitive.
const addrKey = (a) => (EVM.test(a) ? a.toLowerCase() : a);

export function buildAddressIndex(tokens) {
  const idx = new Map();
  for (const t of tokens) for (const a of Object.values(t.addr || {})) if (!idx.has(addrKey(a))) idx.set(addrKey(a), t.id);
  return idx;
}

export const lookupAddress = (idx, address) => idx.get(addrKey(String(address).trim())) || null;

// Ticker/name search: exact ticker matches first, then by market-cap rank.
export function searchUniverse(tokens, query, limit = 8) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const hits = tokens.filter((t) => t.sym.toLowerCase().startsWith(q) || t.name.toLowerCase().includes(q));
  return hits
    .sort((a, b) => (b.sym.toLowerCase() === q) - (a.sym.toLowerCase() === q) || a.rank - b.rank)
    .slice(0, limit);
}

// Tokens in the result that share a ticker with another result, so the page can show full names.
export function tickerClashes(hits) {
  const count = {};
  for (const h of hits) count[h.sym] = (count[h.sym] || 0) + 1;
  return new Set(hits.filter((h) => count[h.sym] > 1).map((h) => h.id));
}
