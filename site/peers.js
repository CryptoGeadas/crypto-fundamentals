// Peer percentile for valuation multiples (decision 12). Pure; shared by the page and the Node checks.
// Groups come from data/peers.json, built daily by build/step-peers.mjs.

export const MIN_PEERS = 8; // below this a category falls back to all fee-earning tokens

// Percentile rating for a multiple within its group. Lower multiple = cheaper.
// Returns null when no comparison is possible.
// `secondary` is tried before the catch-all: a chain token whose protocol category is tiny (ARB's
// sequencer revenue is filed under "Foundation") is better compared with other chains.
export function peerPercentile(value, groupName, groups, key, secondary = null) {
  if (value == null || !(value > 0)) return null;
  const listOf = (g) => (groups[g] || []).map((p) => p[key]).filter((x) => x > 0);
  // A chain's "revenue" (burned fees, a treasury) is not a protocol's revenue (#54): revenue multiples
  // are never compared with the Chain group, as a secondary group or inside the wider fallback.
  const comparable = (g) => !(key === "pr" && g === "Chain");
  let name = groupName, list = listOf(groupName);
  if (list.length < MIN_PEERS && secondary && secondary !== groupName && comparable(secondary) && listOf(secondary).length >= MIN_PEERS) {
    name = secondary; list = listOf(secondary);
  }
  if (list.length < MIN_PEERS) {
    name = "all fee-earning tokens";
    list = Object.entries(groups).filter(([g]) => comparable(g)).flatMap(([, ps]) => ps).map((p) => p[key]).filter((x) => x > 0);
  }
  if (!list.length) return null;
  const below = list.filter((x) => x < value).length;
  const share = (below / list.length) * 100;           // % of peers cheaper than this token
  const level = share < 20 ? 1 : share < 40 ? 2 : share < 60 ? 3 : share < 80 ? 4 : 5;
  return { level, group: name, n: list.length, cheaperThan: Math.round(100 - share), fellBack: name !== groupName };
}

