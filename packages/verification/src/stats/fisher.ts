/**
 * Fisher's exact test for a 2x2 contingency table.
 * Table: [[a, b], [c, d]]
 *
 * Uses the hypergeometric distribution to compute a two-tailed p-value.
 */
export function fisherExact(
  a: number,
  b: number,
  c: number,
  d: number,
): { pValue: number } {
  const n = a + b + c + d;
  const row1 = a + b;
  const row2 = c + d;
  const col1 = a + c;
  const col2 = b + d;

  // Compute p-value of the observed table
  const pObserved = hypergeometricPMF(a, n, col1, row1);

  // Sum probabilities of all tables as extreme or more extreme
  let pValue = 0;
  const minA = Math.max(0, row1 - col2);
  const maxA = Math.min(row1, col1);

  for (let i = minA; i <= maxA; i++) {
    const p = hypergeometricPMF(i, n, col1, row1);
    if (p <= pObserved + 1e-12) {
      pValue += p;
    }
  }

  return { pValue: Math.min(1, pValue) };
}

/**
 * Hypergeometric PMF: P(X = k) where X ~ Hypergeometric(N, K, n)
 * Uses log-space computation to avoid overflow.
 */
function hypergeometricPMF(k: number, N: number, K: number, n: number): number {
  // P(X=k) = C(K,k) * C(N-K, n-k) / C(N, n)
  const logP =
    logBinomial(K, k) + logBinomial(N - K, n - k) - logBinomial(N, n);
  return Math.exp(logP);
}

/**
 * Log of binomial coefficient C(n, k) = n! / (k! * (n-k)!)
 */
function logBinomial(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  if (k === 0 || k === n) return 0;
  // Use the identity: log C(n,k) = log(n!) - log(k!) - log((n-k)!)
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

/**
 * Log factorial using Stirling's approximation for large n,
 * direct computation for small n.
 */
const logFactorialCache: number[] = [0, 0];

function logFactorial(n: number): number {
  if (n <= 1) return 0;
  if (logFactorialCache[n] !== undefined) return logFactorialCache[n];

  // Build up the cache iteratively
  const start = logFactorialCache.length;
  for (let i = start; i <= n; i++) {
    logFactorialCache[i] = logFactorialCache[i - 1] + Math.log(i);
  }
  return logFactorialCache[n];
}
