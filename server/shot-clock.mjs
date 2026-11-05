export const shotTimeMs = 30000;
export function updateShotClock(room, state, now = Date.now()) {
  if (typeof state?.rolling !== 'boolean' || (state.turn !== 0 && state.turn !== 1)) return;
  const busy = state.rolling || state.strike > 0 || state.finished;
  const previous = room.clock;
  if (busy) {
    room.clock = { turn: state.turn, deadline: null, expired: false };
  } else if (!previous || previous.turn !== state.turn || previous.deadline === null && !previous.expired) {
    room.clock = { turn: state.turn, deadline: now + shotTimeMs, expired: false };
  }
}
export function expireShotClock(room, now = Date.now()) {
  const clock = room.clock;
  if (!clock || clock.deadline === null || clock.expired || now < clock.deadline) return false;
  clock.expired = true;
  return true;
}
export function pauseShotClock(room, now = Date.now()) {
  if (room.clock?.deadline != null) {
    room.clock.remaining = Math.max(0, room.clock.deadline - now);
    room.clock.deadline = null;
  }
}
export function resumeShotClock(room, now = Date.now()) {
  if (room.clock?.remaining !== undefined) {
    room.clock.deadline = now + room.clock.remaining;
    delete room.clock.remaining;
  }
}
