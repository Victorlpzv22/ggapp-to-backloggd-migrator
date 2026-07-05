import { type ThrottleSpeed } from '../models/index.js';

const DELAYS: Record<ThrottleSpeed, number> = {
  slow: 3000,
  normal: 1000,
  fast: 200,
};

export async function wait(speed: ThrottleSpeed = 'normal'): Promise<void> {
  const ms = DELAYS[speed];
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
