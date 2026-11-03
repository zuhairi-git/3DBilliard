export const roomBounds = {
  halfWidth: 3.6,
  halfLength: 3.9,
  floor: -0.765,
  ceiling: 2.8,
};

// Keep the orbit above the rails, with clearance for the camera near plane.
export function constrainOrbit(alpha: number, beta: number, radius: number) {
  const elevation = Math.max(0.025, Math.min(1.28, beta));
  const dx = Math.sin(elevation) * Math.cos(alpha);
  const dz = Math.sin(elevation) * Math.sin(alpha);
  const dy = Math.cos(elevation);
  const clearance = 0.25;
  const maximum = Math.min(
    6,
    (roomBounds.halfWidth - clearance) / Math.max(Math.abs(dx), 0.0001),
    (roomBounds.halfLength - clearance) / Math.max(Math.abs(dz), 0.0001),
    (roomBounds.ceiling - clearance) / dy,
  );
  return { beta: elevation, radius: Math.max(0.7, Math.min(maximum, radius)) };
}
