// Cumulative unlocked supply at a time `ts` (seconds), from monthly rows, linear between rows.
// Its own small module, so the daily build can use it without loading the rating module (#79).
export function unlockedAt(monthly, ts) {
  if (!monthly?.length) return null;
  const total = (r) => r.slice(1).reduce((a, b) => a + b, 0);
  if (ts <= monthly[0][0]) return total(monthly[0]);
  for (let i = 1; i < monthly.length; i++) {
    if (ts <= monthly[i][0]) {
      const a = monthly[i - 1], b = monthly[i];
      return total(a) + (total(b) - total(a)) * ((ts - a[0]) / (b[0] - a[0] || 1));
    }
  }
  return total(monthly[monthly.length - 1]);
}
