import { length, width, radius, pockets, type Ball } from './physics';

export type RemoteKey = 'left' | 'right' | 'up' | 'down' | 'ok' | 'back';
export function remoteKey(key: string, code: number): RemoteKey | undefined {
  const keys: Record<string, RemoteKey> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'ok', Select: 'ok', Accept: 'ok', OK: 'ok', Escape: 'back', Backspace: 'back', BrowserBack: 'back', GoBack: 'back' };
  return keys[key] ?? ({ 13: 'ok', 37: 'left', 38: 'up', 39: 'right', 40: 'down', 461: 'back', 10009: 'back' } as Record<number, RemoteKey>)[code];
}

// Screen directions follow the fitted overhead camera, including portrait screens.
export function remotePlacement(balls: Ball[], placement: 'break' | 'foul', key: RemoteKey, alpha: number) {
  const horizontal = key === 'right' ? 1 : key === 'left' ? -1 : 0;
  const vertical = key === 'up' ? 1 : key === 'down' ? -1 : 0;
  const x = Math.max(-width / 2 + radius, Math.min(width / 2 - radius,
    balls[0].x + 0.025 * (-horizontal * Math.sin(alpha) - vertical * Math.cos(alpha))));
  const z = Math.max(-length / 2 + radius, Math.min(placement === 'break' ? -length / 4 : length / 2 - radius,
    balls[0].z + 0.025 * (horizontal * Math.cos(alpha) - vertical * Math.sin(alpha))));
  if (pockets.some(p => Math.hypot(p.x - x, p.z - z) < 0.085) ||
      balls.slice(1).some(b => !b.pocketed && Math.hypot(b.x - x, b.z - z) < 2 * radius + 0.001)) return;
  return { x, z };
}

export class RemoteShot {
  stage: 'place' | 'aim' | 'pocket' | 'power' = 'aim';
  power = 0.5;
  reset(placement: boolean) { this.stage = placement ? 'place' : 'aim'; }
  press(key: RemoteKey, needsPocket: boolean): 'shoot' | 'menu' | undefined {
    if (key === 'back') {
      if (this.stage === 'aim' || this.stage === 'place') return 'menu';
      this.stage = 'aim';
    } else if (key === 'ok') {
      if (this.stage === 'place') this.stage = 'aim';
      else if (this.stage === 'aim') this.stage = needsPocket ? 'pocket' : 'power';
      else if (this.stage === 'pocket') this.stage = 'power';
      else return 'shoot';
    } else if (this.stage === 'power') {
      this.power = Math.max(0.1, Math.min(1, Math.round((this.power + (key === 'up' || key === 'right' ? 0.05 : -0.05)) * 100) / 100));
    }
  }
}
