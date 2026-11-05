import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSource } from './load-source.mjs';
const { RemoteShot, remoteKey, remotePlacement } = await loadSource('tv-controls');
const { rack, radius, width, length } = await loadSource('physics');

test('remote supports directional, OK and common TV Back keys', () => {
  assert.equal(remoteKey('ArrowLeft', 0), 'left');
  assert.equal(remoteKey('Select', 0), 'ok');
  assert.equal(remoteKey('Unidentified', 10009), 'back');
  assert.equal(remoteKey('Unidentified', 461), 'back');
  assert.equal(remoteKey('Unidentified', 38), 'up');
  assert.equal(remoteKey('a', 65), undefined);
});
test('placement and aim confirmation precede firing; Back cancels power', () => {
  const shot = new RemoteShot();
  shot.reset(true);
  assert.equal(shot.stage, 'place');
  assert.equal(shot.press('ok', false), undefined);
  assert.equal(shot.stage, 'aim');
  shot.press('ok', false);
  assert.equal(shot.stage, 'power');
  shot.press('back', false);
  assert.equal(shot.stage, 'aim');
  assert.equal(shot.press('back', false), 'menu');
  shot.press('ok', false);
  assert.equal(shot.press('ok', false), 'shoot');
});
test('eight-ball pocket selection precedes power and power stays in safe bounds', () => {
  const shot = new RemoteShot();
  shot.press('ok', true);
  assert.equal(shot.stage, 'pocket');
  shot.press('ok', true);
  assert.equal(shot.stage, 'power');
  for (let i = 0; i < 50; i++) shot.press('up', true);
  assert.equal(shot.power, 1);
  for (let i = 0; i < 50; i++) shot.press('down', true);
  assert.equal(shot.power, 0.1);
  shot.reset(false);
  assert.equal(shot.stage, 'aim');
});
test('remote placement follows screen direction and rejects ball overlap', () => {
  const balls = rack();
  assert.ok(remotePlacement(balls, 'break', 'right', 0).z > balls[0].z);
  assert.ok(remotePlacement(balls, 'break', 'right', -Math.PI / 2).x > balls[0].x);
  const next = remotePlacement(balls, 'break', 'up', 0);
  Object.assign(balls[1], next);
  assert.equal(remotePlacement(balls, 'break', 'up', 0), undefined);
});
test('remote placement respects cushions and the break head string', () => {
  const balls = rack().slice(0, 1);
  Object.assign(balls[0], { x: width / 2 - radius, z: -length / 4 });
  const next = remotePlacement(balls, 'break', 'right', -Math.PI / 2);
  assert.ok(next.x <= width / 2 - radius);
  const forward = remotePlacement(balls, 'break', 'up', -Math.PI / 2);
  assert.ok(forward.z <= -length / 4);
});
