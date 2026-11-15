// Network helpers for the daily job: paced API calls with a timeout and retries.
// Retries are logged in the run report (not alerted). Every daily step calls outside sources
// through the `net` it is handed (#76), so checks can swap in a fake.
//
//   createNet(report, { fetchImpl?, sleep? }) → { get, getJson }
//     get(url, source, { coingecko?, tries?, headers?, timeoutMs?, bodyTimeoutMs? }) → Response
//       Retries a call that cannot connect, hangs, is rate-limited (429) or fails on the server
//       side (5xx). Returns the last Response also when it is not ok, so the caller can tell
//       "no data" (400/404) from a failure. Throws only when no answer came after every try.
//       timeoutMs is the wait for the answer to START; the download of its body then has its
//       own, longer limit (bodyTimeoutMs), so a large answer on a slow line is not cut off (#79).
//     getJson(...) → parsed JSON; throws on any answer that is not ok.

export const UA_API = "Mozilla/5.0 (compatible; crypto-fundamentals daily build; +https://github.com/CryptoGeadas/crypto-fundamentals)";
const CG_GAP_MS = 8000; // the CoinGecko keyless tier throttles even at one call per ~7s
const TIMEOUT_MS = 60_000;
const BODY_TIMEOUT_MS = 10 * 60_000;
const timeoutError = () => new DOMException("The operation timed out", "TimeoutError");

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createNet(report, { fetchImpl = fetch, sleep: wait = sleep } = {}) {
  let lastCg = 0;

  async function get(url, source, { coingecko = false, tries = 4, headers = {}, timeoutMs = TIMEOUT_MS, bodyTimeoutMs = BODY_TIMEOUT_MS } = {}) {
    const host = new URL(url).host;
    for (let attempt = 1; ; attempt++) {
      if (coingecko) {
        const gap = lastCg + CG_GAP_MS - Date.now();
        if (gap > 0) await wait(gap);
        lastCg = Date.now();
      }
      let res;
      // our own timer (not AbortSignal.timeout): it is cleared once the answer starts, and it
      // keeps Node running while it waits
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(timeoutError()), timeoutMs);
      try {
        res = await fetchImpl(url, { headers: { "user-agent": UA_API, accept: "application/json", ...headers }, signal: ctl.signal });
      } catch (e) {
        const why = e?.name === "TimeoutError" ? `no answer in ${Math.round(timeoutMs / 1000)}s` : e.cause?.code || e.message;
        if (attempt < tries) { report.retry(source, `${host} unreachable (${why}), retried`); await wait(10_000); continue; }
        throw new Error(`${host} unreachable after ${tries} attempts`);
      } finally {
        clearTimeout(timer);
      }
      if ((res.status === 429 || res.status >= 500) && attempt < tries) {
        // release the answer we will not read, so its connection can be used again
        try { await res.body?.cancel(); } catch { /* nothing to release */ }
        const backoff = res.status === 429 ? 60_000 : 10_000;
        report.retry(source, `HTTP ${res.status} from ${host}${res.status === 429 ? " (rate limited)" : ""}, retried after ${backoff / 1000}s`);
        console.log(`  ${res.status} from ${host}, retrying in ${backoff / 1000}s (attempt ${attempt}/${tries})`);
        await wait(backoff);
        continue;
      }
      // the download's own limit; it must not hold the process open once the caller is done
      setTimeout(() => ctl.abort(timeoutError()), bodyTimeoutMs).unref?.();
      return res;
    }
  }

  async function getJson(url, source, opts) {
    const res = await get(url, source, opts);
    if (res.ok) { report.ok(source); return res.json(); }
    throw new Error(`${new URL(url).host} answered HTTP ${res.status} for ${new URL(url).pathname}`);
  }

  return { get, getJson };
}
