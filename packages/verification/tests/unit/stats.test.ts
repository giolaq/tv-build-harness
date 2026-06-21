import { describe, it, expect } from "vitest";
import { wilsonCI, twoPropZTest, fisherExact, mannWhitneyU, holmCorrection } from "../../src/stats/index.js";

describe("wilsonCI", () => {
  it("n=10, k=9 → rate=0.9, lower≈0.596, upper≈0.986", () => {
    const result = wilsonCI(10, 9);
    expect(result.rate).toBeCloseTo(0.9, 5);
    expect(result.lower).toBeGreaterThan(0.5);
    expect(result.lower).toBeLessThan(0.7);
    expect(result.upper).toBeGreaterThan(0.95);
    expect(result.upper).toBeLessThanOrEqual(1.0);
  });

  it("n=0 → rate=0, lower=0, upper=0", () => {
    const result = wilsonCI(0, 0);
    expect(result.rate).toBe(0);
    expect(result.lower).toBe(0);
    expect(result.upper).toBe(0);
  });

  it("n=100, k=100 → rate=1.0, lower close to 0.963", () => {
    const result = wilsonCI(100, 100);
    expect(result.rate).toBeCloseTo(1.0, 5);
    expect(result.lower).toBeGreaterThan(0.95);
    expect(result.lower).toBeLessThan(0.98);
    expect(result.upper).toBeCloseTo(1.0, 5);
  });
});

describe("twoPropZTest", () => {
  it("n1=100,k1=60 vs n2=100,k2=40 → significant (p < 0.05)", () => {
    const result = twoPropZTest(100, 60, 100, 40);
    expect(result.pValue).toBeLessThan(0.05);
  });

  it("n1=100,k1=50 vs n2=100,k2=48 → not significant", () => {
    const result = twoPropZTest(100, 50, 100, 48);
    expect(result.pValue).toBeGreaterThan(0.05);
  });
});

describe("fisherExact", () => {
  it("[[10,0],[0,10]] → very small p-value (< 0.001)", () => {
    const result = fisherExact(10, 0, 0, 10);
    expect(result.pValue).toBeLessThan(0.001);
  });
});

describe("mannWhitneyU", () => {
  it("[1,2,3,4,5] vs [6,7,8,9,10] → significant", () => {
    const result = mannWhitneyU([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]);
    expect(result.pValue).toBeLessThan(0.05);
  });

  it("[1,2,3,4,5] vs [1,2,3,4,5] → not significant (p close to 1)", () => {
    const result = mannWhitneyU([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]);
    expect(result.pValue).toBeGreaterThan(0.05);
  });
});

describe("holmCorrection", () => {
  it("[0.01, 0.04, 0.03] with alpha=0.05 → only the smallest is significant after correction", () => {
    const result = holmCorrection([0.01, 0.04, 0.03], 0.05);
    // Sorted: [0.01(idx0), 0.03(idx2), 0.04(idx1)]
    // Adjusted: 0.01*3=0.03, 0.03*2=0.06, max(0.06, 0.04*1)=0.06
    // Only idx0 (adjusted=0.03) passes alpha=0.05
    expect(result.significant[0]).toBe(true);
    expect(result.significant[1]).toBe(false);
    expect(result.significant[2]).toBe(false);
    expect(result.adjusted[0]).toBeCloseTo(0.03, 5);
    expect(result.adjusted[1]).toBeCloseTo(0.06, 5);
    expect(result.adjusted[2]).toBeCloseTo(0.06, 5);
  });
});
