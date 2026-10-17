// 日程：每年、每个月排哪些事件、抉择、里程碑，以及生日那个月的入学、退休。
// 现在是兼容模式：生日那个月一次排好一整年（planYearSchedule），每个月开始时（planMonth）不再加东西。
import { S } from './state';
import { rnd, wpick, chance } from './rng';
import { log } from './journal';
import { EVENTS } from './content/events';
import { dueDecisions } from './content/decisions';
import { planDaily } from './content/daily';
import { FOCUS, autoFocus, focusList } from './focus';
import { loveQueue } from './romance';
import { carer } from './parents';
import { isWorking, retire, retireAge } from './career';
import { ENABLE_REFLECT, MILESTONES, REFLECT } from './lifecycle';

// 「平静的一段时间」：给低权重事件一个参照，避免总有事情发生
export const QUIET_W = a => a < 18 ? 1.5 : 5;
export function chooseEvent(used) {
  const w: [string | null, number][] = [[null, QUIET_W(S.age)]];
  for (const ev of EVENTS) {
    if (S.age < ev.a[0] || S.age > ev.a[1] || used.has(ev.id)) continue;
    if (ev.once && S.done[ev.id] != null) continue;
    if (ev.gap && S.done[ev.id] != null && S.age - S.done[ev.id] < ev.gap) continue;
    if (ev.c && !ev.c()) continue;
    let wt = typeof ev.w === 'function' ? ev.w() : (ev.w == null ? 1 : ev.w);
    if (S.recent.includes(ev.id)) wt *= 0.1;
    if (wt > 0) w.push([ev.id, wt]);
  }
  return wpick(w);
}

/** 生日那个月：排好这一年的事件、抉择、里程碑，选好这一年的重心 */
export function planYearSchedule() {
  S.queue = []; S.fT = {}; S.fStart = 0;
  const n = S.age < 6 ? 2 : 3, used = new Set();
  for (let i = 0; i < n; i++) {
    const id = chooseEvent(used);
    if (id) { used.add(id); S.queue.push({ at: 0.1 + (i + rnd() * 0.8) / n * 0.8, type: 'ev', id }); }
  }
  dueDecisions().slice(0, 2).forEach((id, i) => S.queue.push({ at: 0.3 + i * 0.3 + rnd() * 0.1, type: 'dec', id }));
  loveQueue();
  if (MILESTONES.includes(S.age)) S.queue.push({ at: 0.02, type: 'ms' });
  if (ENABLE_REFLECT && !S.headless && REFLECT[S.age]) S.queue.push({ at: 0.92, type: 'ref' });
  planDaily(); // 日常：只用第二条随机数流，不影响上面这些
  S.queue.sort((a, b) => a.at - b.at);
  if (S.focus && !(FOCUS[S.focus] && FOCUS[S.focus].ok())) S.focus = null;
  if (!S.focus && focusList().length) S.focus = autoFocus();
}
/** 每个月开始时（第 0 个月在 planYearSchedule 之后）：兼容模式下什么都不做 */
export function planMonth(m: number) { void m; }

/** 生日那个月：上幼儿园、上小学、上初中、退休、不再种地 */
export function scheduleYearStart() {
  const a = S.age;
  if (a === 3) {
    if (chance(S.loc.kind === 'rural' ? 0.85 : 0.96)) log(S.loc.kind === 'rural' ? '上了镇上的幼儿园，每天坐校车来回。' : '上幼儿园了。第一天你抱着门框哭，第二天就交到了朋友。', 'ev');
    else log(`没有上幼儿园，每天跟着${carer()}在家附近转。`, 'ev');
  }
  if (a === 6) { S.school = '小学'; S.schoolEnd = 12; log(S.loc.kind === 'rural' ? '背上新书包，走半个小时的山路去村里的小学。' : '上小学了。开学第一天，门口挤满了拍照的家长。', 'ev'); }
  if (a === 12 && S.school === '小学') { S.school = '初中'; S.schoolEnd = 15; S.edu = 1; log(S.loc.kind === 'rural' ? '小学毕业，去镇上读初中。' : '小学毕业，上了初中。', 'ev'); }
  // 到了退休年龄还在待业的，也直接退休（按原来那一行的退休年龄），不再找工作
  if ((isWorking() || S.job === 'seeking') && a >= retireAge()) retire();
}
