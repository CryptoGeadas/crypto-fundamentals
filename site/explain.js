// Plain-language explanations for every metric and a glossary of every concept on the page.
// The methodology page is generated from this file plus the rating module and house rules, so it
// cannot drift from what the dashboard actually does. build/check-docs.mjs fails if a metric or a
// referenced glossary term is missing here.

export const AREA_INTROS = {
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
  circulatingShare: {
    what: "The share of the token's maximum supply that is already in circulation.",
    why: "The rest will be released over time and dilute holders. A token with a small share circulating has most of its dilution still ahead. Tokens without a maximum supply are not rated here, because their circulating share of today's supply is always close to 100% and says nothing about future issuance.",
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
    what: "The share of fees that reached token holders over the last 30 days, through buybacks, burns or staking payouts.",
    why: "It answers whether owning the token gives any claim on the business. DefiLlama can miss value returned outside the protocol, such as buybacks run by a foundation, so a zero here deserves a check of the project's own documents.",
    terms: ["holders-revenue", "buyback", "burn", "fees"],
  },
  treasuryYears: {
    what: "Treasury assets other than the project's own token, divided by a year of revenue.",
    why: "It shows how long the project could keep paying its way from reserves that do not depend on its own token price.",
    terms: ["treasury", "revenue"],
  },
  treasuryOwnShare: {
    what: "The share of the treasury held in the project's own token.",
    why: "A treasury made mostly of its own token loses value exactly when the project needs it most, and selling it to fund work pushes the price down.",
    terms: ["treasury"],
  },
  feeMultiple: {
    what: "The fully diluted valuation divided by a year of fees (the last 30 days times twelve).",
    why: "Like a price-to-sales ratio. It is rated against projects in the same DefiLlama category, because a normal multiple for an exchange is not a normal multiple for a chain.",
    terms: ["fdv", "fees", "percentile", "peer-group"],
  },
  revenueMultiple: {
    what: "The fully diluted valuation divided by a year of revenue.",
    why: "Like a price-to-earnings ratio, measured on the money the project keeps. Rated against the same category of peers.",
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
    why: "Context only, shown in a neutral colour: a large drawdown can mean opportunity or lasting decline.",
    terms: ["all-time-high"],
  },
  contractFlags: {
    what: "The number of risky features GoPlus finds in the token contract.",
    why: "Owner powers to mint, change balances, pause transfers or blacklist wallets, trading taxes and honeypot behaviour all put holders at the mercy of whoever controls the contract. An upgradeable contract is flagged too: it is common and often legitimate, but it means the rules can change.",
    terms: ["honeypot", "mint-authority", "proxy-contract"],
  },
  exploitLoss: {
    what: "Money lost in past exploits recorded by DefiLlama, minus any funds returned.",
    why: "A history of losses says something about how carefully the project is built and run.",
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
  raised: {
    what: "The total raised in funding rounds recorded by DefiLlama, with the lead investors.",
    why: "Shown, never rated: judging whether an investor is good would be opinion dressed up as a rule.",
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
  fdv: { name: "FDV (fully diluted valuation)", text: "The token price multiplied by the maximum supply, or the total supply when there is no maximum. What the whole project would be worth if every token were already circulating." },
  fees: { name: "Fees", text: "Everything users pay to use a protocol or chain, such as trading fees, interest or gas." },
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
