# Token Fundamentals

Type a ticker and see a token's fundamentals in one place: valuation against its peers, traction, value accrual, dilution and unlocks, holder concentration, market health, treasury, security and development activity. Each number is rated from very low to very high by fixed, visible rules, so the page can be read at a glance.

It runs entirely in your browser on free, keyless public data (DefiLlama, CoinGecko, GitHub, Blockscout, GoPlus). There is no server, no account and no AI. A daily GitHub Action rebuilds the token list, the unlock schedules and the peer benchmarks.

## How the data stays healthy

A daily GitHub Action (`refresh-data`, 06:17 UTC, with a 14:17 UTC catch-up that only builds if the morning run never happened) rebuilds the data. It sanity-checks everything before saving and never overwrites good data with a suspicious result; when something is off, the page keeps the last good data and says how old it is. Every problem from a run, large or small, is posted to a single open issue titled **"Daily update problems"** (label `pipeline`). The next fully clean run closes it. The footer of the page shows the same health line.

**One-time setup for the owner:** make sure GitHub emails you about issues on your own repositories (GitHub → Settings → Notifications → enable email for "Participating, @mentions and custom" and "Watching", and watch this repository). That is how a problem reaches your inbox. A crashed run also triggers GitHub's standard "workflow failed" email.

To test the alert flow without touching data: Actions → `refresh-data` → *Run workflow* with "Add a harmless simulated problem" ticked. A normal manual run afterwards closes the issue again.

**Status:** in development. The plan lives in the PRD and the build is tracked in this repository's issues.

*Informational only, not financial advice. Ratings follow published house rules and can be wrong when the source data is wrong.*
