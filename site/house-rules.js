// House rules: the thresholds behind every fixed-band rating.
//
// These are OPINIONS, not evidence. They are starting points to be tuned once real
// ratings have been reviewed (issue #12). Each metric's `bands` are four ascending
// cut-offs that split values into five levels:
//
//   value < b0 → very low · < b1 → low · < b2 → neutral · < b3 → high · else very high
//
// `dir` says which way is good: "up" = higher is better, "down" = lower is better,
// "none" = context only (shown in a neutral colour).

export const HOUSE_RULES = {
  version: "0.1",
  // A chain's TVL (public DeFi deposits) is rated only when it is at least this % of the chain's market
  // cap; below it, TVL likely misses what the chain is mainly used for (#38).
  chainTvlMinSharePct: 1,
  // D7 (#58): a trend is rated only when the smaller of its two periods reaches this floor. Below it the
  // change is shown with "too small to rate": +210% from 10 to 31 commits, or a fee trend on a few
  // thousand dollars a month, swings wildly and says little.
  trendFloors: { commitTrend: 30, feesTrend: 100000, revenueTrend: 100000, tvlTrend: 1000000, watchTrend: 1000, stablesTrend: 10000000 },
  trendFloorsReason: "Small numbers swing wildly: going from 10 to 31 commits is +210% but means little, and so does a fee trend on a few thousand dollars a month. A trend is rated only when the smaller of its two periods has at least 30 commits, $100K of fees or revenue in a month, $1M of TVL, 1,000 watchlist users or $10M of stablecoins on the chain.",
  metrics: {
    // Share of the total supply (what exists now) already circulating, in % (#39).
    circulatingShare: { bands: [30, 50, 70, 90], dir: "up",
      reason: "Under 30% circulating, most of the dilution is still ahead. Above 90%, almost none is left." },
    // Fully diluted valuation ÷ market cap, as a multiple.
    fdvToMcap: { bands: [1.1, 1.5, 2, 3], dir: "down",
      reason: "Up to 1.1 times, nearly all supply already trades. At 3 times or more, two thirds of the value is still locked." },
    // Circulating supply growth per year, in % (#55): new supply spreads the same value over more
    // tokens. Below 0 = burning (good); up to 2% is mild; 5% and more a year is real dilution.
    supplyGrowth: { bands: [0, 2, 5, 10], dir: "down",
      reason: "New tokens entering circulation dilute every holder. Up to 2% a year is mild; 5% or more is real dilution, whether it comes from issuance, unlocks or emissions; a negative number means tokens are burned." },
    // Next scheduled unlock as % of circulating supply.
    nextUnlockShare: { bands: [0.5, 1, 2, 5], dir: "down",
      reason: "Under 0.5% of circulating supply is routine. 5% or more in one event is large enough to move the price." },
    // Next scheduled unlock's dollar value ÷ 24h trading volume, as a multiple.
    nextUnlockVsVolume: { bands: [0.25, 0.5, 1, 2], dir: "down",
      reason: "An unlock worth a quarter of one day's trading is easy to absorb. One worth two days or more is not." },
    // Supply due to unlock in the next 12 months, as % of circulating supply.
    unlocks12m: { bands: [2, 5, 10, 20], dir: "down",
      reason: "Under 2% a year is close to no dilution. 20% or more means one new token for every five in circulation." },
    // Supply neither circulating nor scheduled within 12 months, as % of max supply
    // (a later schedule, or none published: open-ended dilution).
    lockedBeyond12m: { bands: [10, 25, 40, 60], dir: "down",
      reason: "Under 10% of maximum supply left means dilution is nearly over. Over 60% means most of it has no near date." },

    // Valuation against peers: rated by percentile within the token's DefiLlama category, not by bands
    // (bottom 20% of the group = very low … top 20% = very high). Lower multiples are cheaper.
    feeMultiple: { peer: true, dir: "down",
      reason: "A multiple only means something against similar projects, so the token is ranked inside its own category." },
    revenueMultiple: { peer: true, dir: "down",
      reason: "Same as the fee multiple, using what the protocol keeps." },
    // Market cap ÷ TVL, as a multiple (fixed bands).
    mcapToTvl: { bands: [0.1, 0.3, 1, 3], dir: "down",
      reason: "Under 0.3 times, the token is worth far less than the money it holds. Over 3 times, the price runs well ahead of deposits." },

    // Holders: % of supply held by the 10 largest wallets (exchanges, bridges and treasuries included).
    top10Share: { bands: [20, 35, 50, 70], dir: "down",
      reason: "Under 20% is well spread. Over 70% means a few wallets can move the price alone." },
    // Market health: 24h volume ÷ market cap, %.
    volumeToMcap: { bands: [1, 3, 8, 20], dir: "up",
      reason: "Under 1% a day is hard to trade in size. Over 20% a day is very active." },
    // Distance from the all-time high is context: shown, never rated, so it has no bands (#68).
    // Security: number of contract risk flags raised by GoPlus.
    contractFlags: { bands: [0.5, 1.5, 2.5, 3.5], dir: "down",
      reason: "No flag is the normal case. Each flag is a power someone holds over the token, so every extra one counts." },
    // Past exploits, net loss after returned funds, in $ millions.
    exploitLoss: { bands: [0.01, 1, 10, 50], dir: "down",
      reason: "Under $10K is noise. Over $50M is among the largest losses on record." },

    // Development: distinct human contributors in the last 90 days (bots excluded).
    contributors90: { bands: [2, 5, 10, 25], dir: "up",
      reason: "Fewer than 2 people means one person or nobody. 25 or more is a large team." },
    // Development: % change in human commits, last 90 days vs the 90 days before.
    commitTrend: { bands: [-40, -15, 15, 40], dir: "up",
      reason: "A change within 15% is normal variation. Beyond 40% is a clear rise or fall in work." },

    // Attention: % change of CoinGecko watchlist users over ~30 days (a proxy for interest; issue #24).
    watchTrend: { bands: [-5, -1, 1, 5], dir: "up",
      reason: "Watchlists move slowly, so 1% in a month is already a signal and 5% is strong." },

    // Traction: % change of the last 30 days against the 30 days ending 90 days earlier.
    feesTrend: { bands: [-30, -10, 10, 30], dir: "up",
      reason: "A change within 10% is normal month-to-month noise. Beyond 30% is a real change in use." },
    revenueTrend: { bands: [-30, -10, 10, 30], dir: "up",
      reason: "Same cut-offs as fees, so the two can be read together." },
    // TVL, % change over 30 days.
    tvlTrend: { bands: [-20, -5, 5, 20], dir: "up",
      reason: "Deposits move less than fees, so the cut-offs are tighter: 5% is a signal, 20% is strong." },
    // Stablecoins on a chain, % change over 90 days.
    stablesTrend: { bands: [-20, -5, 5, 20], dir: "up",
      reason: "Same cut-offs as TVL: stablecoins are the cash on a chain and move at a similar pace." },
    // Value accrual: % of fees that reached token holders (30 days).
    holdersShare: { bands: [5, 15, 30, 50], dir: "up",
      reason: "Under 5% of revenue, holders get almost nothing. At 50% or more, holders get at least half." },
    // Treasury outside the project's own token, in years of current revenue.
    treasuryYears: { bands: [0.5, 1, 2, 5], dir: "up",
      reason: "Under half a year of revenue is thin. Five years or more is a long reserve." },
    // Share of the treasury held in the project's own token, %.
    treasuryOwnShare: { bands: [30, 50, 70, 90], dir: "down",
      reason: "Under 30% in its own token, the reserve is mostly real money. Over 90%, it falls when the token falls." },
  },
};
