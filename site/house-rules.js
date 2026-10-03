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
  },
};
