// 一生的记录：时间线上的文字、档案里的证件。

import { S } from './state';
import type { LogEntry } from './types';
import { calMonth, calYear } from './monthly';

declare module './types' {
  // y、m：写下时是公历哪年哪月（和页头的「X年X月」一致）
  interface Doc { m: number }
  interface LogEntry { y: number; m: number; x?: 1 } // x：人生大事（见 major）
}

const curM = () => S.month;

// ===== 证件：人生每个关口往档案里放一份 =====
// k: 证件类型（决定样式），title: 名称，rows: [[栏目, 内容]...]
export function addDoc(k, title, rows) {
  if (!S.docs) S.docs = [];
  const m = curM();
  S.docs.push({ k, title, a: S.age, y: calYear(m), m: calMonth(m), rows: rows.filter(r => r && r[1] != null && r[1] !== '') });
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
