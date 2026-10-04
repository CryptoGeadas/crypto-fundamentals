// Audit step for the daily job: reads site/data/audit.json and keeps ONE GitHub issue, "Data drift"
// (label audit), in sync: opened when drift first appears, its list refreshed every day, a comment
// (which notifies) only when new items appear, closed when the list is empty. Uses GITHUB_TOKEN.
//
// Run (in CI): GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/repo node build/audit-issue.mjs
// Local dry run: node build/audit-issue.mjs --dry-run

import { readFile } from "node:fs/promises";
import { DRIFT_TITLE, decideDrift, driftBody, keyOf, actionable } from "./audit-lib.mjs";

const dryRun = process.argv.includes("--dry-run");
const repo = process.env.GITHUB_REPOSITORY || "CryptoGeadas/crypto-fundamentals";
const token = process.env.GITHUB_TOKEN;
const runUrl = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}` : "";

async function gh(method, path, body) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "crypto-fundamentals-audit" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`GitHub API ${method} ${path} → HTTP ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function main() {
  let audit;
  try { audit = JSON.parse(await readFile(new URL("../site/data/audit.json", import.meta.url), "utf8")); }
  catch { console.log("Audit issue: no audit.json; nothing to do."); return; }
  let open = null;
  if (!dryRun) {
    const issues = await gh("GET", `/issues?state=open&labels=audit&per_page=50`);
    open = issues.find((i) => i.title === DRIFT_TITLE && !i.pull_request) || null;
  }
  const action = decideDrift(audit.items, audit.previousKeys, open);
  const body = driftBody(audit.items, { runUrl, at: audit.generated, sampled: audit.sampled });
  const items = actionable(audit.items);
  const fresh = items.filter((it) => !(audit.previousKeys || []).includes(keyOf(it)));
  console.log(`Audit issue: ${action}${open ? ` (issue #${open.number})` : ""}; ${items.length} actionable item(s), ${fresh.length} new; ${audit.items.length - items.length} info-only.`);
  if (dryRun) { if (action !== "none") console.log("\n" + body); return; }

  if (action === "create") {
    const created = await gh("POST", "/issues", { title: DRIFT_TITLE, body, labels: ["audit"] });
    console.log(`Opened issue #${created.number}`);
  } else if (action === "update" || action === "update+comment") {
    await gh("PATCH", `/issues/${open.number}`, { body });
    if (action === "update+comment") {
      const shown = fresh.slice(0, 20).map((it) => `- \`${it.id}\`: ${it.detail}`);
      if (fresh.length > 20) shown.push(`- … and ${fresh.length - 20} more`);
      await gh("POST", `/issues/${open.number}/comments`, { body: `New today (${fresh.length}):\n${shown.join("\n")}${runUrl ? `\n\nRun log: ${runUrl}` : ""}` });
    }
  } else if (action === "close") {
    await gh("POST", `/issues/${open.number}/comments`, { body: `Resolved: the self-audit of ${new Date(audit.generated).toUTCString()} found no drift.` });
    await gh("PATCH", `/issues/${open.number}`, { state: "closed", state_reason: "completed" });
  }
}

main().catch((e) => { console.error(`Audit issue step failed: ${e.message}`); process.exit(1); });
