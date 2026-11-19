// Plain-language explanations for every metric and a glossary of every concept on the page.
// The methodology page is generated from this file plus the rating module and house rules, so it
// cannot drift from what the dashboard actually does. build/check-docs.mjs fails if a metric or a
// referenced glossary term is missing here.

import { METRICS } from "./rating.js";

export const AREA_INTROS = {
  peg: "For pegged assets only (stablecoins, tokenized gold or funds, wrapped and liquid-staking tokens): whether the price holds its target, and whether money is coming in or leaving. Their price follows something else, so valuation, dilution and growth do not apply.",
  attention: "Whether people are paying attention to the token, measured with free CoinGecko data: how often it appears in CoinGecko's trending searches and whether its watchlist is growing. A stand-in for social chatter, not Twitter data, which is not available for free.",
  valuation: "How expensive the token is compared with what the project earns, judged against similar projects rather than an absolute standard. A project can be excellent and still too expensive.",
  traction: "Whether the business behind the token is being used and growing: fees paid by users, revenue kept by the project, and money locked in it.",
  accrual: "Whether any of the money the project earns actually reaches people who hold the token. Many tokens have busy protocols behind them but no claim on the fees.",
  dilution: "How much new supply is still to come, and when. New tokens entering circulation spread the same value across more units.",
  holders: "How concentrated ownership is. A few wallets holding most of the supply can move the price on their own.",
  market: "How actively the token trades and where its price sits against its own history.",
  treasury: "How much the project holds in reserve to keep operating, and whether that reserve is real money or mostly its own token.",
  security: "Whether the token contract gives anyone dangerous powers, and whether the project has been exploited before.",
  dev: "Whether people are still building it, measured from public code repositories.",
  backers: "Who funded the project and how long the token has existed. Shown for context, never rated.",
};

// Each metric's explanation lives on its record in rating.js (explain: { what, why, terms }, #77).
export const METRIC_EXPLAIN = Object.fromEntries(METRICS.map((m) => [m.id, m.explain]));

export const GLOSSARY = {
  "all-time-high": { name: "All-time high", text: "The highest price a token has ever traded at." },
  audit: { name: "Audit", text: "A review of a project's smart contracts by a security firm, looking for bugs and vulnerabilities. An audit lowers risk but never removes it." },
  burn: { name: "Burn", text: "Permanently destroying tokens, usually by sending them to an address nobody controls. It reduces supply." },
  buyback: { name: "Buyback", text: "A project using its revenue to buy its own token on the market, either to burn it or to distribute it." },
  "circulating-supply": { name: "Circulating supply", text: "The tokens that exist and can be traded today. It excludes tokens still locked for the team, investors or future programmes." },
  "cliff-unlock": { name: "Cliff unlock", text: "A large amount of tokens released all at once on a set date, typically to the team or investors at the end of a lock-up." },
  commit: { name: "Commit", text: "A saved change to a code repository. Counting commits shows how actively a codebase is being worked on." },
  dex: { name: "DEX (decentralised exchange)", text: "An exchange that runs on smart contracts, where people trade directly from their own wallets." },
  dilution: { name: "Dilution", text: "The fall in each token's share of the whole as new tokens are released. If supply doubles and value stays the same, each token is worth half as much." },
  exploit: { name: "Exploit (hack)", text: "An attack that drains funds by abusing a bug or weakness in a protocol, its contracts or its infrastructure." },
  fdv: { name: "FDV (fully diluted valuation)", text: "The token price multiplied by the total supply: what the whole project would be worth if every token that exists today were circulating. This page uses the total supply (what exists now, locked or not). When the maximum supply is higher, the difference may be supply still to be minted or supply already burned, and no free source says which, so the figure at maximum supply is shown as a note. When CoinGecko's total supply contradicts its other figures (more tokens than the maximum allows, or over 1,000 times the circulating supply), it is treated as unknown: FDV then uses the maximum supply, or is shown as unknown." },
  fees: { name: "Fees", text: "Everything users pay to use a protocol or chain, such as trading fees, interest or gas." },
  "trending-searches": { name: "Trending searches", text: "CoinGecko's list of the most-searched coins over the last 24 hours (about 15). Showing up there often means a burst of interest, sometimes hype." },
  watchlist: { name: "Watchlist users", text: "How many CoinGecko users have added the coin to a watchlist or portfolio. Rising means more people are following it; the level mostly reflects size and age." },
  "funding-round": { name: "Funding round", text: "A sale of tokens or equity to investors, usually before the token launches, often at a discount and with a lock-up." },
  "holder-concentration": { name: "Holder concentration", text: "How much of the supply sits in a few wallets. High concentration means a few parties can move the price." },
  "holders-revenue": { name: "Holders revenue", text: "The part of a protocol's revenue that reaches token holders, through buybacks, burns or payments to stakers." },
  "home-chain": { name: "Home chain", text: "The blockchain a token natively lives on. Copies on other chains are bridged versions whose holder lists say little about the token." },
  honeypot: { name: "Honeypot", text: "A token that can be bought but not sold, a common scam. GoPlus tests for it." },
  "linear-unlock": { name: "Linear unlock (vesting)", text: "Tokens released gradually, a little every day or month, rather than all at once." },
  "market-cap": { name: "Market cap", text: "The token price multiplied by the circulating supply: what the tokens trading today are worth together." },
  "max-supply": { name: "Max supply", text: "The most tokens that can ever exist. Some tokens have no maximum and keep issuing new tokens." },
  "mint-authority": { name: "Mint authority", text: "The power to create new tokens. If someone still holds it, they can increase supply at will." },
  "peer-group": { name: "Peer group", text: "The projects a token is compared with: those in the same DefiLlama category, such as Lending, Dexs or Chain. A group needs at least 8 members; smaller groups fall back to a wider one." },
  percentile: { name: "Percentile", text: "A token's position within its group. Cheaper than 80% of peers means only a fifth of the group is valued lower against its fees." },
  "proxy-contract": { name: "Upgradeable (proxy) contract", text: "A contract whose logic can be replaced by whoever controls the upgrade. Common and often legitimate, but the rules can change after you buy." },
  repository: { name: "Repository", text: "A project's code, stored on GitHub with its full history of changes." },
  revenue: { name: "Revenue", text: "The part of fees a protocol or chain keeps for itself after paying liquidity providers, lenders or validators." },
  stablecoin: { name: "Stablecoin", text: "A token designed to hold a steady value, usually one US dollar." },
  treasury: { name: "Treasury", text: "The reserves a project controls to fund its work, often held by a DAO or foundation." },
  tvl: { name: "TVL (total value locked)", text: "The value of the assets deposited in a protocol or on a chain, for lending, trading or staking." },
  unlock: { name: "Token unlock", text: "The release of tokens that were locked, typically for the team, investors or ecosystem programmes, into circulation." },
  volume: { name: "Trading volume", text: "The value of a token traded over a period, usually 24 hours." },
};

// The nine rating principles (#60): the rules every rating follows. Shown on the "How it works" page
// and linked from each metric they apply to. build/check-docs.mjs checks the code against them.
// #82: under the token-type table. The table shows areas; inside an area a metric can still be left out.
export const TYPES_NOTE = "Inside an area, a metric can still be left out for one kind of token. A chain's native coin (ETH, SOL) has no token contract, so its holders and contract risk flags show \"Native asset\" and are not rated; a chain token with a contract (ARB) is checked. For chains, Treasury shows only the share held in its own token: treasury in years of revenue is left out, because a chain's revenue never reaches its foundation.";

export const PRINCIPLES = [
  { n: 1, name: "Same meaning or no rating.", text: "A number is rated only where it means the same thing for every token it is rated on. Where it does not, it is shown without a rating, or rated only for the types of token where it holds." },
  { n: 2, name: "Measure where the business is.", text: "Fees, revenue and TVL are taken from the same place: the protocol when the token's value comes from a protocol, the chain when it comes from the chain." },
  { n: 3, name: "Supply means what exists now.", text: "Valuation and circulating share use total supply, the tokens that exist today. A higher maximum may be unminted or already burned, so it is only a note. One exception: supply locked beyond twelve months is measured against the maximum on the unlock schedule, because it needs a ceiling." },
  { n: 4, name: "Unknown is never none.", text: "Missing, unrecorded or stale data is shown as unknown. It is never shown as zero and never counted as good." },
  { n: 5, name: "Trust the source's own signals first.", text: "When DefiLlama itself reports no figure for the latest day, or marks deposits as already counted in another product, the page follows that signal. A 14-day age limit is only a second check." },
  { n: 6, name: "A token is the same token in any wrapper.", text: "Wrapped and staked forms of a token count as the token, for example when a treasury holds its own token in staked form." },
  { n: 7, name: "Context is shown, not rated.", text: "Numbers that mostly reflect size or price history, such as watchlist size and distance from the all-time high, are shown without a rating." },
  { n: 8, name: "Every threshold is a written house rule with its reason.", text: "Every cut-off sits in one public file, and its reason is shown under its scale in the metric list below." },
  { n: 9, name: "No trends on tiny bases.", text: "A change from 10 to 31 commits is +210% and means little. A trend is rated only when the smaller of its two periods reaches a minimum size." },
];

// Which principles a metric shows most directly: its record's principles (#77). Principle 8 (every rated metric) and 9 (every trend
// with a minimum base) are added from the metric itself in principlesFor.
export const METRIC_PRINCIPLES = Object.fromEntries(METRICS.filter((m) => m.principles.length).map((m) => [m.id, m.principles]));
export const principlesFor = (m) => [...new Set([...(METRIC_PRINCIPLES[m.id] || []), ...(m.yard !== "shown" ? [8] : []), ...(m.base ? [9] : [])])].sort((a, b) => a - b);
