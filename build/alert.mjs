// Alert step for the daily job: reads site/data/status.json and keeps ONE GitHub issue,
// "Daily update problems", in sync with it. Problems open the issue (or comment on the open
// one); the first fully clean run closes it with "resolved". Uses the GITHUB_TOKEN every
// Action already has; no other keys.
//
// Run (in CI): GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/repo node build/alert.mjs
// Local dry run: node build/alert.mjs --dry-run

import { readFile } from "node:fs/promises";
import { ALERT_TITLE, decideAlert, alertBody } from "./report.mjs";

const dryRun = process.argv.includes("--dry-run");
const repo = process.env.GITHUB_REPOSITORY || "CryptoGeadas/crypto-fundamentals";
const token = process.env.GITHUB_TOKEN;
const runUrl = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}` : "";

async function gh(method, path, body) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "crypto-fundamentals-alert" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`GitHub API ${method} ${path} → HTTP ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function main() {
  const status = JSON.parse(await readFile(new URL("../site/data/status.json", import.meta.url), "utf8"));
  let open = null;
  if (!dryRun) {
    const issues = await gh("GET", `/issues?state=open&labels=pipeline&per_page=50`);
    open = issues.find((i) => i.title === ALERT_TITLE && !i.pull_request) || null;
  }
  const action = decideAlert(status, open);
  const body = alertBody(status, runUrl);
  console.log(`Alert: ${action}${open ? ` (issue #${open.number})` : ""}; ${status.problems.length} problem(s).`);
  if (dryRun) { if (action !== "none" && action !== "close") console.log("\n" + body); return; }

  if (action === "create") {
    const created = await gh("POST", "/issues", { title: ALERT_TITLE, body, labels: ["pipeline"] });
    console.log(`Opened issue #${created.number}`);
  } else if (action === "comment") {
    await gh("POST", `/issues/${open.number}/comments`, { body });
  } else if (action === "close") {
    await gh("POST", `/issues/${open.number}/comments`, { body: `Resolved: the run of ${new Date(status.startedAt).toUTCString()} was fully clean.${runUrl ? `\n\nRun log: ${runUrl}` : ""}` });
    await gh("PATCH", `/issues/${open.number}`, { state: "closed", state_reason: "completed" });
  }
}

main().catch((e) => { console.error(`Alert step failed: ${e.message}`); process.exit(1); });
