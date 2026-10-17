// 每年的重心：玩家把时间花在哪里，每个月月底按这个月在各个重心上花的时间结算。

import { S } from './state';
import { chance, clamp, wpick } from './rng';
import { isWorking, raise } from './career';
import { log } from './journal';
import { MONTHS, perMonth } from './monthly';

declare module './types' {
  interface Life {
    fAuto?: { k: string | null; a: number }; // 自动抉择（或无界面）时，这一年替你选的重心（a：哪一岁选的）
    fLove?: number; // 这一年花在「恋爱」上的时间（年为单位），超过 0.4 年就更容易认识人
  }
}

// ===== 每年的重心 =====
// e：把一整年都花在这上面的效果；每个月结算 1/12
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
// 改重心：先把旧重心从上次改动到现在这一段时间记上。
// 记账只看「在哪些时刻改了重心」和月底的时刻，与每一步推进多远无关，所以重放逐位一致
export function setFocus(k: string) { closeFocus(); S.focus = k; }
function closeFocus() {
  const t0 = S.fStart || 0;
  if (S.focus && S.t > t0) S.fT[S.focus] = (S.fT[S.focus] || 0) + (S.t - t0);
  S.fStart = S.t;
}
// 工作很拼时涨工资：一整年都拼的话一年 22% 的机会，换算成每月；涨幅 12%，越接近个人上限涨得越少（career.ts 的 raise）
const RAISE_P = 0.22, RAISE_M1 = perMonth(RAISE_P);
// 各重心的效果拆成 [状态, 一年的量] 的列表，每月结算时不用再遍历对象
const EFF: Record<string, [string, number][]> = {};
for (const k in FOCUS) EFF[k] = Object.entries(FOCUS[k].e) as [string, number][];
/** 把重心 k 花了这个月 w（0–1）的时间：结算 1/12 年的效果。ok：已经确认过这一项现在能选 */
function applyOne(k: string, w: number, ok = false) {
  const f = FOCUS[k]; if (!f || !ok && !f.ok()) return;
  const x = w / MONTHS, st = S.st;
  for (const [s, v] of EFF[k]) st[s] = clamp(st[s] + v * x * (s === 'kn' && v > 0 ? 1 - st.kn / 115 : 1), 0, 100);
  if (k === 'work' && w > 0.4 && chance(w === 1 ? RAISE_M1 : perMonth(RAISE_P * w))) { raise(1.12); log('工作上很拼，涨了工资。', 'good'); }
  if (k === 'love') { S.fLove = (S.fLove || 0) + x; if (S.fLove > 0.4) S.flags.loveBoost = 1; }
}
// 自动抉择（或无界面）时：和原来一样，每年替你抽一个重心、整年都算在它上面。
// 原来是年底抽一次、结算一整年；现在是这一年第一次用到时抽（多半是第 0 个月月底），之后每月结算 1/12。
// 年中抽到的那一项不再能选了（比如结了婚就不能再选恋爱、没了工作就不能再选工作），就重新抽一次，保证每个月都有效果
function autoMonth() {
  let a = S.fAuto;
  if (!a || a.a !== S.age || (a.k && !FOCUS[a.k].ok())) a = S.fAuto = { k: autoFocus(), a: S.age };
  if (a.k) applyOne(a.k, 1, true);
}
/** 这个月的重心：按这个月在各个重心上花的时间结算，然后从下个月重新记 */
export function applyFocus() {
  if (S.headless || S.auto) {
    // 自动的月份不看这个月的时间账：从月底重新记，清掉玩家在这个月里改重心时记下的
    S.fStart = S.t;
    for (const k in S.fT) { void k; S.fT = {}; break; }
    autoMonth();
    return;
  }
  closeFocus();
  let tot = 0; for (const k in S.fT) tot += S.fT[k];
  // 这个月里有一部分时间没有重心（比如刚满 6 岁）：和原来一样，按有重心的时间的比例结算
  if (tot) for (const k in S.fT) applyOne(k, S.fT[k] / tot);
  S.fT = {};
}

// ===== 每个月月底 =====
/** 按这个月在各个重心上花的时间结算 1/12 年的效果。S.fT 只记这个月（结算完清空） */
export function focusMonth(m: number) {
  if (m === 0) S.fLove = 0;
  applyFocus();
  // 下一年从 t = 0 重新记（planYearSchedule 也会这样重置；这里再做一次，不依赖它）
  if (m === MONTHS - 1) S.fStart = 0;
}
