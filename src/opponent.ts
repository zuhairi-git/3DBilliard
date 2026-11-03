import { length, pockets, radius, width, type Ball } from './physics';

export function chooseShot(balls: Ball[], legal: number[], difficulty: string) {
  const cue = balls[0];
  let best: { angle: number; power: number; cost: number } | undefined;
  function clear(ax: number, az: number, bx: number, bz: number, target: number) {
    const dx = bx - ax, dz = bz - az;
    const squared = dx * dx + dz * dz;
    return balls.every((ball, index) => {
      if (!index || index === target || ball.pocketed) return true;
      const t = Math.max(0, Math.min(1, ((ball.x - ax) * dx + (ball.z - az) * dz) / squared));
      return Math.hypot(ball.x - ax - t * dx, ball.z - az - t * dz) > 2 * radius;
    });
  }
  for (const index of legal) {
    const ball = balls[index];
    for (const pocket of pockets) {
      const dx = pocket.x - ball.x, dz = pocket.z - ball.z;
      const distance = Math.hypot(dx, dz);
      if (!distance) continue;
      const x = ball.x - dx / distance * 2 * radius;
      const z = ball.z - dz / distance * 2 * radius;
      if (Math.abs(x) > width / 2 - radius || Math.abs(z) > length / 2 - radius) continue;
      const reach = Math.hypot(x - cue.x, z - cue.z);
      if (!reach) continue;
      const cut = ((x - cue.x) * dx + (z - cue.z) * dz) / (reach * distance);
      if (cut < 0.34 || !clear(cue.x, cue.z, x, z, index) || !clear(ball.x, ball.z, pocket.x, pocket.z, index)) continue;
      const cost = reach + distance + 1.5 * (1 - cut);
      if (!best || cost < best.cost) best = {
        angle: Math.atan2(x - cue.x, z - cue.z),
        power: Math.min(0.9, Math.sqrt(0.74 * (reach + distance / (cut * cut)) + 0.45) / 4.3),
        cost,
      };
    }
  }
  const target = [...legal].sort((a, b) =>
    Math.hypot(balls[a].x - cue.x, balls[a].z - cue.z) - Math.hypot(balls[b].x - cue.x, balls[b].z - cue.z)
  ).find(index => clear(cue.x, cue.z, balls[index].x, balls[index].z, index)) ?? legal[0];
  if (!best && target === undefined) return;
  const angle = best?.angle ?? Math.atan2(balls[target].x - cue.x, balls[target].z - cue.z);
  const error = difficulty === 'Easy' ? 0.085 : difficulty === 'Hard' ? 0.005 : 0.025;
  return { angle: angle + (Math.random() * 2 - 1) * error, power: best?.power ?? 0.55 };
}
