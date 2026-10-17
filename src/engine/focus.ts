// 每年的时间安排：空闲时间放在哪里。6–17 岁 1 格、18 岁起 2 格，两格可以放同一件事（全力投入，第二格打折）。
// 玩家要感觉得到（AGENTS.md）：
// · 状态：每格每年的效果见 FOCUS 的 e，每个月月底按这个月放在各项上的时间结算；
// · 遇到什么事：格子所在领域的随机事件更容易抽到（schedule.ts 的 chooseEvent 用 domK），好事坏事一起多；
// · 具体结果：工作 → 涨工资、被挖；恋爱 → 认识人、感情；家人 → 婚姻更稳；
// · 一生的回响：每一项一辈子放了多少年记在 S.fy，几十年后会被提起（content/echoes.ts），结局里也看得到（story.ts）。

import { S } from './state';
import { chance, clamp, wpick } from './rng';
import { RAISE, isWorking, raise } from './career';
import { log, vary } from './journal';
import { MONTHS, perMonth } from './monthly';

declare module './types' {
  interface Life {
    slots?: (string | null)[]; // 这一年的格子（slotN 个）；自动抉择（或无界面）时每年生日那个月替你分好，显示的就是结算的
    slotPin?: boolean[];       // 玩家亲手选过的格子：开着自动抉择也不再替你换（那一项不能再选了才换）
    fy?: Record<string, number>; // 一辈子在每一项上放了多少格·年
  }
}

// ===== 能放什么 =====
// e：一格放满一整年的效果（每个月结算 1/12）；dom：属于哪个领域（这个领域的随机事件更容易抽到）
export const FOCUS = {
  study: { n: '学习', d: '多花时间读书、写作业', e: { kn: 5, h: -2.5, so: -1 }, dom: 'study', ok: () => S.age >= 6 && (S.school || S.age < 18) },
  play: { n: '玩耍', d: '跑出去玩、看动画、打游戏', e: { h: 6, kn: -2, so: 2 }, dom: 'leisure', ok: () => S.age >= 6 && S.age < 18 },
  friends: { n: '朋友', d: '和朋友待在一起', e: { so: 7, h: 3, kn: -1 }, dom: 'social', ok: () => S.age >= 6 },
  sport: { n: '运动', d: '跑步、打球、跳绳', e: { hl: 5, h: 2 }, dom: 'health', ok: () => S.age >= 6 && S.age < 70 },
  work: { n: '工作', d: '加班、学技能、争取升职', e: { h: -2.5, hl: -2.5, so: -1 }, dom: 'work', ok: () => isWorking() },
  love: { n: '恋爱', d: '多出去认识人', e: { so: 2, h: 2 }, dom: 'love', ok: () => S.age >= 18 && S.age < 60 && !S.fam.married },
  family: { n: '家人', d: '陪伴家人', e: { so: 4, h: 4 }, dom: 'family', ok: () => S.age >= 22 },
  hobby: { n: '爱好', d: '做自己喜欢的事', e: { h: 6, so: 1 }, dom: 'leisure', ok: () => S.age >= 18 },
  rest: { n: '养身体', d: '好好吃饭睡觉，按时体检', e: { hl: 5, h: 1 }, dom: 'health', ok: () => S.age >= 18 },
};
// 格子旁边写的「有什么用」（状态以外的结果）
const MORE: Record<string, string> = {
  study: '', work: '更容易涨工资、被别的公司挖', love: '更容易认识人，感情更好',
  family: '婚姻更稳，家里的事更多', friends: '朋友多了，事也多了', sport: '少生病', rest: '少生病', hobby: '日子过得有滋味', play: '开心',
};
export const focusMore = (k: string) => k === 'study' ? (S.age < 18 ? '成绩更好，中考高考更有把握' : '学得更扎实，毕业去向更好') : MORE[k];
export const focusList = () => Object.keys(FOCUS).filter(k => FOCUS[k].ok());

// ===== 格子 =====
/** 这个年纪有几格：6 岁以前没有（由大人带着），6–17 岁 1 格，18 岁起 2 格 */
export const slotN = (a = S.age) => a < 6 ? 0 : a < 18 ? 1 : 2;
// 两格放同一件事：第二格只算 SAME2（全力投入，效果递减）
export const SAME2 = 0.6;
/** 现在的格子里，重心 k 一共算几格（0、1、1.6） */
export function slotW(k: string, slots = S.slots) {
  let w = 0, seen = false;
  for (const x of slots || []) if (x === k) { w += seen ? SAME2 : 1; seen = true; }
  return w;
}
/** 现在的格子里，领域 dom 一共算几格 */
export function domW(dom: string, slots = S.slots) {
  let w = 0;
  for (const k in FOCUS) if (FOCUS[k].dom === dom) w += slotW(k, slots);
  return w;
}
/** 这个月有没有一格放在「恋爱」上（说过「现在不想谈」的，放上恋爱就是又想谈了，见 romance.ts） */
export const loveNow = () => slotW('love') > 0;
// 格子所在领域的事件更容易抽到：每一格把这个领域的权重抬高 DOM_K 倍（一格 ×3，两格都放 ×4.2）。
// 不做归一：放在哪里，这一生就真的多遇到那一类事
export const DOM_K = 2;
export const domK = (dom: string) => 1 + DOM_K * domW(dom);

// ===== 自动分配 =====
// 按处境：上学的多学习、上班的多工作，年轻单身的多恋爱，结了婚的多陪家人，上了年纪的多养身体
const autoW = (k: string) => ({ study: S.school ? 3 : 1, play: 2, friends: 1.5, sport: 1, work: 3, love: S.age < 32 ? 2 : 0.5, family: S.fam.married ? 2.5 : 1, hobby: 1, rest: S.age > 50 ? 2.5 : 0.8 })[k] || 1;
// 第二格放和第一格一样的，权重再乘 SAME_W（多数人会分开放）
const SAME_W = 0.5;
export function autoFocus(not: string | null = null) {
  const l = focusList(); if (!l.length) return null;
  return wpick(l.map(k => [k, autoW(k) * (k === not ? SAME_W : 1)]));
}
/** 生日那个月：格子数随年龄变（6 岁、18 岁），不能再选的清掉。玩家亲手选的留着（开着自动抉择也不换）；
 *  其余的每年按这时的处境重新分（不操作也合理：上学时多学习，上了班多工作，结了婚多陪家人） */
export function slotsYear() {
  const n = slotN(), pin = (S.slotPin || []).slice(0, n);
  const cur = (S.slots || []).slice(0, n).map((k, i) => k && FOCUS[k] && FOCUS[k].ok() && pin[i] ? k : null);
  while (cur.length < n) cur.push(null);
  for (let i = 0; i < n; i++) if (!cur[i]) { cur[i] = autoFocus(i ? cur[0] : null); pin[i] = false; }
  S.slots = cur; S.slotPin = pin;
}

// ===== 记账 =====
// 改格子：先把旧格子从上次改动到现在这一段时间记上。
// 记账只看「在哪些时刻改了格子」和月底的时刻，与每一步推进多远无关，所以重放逐位一致
export function setSlot(i: number, k: string | null) {
  closeFocus();
  const s = (S.slots || []).slice();
  while (s.length < slotN()) s.push(null);
  if (i >= 0 && i < s.length) { s[i] = k; (S.slotPin ||= [])[i] = true; }
  S.slots = s;
}
function closeFocus() {
  const t0 = S.fStart || 0, dt = S.t - t0;
  if (dt > 0) for (const k of new Set(S.slots || [])) if (k) S.fT[k] = (S.fT[k] || 0) + dt * slotW(k);
  S.fStart = S.t;
}
// 拼工作涨工资：一格放满一年 15% 的机会（两格 1.6 份约 24%），换算成每月；越接近个人上限涨得越少（career.ts 的 raise）
const RAISE_P = 0.15;
const RAISE_T = ['工作上很拼，涨了工资。', '年底考核拿了优秀，工资涨了一档。', '项目做得漂亮，领导在会上点了你的名，下个月工资条多了一截。', '加了一年的班，换来一次加薪。', '同一批进来的人里，你第一个涨了薪。'];
const EFF: Record<string, [string, number][]> = {};
for (const k in FOCUS) EFF[k] = Object.entries(FOCUS[k].e) as [string, number][];
/** 重心 k 这个月算 w 格（一格放满一个月是 1）：结算 1/12 年的效果，记进一生的账 */
function applyOne(k: string, w: number) {
  const f = FOCUS[k]; if (!f || !f.ok() || w <= 0) return;
  const x = w / MONTHS, st = S.st;
  for (const [s, v] of EFF[k]) st[s] = clamp(st[s] + v * x * (s === 'kn' && v > 0 ? 1 - st.kn / 115 : 1), 0, 100);
  (S.fy ||= {})[k] = (S.fy[k] || 0) + x;
  if (k === 'work' && w > 0.4 && chance(perMonth(Math.min(0.95, RAISE_P * w)))) { raise(RAISE.work); log(vary('raiseWork', RAISE_T), 'good'); }
}
/** 这个月的格子：按这个月在各项上放的时间结算，然后从下个月重新记 */
export function applyFocus() {
  if (S.headless || S.auto) {
    // 自动的月份不看时间账：从月底重新记，清掉玩家在这个月里改格子时记下的。
    // 年中某一格不能再选了（结了婚不能再选恋爱、没了工作不能再选工作），那一格重新抽，保证每个月都有效果
    S.fStart = S.t; S.fT = {};
    const s = S.slots || [];
    for (let i = 0; i < s.length; i++) if (s[i] && !FOCUS[s[i]].ok()) { s[i] = autoFocus(i ? s[0] : null); if (S.slotPin) S.slotPin[i] = false; }
    for (const k of new Set(s)) if (k) applyOne(k, slotW(k, s));
    return;
  }
  closeFocus();
  for (const k in S.fT) applyOne(k, S.fT[k] * MONTHS);
  S.fT = {};
  // 玩家选的那一格不能再选了（结了婚、丢了工作）：下个月起换成按处境的一项，回到自动
  const s = S.slots || [];
  for (let i = 0; i < s.length; i++) if (s[i] && !FOCUS[s[i]].ok()) { s[i] = autoFocus(i ? s[0] : null); if (S.slotPin) S.slotPin[i] = false; }
}

// ===== 每个月月底 =====
export function focusMonth(m: number) {
  applyFocus();
  // 下一年从 t = 0 重新记（planYearSchedule 也会这样重置；这里再做一次，不依赖它）
  if (m === MONTHS - 1) S.fStart = 0;
}
