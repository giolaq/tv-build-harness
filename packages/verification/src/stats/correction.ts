/**
 * Holm-Bonferroni multiple comparison correction.
 *
 * Adjusts p-values to control the family-wise error rate (FWER).
 * More powerful than Bonferroni while still controlling FWER.
 */
export function holmCorrection(
  pValues: number[],
  alpha: number = 0.05,
): { adjusted: number[]; significant: boolean[] } {
  const m = pValues.length;

  if (m === 0) {
    return { adjusted: [], significant: [] };
  }

  // Create indexed array and sort by p-value ascending
  const indexed = pValues.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => a.p - b.p);

  // Compute adjusted p-values using Holm step-down
  const adjustedSorted = new Array<number>(m);
  let maxSoFar = 0;

  for (let rank = 0; rank < m; rank++) {
    const correction = m - rank; // (m - rank) for Holm
    const adjusted = Math.min(1, indexed[rank].p * correction);
    // Enforce monotonicity: adjusted p-values must be non-decreasing
    maxSoFar = Math.max(maxSoFar, adjusted);
    adjustedSorted[rank] = maxSoFar;
  }

  // Map back to original order
  const adjusted = new Array<number>(m);
  const significant = new Array<boolean>(m);

  for (let rank = 0; rank < m; rank++) {
    const originalIndex = indexed[rank].i;
    adjusted[originalIndex] = adjustedSorted[rank];
    significant[originalIndex] = adjustedSorted[rank] < alpha;
  }

  return { adjusted, significant };
}
