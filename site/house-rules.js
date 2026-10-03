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
  metrics: {
    // Share of the eventual supply already circulating, in % (circulating ÷ max, or ÷ total when uncapped).
    circulatingShare: { bands: [30, 50, 70, 90], dir: "up" },
    // Fully diluted valuation ÷ market cap, as a multiple.
    fdvToMcap: { bands: [1.1, 1.5, 2, 3], dir: "down" },
    // Next scheduled unlock as % of circulating supply.
    nextUnlockShare: { bands: [0.5, 1, 2, 5], dir: "down" },
    // Next scheduled unlock's dollar value ÷ 24h trading volume, as a multiple.
    nextUnlockVsVolume: { bands: [0.25, 0.5, 1, 2], dir: "down" },
    // Supply due to unlock in the next 12 months, as % of circulating supply.
    unlocks12m: { bands: [2, 5, 10, 20], dir: "down" },
    // Supply neither circulating nor scheduled within 12 months, as % of max supply
    // (a later schedule, or none published: open-ended dilution).
    lockedBeyond12m: { bands: [10, 25, 40, 60], dir: "down" },

    // Valuation against peers: rated by percentile within the token's DefiLlama category, not by bands
    // (bottom 20% of the group = very low … top 20% = very high). Lower multiples are cheaper.
    feeMultiple: { peer: true, dir: "down" },
    revenueMultiple: { peer: true, dir: "down" },
    // Market cap ÷ TVL, as a multiple (fixed bands).
    mcapToTvl: { bands: [0.1, 0.3, 1, 3], dir: "down" },

    // Traction: % change of the last 30 days against the 30 days ending 90 days earlier.
    feesTrend: { bands: [-30, -10, 10, 30], dir: "up" },
    revenueTrend: { bands: [-30, -10, 10, 30], dir: "up" },
    // TVL, % change over 30 days.
    tvlTrend: { bands: [-20, -5, 5, 20], dir: "up" },
    // Stablecoins on a chain, % change over 90 days.
    stablesTrend: { bands: [-20, -5, 5, 20], dir: "up" },
    // Value accrual: % of fees that reached token holders (30 days).
    holdersShare: { bands: [5, 15, 30, 50], dir: "up" },
    // Treasury outside the project's own token, in years of current revenue.
    treasuryYears: { bands: [0.5, 1, 2, 5], dir: "up" },
    // Share of the treasury held in the project's own token, %.
    treasuryOwnShare: { bands: [30, 50, 70, 90], dir: "down" },
  },
};
