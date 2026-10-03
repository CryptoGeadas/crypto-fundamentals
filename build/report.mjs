// Run report for the daily job: collects every problem, decides whether new data is safe to
// publish, and produces site/data/status.json (always written, even when a run fails).
// The pure helpers are exported for build/check-report.mjs.

export const ALERT_TITLE = "Daily update problems";
export const MAX_DROP = 0.10; // refuse a dataset that shrank by more than 10% since the last good run

export class Report {
  constructor(now = new Date()) {
    this.startedAt = now.toISOString();
    this.problems = [];          // { level: "error" | "warning", source, message }
    this.sources = {};           // name → "ok" | "degraded" | "failed"
    this.datasets = {};          // name → { status: "updated" | "kept" | "unchanged", count, lastSuccess }
  }
  ok(source) { if (!this.sources[source]) this.sources[source] = "ok"; }
  warn(source, message) {
    this.problems.push({ level: "warning", source, message });
    if (this.sources[source] !== "failed") this.sources[source] = "degraded";
  }
  error(source, message) {
    this.problems.push({ level: "error", source, message });
    this.sources[source] = "failed";
  }
  status(previous = {}) {
    const prevSets = previous.datasets || {};
    const datasets = {};
    for (const name of new Set([...Object.keys(prevSets), ...Object.keys(this.datasets)])) {
      datasets[name] = { ...prevSets[name], ...this.datasets[name] };
    }
    return {
      generated: new Date().toISOString(),
      startedAt: this.startedAt,
      healthy: this.problems.length === 0,
      sources: this.sources,
      datasets,
      problems: this.problems,
    };
  }
}

// Sanity check on a rebuilt dataset against the last good one. Returns null when safe,
// or a human-readable reason to keep the previous data.
export function sanityCheck(name, newCount, previousCount, minCount = 0) {
  if (!Number.isFinite(newCount) || newCount < minCount) {
    return `${name}: only ${newCount} entries (minimum ${minCount}); kept the previous data.`;
  }
  if (previousCount && newCount < previousCount * (1 - MAX_DROP)) {
    const drop = Math.round((1 - newCount / previousCount) * 100);
    return `${name}: shrank by ${drop}% (${previousCount} → ${newCount}), more than the ${MAX_DROP * 100}% allowed; kept the previous data.`;
  }
  return null;
}

// What the alert step should do, given the run status and the currently open alert issue (if any).
export function decideAlert(status, openIssue) {
  const hasProblems = !status.healthy;
  if (hasProblems && !openIssue) return "create";
  if (hasProblems && openIssue) return "comment";
  if (!hasProblems && openIssue) return "close";
  return "none";
}

export function alertBody(status, runUrl) {
  const when = new Date(status.startedAt).toUTCString().replace(/:\d\d GMT$/, " UTC");
  const lines = status.problems.map((p) => `- **${p.level === "error" ? "Error" : "Warning"}** · ${p.source}: ${p.message}`);
  const kept = Object.entries(status.datasets).filter(([, d]) => d.status === "kept")
    .map(([n, d]) => `- \`${n}\` kept from ${d.lastSuccess ? new Date(d.lastSuccess).toUTCString() : "an earlier run"}`);
  return [
    `### Run of ${when}`,
    "",
    `${status.problems.length} problem(s):`,
    ...lines,
    ...(kept.length ? ["", "Previous good data kept (the live page keeps working on it):", ...kept] : []),
    "",
    runUrl ? `Run log: ${runUrl}` : "",
  ].join("\n");
}
