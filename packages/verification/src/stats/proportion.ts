/**
 * Two-proportion z-test.
 * Tests whether two proportions k1/n1 and k2/n2 are significantly different.
 */
export function twoPropZTest(
  n1: number,
  k1: number,
  n2: number,
  k2: number,
): { z: number; pValue: number } {
  // Edge case: both groups have zero observations
  if (n1 === 0 && n2 === 0) {
    return { z: 0, pValue: 1 };
  }

  const p1 = n1 === 0 ? 0 : k1 / n1;
  const p2 = n2 === 0 ? 0 : k2 / n2;

  // Pooled proportion
  const pPool = (k1 + k2) / (n1 + n2);

  // Edge cases: pooled proportion is 0 or 1 (no variance)
  if (pPool === 0 || pPool === 1) {
    return { z: 0, pValue: 1 };
  }

  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));

  if (se === 0) {
    return { z: 0, pValue: 1 };
  }

  const z = (p1 - p2) / se;

  // Two-tailed p-value using normal approximation
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  return { z, pValue };
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
