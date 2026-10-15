import test from 'node:test';
import assert from 'node:assert/strict';
import { PORTAL_MOTION, portalCameraPosition } from '../lib/portal-motion.ts';

test('portal camera keeps its existing timing and passes waypoints without stopping', () => {
  const positions = [0, 720, 1000, 1800];
  assert.equal(portalCameraPosition(0, positions), 0);
  assert.equal(portalCameraPosition(PORTAL_MOTION.hero, positions), 720);
  assert.equal(portalCameraPosition(PORTAL_MOTION.depth, positions), 1000);
  assert.equal(portalCameraPosition(PORTAL_MOTION.cameraEnd, positions), 1800);
  let previous = -1;
  for (let time = 0; time <= PORTAL_MOTION.cameraEnd; time += 5) {
    const position = portalCameraPosition(time, positions);
    assert.ok(position >= previous, `camera moved backward at ${time}ms`);
    previous = position;
  }
  for (const waypoint of [PORTAL_MOTION.hero, PORTAL_MOTION.depth]) {
    const before = portalCameraPosition(waypoint, positions) - portalCameraPosition(waypoint - 1, positions);
    const after = portalCameraPosition(waypoint + 1, positions) - portalCameraPosition(waypoint, positions);
    assert.ok(before > 0 && after > 0, 'camera paused at a waypoint');
    assert.ok(Math.abs(before - after) < 0.01, 'camera velocity jumped at a waypoint');
  }
});
