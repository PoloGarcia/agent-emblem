import { describe, expect, it } from "vitest";
import { getCandidateSamplingDensity, getLowCountUniformPresetMark, getParticleSamplingPlan, selectSpatiallyBalancedCandidates } from "./AgentEmblem";

describe("particle sampling plan", () => {
  it("uses a denser source grid for sparse artwork at the same requested count", () => {
    const filledMark = getParticleSamplingPlan("auto", 24, 0.1, 0.8, 80);
    const sparseMark = getParticleSamplingPlan("auto", 24, 0.1, 0.2, 80);

    expect(filledMark.particleCount).toBe(80);
    expect(sparseMark.particleCount).toBe(80);
    expect(sparseMark.density).toBeGreaterThan(filledMark.density);
  });

  it("keeps legacy density behavior when particleCount is omitted", () => {
    expect(getParticleSamplingPlan(18, 24, 0.1, 0.8)).toEqual({ density: 18, particleCount: undefined });
  });

  it("bounds extreme particle-count requests", () => {
    expect(getParticleSamplingPlan("auto", 24, 0.1, 0.8, 2).particleCount).toBe(12);
    expect(getParticleSamplingPlan("auto", 24, 0.1, 0.8, 5000).particleCount).toBe(800);
  });

  it("moves position-uniform particles toward the count-derived grid", () => {
    expect(getCandidateSamplingDensity(10, 24, 0)).toBe(16);
    expect(getCandidateSamplingDensity(10, 24, 1)).toBe(10);
    expect(getCandidateSamplingDensity(10, undefined, 1)).toBe(10);
  });

  it("uses a complete lattice for a low-count uniform square", () => {
    const mark = getLowCountUniformPresetMark("square", 24);

    expect(mark.points).toHaveLength(25);
    expect(new Set(mark.points.map((point) => point.x)).size).toBe(5);
    expect(new Set(mark.points.map((point) => point.y)).size).toBe(5);
    expect(mark.points.filter((point) => point.edge)).toHaveLength(16);
  });

  it("uses balanced rings for a low-count uniform circle", () => {
    const mark = getLowCountUniformPresetMark("circle", 24);
    const center = mark.points.find((point) => point.x === 0.5 && point.y === 0.5);
    const edgeRadii = mark.points.filter((point) => point.edge).map((point) => Math.hypot(point.x - 0.5, point.y - 0.5));

    expect(mark.points).toHaveLength(24);
    expect(center).toBeTruthy();
    expect(edgeRadii).toHaveLength(16);
    expect(Math.max(...edgeRadii) - Math.min(...edgeRadii)).toBeLessThan(0.000001);
  });

  it("keeps low-count selection balanced across a filled silhouette", () => {
    const candidates = [];
    for (let y = -5; y <= 5; y += 1) {
      for (let x = -5; x <= 5; x += 1) {
        if (x * x + y * y > 25) continue;
        candidates.push({ sourceX: x, sourceY: y, weight: 1, seed: ((x + 5) * 13 + (y + 5) * 29) / 500 });
      }
    }

    const selected = selectSpatiallyBalancedCandidates(candidates, 12);
    const quadrants = new Set(selected.map((point) => `${point.sourceX < 0 ? "left" : "right"}:${point.sourceY < 0 ? "top" : "bottom"}`));

    expect(selected).toHaveLength(12);
    expect(quadrants).toEqual(new Set(["left:top", "right:top", "left:bottom", "right:bottom"]));
    expect(Math.min(...selected.map((point) => point.sourceX))).toBeLessThanOrEqual(-4);
    expect(Math.max(...selected.map((point) => point.sourceX))).toBeGreaterThanOrEqual(4);
    expect(Math.min(...selected.map((point) => point.sourceY))).toBeLessThanOrEqual(-4);
    expect(Math.max(...selected.map((point) => point.sourceY))).toBeGreaterThanOrEqual(4);
  });

  it("does not let raster scan order determine the selected shape", () => {
    const candidates = Array.from({ length: 36 }, (_, index) => ({
      sourceX: index % 6,
      sourceY: Math.floor(index / 6),
      weight: 1,
      seed: ((index % 6) * 19 + Math.floor(index / 6) * 31) / 997,
    }));
    const key = (points: typeof candidates) => points.map((point) => `${point.sourceX}:${point.sourceY}`).sort();

    expect(key(selectSpatiallyBalancedCandidates(candidates, 12))).toEqual(key(selectSpatiallyBalancedCandidates([...candidates].reverse(), 12)));
  });
});
