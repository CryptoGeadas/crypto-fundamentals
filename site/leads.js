// The one plain sentence of facts that opens each area on the token page (Factsheet layout).
// Pure text from the token and its analysed rows: no page code, so the checks cover every sentence
// (build/check-leads.mjs). Rows are found with row(a, id); a check proves every id used here is a
// real metric, so renaming a metric cannot silently break a sentence (#77).
import { fmt } from "./format.js";

export const row = (a, id) => a.rows.find((r) => r.id === id);

function leadSentence(t, a) {
  const circ = row(a, "circulatingShare");
  const fdvm = row(a, "fdvToMcap");
  const parts = [];
  if (circ?.unrated) parts.push(`${t.sym} has no maximum supply, so its dilution depends on how fast new tokens are issued`);
  else if (circ?.value != null) parts.push(`${circ.display} of ${t.sym}'s eventual supply is already circulating`);
  if (fdvm?.value != null) parts.push(`its fully diluted value is ${fdvm.display} its market cap`);
  let text = parts.length ? parts.join("; ") + "." : "CoinGecko has no supply data for this token.";
  const next = row(a, "nextUnlockShare");
  const y = row(a, "unlocks12m");
  if (next && next.value != null) text += ` Next unlock: ${next.extra}.`;
  else if (next?.display === "None scheduled") text += " No unlock is scheduled.";
  if (y && y.value != null) text += ` ${y.display.replace(" of circulating", "")} of circulating supply is due to unlock in the next 12 months.`;
  else if (!t.unlocks) text += " DefiLlama does not track an unlock schedule for it.";
  return text;
}

// One plain sentence of facts that opens each area (Factsheet layout).
const money = (v) => fmt.usd(v);
function tractionLead(t, a) {
  const L = t.llama, f = row(a, "feesTrend"), tv = row(a, "tvlTrend");
  const parts = [];
  if (L?.fees?.d30 != null) parts.push(`${t.name} earned ${money(L.fees.d30)} in fees over the last 30 days${f?.value != null ? ` (${f.display} against the same window three months earlier)` : ""}${L.revenue?.d30 != null ? `, of which ${money(L.revenue.d30)} was revenue` : ""}`);
  if (L?.tvl?.now) parts.push(`${money(L.tvl.now)} is locked in it${tv?.value != null ? ` (${tv.display} in 30 days)` : ""}`);
  if (L?.chain?.dex30) parts.push(`${money(L.chain.dex30)} traded on its DEXs in 30 days`);
  return parts.length ? parts.join("; ") + "." : "DefiLlama returned no fee or TVL data for it.";
}
function accrualLead(t, a) {
  const r = row(a, "holdersShare"), f = row(a, "holdersShareFees");
  if (r?.value == null) return f?.value != null
    ? `${f.display} of ${t.name}'s fees reached token holders in the last 30 days; DefiLlama has no revenue figure to measure it against.`
    : "DefiLlama has no holders-revenue or revenue data for it, so it is unclear whether what it earns reaches token holders.";
  // D6 (#54): measured against revenue, what the protocol keeps
  return r.value === 0 ? `None of ${t.name}'s revenue reached token holders in the last 30 days, according to DefiLlama.`
    : `${r.display} of what ${t.name} keeps reached token holders in the last 30 days, through buybacks, burns or staking payouts${f?.value != null ? ` (${f.display} of all fees, including what passes through to depositors)` : ""}.`;
}
function treasuryLead(t) {
  const tr = t.llama?.treasury;
  return tr ? `The treasury holds ${money(tr.other)} in other assets and ${money(tr.own)} in ${t.sym}.` : "DefiLlama does not track a treasury for it.";
}
export const peerLabel = (p) => `${p.n} ${p.group === "all fee-earning tokens" ? p.group : `${p.group} peers`}`;
function valuationLead(t, a) {
  // the multiple the token is rated on (#54): revenue for protocols, fees for chains; else whichever exists
  const f = row(a, "feeMultiple"), v = row(a, "revenueMultiple"), m = row(a, "mcapToTvl");
  const rated = [v, f].find((x) => x?.level != null) || [v, f].find((x) => x?.peer) || [v, f].find((x) => x?.value != null);
  const what = rated && rated === v ? "yearly revenue" : "yearly fees";
  const parts = [];
  if (rated?.value != null) parts.push(`${t.sym} is valued at ${rated.display} its ${what}${rated.peer ? `, cheaper than ${rated.peer.cheaperThan}% of ${peerLabel(rated.peer)}` : ""}`);
  if (m?.value != null) parts.push(`its market cap is ${m.display} the value locked in it`);
  return parts.length ? parts.join("; ") + "." : "There are no fees or TVL to value it against.";
}
function holdersLead(t, a) {
  const r = row(a, "top10Share");
  if (r?.display === "Native asset") return `${t.name} is a chain's native coin, so there is no token contract or holder list to inspect.`;
  if (r?.value == null) return "The holder list could not be checked.";
  if (t.security.chain === "solana") return `The 10 largest wallets hold ${r.display} of the supply. On Solana these can include team, exchange and treasury wallets, which are not single owners.`;
  const c = t.security.holders.filter((h) => h.contract).length;
  return `The 10 largest wallets hold ${r.display} of the supply; ${c} of them are contracts such as exchanges, bridges, staking or treasuries, not single owners.`;
}
function marketLead(t, a) {
  const v = row(a, "volumeToMcap"), h = row(a, "athDistance");
  const parts = [];
  if (v?.value != null) parts.push(`${money(t.volume24h)} traded in the last 24 hours, ${v.display} of its market cap`);
  if (h?.value != null) parts.push(`the price is ${Math.abs(h.value).toFixed(0)}% below its all-time high`);
  return parts.length ? parts.join("; ") + "." : "CoinGecko has no market data for it.";
}
// Pegged assets (#53): the peg, then the supply and which way it moved.
function pegLead(t, a) {
  const d = row(a, "pegDistance"), s = row(a, "pegSupply"), c = row(a, "pegSupplyChange");
  const parts = [];
  if (d?.value != null) parts.push(`${t.sym} trades ${Math.abs(d.value) < 0.005 ? "at" : `${d.display} from`} its ${fmt.price(t.peg.target)} peg`);
  else parts.push(`It is not known what ${t.sym} is pegged to in the free data, so its peg can't be checked here`);
  if (s?.value != null) parts.push(`${s.display} tokens are in circulation${c?.value != null ? ` (${c.display} in 30 days)` : ""}`);
  return parts.join("; ") + ".";
}

function securityLead(t, a) {
  const f = row(a, "contractFlags"), e = row(a, "exploitLoss");
  const parts = [];
  if (f?.display === "Native asset") parts.push("As a native coin it has no token contract to audit");
  else if (f?.value != null) parts.push(f.value === 0 ? "GoPlus found no risky owner powers, taxes or honeypot behaviour in the contract" : `GoPlus raises ${f.display} on the contract: ${t.security.flags.join(", ").toLowerCase()}`);
  const n = (t.defiExtra?.hacks || []).length, ex = n === 1 ? "1 exploit" : `${n} exploits`;
  if (e?.value != null) parts.push(e.value === 0 ? `DefiLlama records ${ex}, with the funds returned in full` : `DefiLlama records ${ex}, with ${e.display} lost after returned funds`);
  else if (e?.notOnRecord) parts.push("DefiLlama's exploit list has nothing on file for it, which is not proof that none happened");
  return parts.length ? parts.join("; ") + "." : "The contract could not be checked.";
}
function devLead(t, a) {
  const c = row(a, "contributors90");
  if (!c || c.value == null) return c?.display === "Not measured yet" ? "Development activity is still queued for measurement by the daily job." : c?.notOnRecord ? "Neither DefiLlama nor CoinGecko links a GitHub organisation for it, so its development activity is unknown." : "No public GitHub repository is linked for it.";
  const d = t.meta.dev;
  return `${c.display} people (bots excluded) made ${d.commits90} commits in the last 90 days across ${d.repos.length} recently active repositories, against ${d.commitsPrev90} commits in the 90 days before.`;
}
function backersLead(t, a) {
  const r = row(a, "raised"), g = row(a, "age");
  const parts = [];
  const n = t.meta?.raises?.length || 0, rounds = `${n} recorded round${n > 1 ? "s" : ""}`;
  if (r?.value) parts.push(`It raised ${r.display} across ${rounds}`);
  else if (r?.value === 0) parts.push(`DefiLlama lists ${rounds} with undisclosed amounts`);
  else if (r?.notOnRecord) parts.push("DefiLlama has no funding rounds on file for it, which does not mean it raised nothing");
  if (g?.value != null) parts.push(`the token has traded for ${g.display}`);
  return parts.length ? parts.join("; ") + "." : "No funding or age data for it.";
}
export const LEADS = { peg: pegLead, valuation: valuationLead, holders: holdersLead, market: marketLead, security: securityLead, dev: devLead, backers: backersLead, dilution: leadSentence, traction: tractionLead, accrual: accrualLead, treasury: treasuryLead };
