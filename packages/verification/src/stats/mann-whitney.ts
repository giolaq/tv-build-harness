/**
 * Mann-Whitney U test for comparing two independent samples.
 * Uses normal approximation for the p-value (valid for n >= 8 per group).
 */
export function mannWhitneyU(
  xs: number[],
  ys: number[],
): { u: number; z: number; pValue: number } {
  const n1 = xs.length;
  const n2 = ys.length;

  if (n1 === 0 || n2 === 0) {
    return { u: 0, z: 0, pValue: 1 };
  }

  // Combine and rank
  const combined: Array<{ value: number; group: 0 | 1 }> = [
    ...xs.map((value) => ({ value, group: 0 as const })),
    ...ys.map((value) => ({ value, group: 1 as const })),
  ];

  combined.sort((a, b) => a.value - b.value);

  // Assign ranks with tie handling (average rank)
  const ranks = assignRanks(combined);

  // Sum of ranks for group 0 (xs)
  let r1 = 0;
  for (let i = 0; i < combined.length; i++) {
    if (combined[i].group === 0) {
      r1 += ranks[i];
    }
  }

  // U statistic for group 1
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);

  // Normal approximation
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);

  if (sigma === 0) {
    return { u, z: 0, pValue: 1 };
  }

  // Continuity correction
  const z = (Math.abs(u1 - mu) - 0.5) / sigma;

  // Two-tailed p-value
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  return { u, z, pValue };
}

/**
 * Assign average ranks handling ties.
 */
function assignRanks(
  sorted: Array<{ value: number; group: 0 | 1 }>,
): number[] {
  const n = sorted.length;
  const ranks = new Array<number>(n);
  let i = 0;

  while (i < n) {
    let j = i;
    // Find the end of the tie group
    while (j < n && sorted[j].value === sorted[i].value) {
      j++;
    }
    // Average rank for this tie group (ranks are 1-based)
    const avgRank = (i + 1 + j) / 2;
    for (let k = i; k < j; k++) {
      ranks[k] = avgRank;
    }
    i = j;
  }

  return ranks;
}

/**
 * Standard normal CDF approximation (Abramowitz and Stegun 26.2.17).
 */
function normalCDF(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return 0.5 * (1.0 + sign * y);
}
