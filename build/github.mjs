// The one way the job writes to this repo's GitHub issues (#76): used by the daily alert
// (alert.mjs) and the data-drift issue (audit-issue.mjs).
//
//   githubIssues({ repo, token, agent, fetchImpl? }) → gh(method, path, body?) → JSON | null (204)
//     Throws on any answer that is not ok, with the status and GitHub's own message.
//     A write is never tried again here: a repeated POST could open the same issue twice.

export function githubIssues({ repo, token, agent, fetchImpl = fetch }) {
  return async function gh(method, path, body) {
    const res = await fetchImpl(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": agent },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`GitHub API ${method} ${path} → HTTP ${res.status}: ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  };
}
