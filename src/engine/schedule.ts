// 日程：每年、每个月排哪些事件、抉择、里程碑，以及入学、退休。
// 生日那个月（planYearSchedule）：定下这一年的随机事件落在哪几个月、做每年一次的抉择判定（落在随机的月份）、排里程碑和日常；
// 每个月开始时（planMonth）：学校的日历（9 月开学、6 月考试和毕业），按当时的处境抽这个月的随机事件，检查这个月该弹出的抉择。
import type { QueueItem } from './types';
import { S } from './state';
import { chance, ri, rnd, wpick } from './rng';
import { log } from './journal';
import { EVENTS } from './content/events';
import { huntMonth, monthDecisions, schoolDecision, yearDecisions } from './content/decisions';
import { planDaily } from './content/daily';
import { FOCUS, autoFocus, focusList } from './focus';
import { carer } from './parents';
import { isWorking, retire, retireAge } from './career';
import { ENABLE_REFLECT, MILESTONES, REFLECT } from './lifecycle';
import { MONTHS, calMonth, calYear, monthStart, posIn } from './monthly';
import { entryYear, fixSchoolEnd, nowM } from './calendar';
import { reportCard } from './personality';

declare module './types' {
  interface Life {
    evAt?: number[];                 // 这一年随机事件的位置（生日那个月定好；到了那个月才按当时的处境抽是哪件事）
    decAt?: Record<string, number>;  // 各抉择最近一次排进日程是出生后的第几个月（按月的间隔用，见 content/decisions.ts）
  }
}

/** 放进队列，保持按 at 排序（同一时刻的排在已有条目后面） */
export function enqueue(e: QueueItem) {
  let i = S.queue.length;
  while (i > 0 && S.queue[i - 1].at > e.at) i--;
  S.queue.splice(i, 0, e);
}
const queued = (type: QueueItem['type'], id: string) => S.queue.some(e => e.type === type && e.id === id);

// 「平静的一段时间」：给低权重事件一个参照，避免总有事情发生
export const QUIET_W = a => a < 18 ? 1.5 : 5;
export function chooseEvent(used: Set<string> = new Set()) {
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

/** 生日那个月：定下这一年的事件位置、每年一次的抉择、里程碑、日常，选好这一年的重心 */
export function planYearSchedule() {
  // 上一年最后一个月给「下个月」排的事（at > 1）挪到这一年的第一个月；其余的都已经发生过
  S.queue = S.queue.filter(e => e.at > 1).map(e => ({ ...e, at: Math.min(e.at - 1, posIn(0, 1)) }));
  S.fT = {}; S.fStart = 0;
  // 随机事件：每年 2–3 个位置，和按年排时一样均匀地铺在一年里（0.1–0.9）；是哪件事，到了那个月按当时的处境再抽。
  // 这样每年的事件数和原来一样，只是条件（在不在职、结没结婚……）看的是事发那个月的状态
  const n = S.age < 6 ? 2 : 3;
  S.evAt = [];
  for (let i = 0; i < n; i++) S.evAt.push(0.1 + (i + rnd() * 0.8) / n * 0.8);
  // 每年判定一次的抉择（结婚、裁员名单、拆迁）：落在这一年随机的一个月
  for (const id of yearDecisions()) enqueue({ at: posIn(ri(0, MONTHS - 1), rnd()), type: 'dec', id });
  if (MILESTONES.includes(S.age)) enqueue({ at: 0.02, type: 'ms' });
  if (ENABLE_REFLECT && !S.headless && REFLECT[S.age]) enqueue({ at: 0.92, type: 'ref' });
  planDaily(); // 日常：只用第二条随机数流，不影响上面这些
  S.queue.sort((a, b) => a.at - b.at);
  if (S.focus && !(FOCUS[S.focus] && FOCUS[S.focus].ok())) S.focus = null;
  if (!S.focus && focusList().length) S.focus = autoFocus();
}

/** 每个月开始时（第 0 个月在 planYearSchedule 之后）：学校的日历、这个月的随机事件、这个月该弹出的抉择 */
export function planMonth(m: number) {
  schoolMonth(m);
  huntMonth();
  const lo = monthStart(m), hi = monthStart(m + 1);
  for (const at of S.evAt || []) {
    if (at < lo || at >= hi) continue;
    const used = new Set(S.queue.filter(e => e.type === 'ev').map(e => e.id));
    const id = chooseEvent(used);
    if (id) enqueue({ at, type: 'ev', id });
  }
  // 状态触发的抉择（待业、生病、父母病了……）每个月都查，状态一出现，下个月开始时就排进来；同一个月最多两个
  let k = 0;
  for (const id of monthDecisions()) {
    if (queued('dec', id)) continue;
    (S.decAt ||= {})[id] = nowM();
    enqueue({ at: posIn(m, rnd()), type: 'dec', id });
    if (++k >= 2) break;
  }
}

// ===== 学校的日历（见 calendar.ts）=====
// 9 月：上幼儿园、上小学、小学毕业升初中；6 月：中考、高考；6–7 月：职高、大学毕业
function schoolMonth(m: number) {
  fixSchoolEnd();
  const cm = calMonth(m), cy = calYear(m), rural = S.loc.kind === 'rural';
  if (cm === 9) {
    if (cy === entryYear() - 3 && !S.school) {
      if (chance(rural ? 0.85 : 0.96)) log(rural ? '上了镇上的幼儿园，每天坐校车来回。' : '上幼儿园了。第一天你抱着门框哭，第二天就交到了朋友。', 'ev');
      else log(`没有上幼儿园，每天跟着${carer()}在家附近转。`, 'ev');
    }
    if (!S.school && S.edu === 0 && S.age <= 8 && cy >= entryYear()) {
      S.school = '小学'; S.schoolEnd = cy + 6;
      log(rural ? '背上新书包，走半个小时的山路去村里的小学。' : '上小学了。开学第一天，门口挤满了拍照的家长。', 'ev');
    } else if (S.school === '小学' && cy >= S.schoolEnd) {
      S.school = '初中'; S.schoolEnd = cy + 3; S.edu = 1;
      log(rural ? '小学毕业，去镇上读初中。' : '小学毕业，上了初中。', 'ev');
    }
  }
  if (cm === 1 && S.school === '小学' && cy === S.schoolEnd - 5) reportCard(); // 一年级上学期期末
  if (cm === 6 && S.school && S.school !== '小学' && cy >= S.schoolEnd) {
    const id = schoolDecision();
    if (!id || queued('dec', id)) return;
    // 中考在 6 月中下旬，高考成绩和填志愿在 6 月下旬；毕业去向在 6 月或 7 月
    const late = id === 'gaokao' ? 0.75 : id === 'zhongkao' ? 0.5 : 0.3;
    const mm = (id === 'graduate' || id === 'vocgrad') && m < MONTHS - 1 && chance(0.5) ? m + 1 : m;
    enqueue({ at: posIn(mm, mm === m ? late + rnd() * (0.95 - late) : rnd() * 0.6), type: 'dec', id });
  }
}

/** 生日那个月：退休、不再种地（入学按公历 9 月，见 schoolMonth） */
export function scheduleYearStart() {
  // 到了退休年龄还在待业的，也直接退休（按原来那一行的退休年龄），不再找工作
  if ((isWorking() || S.job === 'seeking') && S.age >= retireAge()) retire();
}
