/**
 * shared/ratings.js — Rating multipliers by format
 *
 * BASE_POINTS (from tournament placement) × FORMAT_MULTIPLIER = final rating points.
 * Ensures that higher-prestige formats award proportionally more rating.
 */

const FORMAT_MULTIPLIERS = {
  kotc:        1.0,    // King of the Court — flagship format
  ipt_mixed:   0.9,    // IPT Mixed — high participation
  thai:        0.85,   // Thai format — shorter rounds
  classic:     0.8,    // Classic format
  swiss:       0.75,   // Swiss system
  double_elim: 0.7,    // Double elimination
  friendly:    0.5,    // Friendly / training
};

// Placement → base points (1st = 100, 2nd = 85, etc.)
const PLACEMENT_POINTS = [
  100, 85, 75, 65, 55, 48, 42, 36,
  30, 26, 22, 19, 16, 14, 12, 10,
  8, 7, 6, 5, 4, 3, 2, 1,
];

/**
 * Calculate rating points for a placement in a tournament.
 * @param {number} place - 1-based placement (1 = winner)
 * @param {string} formatCode - tournament format code (e.g. 'kotc', 'thai')
 * @param {object} [opts] - optional overrides
 * @param {number} [opts.participantCount] - number of participants (bonus for large events)
 * @returns {{ base: number, multiplier: number, bonus: number, total: number }}
 */
function calcRatingPoints(place, formatCode, opts = {}) {
  const base = PLACEMENT_POINTS[Math.min(place - 1, PLACEMENT_POINTS.length - 1)] || 1;
  const multiplier = FORMAT_MULTIPLIERS[formatCode] || 0.8;

  // Participation bonus: +10% for 24+ players, +20% for 32+
  let bonus = 0;
  if (opts.participantCount) {
    if (opts.participantCount >= 32) bonus = 0.2;
    else if (opts.participantCount >= 24) bonus = 0.1;
  }

  const total = Math.round(base * multiplier * (1 + bonus));
  return { base, multiplier, bonus, total };
}

/**
 * Get the multiplier for a format code.
 * @param {string} formatCode
 * @returns {number}
 */
function getFormatMultiplier(formatCode) {
  return FORMAT_MULTIPLIERS[formatCode] || 0.8;
}

/**
 * Get all format multipliers.
 * @returns {Record<string, number>}
 */
function getFormatMultipliers() {
  return { ...FORMAT_MULTIPLIERS };
}

/**
 * Get base points for a placement.
 * @param {number} place - 1-based
 * @returns {number}
 */
function getPlacementPoints(place) {
  return PLACEMENT_POINTS[Math.min(place - 1, PLACEMENT_POINTS.length - 1)] || 1;
}

// ── GlobalThis bridge for classic scripts ────────────────────
if (typeof globalThis !== 'undefined') {
  globalThis.sharedRatings = {
    calcRatingPoints,
    getFormatMultiplier,
    getFormatMultipliers,
    getPlacementPoints,
    FORMAT_MULTIPLIERS,
    PLACEMENT_POINTS,
  };
}

export {
  calcRatingPoints,
  getFormatMultiplier,
  getFormatMultipliers,
  getPlacementPoints,
  FORMAT_MULTIPLIERS,
  PLACEMENT_POINTS,
};
