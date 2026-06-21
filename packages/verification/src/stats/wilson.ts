/**
 * Wilson score confidence interval for a binomial proportion.
 */
export function wilsonCI(
  n: number,
  k: number,
  z: number = 1.96,
): { rate: number; lower: number; upper: number } {
  if (n === 0) {
    return { rate: 0, lower: 0, upper: 0 };
  }

  const pHat = k / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = pHat + z2 / (2 * n);
  const margin = z * Math.sqrt((pHat * (1 - pHat) + z2 / (4 * n)) / n);

  const lower = Math.max(0, (centre - margin) / denominator);
  const upper = Math.min(1, (centre + margin) / denominator);

  return { rate: pHat, lower, upper };
}
