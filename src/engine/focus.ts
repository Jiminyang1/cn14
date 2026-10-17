// 每年的重心：玩家把时间花在哪里，年底按时间比例结算。

import { S } from './state';
import { chance, clamp, wpick } from './rng';
import { isWorking } from './career';
import { log } from './journal';
import { MONTHS } from './monthly';

// ===== 每年的重心 =====
export const FOCUS = {
  study: { n: '学习', d: '多花时间读书、写作业', e: { kn: 3, h: -2, so: -1 }, ok: () => S.age >= 6 && (S.school || S.age < 18) },
  play: { n: '玩耍', d: '跑出去玩、看动画、打游戏', e: { h: 4, kn: -1, so: 1 }, ok: () => S.age >= 6 && S.age < 18 },
  friends: { n: '朋友', d: '和朋友待在一起', e: { so: 5, h: 2, kn: -1 }, ok: () => S.age >= 6 },
  sport: { n: '运动', d: '跑步、打球、跳绳', e: { hl: 3, h: 1 }, ok: () => S.age >= 6 && S.age < 60 },
  work: { n: '工作', d: '加班、学技能、争取升职', e: { h: -2, hl: -2, so: -1 }, ok: () => isWorking() },
  love: { n: '恋爱', d: '多出去认识人', e: { so: 2, h: 1 }, ok: () => S.age >= 18 && S.age < 45 && !S.fam.married },
  family: { n: '家人', d: '陪伴家人', e: { so: 4, h: 3 }, ok: () => S.age >= 22 },
  hobby: { n: '爱好', d: '做自己喜欢的事', e: { h: 4, so: 1 }, ok: () => S.age >= 18 },
  rest: { n: '养身体', d: '好好吃饭睡觉，按时体检', e: { hl: 4, h: 1 }, ok: () => S.age >= 18 },
};
export const focusList = () => Object.keys(FOCUS).filter(k => FOCUS[k].ok());
export function autoFocus() {
  const l = focusList(); if (!l.length) return null;
  const w = { study: S.school ? 3 : 1, play: 2, friends: 1.5, sport: 1, work: 3, love: S.age < 32 ? 2 : 0.5, family: S.fam.married ? 2.5 : 1, hobby: 1, rest: S.age > 50 ? 2.5 : 0.8 };
  return wpick(l.map(k => [k, w[k] || 1]));
}
// 改重心：先把旧重心从上次改动到现在这一段时间记上
export function setFocus(k: string) { closeFocus(); S.focus = k; }
function closeFocus() {
  const t0 = S.fStart || 0;
  if (S.focus && S.t > t0) S.fT[S.focus] = (S.fT[S.focus] || 0) + (S.t - t0);
  S.fStart = S.t;
}
export function applyFocus() {
  closeFocus();
  if (S.headless || S.auto) S.fT = { [autoFocus() || 'none']: 1 };
  let tot = 0; for (const k in S.fT) tot += S.fT[k];
  if (!tot) return;
  for (const k in S.fT) {
    const f = FOCUS[k]; if (!f || !f.ok()) continue;
    const w = S.fT[k] / tot;
    for (const s in f.e) S.st[s] = clamp(S.st[s] + f.e[s] * w * (s === 'kn' && f.e[s] > 0 ? 1 - S.st.kn / 115 : 1), 0, 100);
    if (k === 'work' && w > 0.4 && chance(0.22 * w)) { S.wageK *= 1.12; log('工作上很拼，这一年涨了工资。', 'good'); }
    if (k === 'love' && w > 0.4) S.flags.loveBoost = 1;
  }
}

// ===== 每个月月底 =====
/** 按这一年在各个重心上花的时间结算。兼容模式：一年一次，在第 12 个月（年底） */
export function focusMonth(m: number) {
  if (m === MONTHS - 1) applyFocus();
}
