// Per-visitor cache of live lookups, kept in this browser only (localStorage): never shared between
// visitors and never sent anywhere. Prices move by the minute, so market data is reused for 15 minutes;
// slow data (30-day fee windows, holders, contract flags, token age) for 12 hours. Failed lookups are
// never cached. Storage can be blocked or full: then everything is simply fetched live.

export const TTL = { market: 15 * 60 * 1000, slow: 12 * 60 * 60 * 1000 };
const PREFIX = "tf-cache:v1:";

export function createCache(storage = safeStorage(), now = () => Date.now()) {
  const read = (key, ttl) => {
    try {
      const hit = JSON.parse(storage?.getItem(PREFIX + key) || "null");
      return hit && now() - hit.at < ttl ? hit : null;
    } catch { return null; }
  };
  const write = (key, value) => {
    const entry = { at: now(), v: value };
    try { storage?.setItem(PREFIX + key, JSON.stringify(entry)); }
    catch { prune(true); try { storage?.setItem(PREFIX + key, JSON.stringify(entry)); } catch { /* full: live only */ } }
    return entry;
  };
  // Drop expired entries (or, when storage is full, all of ours).
  const prune = (all = false) => {
    try {
      for (const k of Object.keys(storage || {})) {
        if (!k.startsWith(PREFIX)) continue;
        const at = JSON.parse(storage.getItem(k) || "null")?.at || 0;
        if (all || now() - at >= TTL.slow) storage.removeItem(k);
      }
    } catch { /* storage unavailable */ }
  };

  // Returns { value, at } where at is when the value was fetched. fn() runs on a miss, or always with
  // fresh: true (the Refresh button). keep(value) decides whether a result is good enough to store.
  async function get(key, ttl, fn, { fresh = false, keep = (v) => v != null } = {}) {
    if (!fresh) { const hit = read(key, ttl); if (hit) return { value: hit.v, at: hit.at }; }
    const value = await fn();
    return keep(value) ? { value, at: write(key, value).at } : { value, at: now() };
  }
  return { get, prune };
}

function safeStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}
