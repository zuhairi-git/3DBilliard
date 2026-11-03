export const radius = 0.028575;
export const width = 1.27;
export const length = 2.54;
export const pockets = [-1, 1].flatMap(side =>
  [-1, 0, 1].map(end => ({ x: side * width / 2, z: end * length / 2 }))
);

export interface Ball {
  x: number;
  z: number;
  vx: number;
  vz: number;
  pocketed: boolean;
  spinX: number;
  spinZ: number;
  sideSpin: number;
}

export function rack(snooker = false): Ball[] {
  const make = (x: number, z: number): Ball => ({ x, z, vx: 0, vz: 0, pocketed: false, spinX: 0, spinZ: 0, sideSpin: 0 });
  const balls = [make(0, -0.65)];
  const spacing = 2 * radius + 0.0005;
  for (let row = 0; row < 5; row++) {
    for (let column = 0; column <= row; column++) {
      balls.push(make((column - row / 2) * spacing, 0.48 + row * spacing * Math.sqrt(3) / 2));
    }
  }
  if (snooker) {
    balls[0] = make(-0.12, -0.77);
    balls.push(make(0.22, -0.74), make(-0.22, -0.74), make(0, -0.74), make(0, 0), make(0, 0.40), make(0, 1.05));
  }
  return balls;
}

export function step(balls: Ball[], dt: number, sound?: (kind: 'ball' | 'pocket', strength: number) => void) {
  for (const ball of balls) {
    if (ball.pocketed) continue;
    ball.x += ball.vx * dt;
    ball.z += ball.vz * dt;
    if (pockets.some(p => Math.hypot(p.x - ball.x, p.z - ball.z) < 0.067)) {
      sound?.('pocket', Math.max(0.6, Math.hypot(ball.vx, ball.vz)));
      ball.pocketed = true;
      ball.vx = ball.vz = ball.spinX = ball.spinZ = ball.sideSpin = 0;
      continue;
    }
    const xLimit = width / 2 - radius;
    const zLimit = length / 2 - radius;
    if (Math.abs(ball.x) > xLimit) {
      ball.x = Math.sign(ball.x) * xLimit;
      ball.vz -= Math.sign(ball.x) * ball.sideSpin * 0.12;
      ball.vx = -Math.sign(ball.x) * Math.abs(ball.vx) * 0.77;
    }
    if (Math.abs(ball.z) > zLimit) {
      ball.z = Math.sign(ball.z) * zLimit;
      ball.vx += Math.sign(ball.z) * ball.sideSpin * 0.12;
      ball.vz = -Math.sign(ball.z) * Math.abs(ball.vz) * 0.77;
    }
    const spinDecay = Math.exp(-dt * 5);
    ball.vx += ball.spinX * dt;
    ball.vz += ball.spinZ * dt;
    ball.spinX *= spinDecay;
    ball.spinZ *= spinDecay;
    ball.sideSpin *= spinDecay;
    const speed = Math.hypot(ball.vx, ball.vz);
    const scale = speed > 0.012 ? Math.max(0, speed - 0.37 * dt) / speed : 0;
    ball.vx *= scale;
    ball.vz *= scale;
  }
  let firstContact: number | undefined;
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (a.pocketed) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (b.pocketed) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= 2 * radius) continue;
      const nx = distance ? dx / distance : 1, nz = distance ? dz / distance : 0;
      const correction = (2 * radius - distance) / 2;
      a.x -= nx * correction;
      a.z -= nz * correction;
      b.x += nx * correction;
      b.z += nz * correction;
      const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
      if (closing <= 0) continue;
      if (i === 0) firstContact ??= j;
      sound?.('ball', closing);
      const impulse = closing * 0.97;
      a.vx -= impulse * nx;
      a.vz -= impulse * nz;
      b.vx += impulse * nx;
      b.vz += impulse * nz;
    }
  }
  return firstContact;
}


