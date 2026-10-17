// 生命表与死亡：分省、城乡、性别的逐岁死亡概率，以及死因。

import { fexp, fpow } from './fmath';
import { BIRTH_TOTAL, PBY, PROVS } from './data';
import { CAUSE_REAL, Q0_NAT, QX_NAT } from './real.generated';
import { S } from './state';
import { clamp, wpick } from './rng';
import { hlExp } from './stats';
import { log } from './journal';
import { perMonth } from './monthly';
import { rural } from './content/events';

// ===== 生命表 =====
// 有全国分性别的真实生命表（QX_NAT）时：以它的年龄形状为底，按比例风险缩放，使预期寿命对上各省的值；
// 没有时退回 Gompertz-Makeham 曲线。两种情况下 0 岁的死亡概率都单独给定。
export const LT_CACHE = {};
export function natQx(sex) {
  if (!QX_NAT[sex]) return null;
  const k = '_full' + sex;
  if (QX_NAT[k]) return QX_NAT[k];
  const q = QX_NAT[sex].slice(0, 101);
  // 100 岁以后按最后十年的增长率外推到 119
  const g = fpow(q[100] / q[90], 1 / 10);
  for (let x = 101; x < 120; x++) q.push(Math.min(0.95, q[x - 1] * g));
  q.push(1);
  return (QX_NAT[k] = q);
}
export function lifeTable(le, q0, sex) {
  const key = le.toFixed(2) + '|' + q0.toFixed(5) + '|' + (sex || '');
  if (LT_CACHE[key]) return LT_CACHE[key];
  const base = natQx(sex);
  const A = 0.0002, b = 0.092;
  const build = base
    ? m => { const kk = fexp(m), q = [q0]; for (let x = 1; x < 120; x++) q.push(Math.min(1, 1 - fpow(1 - base[x], kk))); q.push(1); return q; }
    : m => { const a = fexp(m), q = [q0]; for (let x = 1; x < 120; x++) q.push(Math.min(1, 1 - fexp(-(A + a * fexp(b * x))))); q.push(1); return q; };
  const e0 = q => { let l = 1, e = 0; for (let x = 0; x <= 120; x++) { const l2 = l * (1 - q[x]); e += l2 + (l - l2) * (x === 0 ? 0.15 : 0.5); l = l2; } return e; };
  let lo = base ? -4 : -22, hi = base ? 4 : -3;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (e0(build(m)) > le) lo = m; else hi = m; }
  const q = build((lo + hi) / 2);
  const l = [1];
  for (let x = 0; x < 120; x++) l.push(l[x] * (1 - q[x]));
  return (LT_CACHE[key] = { q, l });
}
// 各省之间的差距来自人口普查；全国整体水平对齐联合国 WPP 2024（比官方口径略低，见 DATA.md）。
export const LE_TARGET = { M: 75.25, F: 80.97 };            // UN WPP 2024
export const RURAL_LE = { rural: -1.0, urban: 0.6 };        // 城乡差距（粗略）
export const leRaw = (pid, sex, rural) => { const p = PBY[pid]; return (sex === 'F' ? (p.leF || p.le + 2.95) : (p.leM || p.le - 2.56)) + (rural ? RURAL_LE.rural : RURAL_LE.urban); };
export const LE_SHIFT = {};
for (const sx of ['M', 'F']) {
  let t = 0, n = 0;
  for (const p of PROVS) { const u = p.u / 100; t += p.b * (u * leRaw(p.id, sx, false) + (1 - u) * leRaw(p.id, sx, true)); n += p.b; }
  LE_SHIFT[sx] = LE_TARGET[sx] - t / n;
}
export const leOf = (pid, sex, rural) => leRaw(pid, sex, rural) + LE_SHIFT[sex];
// 婴儿死亡率：全国水平用 UN IGME 2024（男 4.3‰、女 3.9‰），各省、城乡按相对倍数分配，再归一到全国水平
export const IMK_NORM = PROVS.reduce((t, p) => t + p.b * p.imk * (p.u / 100 * 0.8 + (1 - p.u / 100) * 1.3), 0) / BIRTH_TOTAL;
export const q0Of = (pid, rural, sex = 'M') => Q0_NAT[sex] * PBY[pid].imk * (rural ? 1.3 : 0.8) / IMK_NORM;
// 你本人的生命表：每个月都要用，按（出生省份、性别、城乡）记住上一次的结果，省掉拼缓存键
let ltKey: [string, string, boolean] | null = null, ltVal: { q: number[]; l: number[] } | null = null;
export const LT = () => {
  if (!ltKey || ltKey[0] !== S.born || ltKey[1] !== S.sex || ltKey[2] !== S.rural) { ltVal = lifeTable(leOf(S.born, S.sex, S.rural), q0Of(S.born, S.rural, S.sex), S.sex); ltKey = [S.born, S.sex, S.rural]; }
  return ltVal;
};
/** 一张生命表第 x 岁的每月死亡概率（年概率按 perMonth 换算；每张表只算一次，挂在表上） */
export function qMonth(T: { q: number[]; qm?: number[] }, x: number) {
  return (T.qm || (T.qm = T.q.map(perMonth)))[Math.min(119, x)];
}
// 家人的生命表：父母按你出生的地方（比你这一代低 3 岁，估计），配偶、孩子按你现在住的省。
// 每个月都要查好几次：按 种类 → 省 → 性别 分层缓存，不拼字符串键
const KIN_LT = { par: {}, parR: {}, pt: {}, kid: {} };
export function kinLT(kind: 'par' | 'pt' | 'kid', sex: string) {
  const par = kind === 'par', pid = par ? S.born : S.loc.p;
  const byP = KIN_LT[par && S.rural ? 'parR' : kind], bySex = byP[pid] || (byP[pid] = {});
  return bySex[sex] || (bySex[sex] = par
    ? lifeTable(leOf(pid, sex, S.rural) - 3, 0.005, sex)
    : lifeTable(leOf(pid, sex, false), kind === 'pt' ? 0.004 : 0.003, sex));
}
export function parentQ(p, male) { return kinLT('par', male ? 'M' : 'F').q[Math.min(119, p.age)]; }

// ===== 死亡 =====
export const CAUSE = {
  perinatal: '早产或出生时的并发症', congenital: '先天性疾病', pneumonia: '肺炎', drown: '溺水', traffic: '交通事故', accident: '意外伤害',
  leukemia: '白血病', cancer: '癌症', heart: '心脏病', stroke: '脑卒中（中风）', resp: '慢性呼吸系统疾病', liver: '肝病',
  suicide: '自杀', old: '衰老', disaster: '自然灾害', other: '疾病',
  diabetes: '糖尿病', kidney: '肾病', dementia: '阿尔茨海默病等认知症', maternal: '孕产期并发症',
};
export const DIAG = {
  cancer: '体检时发现了一个阴影，进一步检查后，医生说是癌症。',
  heart: '胸口一阵剧痛，被送进医院。医生说是冠心病，心脏的血管堵了。',
  stroke: '一天早上起床时半边身子发麻，被送去医院，确诊是脑卒中。',
  liver: '一直觉得累，查出来是肝硬化。',
  resp: '咳嗽和气短越来越重，确诊为慢性阻塞性肺病。',
};
// npm run calib -- mortk。按月判定以后重调（原来 M 1.43、F 1.57）：大病治疗按月判满 5 年（原来按年只判到约 4.6 年）、
// 确诊后等着治疗的几个月里其他死因照常存在，女性的模拟寿命短了约 0.4 岁，F 调到 1.51；男性不用动。
// 这是在「确诊后一两个月内就弹出治疗抉择」（日程按月以后）的前提下校准的
export const MORT_K = { M: 1.43, F: 1.51 };
export function deathProb() {
  const hm = S.age < 15 ? 1 : clamp(fexp((hlExp(S.age) - S.st.hl) / 30), 0.6, 2.2);
  // ×MORT_K：抵消“确诊后治愈”带走的那部分死亡，使模拟的平均寿命对上生命表
  return LT().q[Math.min(119, S.age)] * hm * (S.age >= 35 ? MORT_K[S.sex] : 1) * (S.flags.smoke && S.age > 40 ? 1.3 : 1);
}
export function pickCause() {
  const tbl = CAUSE_REAL[S.sex];
  const row = tbl.find(r => S.age >= r[0] && S.age <= r[1]);
  const w = { ...row[2] };
  if (w.suicide && S.st.h < 35) w.suicide *= 2.5;
  if (w.cancer && S.flags.smoke) w.cancer *= 1.4;
  if (w.traffic) w.traffic *= PBY[S.loc.p].trafK || 1; // 各省交通事故死亡率差异（统计年鉴 24-6）
  return wpick(w);
}
export function milestone() {
  const l = LT().l[S.age], sx = S.sex === 'M' ? '男孩' : '女孩', pv = PBY[S.born].n;
  if (S.age === 5) log(`五岁生日。在${pv}，同年出生的孩子里大约每千人有${Math.max(1, Math.round((1 - l) * 1000))}人没能活到五岁。你走过了这一关。`, 'ms');
  else {
    const pct = l * 100;
    log(`${S.age}岁。同一年在${pv}出生的${sx}里，${pct >= 99.5 ? '几乎所有人都还活着' : `大约${pct >= 10 ? Math.round(pct) : pct.toFixed(1)}%还活着`}。`, 'ms');
  }
}
