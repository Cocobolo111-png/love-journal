export const PORTAL_MOTION = {
  hero: 900,
  depth: 1550,
  cameraEnd: 2550,
  revealEnd: 2720,
} as const;

/** Monotone cubic camera path with shared non-zero velocity at both waypoints. */
export function portalCameraPosition(
  elapsed: number,
  positions: readonly [number, number, number, number],
): number {
  const times = [0, PORTAL_MOTION.hero, PORTAL_MOTION.depth, PORTAL_MOTION.cameraEnd];
  if (elapsed <= 0) return positions[0];
  if (elapsed >= PORTAL_MOTION.cameraEnd) return positions[3];

  const spans = times.slice(1).map((time, index) => time - times[index]);
  const slopes = spans.map((span, index) =>
    Math.max(0, (positions[index + 1] - positions[index]) / span));
  const tangent = (index: 1 | 2) => {
    const before = slopes[index - 1];
    const after = slopes[index];
    if (!before || !after) return 0;
    const first = 2 * spans[index] + spans[index - 1];
    const second = spans[index] + 2 * spans[index - 1];
    return (first + second) / (first / before + second / after);
  };
  const tangents = [0, tangent(1), tangent(2), 0];
  const segment = elapsed < times[1] ? 0 : elapsed < times[2] ? 1 : 2;
  const width = spans[segment];
  const t = (elapsed - times[segment]) / width;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * positions[segment]
    + (t3 - 2 * t2 + t) * width * tangents[segment]
    + (-2 * t3 + 3 * t2) * positions[segment + 1]
    + (t3 - t2) * width * tangents[segment + 1];
}
