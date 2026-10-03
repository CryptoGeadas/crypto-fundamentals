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
  },
};
