// 随机数：mulberry32，状态保存在 S.rs 里，所以同一个 seed 的一生可以完全复现、也可以存档。

import { fcos, flog } from './fmath';
import { S } from './state';

// ===== 随机数（可存档的 mulberry32，状态保存在 S.rs） =====
export function rnd() {
  let t = (S.rs = (S.rs + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
export const pick = a => a[Math.floor(rnd() * a.length)];
export const chance = p => rnd() < p;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function wpick(pairs) {
  if (!Array.isArray(pairs)) pairs = Object.entries(pairs);
  let t = 0;
  for (const [, w] of pairs) t += Math.max(0, w);
  let r = rnd() * t;
  for (const [x, w] of pairs) { r -= Math.max(0, w); if (r < 0) return x; }
  return pairs[pairs.length - 1][0];
}
export function gauss(m = 0, sd = 1) { const u = 1 - rnd(), v = rnd(); return m + sd * Math.sqrt(-2 * flog(u)) * fcos(2 * Math.PI * v); }

// 只读地执行 fn：期间消耗的随机数会被退回。界面上算展示用的数字时用它，避免影响这一生的走向
export function peek<T>(fn: () => T): T {
  const rs = S.rs;
  try { return fn(); } finally { S.rs = rs; }
}

// ===== 第二条随机数流：只给「日常」用 =====
// 日常（年节、生活片段，见 content/daily.ts）只往时间线上写字，不改任何状态。它用自己的随机数流，
// 所以加不加、改不改日常内容，主流的随机数序列都不变，人生的走向（寿命、婚育、收入……）一位都不变
export function rnd2() {
  if (S.rs2 == null) S.rs2 = (S.seed ^ 0x5bd1e995) | 0;
  let t = (S.rs2 = (S.rs2 + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const pick2 = <T>(a: T[]): T => a[Math.floor(rnd2() * a.length)];
export const chance2 = (p: number) => rnd2() < p;
