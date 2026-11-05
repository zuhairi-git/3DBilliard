import test from 'node:test';
import assert from 'node:assert/strict';
import { updateShotClock, expireShotClock, pauseShotClock, resumeShotClock } from '../server/shot-clock.mjs';
const ready = {turn: 0, rolling: false, strike: 0, finished: false};

test('online clock starts at 30s and snapshots do not extend the turn', () => {
  const room = {};
  updateShotClock(room, ready, 1000);
  assert.equal(room.clock.deadline, 31000);
  updateShotClock(room, ready, 2000);
  assert.equal(room.clock.deadline, 31000);
  assert.equal(expireShotClock(room, 30999), false);
  assert.equal(expireShotClock(room, 31000), true);
  assert.equal(expireShotClock(room, 32000), false);
  updateShotClock(room, ready, 33000);
  assert.equal(room.clock.expired, true);
});
test('clock pauses for the shot and starts fresh when balls settle or turn changes', () => {
  const room = {};
  updateShotClock(room, ready, 0);
  updateShotClock(room, {...ready, strike: 0.19}, 2000);
  assert.equal(room.clock.deadline, null);
  updateShotClock(room, {...ready, rolling: true}, 5000);
  assert.equal(expireShotClock(room, 100000), false);
  updateShotClock(room, {...ready, turn: 1}, 10000);
  assert.equal(room.clock.deadline, 40000);
  updateShotClock(room, {...ready, turn: 0}, 11000);
  assert.equal(room.clock.deadline, 41000);
});
test('disconnect and reconnect preserve remaining shot time', () => {
  const room = {};
  updateShotClock(room, ready, 1000);
  pauseShotClock(room, 11000);
  assert.equal(room.clock.remaining, 20000);
  assert.equal(room.clock.deadline, null);
  resumeShotClock(room, 51000);
  assert.equal(room.clock.deadline, 71000);
  assert.equal(expireShotClock(room, 70999), false);
  assert.equal(expireShotClock(room, 71000), true);
});
