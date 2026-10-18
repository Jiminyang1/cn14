// 一生的记录：时间线上的文字、档案里的证件。

import { S } from './state';
import type { LogEntry } from './types';
import { calMonth, calYear } from './monthly';
import { pick } from './rng';

declare module './types' {
  // y、m：写下时是公历哪年哪月（和页头的「X年X月」一致）
  interface Doc { m: number }
  interface LogEntry { y: number; m: number; x?: 1 } // x：人生大事（见 major）
  interface Life {
    vary?: Record<string, number>; // 反复发生的事已经用过哪几种说法（位掩码，见 vary）
    moves?: Move[];                // 大笔进出（年终小结里写来源，见 noteMoney）
  }
}

const curM = () => S.month;

// ===== 证件：人生每个关口往档案里放一份 =====
// k: 证件类型（决定样式），title: 名称，rows: [[栏目, 内容]...]
export function addDoc(k: string, title: string, rows: [string, string][], v?: string) {
  if (!S.docs) S.docs = [];
  const m = curM();
  S.docs.push({ k, title, a: S.age, y: calYear(m), m: calMonth(m), rows: rows.filter(r => r && r[1] != null && r[1] !== ''), ...(v ? { v } : {}) });
}

// ===== 记录 =====
// pic：给这条记录配一张像素插画（场景名见 ui/pixel/scenes.ts），只在人生的几个关口用
export function log(t, k = 'ev', f = null, pic: string | null = null, x = false) {
  const m = curM(), y = calYear(m), cm = calMonth(m);
  const e: LogEntry = pic ? { a: S.age, y, m: cm, t, k, f, pic } : { a: S.age, y, m: cm, t, k, f };
  if (x) e.x = 1;
  S.log.unshift(e);
}
// ===== 人生大事 =====
// 升学、毕业、结婚、孩子出生、亲人去世、大病、失业、买房、拆迁、继承、退休、离世：一生里分量最重的那些事。
// 界面上突出显示、停一下；「下一件大事」只停在这些上；结局回顾里按时间列出来（见 AGENTS.md「轻重」）
export function major(t: string, k = 'ev', pic: string | null = null, f: string | null = null) { log(t, k, f, pic, true); }
// 事件、抉择里顺带发生的事（例如换工作时公积金封存）先记在这里，等事件本身的文字写完再写，时间线上的先后才对
let later: [string, string][] = [];
export function logLater(t: string, k = 'ev') { later.push([t, k]); }
/** 把事件、抉择的结果写进时间线。x：记成人生大事（事件的 big、抉择的 fork，或者结果自己带 x） */
export function out(r, kind = 'ev', x = false) {
  if (r) { if (typeof r === 'string') log(r, kind, null, null, x); else log(r.t, r.k || kind, r.f || null, r.pic || null, x || !!r.x); }
  const l = later; later = [];
  for (const [t, k] of l) log(t, k);
}

// ===== 换着说 =====
/** 反复发生的事换着说：从这件事还没用过的说法里挑一句，都用过了再从头来（见 AGENTS.md「不重复」） */
export function vary(id: string, xs: string[]) {
  const V = (S.vary ||= {}), all = (1 << xs.length) - 1;
  if ((V[id] & all) === all) V[id] = 0;
  const free = xs.map((_, i) => i).filter(i => !(V[id] & (1 << i)));
  const i = pick(free); V[id] = (V[id] || 0) | (1 << i);
  return xs[i];
}

// ===== 大笔进出 =====
// 年终小结写清楚这一年钱的大进大出是哪来的（公积金提取、继承、买房、陪嫁……），不然现金突然多了、少了一大块，看不出原因。
// 事件和抉择发生时自动记（lifecycle.ts 的 fire、resolveDec），不经过事件的（退休提公积金、继承）在各自的地方记。无界面的人生不记
export interface Move { a: number; y: number; m: number; t: string; x: number } // 几岁、公历年月、来源、金额（正是进、负是出）
/** 手上的钱：现金减欠款（借钱付的也算花出去了） */
export const netCash = () => (S.money || 0) - (S.debt || 0);
/** 算不算大笔：一万块以上，而且超过两个月的收入 */
const bigLine = () => Math.max(1e4, (S.net || 0) / 6);
export function noteMoney(t: string, x: number) {
  if (S.headless || !S.indep || Math.abs(x) < bigLine()) return;
  const m = curM();
  (S.moves ||= []).push({ a: S.age, y: calYear(m), m: calMonth(m), t, x: Math.round(x) });
}
/** 一件事前后：手上的钱变了多少，扣掉这件事里已经单独记过的，剩下的记在 t 名下 */
export function moneyAround<T>(t: () => string, run: () => T): T {
  const c0 = netCash(), n0 = S.moves?.length || 0;
  const r = run();
  let d = netCash() - c0;
  for (const mv of (S.moves || []).slice(n0)) d -= mv.x;
  if (Math.abs(d) >= 1) noteMoney(t(), d);
  return r;
}
/** 事件的来源名：取那句话开头的一截（到第一个逗号或句号） */
export const moveLabel = (r: any) => { const t = typeof r === 'string' ? r : r?.t || ''; const s = t.split(/[，。：]/)[0]; return s.length > 16 ? s.slice(0, 15) + '…' : s; };
