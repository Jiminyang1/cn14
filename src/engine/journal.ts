// 一生的记录：时间线上的文字、档案里的证件。

import { S } from './state';

// ===== 证件：人生每个关口往档案里放一份 =====
// k: 证件类型（决定样式），title: 名称，rows: [[栏目, 内容]...]
export function addDoc(k, title, rows) {
  if (!S.docs) S.docs = [];
  S.docs.push({ k, title, a: S.age, y: S.birthYear + S.age, rows: rows.filter(r => r && r[1] != null && r[1] !== '') });
}

// ===== 记录 =====
export function log(t, k = 'ev', f = null) { S.log.unshift({ a: S.age, t, k, f }); }
// 事件、抉择里顺带发生的事（例如换工作时公积金封存）先记在这里，等事件本身的文字写完再写，时间线上的先后才对
let later: [string, string][] = [];
export function logLater(t: string, k = 'ev') { later.push([t, k]); }
export function out(r, kind = 'ev') {
  if (r) { if (typeof r === 'string') log(r, kind); else log(r.t, r.k || kind, r.f || null); }
  const l = later; later = [];
  for (const [t, k] of l) log(t, k);
}
