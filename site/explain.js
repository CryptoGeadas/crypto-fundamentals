// Plain-language explanations for every metric and a glossary of every concept on the page.
// The methodology page is generated from this file plus the rating module and house rules, so it
// cannot drift from what the dashboard actually does. build/check-docs.mjs fails if a metric or a
// referenced glossary term is missing here.

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

export const METRIC_EXPLAIN = {
  supplyGrowth: {
    what: "How fast the number of tokens in circulation grew over the last 30 days, turned into a yearly rate. It comes from CoinGecko's circulating supply, recorded every day, or from DefiLlama's own 30-day figure until that record covers a month.",
    why: "New tokens spread the same value over more units, whatever the reason: issuance to validators (Solana), unlocks to investors and teams, or farming emissions. Tokens being burned make it negative, which is good for holders. It is the one dilution number that works for every token, with or without a maximum supply. CoinGecko sometimes corrects a token's circulating supply in one step, which shows here as a jump.",
    terms: ["circulating-supply", "unlock"],
  },
  pegDistance: {
    what: "How far the price is from the value the token is meant to hold, in percent: the price against $1 for a dollar stablecoin.",
    why: "A pegged token is only worth its target if it holds it. A gap of more than a fraction of a percent means the market doubts the backing or the redemption. Shown as unknown when the free data does not say what the target is.",
  },
  pegSupply: {
    what: "How many tokens are in circulation, across all chains where DefiLlama tracks the stablecoin, otherwise CoinGecko's circulating supply.",
    why: "For a pegged token, supply is the money people have put in. It shows the token's size and is the base for the 30-day change.",
  },
  pegSupplyChange: {
    what: "The change in supply over the last 30 days, from DefiLlama's stablecoin list.",
    why: "New tokens are minted when people deposit money, and burned when they redeem. A rising supply means money coming in; a falling one means people taking money out. Shown, not rated: neither is good or bad by itself.",
  },
  circulatingShare: {
    what: "The share of the token's total supply (everything that exists now, locked or not) that is already in circulation.",
    why: "The rest is locked and will be released over time, diluting holders. A maximum supply above the total is noted but not used: the difference may be supply still to be minted or supply already burned. A token with a small share circulating has most of its dilution still ahead. Tokens without a maximum supply are not rated here, because their circulating share of today's supply is always close to 100% and says nothing about future issuance.",
    terms: ["circulating-supply", "max-supply", "dilution"],
  },
  fdvToMcap: {
    what: "The fully diluted valuation divided by the market cap.",
    why: "It shows how much bigger the token's value would be if every token that will ever exist were already circulating at today's price. A ratio well above 1 means a lot of supply is still locked.",
    terms: ["fdv", "market-cap"],
  },
  nextUnlockShare: {
    what: "The size of the next scheduled unlock, as a share of the tokens circulating today.",
    why: "A large unlock can bring selling pressure from investors or team members receiving tokens. When nothing is scheduled the metric is shown but not rated: no scheduled unlock is not good news on its own if a lot of supply remains locked.",
    terms: ["unlock", "cliff-unlock", "circulating-supply"],
  },
  nextUnlockVsVolume: {
    what: "The dollar value of the next unlock divided by one day of trading volume.",
    why: "It compares the new supply with how much the market can absorb. An unlock worth several days of trading is harder to absorb than one worth a fraction of a day.",
    terms: ["unlock", "volume"],
  },
  unlocks12m: {
    what: "The tokens due to unlock over the next twelve months on the published schedule, as a share of today's circulating supply.",
    why: "It captures the dilution of the coming year, from both cliff and linear unlocks.",
    terms: ["unlock", "cliff-unlock", "linear-unlock"],
  },
  lockedBeyond12m: {
    what: "The share of the maximum supply that is neither circulating today nor scheduled to unlock in the next twelve months.",
    why: "This supply either unlocks later or has no published schedule at all. A large share is an open-ended dilution risk that a twelve-month view alone would miss.",
    terms: ["max-supply", "unlock"],
  },
  fees30: {
    what: "Everything users paid to use the protocol or chain over the last 30 days.",
    why: "Fees are the clearest sign of real usage. Shown, not rated, because size alone depends on the kind of project.",
    terms: ["fees"],
  },
  revenue30: {
    what: "The part of those fees the protocol or chain keeps, after paying liquidity providers or validators.",
    why: "Revenue is what could, in principle, fund the project or reach token holders. Shown, not rated.",
    terms: ["revenue", "fees"],
  },
  feesTrend: {
    what: "Fees over the last 30 days compared with the 30 days that ended 90 days earlier.",
    why: "Growth or decline matters more than a single snapshot: a growing project and a shrinking one can show the same fees today.",
    terms: ["fees"],
  },
  revenueTrend: {
    what: "Revenue over the last 30 days compared with the 30 days that ended 90 days earlier.",
    why: "The same as the fees trend, for the money the project keeps.",
    terms: ["revenue"],
  },
  tvlTrend: {
    what: "The change in total value locked over the last 30 days.",
    why: "Money flowing in or out is a direct signal of trust and usage. Thirty days rather than ninety, because a longer history would cost several megabytes per protocol to fetch.",
    terms: ["tvl"],
  },
  dex30: {
    what: "Trading volume on the decentralised exchanges of a chain over the last 30 days.",
    why: "It shows how much economic activity happens on the chain. Shown, not rated.",
    terms: ["dex", "volume"],
  },
  stablesTrend: {
    what: "The change in the value of stablecoins held on the chain over the last 90 days.",
    why: "Stablecoins are the cash of a chain. Growing balances suggest people are bringing money to use there.",
    terms: ["stablecoin"],
  },
  holdersShare: {
    what: "The share of the protocol's revenue (what it keeps after paying depositors, liquidity providers or validators) that reached token holders over the last 30 days, through buybacks, burns or staking payouts.",
    why: "It answers whether owning the token gives any claim on the business. It is measured against revenue, not fees, because fees include money that was never the protocol's to share: on fees a protocol that passes most of them through looks stingy even when it gives holders most of what it keeps. DefiLlama can miss value returned outside the protocol, such as buybacks run by a foundation, so a zero here deserves a check of the project's own documents.",
    terms: ["holders-revenue", "buyback", "burn", "revenue"],
  },
  holdersShareFees: {
    what: "The same payouts to token holders, as a share of all fees users paid, including what passed straight through to depositors or liquidity providers.",
    why: "Context for the rated share of revenue: it shows how much of the total money flowing through the protocol ends up with holders. Shown, never rated.",
    terms: ["holders-revenue", "fees"],
  },
  treasuryYears: {
    what: "Treasury assets other than the project's own token, divided by a year of revenue.",
    why: "It shows how long the project could keep paying its way from reserves that do not depend on its own token price. Shown only for DeFi protocols (and chains whose protocol side earns fees), where revenue actually funds the treasury. For chains and exchange tokens it is left out: a chain's \"revenue\" is burned fees or validator income that never reaches its foundation, and an exchange token's treasury is paid from the exchange.",
    terms: ["treasury", "revenue"],
  },
  treasuryOwnShare: {
    what: "The share of the treasury held in the project's own token.",
    why: "A treasury made mostly of its own token loses value exactly when the project needs it most, and selling it to fund work pushes the price down.",
    terms: ["treasury"],
  },
  feeMultiple: {
    what: "The fully diluted valuation divided by a year of fees (the last 30 days times twelve).",
    why: "Like a price-to-sales ratio. Rated for chains only, against other chains: blockspace is a chain's product. For DeFi protocols it is shown but not rated, because fees include what passes straight through to depositors or liquidity providers, so a protocol that keeps little of them would look cheap.",
    terms: ["fdv", "fees", "percentile", "peer-group"],
  },
  revenueMultiple: {
    what: "The fully diluted valuation divided by a year of revenue.",
    why: "Like a price-to-earnings ratio, measured on the money the project keeps. Rated for DeFi protocols (and chains whose protocol side earns fees), against projects in the same DefiLlama category, because a normal multiple for an exchange is not a normal multiple for a lending market. Shown but not rated for chains, where \"revenue\" means something different on each chain. No revenue gives no multiple, never a cheap one.",
    terms: ["fdv", "revenue", "percentile", "peer-group"],
  },
  mcapToTvl: {
    what: "The market cap divided by the total value locked in the protocol.",
    why: "How much the market pays for each dollar people trust the protocol with. Low values can mean undervaluation or that the locked money is not very sticky.",
    terms: ["market-cap", "tvl"],
  },
  top10Share: {
    what: "The share of the total supply held by the ten largest wallets, read from the token's home chain.",
    why: "Concentrated ownership means a few parties can move the price. The ten largest wallets often include exchanges, bridges, staking contracts and treasuries, which hold tokens for many people, so read it together with the holder list.",
    terms: ["holder-concentration", "home-chain"],
  },
  volumeToMcap: {
    what: "One day of trading volume as a share of the market cap.",
    why: "It shows how easily the token can be bought or sold without moving the price. Very high values can also reflect speculation.",
    terms: ["volume", "market-cap"],
  },
  athDistance: {
    what: "How far the current price is below the token's all-time high.",
    why: "Context only, shown but not rated: a large drawdown can mean opportunity or lasting decline.",
    terms: ["all-time-high"],
  },
  contractFlags: {
    what: "The number of risky features GoPlus finds in the token contract.",
    why: "Owner powers to mint, change balances, pause transfers or blacklist wallets, trading taxes and honeypot behaviour all put holders at the mercy of whoever controls the contract. An upgradeable contract is flagged too: it is common and often legitimate, but it means the rules can change.",
    terms: ["honeypot", "mint-authority", "proxy-contract"],
  },
  exploitLoss: {
    what: "Money lost in past exploits recorded by DefiLlama, minus any funds returned.",
    why: "A history of losses says something about how carefully the project is built and run. It is rated only when an exploit is on record; when DefiLlama's list has nothing, the page says unknown rather than none.",
    terms: ["exploit"],
  },
  audits: {
    what: "The number of audit reports DefiLlama links for the project.",
    why: "Shown, never rated: DefiLlama's audit data is patchy and often recorded only on sub-protocols, so a low count does not prove a lack of audits.",
    terms: ["audit"],
  },
  contributors90: {
    what: "The number of distinct people who committed code in the last 90 days, across the project's main public repositories.",
    why: "It shows whether a team is still building. Bot accounts are excluded, and the main repositories are the most starred among those active in the last six months. Projects that build in private repositories will look quieter than they are.",
    terms: ["repository", "commit"],
  },
  commitTrend: {
    what: "Human commits in the last 90 days compared with the 90 days before.",
    why: "Rising or falling development activity, with the same caveats as the contributor count.",
    terms: ["commit"],
  },
  trendingDays: {
    what: "On how many of the last 30 days the coin was in CoinGecko's trending searches, checked once a day.",
    why: "A sudden run of trending days usually means a wave of retail interest, often around news or hype. It is a proxy for social chatter, not Twitter data.",
    terms: ["trending-searches"],
  },
  watchlist: {
    what: "How many CoinGecko users follow the coin in a watchlist or portfolio, live.",
    why: "A rough measure of how many people care about it. Large, old coins always lead on this, so it is context rather than a signal.",
    terms: ["watchlist"],
  },
  watchTrend: {
    what: "The change in watchlist users against a snapshot from about 30 days ago (recorded weekly by the daily job).",
    why: "Growing interest shows up here before it shows up in fundamentals; a shrinking watchlist means people are moving on.",
    terms: ["watchlist"],
  },
  raised: {
    what: "The total raised in funding rounds recorded by DefiLlama, with the lead investors.",
    why: "Shown, never rated: judging whether an investor is good would be opinion dressed up as a rule. DefiLlama's list is incomplete, so an empty record is shown as unknown, with links to check elsewhere.",
    terms: ["funding-round"],
  },
  age: {
    what: "How long the token has traded, from its first recorded price.",
    why: "Shown, never rated. It is the age of the current token, not the project: a migrated token (LEND to AAVE) restarts the clock.",
    terms: [],
  },
};

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

// Which principles a metric shows most directly. Principle 8 (every rated metric) and 9 (every trend
// with a minimum base) are added from the metric itself in principlesFor.
export const METRIC_PRINCIPLES = {
  circulatingShare: [1, 3], fdvToMcap: [3], lockedBeyond12m: [3],
  feeMultiple: [1, 2], revenueMultiple: [1, 2], mcapToTvl: [1, 2],
  fees30: [2, 5], revenue30: [2, 5], feesTrend: [2, 5], revenueTrend: [2, 5], tvlTrend: [1, 2, 5],
  treasuryYears: [1], treasuryOwnShare: [6],
  exploitLoss: [4], audits: [4], raised: [4], contractFlags: [4],
  watchlist: [7], athDistance: [7],
};
export const principlesFor = (m) => [...new Set([...(METRIC_PRINCIPLES[m.id] || []), ...(m.yard !== "shown" ? [8] : []), ...(m.base ? [9] : [])])].sort((a, b) => a - b);
