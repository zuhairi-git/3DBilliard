import { length, radius, width, type Ball } from './physics';
export const cueLength = 0.95;

export function cuePose(balls: Ball[], aimX: number, aimZ: number, tipX: number, tipY: number, withdrawal: number) {
  const cueBall = balls[0];
  const offsetX = aimZ * tipX * radius;
  const offsetZ = -aimX * tipX * radius;
  const offsetY = tipY * radius;
  const rear = Math.sqrt(Math.max(0, radius * radius - offsetX * offsetX - offsetZ * offsetZ - offsetY * offsetY));
  const tip = { x: cueBall.x + offsetX - aimX * rear, y: Math.max(0.008, radius + offsetY), z: cueBall.z + offsetZ - aimZ * rear };
  const shaftLength = cueLength;
  const clearance = 0.016;
  const reach = shaftLength + withdrawal;
  let slope = 0.08;
  for (const b of balls.slice(1)) {
    if (b.pocketed) continue;
    const dx = b.x - tip.x, dz = b.z - tip.z;
    const behind = -(dx * aimX + dz * aimZ);
    const perpendicular = Math.abs(dx * aimZ - dz * aimX);
    if (behind <= 0 || behind > reach + radius || perpendicular >= radius + clearance) continue;
    const height = radius + Math.sqrt((radius + clearance) ** 2 - perpendicular ** 2);
    slope = Math.max(slope, (height - tip.y) / Math.max(0.005, behind - radius - clearance));
  }
  for (const [position, direction, edge] of [[tip.x, -aimX, width / 2], [tip.z, -aimZ, length / 2]]) {
    if (Math.abs(direction) < 1e-9) continue;
    const distance = (Math.sign(direction) * edge - position) / direction;
    if (distance > 0 && distance < reach) slope = Math.max(slope, (0.065 + clearance - tip.y) / Math.max(0.005, distance - clearance));
  }
  const normalization = Math.hypot(1, slope);
  const direction = { x: aimX / normalization, y: -slope / normalization, z: aimZ / normalization };
  const centerDistance = shaftLength / 2 + withdrawal;
  return { direction, center: {
    x: tip.x - direction.x * centerDistance,
    y: tip.y - direction.y * centerDistance,
    z: tip.z - direction.z * centerDistance,
  } };
}
